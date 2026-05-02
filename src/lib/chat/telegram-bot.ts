import {
  Actions,
  Button,
  Card,
  CardText as Text,
  Chat,
  Divider,
  LinkButton,
  type Attachment,
  type Message,
  type Thread,
} from "chat";
import {
  createTelegramAdapter,
  type TelegramRawMessage,
} from "@chat-adapter/telegram";
import { createMemoryState } from "@chat-adapter/state-memory";
import type { ApiError, SubmitRequestResponse } from "@/lib/api-types";
import { getAppUrl } from "@/lib/comm/config";
import { formatGbpRange } from "@/lib/currency";
import {
  getRequestWithRelations,
  isLocalDevDataMode,
  listUnitsForTenant,
} from "@/lib/local-dev-store";
import { normalizeRequestLanguage } from "@/lib/request-language";
import { createAdminClient } from "@/lib/supabase/admin";

const REFRESH_STATUS_ACTION = "refresh_status";
const DEFAULT_TELEGRAM_BOT_USERNAME = "fixflowbot";

type TelegramRequestSummary = {
  id: string;
  status: string;
  description: string | null;
  category: string | null;
  urgency: string | null;
  assignedContractorName: string | null;
  estimatedCostRange: string | null;
  voiceUpdateUrl: string | null;
  pipelineError: string | null;
  requestUrl: string;
};

type TelegramTarget = {
  tenantId: string;
  unitId: string;
};

type RequestRowLike = {
  id: string;
  status: string;
  description: string | null;
  diagnosis: unknown;
  assigned_contractor: unknown;
  estimated_cost_low: number | null;
  estimated_cost_high: number | null;
  voice_update_url: string | null;
};

const globalTelegramState = globalThis as typeof globalThis & {
  __fixflowTelegramBot?: Chat | null;
  __fixflowTelegramBotInit?: Promise<void>;
};

function isTelegramBotEnabled() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

function normalizeTelegramCommand(token: string) {
  return token.trim().toLowerCase().replace(/@.+$/, "");
}

function shortRequestId(requestId: string) {
  return requestId.slice(0, 8);
}

function getTelegramPreferredLanguage(raw: TelegramRawMessage) {
  return normalizeRequestLanguage(
    process.env.TELEGRAM_FIXFLOW_REQUEST_LANGUAGE?.trim() ||
      raw.from?.language_code ||
      null
  ).code;
}

function getTelegramTenantId(telegramUserId: string) {
  const explicit = process.env.TELEGRAM_FIXFLOW_TENANT_ID?.trim();
  if (explicit) return explicit;
  return `telegram:${telegramUserId}`;
}

async function resolveTelegramTarget(telegramUserId: string): Promise<TelegramTarget> {
  const explicitUnitId = process.env.TELEGRAM_FIXFLOW_UNIT_ID?.trim() || null;
  const tenantId = getTelegramTenantId(telegramUserId);

  if (isLocalDevDataMode()) {
    if (explicitUnitId) {
      return {
        tenantId,
        unitId: explicitUnitId,
      };
    }

    const units = listUnitsForTenant(tenantId);
    const firstUnit = units[0];
    if (!firstUnit?.id) {
      throw new Error(
        "FixFlow could not create or find a local test unit for this Telegram user."
      );
    }

    return {
      tenantId,
      unitId: firstUnit.id,
    };
  }

  if (!tenantId || !explicitUnitId) {
    throw new Error(
      "Telegram real-data mode requires TELEGRAM_FIXFLOW_TENANT_ID and TELEGRAM_FIXFLOW_UNIT_ID in the project root .env.local."
    );
  }

  return {
    tenantId,
    unitId: explicitUnitId,
  };
}

async function attachmentToBuffer(attachment: Attachment) {
  if (Buffer.isBuffer(attachment.data)) {
    return attachment.data;
  }

  if (attachment.data instanceof Blob) {
    return Buffer.from(await attachment.data.arrayBuffer());
  }

  if (attachment.fetchData) {
    return attachment.fetchData();
  }

  throw new Error("Telegram photo could not be downloaded.");
}

