import { randomUUID } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { getRequestLanguageMeta } from "@/lib/request-language";

const DB_PATH = path.join(process.cwd(), ".fixflow-local-dev-db.json");
const MOCK_AUDIO_URL =
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
const LOCAL_UK_PROPERTY = {
  address: "14 Floral Street",
  city: "London",
  state: "Greater London",
  zip: "WC2E 9DH",
};
const LOCAL_UK_CONTRACTORS = [
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
] as const;

type LocalProperty = {
  id: string;
  landlord_id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  unit_count: number;
  created_at: string;
  updated_at: string;
};

type LocalUnit = {
  id: string;
  property_id: string;
  unit_label: string;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_phone: string | null;
  created_at: string;
  updated_at: string;
};

export type LocalRequest = {
  id: string;
  unit_id: string;
  tenant_id: string;
  photo_url: string;
  description: string | null;
  status: string;
  diagnosis: Record<string, unknown> | null;
  contractors: Record<string, unknown>[] | null;
  vetting: Record<string, unknown>[] | null;
  work_order: Record<string, unknown> | null;
  voice_update_url: string | null;
  voice_transcript: string | null;
  assigned_contractor: Record<string, unknown> | null;
  estimated_cost_low: number | null;
  estimated_cost_high: number | null;
  landlord_approved: boolean | null;
  created_at: string;
  updated_at: string;
};

export type LocalRequestUpdatePatch = {
  status?: string;
  diagnosis?: Record<string, unknown> | null;
  diagnosis_patch?: Record<string, unknown>;
  contractors?: Record<string, unknown>[] | null;
  vetting?: Record<string, unknown>[] | null;
  work_order?: Record<string, unknown> | null;
  voice_update_url?: string | null;
  voice_transcript?: string | null;
  assigned_contractor?: Record<string, unknown> | null;
  estimated_cost_low?: number | null;
  estimated_cost_high?: number | null;
  landlord_approved?: boolean | null;
};

type LocalDb = {
  properties: LocalProperty[];
  units: LocalUnit[];
  maintenance_requests: LocalRequest[];
};

function nowIso() {
  return new Date().toISOString();
}

function defaultDb(): LocalDb {
  return {
    properties: [],
    units: [],
    maintenance_requests: [],
  };
}

