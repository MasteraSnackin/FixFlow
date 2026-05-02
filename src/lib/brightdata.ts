type BrightDataDiscoverResult = {
  link: string;
  title: string;
  description: string;
  relevance_score: number;
  content?: string | null;
};

type BrightDataDiscoverResponse = {
  status: "processing" | "done";
  duration_seconds?: number;
  results?: BrightDataDiscoverResult[];
};

type BrightDataDiscoverRequest = {
  query: string;
  intent?: string;
  filterKeywords?: string[];
  numResults?: number;
  city?: string;
  country?: string;
  language?: string;
  includeContent?: boolean;
  includeImages?: boolean;
};

export type FixFlowWebProvider = "brightdata" | "model_tools";

const BRIGHTDATA_DISCOVER_URL = "https://api.brightdata.com/discover";
const DEFAULT_DISCOVER_TIMEOUT_MS = 45_000;
const DEFAULT_POLL_INTERVAL_MS = 1_500;

function getBrightDataApiKey() {
  return process.env.BRIGHTDATA_API_KEY?.trim() || "";
}

function hasBrightDataKey() {
  return Boolean(getBrightDataApiKey());
}

export function getFixFlowWebProvider(): FixFlowWebProvider {
  const configured = process.env.FIXFLOW_WEB_PROVIDER?.trim().toLowerCase();

  if (configured === "brightdata" && hasBrightDataKey()) {
    return "brightdata";
  }

  if (configured === "model_tools") {
    return "model_tools";
  }

  return hasBrightDataKey() ? "brightdata" : "model_tools";
}

export function getFixFlowWebProviderLabel() {
  return getFixFlowWebProvider() === "brightdata"
    ? "brightdata:discover"
    : "model_tools";
}

function getAuthHeaders() {
  const key = getBrightDataApiKey();
  if (!key) {
    throw new Error("BRIGHTDATA_API_KEY is required to use the Bright Data web provider");
  }

  return {
    Authorization: `Bearer ${key}`,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runBrightDataDiscover(
  params: BrightDataDiscoverRequest
): Promise<BrightDataDiscoverResult[]> {
  const startResponse = await fetch(BRIGHTDATA_DISCOVER_URL, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: params.query,
      intent: params.intent,
      filter_keywords: params.filterKeywords,
      num_results: params.numResults ?? 8,
      city: params.city,
      country: params.country ?? "GB",
      language: params.language ?? "en",
      format: "json",
      include_content: params.includeContent ?? true,
      include_images: params.includeImages ?? false,
      remove_duplicates: true,
    }),
  });

  if (!startResponse.ok) {
    const payload = await startResponse.text().catch(() => "");
    throw new Error(
      `Bright Data discover start failed (${startResponse.status}): ${payload || startResponse.statusText}`
    );
  }

  const startPayload = (await startResponse.json()) as { task_id?: string };
  if (!startPayload.task_id) {
    throw new Error("Bright Data discover did not return a task_id");
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < DEFAULT_DISCOVER_TIMEOUT_MS) {
    const pollResponse = await fetch(
      `${BRIGHTDATA_DISCOVER_URL}?task_id=${encodeURIComponent(startPayload.task_id)}`,
      {
        headers: getAuthHeaders(),
      }
    );

    if (!pollResponse.ok) {
      const payload = await pollResponse.text().catch(() => "");
      throw new Error(
        `Bright Data discover poll failed (${pollResponse.status}): ${payload || pollResponse.statusText}`
      );
    }

    const pollPayload =
      (await pollResponse.json()) as BrightDataDiscoverResponse;
    if (pollPayload.status === "done") {
      return pollPayload.results ?? [];
    }

    await sleep(DEFAULT_POLL_INTERVAL_MS);
  }

  throw new Error("Bright Data discover timed out before results were ready");
}

function truncate(value: string, maxChars: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxChars - 1).trim()}...`;
}

export function formatBrightDataDiscoverResults(
  results: BrightDataDiscoverResult[],
  options?: {
    maxResults?: number;
    maxContentChars?: number;
  }
) {
  const maxResults = options?.maxResults ?? 8;
  const maxContentChars = options?.maxContentChars ?? 1_200;

  return results
    .slice(0, maxResults)
    .map((result, index) => {
      const parts = [
        `Result ${index + 1}`,
        `Title: ${result.title}`,
        `URL: ${result.link}`,
        `Snippet: ${result.description || "No snippet provided."}`,
        `Relevance score: ${result.relevance_score}`,
      ];

      if (result.content?.trim()) {
        parts.push(`Content excerpt:\n${truncate(result.content, maxContentChars)}`);
      }

      return parts.join("\n");
    })
    .join("\n\n");
}