async function submitTelegramRequest(
  message: Message<TelegramRawMessage>
): Promise<TelegramRequestSummary> {
  const imageAttachment = message.attachments.find(
    (attachment) => attachment.type === "image"
  );
  if (!imageAttachment) {
    throw new Error("Please send a photo so FixFlow can create a maintenance request.");
  }

  const target = await resolveTelegramTarget(message.author.userId);
  const fileBuffer = await attachmentToBuffer(imageAttachment);
  const mimeType = imageAttachment.mimeType || "image/jpeg";
  const fileName = imageAttachment.name || `telegram-report-${Date.now()}.jpg`;

  const formData = new FormData();
  formData.set(
    "photo",
    new File([new Uint8Array(fileBuffer)], fileName, { type: mimeType })
  );
  formData.set(
    "description",
    message.text?.trim() || "Submitted from Telegram"
  );
  formData.set("unit_id", target.unitId);
  formData.set("tenant_id", target.tenantId);
  formData.set(
    "preferred_language",
    getTelegramPreferredLanguage(message.raw)
  );

  const response = await fetch(`${getAppUrl()}/api/requests`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error(
      payload?.details || payload?.error || `FixFlow request creation failed (${response.status}).`
    );
  }

  const payload = (await response.json()) as SubmitRequestResponse;
  const summary = await fetchTelegramRequestSummary(payload.requestId);
  if (summary) {
    return summary;
  }

  return {
    id: payload.requestId,
    status: "submitted",
    description: message.text?.trim() || "Submitted from Telegram",
    category: null,
    urgency: null,
    assignedContractorName: null,
    estimatedCostRange: null,
    voiceUpdateUrl: null,
    pipelineError: null,
    requestUrl: `${getAppUrl()}/requests/${payload.requestId}`,
  };
}

function toTelegramRequestSummary(row: RequestRowLike): TelegramRequestSummary {
  const diagnosis =
    row.diagnosis && typeof row.diagnosis === "object" && !Array.isArray(row.diagnosis)
      ? (row.diagnosis as Record<string, unknown>)
      : {};

  const assignedContractor =
    row.assigned_contractor &&
    typeof row.assigned_contractor === "object" &&
    !Array.isArray(row.assigned_contractor)
      ? (row.assigned_contractor as Record<string, unknown>)
      : {};

  return {
    id: row.id,
    status: row.status,
    description:
      row.description ||
      (typeof diagnosis.description === "string" ? diagnosis.description : null),
    category:
      typeof diagnosis.category === "string" ? diagnosis.category : null,
    urgency: typeof diagnosis.urgency === "string" ? diagnosis.urgency : null,
    assignedContractorName:
      typeof assignedContractor.name === "string"
        ? assignedContractor.name
        : null,
    estimatedCostRange: formatGbpRange(
      row.estimated_cost_low,
      row.estimated_cost_high
    ),
    voiceUpdateUrl: row.voice_update_url,
    pipelineError:
      typeof diagnosis.pipeline_error === "string"
        ? diagnosis.pipeline_error
        : null,
    requestUrl: `${getAppUrl()}/requests/${row.id}`,
  };
}

