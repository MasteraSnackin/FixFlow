import { getRequestLanguageMeta, normalizeRequestLanguage } from "@/lib/request-language";

const STORAGE_KEY = "fixflow-browser-demo-requests:v1";
const DEMO_AUDIO_URL =
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

export const BROWSER_DEMO_UNIT = {
  id: "demo-unit-london-flat-1",
  unit_label: "Flat 1",
} as const;

const DEMO_PROPERTY = {
  address: "14 Floral Street",
  city: "London",
  state: "Greater London",
  zip: "WC2E 9DH",
  landlord_id: "demo-landlord",
} as const;

export type BrowserDemoRequest = {
  id: string;
  unit_id: string;
  tenant_id: string;
  photo_url: string;
  description: string | null;
  status: string;
  diagnosis: Record<string, unknown>;
  contractors: Record<string, unknown>[];
  vetting: Record<string, unknown>[];
  work_order: Record<string, unknown>;
  voice_update_url: string | null;
  voice_transcript: string | null;
  assigned_contractor: Record<string, unknown> | null;
  estimated_cost_low: number | null;
  estimated_cost_high: number | null;
  landlord_approved: boolean | null;
  created_at: string;
  updated_at: string;
  units: {
    id: string;
    unit_label: string;
    tenant_id: string;
    properties: {
      address: string;
      city: string;
      state: string;
      zip: string;
      landlord_id: string;
    };
  };
};