function migrateLegacyText(db: LocalDb) {
  let changed = false;

  db.properties = db.properties.map((property) => {
    if (
      property.address === "482 Atlantic Ave" &&
      property.city === "Brooklyn" &&
      property.state === "NY" &&
      property.zip === "11217"
    ) {
      changed = true;
      return {
        ...property,
        ...LOCAL_UK_PROPERTY,
      };
    }
    if (
      property.address === LOCAL_UK_PROPERTY.address &&
      property.city === LOCAL_UK_PROPERTY.city &&
      property.state === "UK" &&
      property.zip === LOCAL_UK_PROPERTY.zip
    ) {
      changed = true;
      return {
        ...property,
        state: LOCAL_UK_PROPERTY.state,
      };
    }
    return property;
  });

  db.units = db.units.map((unit) => {
    if (unit.tenant_phone === "555-0101") {
      changed = true;
      return {
        ...unit,
        unit_label: unit.unit_label === "Apt 1A" ? "Flat 1" : unit.unit_label,
        tenant_phone: "020 7946 0110",
      };
    }
    return unit;
  });

  db.maintenance_requests = db.maintenance_requests.map((request) => {
    let next = request;
    const diagnosisRecord =
      next.diagnosis && typeof next.diagnosis === "object"
        ? (next.diagnosis as Record<string, unknown>)
        : null;

    const diagnosisDescription = diagnosisRecord?.description;
    if (
      diagnosisDescription ===
      "Local development fallback diagnosis created because Supabase schema is not configured yet."
    ) {
      next = {
        ...next,
        diagnosis: {
          ...(next.diagnosis || {}),
          description:
            "Issue captured from the submitted photo. Review on site and confirm the required repair.",
        },
      };
      changed = true;
    }

    if (
      next.status === "dispatched" &&
      next.landlord_approved === true &&
      diagnosisRecord?.quote_status === "mock_requested" &&
      typeof diagnosisRecord?.contractor_quote !== "string"
    ) {
      next = {
        ...next,
        diagnosis: {
          ...(diagnosisRecord || {}),
          contractor_quote:
            "We can take this on for around £420 including labour and can attend tomorrow morning.",
          contractor_quote_confidence: 0.99,
          contractor_quote_received_at: next.updated_at || nowIso(),
          quote_status: "received",
        },
      };
      changed = true;
    }

    if (
      next.work_order?.dispatch_notes ===
      "Created in local development fallback mode. Verify scope and schedule directly with the tenant."
    ) {
      next = {
        ...next,
        work_order: {
          ...(next.work_order || {}),
          dispatch_notes:
            "Review the submitted photo, confirm the scope on site, and coordinate scheduling directly with the tenant.",
        },
      };
      changed = true;
    }

    if (
      next.voice_transcript ===
      "This is a local development fallback update. We have reviewed your request and selected a contractor shortlist."
    ) {
      next = {
        ...next,
        voice_transcript:
          "We have reviewed your request and prepared a contractor shortlist for the next step.",
      };
      changed = true;
    }

    if (
      next.contractors &&
      Array.isArray(next.contractors) &&
      next.contractors.some(
        (contractor) =>
          contractor?.address === "142 Atlantic Ave, Brooklyn, NY 11201"
      )
    ) {
      next = {
        ...next,
        contractors: buildMockContractors(),
        vetting: buildMockVetting(buildMockContractors()),
        assigned_contractor: buildMockVetting(buildMockContractors())[0],
        estimated_cost_low: buildMockVetting(buildMockContractors())[0]
          .estimated_cost_low,
        estimated_cost_high: buildMockVetting(buildMockContractors())[0]
          .estimated_cost_high,
        voice_transcript:
          "We have reviewed your request and prepared a contractor shortlist for the next step.",
      };

      if (next.work_order && typeof next.work_order === "object") {
        next.work_order = {
          ...next.work_order,
          property_address: `${LOCAL_UK_PROPERTY.address}, ${LOCAL_UK_PROPERTY.city}, ${LOCAL_UK_PROPERTY.state} ${LOCAL_UK_PROPERTY.zip}`,
          unit_label:
            next.work_order.unit_label === "Apt 1A"
              ? "Flat 1"
              : next.work_order.unit_label,
          tenant_phone:
            next.work_order.tenant_phone === "555-0101"
              ? "020 7946 0110"
              : next.work_order.tenant_phone,
          assigned_contractor_name: LOCAL_UK_CONTRACTORS[0].name,
          assigned_contractor_phone: LOCAL_UK_CONTRACTORS[0].phone,
          alternative_contractors: LOCAL_UK_CONTRACTORS.slice(1).map(
            (contractor) => ({
              name: contractor.name,
              phone: contractor.phone,
            })
          ),
        };
      }

      changed = true;
    }

    if (
      next.work_order?.property_address ===
      "14 Floral Street, London, UK WC2E 9DH"
    ) {
      next = {
        ...next,
        work_order: {
          ...(next.work_order || {}),
          property_address: `${LOCAL_UK_PROPERTY.address}, ${LOCAL_UK_PROPERTY.city}, ${LOCAL_UK_PROPERTY.state} ${LOCAL_UK_PROPERTY.zip}`,
        },
      };
      changed = true;
    }

    if (
      typeof next.work_order?.estimated_cost_range === "string" &&
      next.work_order.estimated_cost_range.includes("$")
    ) {
      next = {
        ...next,
        work_order: {
          ...(next.work_order || {}),
          estimated_cost_range: next.work_order.estimated_cost_range.replace(
            /\$/g,
            "£"
          ),
        },
      };
      changed = true;
    }

    return next;
  });

  if (changed) {
    writeDb(db);
  }

  return db;
}

function readDb(): LocalDb {
  if (!existsSync(DB_PATH)) {
    const db = defaultDb();
    writeDb(db);
    return db;
  }

  try {
    return migrateLegacyText(
      JSON.parse(readFileSync(DB_PATH, "utf8")) as LocalDb
    );
  } catch {
    const db = defaultDb();
    writeDb(db);
    return db;
  }
}