async function fetchTelegramRequestSummary(requestId: string) {
  if (isLocalDevDataMode()) {
    const request = getRequestWithRelations(requestId);
    if (!request) return null;
    return toTelegramRequestSummary(request as RequestRowLike);
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("maintenance_requests")
    .select(
      "id, status, description, diagnosis, assigned_contractor, estimated_cost_low, estimated_cost_high, voice_update_url"
    )
    .eq("id", requestId)
    .single();

  if (error || !data) return null;
  return toTelegramRequestSummary(data as RequestRowLike);
}

function buildHelpCard() {
  return Card({
    title: "FixFlow on Telegram",
    children: [
      Text(
        "Send a photo of the maintenance issue with a short caption and I will open a FixFlow request for you."
      ),
      Divider(),
      Text("Useful commands:"),
      Text("/start or /help"),
      Text("/status <request_id>"),
      Text("Example: send a leaking pipe photo with the caption 'Leak under the sink'."),
    ],
  });
}

function buildStatusCard(summary: TelegramRequestSummary) {
  const details = [
    `Request: ${shortRequestId(summary.id)}`,
    `Status: ${summary.status.replace(/_/g, " ")}`,
    summary.description ? `Issue: ${summary.description}` : null,
    summary.category ? `Category: ${summary.category}` : null,
    summary.urgency ? `Urgency: ${summary.urgency}` : null,
    summary.assignedContractorName
      ? `Contractor: ${summary.assignedContractorName}`
      : null,
    summary.estimatedCostRange
      ? `Estimated cost: ${summary.estimatedCostRange}`
      : null,
    summary.pipelineError ? `Pipeline note: ${summary.pipelineError}` : null,
  ].filter(Boolean);

  const actions = [
    Button({
      id: REFRESH_STATUS_ACTION,
      label: "Refresh Status",
      value: summary.id,
    }),
    LinkButton({
      url: summary.requestUrl,
      label: "Open in FixFlow",
    }),
  ];

  if (summary.voiceUpdateUrl?.startsWith("http")) {
    actions.push(
      LinkButton({
        url: summary.voiceUpdateUrl,
        label: "Voice Update",
      })
    );
  }

  return Card({
    title: `FixFlow Request ${shortRequestId(summary.id)}`,
    children: [Text(details.join("\n")), Divider(), Actions(actions)],
  });
}

function buildCreatedCard(summary: TelegramRequestSummary) {
  return Card({
    title: "FixFlow Request Created",
    children: [
      Text(
        `Your report is in FixFlow as request ${shortRequestId(summary.id)}. I’ll show the current pipeline state below.`
      ),
      Divider(),
      Text(`Status: ${summary.status.replace(/_/g, " ")}`),
      summary.description ? Text(`Issue: ${summary.description}`) : Text("Issue received."),
      Actions([
        Button({
          id: REFRESH_STATUS_ACTION,
          label: "Refresh Status",
          value: summary.id,
        }),
        LinkButton({
          url: summary.requestUrl,
          label: "Open in FixFlow",
        }),
      ]),
    ],
  });
}

async function postRequestStatus(
  thread: Thread<TelegramRawMessage>,
  requestId: string
) {
  const summary = await fetchTelegramRequestSummary(requestId);
  if (!summary) {
    await thread.post(
      `I couldn't find request \`${requestId}\`. Check the ID and try again.`
    );
    return;
  }

  await thread.post(buildStatusCard(summary));
}

async function handleTelegramCommand(
  thread: Thread<TelegramRawMessage>,
  message: Message<TelegramRawMessage>
) {
  const trimmed = message.text.trim();
  if (!trimmed.startsWith("/")) return false;

  const [commandToken, ...rest] = trimmed.split(/\s+/);
  const command = normalizeTelegramCommand(commandToken);

  switch (command) {
    case "/start":
    case "/help":
    case "/report": {
      await thread.post(buildHelpCard());
      return true;
    }
    case "/status": {
      const requestId = rest.join(" ").trim();
      if (!requestId) {
        await thread.post("Use `/status <request_id>` to check a FixFlow request.");
        return true;
      }
      await postRequestStatus(thread, requestId);
      return true;
    }
    default:
      return false;
  }
}

async function handleIncomingTelegramMessage(
  thread: Thread<TelegramRawMessage>,
  message: Message<TelegramRawMessage>
) {
  if (await handleTelegramCommand(thread, message)) {
    return;
  }

  const hasImage = message.attachments.some(
    (attachment) => attachment.type === "image"
  );

  if (!hasImage) {
    await thread.post(buildHelpCard());
    return;
  }

  const summary = await submitTelegramRequest(message);
  await thread.post(buildCreatedCard(summary));
}

function createFixFlowTelegramBot() {
  const bot = new Chat({
    userName:
      process.env.TELEGRAM_BOT_USERNAME?.trim() ||
      DEFAULT_TELEGRAM_BOT_USERNAME,
    adapters: {
      telegram: createTelegramAdapter({ mode: "auto" }),
    },
    state: createMemoryState(),
    logger: process.env.NODE_ENV === "development" ? "info" : "warn",
  });

  bot.onDirectMessage(async (thread, message) => {
    await thread.startTyping("Creating your FixFlow update...");
    try {
      await handleIncomingTelegramMessage(
        thread as Thread<TelegramRawMessage>,
        message as Message<TelegramRawMessage>
      );
    } catch (error) {
      console.error("[telegram bot] direct-message handler failed:", error);
      await thread.post(
        `FixFlow couldn't process that message: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  });

  bot.onNewMention(async (thread, message) => {
    await thread.startTyping("Checking FixFlow...");
    try {
      await handleIncomingTelegramMessage(
        thread as Thread<TelegramRawMessage>,
        message as Message<TelegramRawMessage>
      );
    } catch (error) {
      console.error("[telegram bot] mention handler failed:", error);
      await thread.post(
        `FixFlow couldn't process that message: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  });

  bot.onAction(REFRESH_STATUS_ACTION, async (event) => {
    if (!event.thread) return;

    const requestId = event.value?.trim();
    if (!requestId) {
      await event.thread.post(
        "That status button did not include a request ID. Please run `/status <request_id>`."
      );
      return;
    }

    await postRequestStatus(
      event.thread as Thread<TelegramRawMessage>,
      requestId
    );
  });

  return bot;
}

export function getTelegramBot() {
  if (!isTelegramBotEnabled()) {
    return null;
  }

  if (globalTelegramState.__fixflowTelegramBot) {
    return globalTelegramState.__fixflowTelegramBot;
  }

  const bot = createFixFlowTelegramBot();
  globalTelegramState.__fixflowTelegramBot = bot;
  return bot;
}

export async function ensureTelegramBotInitialized() {
  if (!isTelegramBotEnabled()) return;
  const bot = getTelegramBot();
  if (!bot) return;
  if (globalTelegramState.__fixflowTelegramBotInit) {
    await globalTelegramState.__fixflowTelegramBotInit;
    return;
  }

  globalTelegramState.__fixflowTelegramBotInit = bot.initialize().catch(
    (error) => {
      globalTelegramState.__fixflowTelegramBotInit = undefined;
      throw error;
    }
  );

  await globalTelegramState.__fixflowTelegramBotInit;
}

if (process.env.NODE_ENV !== "production" && isTelegramBotEnabled()) {
  void ensureTelegramBotInitialized().catch((error) => {
    console.error("[telegram bot] initialization failed:", error);
  });
}

export { isTelegramBotEnabled };