type DemoRequestPatch = {
  assigned_contractor?: Record<string, unknown>;
  landlord_approved?: boolean;
  status?: string;
  diagnosis_patch?: Record<string, unknown>;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function nowIso() {
  return new Date().toISOString();
}

function readRequests() {
  if (!canUseStorage()) return [] as BrowserDemoRequest[];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BrowserDemoRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRequests(requests: BrowserDemoRequest[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
}

function createDemoId() {
  return `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function mockCategory(description: string | null) {
  const text = (description || "").toLowerCase();
  if (text.includes("water") || text.includes("leak") || text.includes("pipe")) {
    return "plumbing";
  }
  if (text.includes("heat") || text.includes("air") || text.includes("boiler")) {
    return "hvac";
  }
  if (
    text.includes("light") ||
    text.includes("power") ||
    text.includes("socket") ||
    text.includes("outlet")
  ) {
    return "electrical";
  }
  if (text.includes("mould") || text.includes("crack") || text.includes("door")) {
    return "structural";
  }
  return "general";
}

function buildDiagnosis(description: string | null, preferredLanguage?: string | null) {
  const category = mockCategory(description);
  const language = normalizeRequestLanguage(preferredLanguage);
  const englishTranscript =
    "We have reviewed your request, prepared a contractor shortlist, and generated a recommended next step.";

  return {
    ...getRequestLanguageMeta(preferredLanguage),
    category,
    severity: category === "electrical" ? 4 : 3,
    urgency: category === "electrical" ? "high" : "medium",
    description:
      description?.trim() ||
      "Issue captured successfully. A demo diagnosis has been prepared while the deployed Supabase schema is still being set up.",
    affected_system:
      category === "plumbing"
        ? "Kitchen or bathroom plumbing"
        : category === "electrical"
          ? "Electrical fixture or circuit"
          : category === "hvac"
            ? "Heating and ventilation"
            : "Interior unit repair",
    recommended_action:
      "Inspect the reported issue on site, confirm the root cause, and complete the standard repair workflow.",
    tenant_safety_note:
      category === "electrical"
        ? "Avoid using the affected fixture until a qualified contractor inspects it."
        : null,
    confidence: 0.81,
    quote_status: "estimated",
    quote_source: ["browser_demo_fallback", "ai_estimate"],
    contractor_quote:
      "Estimated repair cost is around £220 to £420, with next-day availability for an initial visit.",
    contractor_quote_confidence: 0.82,
    contractor_quote_received_at: nowIso(),
    voice_transcript_original:
      language.code === "en-GB" ? null : englishTranscript,
  };
}

function buildContractors() {
  return [
    {
      name: "West End Property Services",
      address: "22 Endell Street, London WC2H 9BA",
      phone: "020 7946 0101",
      rating: 4.8,
      total_reviews: 124,
      distance_miles: 1.2,
      hours_today: "Open until 18:00",
      is_open_now: true,
      maps_url: "https://maps.google.com/?q=22+Endell+Street+London+WC2H+9BA",
    },
    {
      name: "Covent Garden Home Repair",
      address: "31 Shelton Street, London WC2H 9JQ",
      phone: "020 7946 0102",
      rating: 4.6,
      total_reviews: 89,
      distance_miles: 1.8,
      hours_today: "Open until 17:30",
      is_open_now: true,
      maps_url: "https://maps.google.com/?q=31+Shelton+Street+London+WC2H+9JQ",
    },
    {
      name: "Thames Maintenance Group",
      address: "8 Theed Street, London SE1 8ST",
      phone: "020 7946 0103",
      rating: 4.4,
      total_reviews: 61,
      distance_miles: 2.7,
      hours_today: "Closes at 16:30",
      is_open_now: false,
      maps_url: "https://maps.google.com/?q=8+Theed+Street+London+SE1+8ST",
    },
  ];
}

function buildVetting(contractors: ReturnType<typeof buildContractors>) {
  return contractors.map((contractor, index) => ({
    ...contractor,
    review_summary:
      index === 0
        ? "Strong recent feedback for punctuality, clear communication, and reliable plumbing and general maintenance call-outs."
        : "Generally positive reviews, with a few mentions of slower scheduling at peak times.",
    red_flags:
      index === 0 ? [] : ["No blocking issues were surfaced in this demo fallback shortlist."],
    estimated_cost_low: 220 + index * 40,
    estimated_cost_high: 420 + index * 60,
    sources: [
      "https://www.checkatrade.com/",
      "https://www.google.com/maps",
    ],
  }));
}

function buildWorkOrder(
  diagnosis: ReturnType<typeof buildDiagnosis>,
  vetting: ReturnType<typeof buildVetting>
) {
  const topContractor = vetting[0];
  return {
    property_address: `${DEMO_PROPERTY.address}, ${DEMO_PROPERTY.city}, ${DEMO_PROPERTY.state} ${DEMO_PROPERTY.zip}`,
    unit_label: BROWSER_DEMO_UNIT.unit_label,
    tenant_name: "Demo tenant",
    tenant_phone: "020 7946 0110",
    issue_description: diagnosis.description,
    category: diagnosis.category,
    severity: diagnosis.severity,
    recommended_action: diagnosis.recommended_action,
    assigned_contractor_name: topContractor.name,
    assigned_contractor_phone: topContractor.phone,
    estimated_cost_range: `£${topContractor.estimated_cost_low} - £${topContractor.estimated_cost_high}`,
    alternative_contractors: vetting.slice(1).map((contractor) => ({
      name: contractor.name,
      phone: contractor.phone,
    })),
    dispatch_notes:
      "This request is running in browser demo mode because the deployed Supabase schema has not been provisioned yet.",
  };
}

export async function fileToDataUrl(file: File) {
  const buffer = await file.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(buffer).reduce(
      (accumulator, byte) => accumulator + String.fromCharCode(byte),
      ""
    )
  );
  return `data:${file.type};base64,${base64}`;
}

export function isSchemaSetupError(message: string | null | undefined) {
  const normalized = (message || "").toLowerCase();
  return (
    normalized.includes("schema cache") ||
    normalized.includes("could not find the table") ||
    normalized.includes("public.units") ||
    normalized.includes("maintenance_requests") ||
    normalized.includes("maintenance-photos")
  );
}

export function isBrowserDemoRequestId(id: string) {
  return id.startsWith("demo_");
}

export function listBrowserDemoRequests(tenantId?: string | null) {
  return readRequests()
    .filter((request) => !tenantId || request.tenant_id === tenantId)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
}

export function getBrowserDemoRequest(requestId: string) {
  return readRequests().find((request) => request.id === requestId) ?? null;
}

export function createBrowserDemoRequest(params: {
  tenantId: string;
  photoUrl: string;
  description: string | null;
  preferredLanguage?: string | null;
}) {
  const diagnosis = buildDiagnosis(params.description, params.preferredLanguage);
  const contractors = buildContractors();
  const vetting = buildVetting(contractors);
  const workOrder = buildWorkOrder(diagnosis, vetting);
  const timestamp = nowIso();
  const request: BrowserDemoRequest = {
    id: createDemoId(),
    unit_id: BROWSER_DEMO_UNIT.id,
    tenant_id: params.tenantId,
    photo_url: params.photoUrl,
    description: params.description,
    status: "dispatched",
    diagnosis,
    contractors,
    vetting,
    work_order: workOrder,
    voice_update_url: DEMO_AUDIO_URL,
    voice_transcript:
      "We have reviewed your request, shortlisted contractors, and prepared a recommended next step for dispatch.",
    assigned_contractor: vetting[0],
    estimated_cost_low: vetting[0].estimated_cost_low,
    estimated_cost_high: vetting[0].estimated_cost_high,
    landlord_approved: true,
    created_at: timestamp,
    updated_at: timestamp,
    units: {
      id: BROWSER_DEMO_UNIT.id,
      unit_label: BROWSER_DEMO_UNIT.unit_label,
      tenant_id: params.tenantId,
      properties: { ...DEMO_PROPERTY },
    },
  };

  const requests = readRequests();
  requests.unshift(request);
  writeRequests(requests);
  return request;
}

export function updateBrowserDemoRequest(requestId: string, patch: DemoRequestPatch) {
  const requests = readRequests();
  const index = requests.findIndex((request) => request.id === requestId);
  if (index === -1) return null;

  const current = requests[index];
  const next: BrowserDemoRequest = {
    ...current,
    updated_at: nowIso(),
  };

  if (patch.assigned_contractor !== undefined) {
    next.assigned_contractor = patch.assigned_contractor ?? null;
  }

  if (patch.landlord_approved !== undefined) {
    next.landlord_approved = patch.landlord_approved;
  }

  if (patch.status !== undefined) {
    next.status = patch.status;
  }

  if (patch.diagnosis_patch) {
    next.diagnosis = {
      ...(next.diagnosis || {}),
      ...patch.diagnosis_patch,
    };
  }

  requests[index] = next;
  writeRequests(requests);
  return next;
}