function writeDb(db: LocalDb) {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function deriveDisplayName(userId: string) {
  return `Tenant ${userId.slice(0, 6)}`;
}

function getProperty(db: LocalDb, propertyId: string) {
  return db.properties.find((property) => property.id === propertyId) ?? null;
}

function getUnit(db: LocalDb, unitId: string) {
  return db.units.find((unit) => unit.id === unitId) ?? null;
}

function attachUnitWithProperty(db: LocalDb, unit: LocalUnit | null) {
  if (!unit) return null;
  return {
    ...unit,
    properties: getProperty(db, unit.property_id),
  };
}

function attachRequest(db: LocalDb, request: LocalRequest) {
  return {
    ...request,
    units: attachUnitWithProperty(db, getUnit(db, request.unit_id)),
  };
}

function mockCategory(description: string | null) {
  const text = (description || "").toLowerCase();
  if (text.includes("water") || text.includes("leak") || text.includes("pipe"))
    return "plumbing";
  if (text.includes("heat") || text.includes("air") || text.includes("hvac"))
    return "hvac";
  if (text.includes("light") || text.includes("power") || text.includes("outlet"))
    return "electrical";
  if (text.includes("bug") || text.includes("pest")) return "pest";
  return "structural";
}

function buildMockDiagnosis(description: string | null) {
  const category = mockCategory(description);
  return {
    category,
    severity: 3,
    urgency: category === "electrical" ? "high" : "medium",
    description:
      description?.trim() ||
      "Issue captured from the submitted photo. Review on site and confirm the required repair.",
    affected_system: "Unit interior",
    recommended_action: "Inspect the issue on site and complete the standard repair workflow.",
    tenant_safety_note:
      category === "electrical"
        ? "Avoid using the affected fixture until it is inspected."
        : null,
    confidence: 0.78,
    contractor_quote:
      "We can take this on for around £420 including labour and can attend tomorrow morning.",
    contractor_quote_confidence: 0.99,
    contractor_quote_received_at: nowIso(),
    quote_status: "received",
    quote_source: ["local-dev-fallback"],
  };
}

function buildMockContractors() {
  return [...LOCAL_UK_CONTRACTORS];
}

function buildMockVetting(contractors: ReturnType<typeof buildMockContractors>) {
  return contractors.map((contractor, index) => ({
    ...contractor,
    review_summary:
      index === 0
        ? "Consistently strong reviews for punctuality and clean workmanship."
        : "Generally positive reputation with a few notes about slower scheduling.",
    red_flags:
      index === 0 ? [] : ["No issues verified in local dev fallback data."],
    estimated_cost_low: 220 + index * 40,
    estimated_cost_high: 420 + index * 60,
    sources: ["https://example.com/local-dev-fallback"],
  }));
}

function buildMockWorkOrder(params: {
  propertyAddress: string;
  unitLabel: string;
  tenantName: string;
  tenantPhone: string;
  diagnosis: ReturnType<typeof buildMockDiagnosis>;
  topContractor: Record<string, unknown>;
  vetting: ReturnType<typeof buildMockVetting>;
}) {
  return {
    property_address: params.propertyAddress,
    unit_label: params.unitLabel,
    tenant_name: params.tenantName,
    tenant_phone: params.tenantPhone,
    issue_description: params.diagnosis.description,
    category: params.diagnosis.category,
    severity: params.diagnosis.severity,
    recommended_action: params.diagnosis.recommended_action,
    assigned_contractor_name: String(params.topContractor.name || "Pending"),
    assigned_contractor_phone: String(params.topContractor.phone || "N/A"),
    estimated_cost_range: `£${params.vetting[0].estimated_cost_low} - £${params.vetting[0].estimated_cost_high}`,
    alternative_contractors: params.vetting.slice(1, 3).map((contractor) => ({
      name: contractor.name,
      phone: contractor.phone,
    })),
    dispatch_notes:
      "Review the submitted photo, confirm the scope on site, and coordinate scheduling directly with the tenant.",
  };
}

export function isLocalDevDataMode() {
  if (process.env.FIXFLOW_LOCAL_FALLBACK?.trim() === "1") return true;
  if (process.env.NODE_ENV === "production") return false;

  const hasServiceKey =
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) ||
    Boolean(process.env.SUPABASE_SECRET_KEY?.trim());

  return !hasServiceKey;
}

export function listUnitsForTenant(userId: string) {
  const db = readDb();
  let units = db.units.filter((unit) => unit.tenant_id === userId);

  if (units.length === 0) {
    const timestamp = nowIso();
    const property: LocalProperty = {
      id: randomUUID(),
      landlord_id: "local-landlord",
      ...LOCAL_UK_PROPERTY,
      unit_count: 1,
      created_at: timestamp,
      updated_at: timestamp,
    };
    const unit: LocalUnit = {
      id: randomUUID(),
      property_id: property.id,
      unit_label: "Flat 1",
      tenant_id: userId,
      tenant_name: deriveDisplayName(userId),
      tenant_phone: "020 7946 0110",
      created_at: timestamp,
      updated_at: timestamp,
    };

    db.properties.push(property);
    db.units.push(unit);
    writeDb(db);
    units = [unit];
  }

  return units
    .map((unit) => ({ id: unit.id, unit_label: unit.unit_label }))
    .sort((a, b) => a.unit_label.localeCompare(b.unit_label));
}

export function listPropertiesForLandlord(userId: string) {
  const db = readDb();
  return db.properties
    .filter((property) => property.landlord_id === userId)
    .map((property) => ({
      ...property,
      units: db.units.filter((unit) => unit.property_id === property.id),
    }))
    .sort((a, b) => a.address.localeCompare(b.address));
}

export function createPropertyWithUnits(params: {
  landlordId: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  units: Array<{
    unit_label?: string;
    tenant_name?: string;
    tenant_phone?: string;
    tenant_id?: string;
  }>;
}) {
  const db = readDb();
  const timestamp = nowIso();
  const property: LocalProperty = {
    id: randomUUID(),
    landlord_id: params.landlordId,
    address: params.address,
    city: params.city,
    state: params.state,
    zip: params.zip,
    unit_count: params.units.length || 1,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const units = (params.units.length > 0 ? params.units : [{ unit_label: "Unit 1" }]).map(
    (unit, index) => ({
      id: randomUUID(),
      property_id: property.id,
      unit_label: unit.unit_label?.trim() || `Unit ${index + 1}`,
      tenant_name: unit.tenant_name?.trim() || null,
      tenant_phone: unit.tenant_phone?.trim() || null,
      tenant_id: unit.tenant_id?.trim() || null,
      created_at: timestamp,
      updated_at: timestamp,
    })
  );

  db.properties.push(property);
  db.units.push(...units);
  writeDb(db);

  return {
    property,
    units: units.map((unit) => ({ id: unit.id, unit_label: unit.unit_label })),
  };
}

export function createMockRequest(params: {
  unitId: string;
  tenantId: string;
  photoUrl: string;
  description: string | null;
  preferredLanguage?: string | null;
}) {
  const db = readDb();
  const unit = getUnit(db, params.unitId);
  if (!unit) {
    throw new Error("Selected unit does not exist in local fallback store.");
  }

  const property = getProperty(db, unit.property_id);
  const diagnosis = buildMockDiagnosis(params.description);
  const diagnosisWithMeta = {
    ...diagnosis,
    ...getRequestLanguageMeta(params.preferredLanguage),
  };
  const contractors = buildMockContractors();
  const vetting = buildMockVetting(contractors);
  const topContractor = vetting[0];
  const workOrder = buildMockWorkOrder({
    propertyAddress: property
      ? `${property.address}, ${property.city}, ${property.state} ${property.zip}`
      : "Unknown Address",
    unitLabel: unit.unit_label,
    tenantName: unit.tenant_name || deriveDisplayName(params.tenantId),
    tenantPhone: unit.tenant_phone || "Not Provided",
    diagnosis: diagnosisWithMeta,
    topContractor,
    vetting,
  });

  const timestamp = nowIso();
  const request: LocalRequest = {
    id: randomUUID(),
    unit_id: params.unitId,
    tenant_id: params.tenantId,
    photo_url: params.photoUrl,
    description: params.description,
    status: "dispatched",
    diagnosis,
    contractors,
    vetting,
    work_order: workOrder,
    voice_update_url: MOCK_AUDIO_URL,
    voice_transcript:
      "We have reviewed your request and prepared a contractor shortlist for the next step.",
    assigned_contractor: topContractor,
    estimated_cost_low: topContractor.estimated_cost_low,
    estimated_cost_high: topContractor.estimated_cost_high,
    landlord_approved: true,
    created_at: timestamp,
    updated_at: timestamp,
  };

  db.maintenance_requests.unshift(request);
  writeDb(db);
  return request.id;
}

export function createLocalRequest(params: {
  unitId: string;
  tenantId: string;
  photoUrl: string;
  description: string | null;
  preferredLanguage?: string | null;
}) {
  const db = readDb();
  const unit = getUnit(db, params.unitId);
  if (!unit) {
    throw new Error("Selected unit does not exist in local fallback store.");
  }

  const timestamp = nowIso();
  const request: LocalRequest = {
    id: randomUUID(),
    unit_id: params.unitId,
    tenant_id: params.tenantId,
    photo_url: params.photoUrl,
    description: params.description,
    status: "submitted",
    diagnosis: getRequestLanguageMeta(params.preferredLanguage),
    contractors: null,
    vetting: null,
    work_order: null,
    voice_update_url: null,
    voice_transcript: null,
    assigned_contractor: null,
    estimated_cost_low: null,
    estimated_cost_high: null,
    landlord_approved: null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  db.maintenance_requests.unshift(request);
  writeDb(db);
  return request.id;
}

export function listRequestsForTenant(userId: string) {
  const db = readDb();
  return db.maintenance_requests
    .filter((request) => request.tenant_id === userId)
    .map((request) => attachRequest(db, request))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function listRequestsForLandlord(userId: string) {
  const db = readDb();
  return db.maintenance_requests
    .filter((request) => {
      const unit = getUnit(db, request.unit_id);
      const property = unit ? getProperty(db, unit.property_id) : null;
      return property?.landlord_id === userId;
    })
    .map((request) => attachRequest(db, request))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getRequestWithRelations(requestId: string) {
  const db = readDb();
  const request =
    db.maintenance_requests.find((entry) => entry.id === requestId) ?? null;
  if (!request) return null;
  return attachRequest(db, request);
}

export function canAccessRequest(userId: string, requestId: string) {
  const request = getRequestWithRelations(requestId);
  if (!request) return false;
  if (request.tenant_id === userId) return true;
  return request.units?.properties?.landlord_id === userId;
}

function applyRequestPatch(current: LocalRequest, patch: LocalRequestUpdatePatch) {
  const next: LocalRequest = {
    ...current,
    updated_at: nowIso(),
  };

  if ("status" in patch) {
    next.status = patch.status ?? current.status;
  }

  if ("diagnosis" in patch) {
    next.diagnosis = patch.diagnosis ?? null;
  } else if (patch.diagnosis_patch != null) {
    next.diagnosis = {
      ...(current.diagnosis || {}),
      ...patch.diagnosis_patch,
    };
  }

  if ("contractors" in patch) {
    next.contractors = patch.contractors ?? null;
  }

  if ("vetting" in patch) {
    next.vetting = patch.vetting ?? null;
  }

  if ("work_order" in patch) {
    next.work_order = patch.work_order ?? null;
  }

  if ("voice_update_url" in patch) {
    next.voice_update_url = patch.voice_update_url ?? null;
  }

  if ("voice_transcript" in patch) {
    next.voice_transcript = patch.voice_transcript ?? null;
  }

  if ("assigned_contractor" in patch) {
    next.assigned_contractor = patch.assigned_contractor ?? null;
  }

  if ("estimated_cost_low" in patch) {
    next.estimated_cost_low = patch.estimated_cost_low ?? null;
  }

  if ("estimated_cost_high" in patch) {
    next.estimated_cost_high = patch.estimated_cost_high ?? null;
  }

  if ("landlord_approved" in patch) {
    next.landlord_approved = patch.landlord_approved ?? null;
  }

  return next;
}

export function updateRequestRecord(
  requestId: string,
  patch: LocalRequestUpdatePatch
) {
  const db = readDb();
  const index = db.maintenance_requests.findIndex(
    (request) => request.id === requestId
  );

  if (index === -1) return null;

  const current = db.maintenance_requests[index];
  db.maintenance_requests[index] = applyRequestPatch(current, patch);

  writeDb(db);
  return attachRequest(db, db.maintenance_requests[index]);
}

export function updateRequest(
  requestId: string,
  patch: {
    assigned_contractor?: Record<string, unknown>;
    landlord_approved?: boolean;
    status?: string;
    diagnosis_patch?: Record<string, unknown>;
  }
) {
  return updateRequestRecord(requestId, patch);
}
