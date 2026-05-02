import { start } from "workflow/api";
import { runDiagnosis } from "@/lib/ai/diagnose";
import { discoverContractors } from "@/lib/ai/contractors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Contractor, Diagnosis } from "@/lib/schemas";
import { REQUEST_STATUSES } from "@/lib/schemas";

type RequestStatus = (typeof REQUEST_STATUSES)[number];

type WorkflowInput = {
  requestId: string;
};

type RequestContext = {
  requestId: string;
  address: string;
  city: string;
};

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

/** Vet / notify can exceed 25s (AI provider + tools, Twilio, ElevenLabs). */
function getInternalApiTimeoutMs(): number {
  const raw = process.env.WORKFLOW_INTERNAL_FETCH_TIMEOUT_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 10_000) return n;
  }
  return 120_000;
}

/** Must match Postgres `maintenance_requests_status_check` (Phase 1 enum). */
async function updateStatus(requestId: string, status: RequestStatus) {
  "use step";
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) {
    throw new Error(`Failed to update status ${status}: ${error.message}`);
  }
}

async function markFailed(requestId: string, message: string) {
  "use step";
  const supabase = createAdminClient();
  const { data, error: fetchError } = await supabase
    .from("maintenance_requests")
    .select("diagnosis")
    .eq("id", requestId)
    .single();

  if (fetchError) {
    console.error(
      `[maintenanceWorkflow] Could not fetch diagnosis before failure update: ${fetchError.message}`
    );
  }

  const diagnosis =
    data && typeof data.diagnosis === "object" && data.diagnosis !== null
      ? (data.diagnosis as Record<string, unknown>)
      : {};

  const { error: updateError } = await supabase
    .from("maintenance_requests")
    .update({
      diagnosis: {
        ...diagnosis,
        pipeline_error: message,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (updateError) {
    console.error(
      `[maintenanceWorkflow] Failed to persist pipeline_error: ${updateError.message}`
    );
  }
}

async function loadRequestContext(input: WorkflowInput): Promise<RequestContext> {
  "use step";
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("maintenance_requests")
    .select(
      `
      id,
      units (
        properties (
          address,
          city,
          state,
          zip
        )
      )
    `
    )
    .eq("id", input.requestId)
    .single();

  if (error || !data) {
    throw new Error(`Request ${input.requestId} not found`);
  }

  const units = (data as { units?: unknown }).units as
    | { properties?: unknown }
    | { properties?: unknown }[]
    | undefined;
  const unit = Array.isArray(units) ? units[0] : units;
  const properties = unit?.properties as
    | {
        address?: string;
        city?: string;
        state?: string;
        zip?: string;
      }
    | {
        address?: string;
        city?: string;
        state?: string;
        zip?: string;
      }[]
    | undefined;
  const property = Array.isArray(properties) ? properties[0] : properties;

  if (!property?.address) {
    throw new Error("Property address is missing for request");
  }

  const address = [property.address, property.city, property.state, property.zip]
    .filter(Boolean)
    .join(", ")
    .replace(", ,", ",");

  return {
    requestId: input.requestId,
    address,
    city: property.city || "Unknown",
  };
}

async function runDiagnosisStep(ctx: RequestContext): Promise<Diagnosis> {
  "use step";
  return runDiagnosis(ctx.requestId);
}

async function runContractorStep(
  ctx: RequestContext,
  diagnosis: Diagnosis
): Promise<Contractor[]> {
  "use step";
  return discoverContractors(
    ctx.requestId,
    diagnosis.category,
    ctx.address,
    diagnosis.urgency === "emergency"
  );
}

async function callInternalApi(path: string, body: Record<string, unknown>) {
  "use step";
  const controller = new AbortController();
  const ms = getInternalApiTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(`${getBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(
        `Internal API ${path} failed (${response.status}): ${JSON.stringify(payload)}`
      );
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function isLandlordApproved(requestId: string): Promise<boolean> {
  "use step";
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("maintenance_requests")
    .select("landlord_approved")
    .eq("id", requestId)
    .single();

  if (error || !data) {
    throw new Error(
      `Could not verify landlord approval before completion: ${error?.message || "missing row"}`
    );
  }

  return Boolean((data as { landlord_approved?: boolean | null }).landlord_approved);
}

export async function maintenanceWorkflow(input: WorkflowInput) {
  "use workflow";
  const ctx = await loadRequestContext(input);
  try {
    // runDiagnosis sets status → diagnosed (valid for DB CHECK constraint)
    const diagnosis = await runDiagnosisStep(ctx);

    const contractors = await runContractorStep(ctx, diagnosis);

    await callInternalApi("/api/vet", {
      requestId: ctx.requestId,
      contractors: contractors.slice(0, 3),
      repairType: diagnosis.category,
      city: ctx.city,
    });

    await callInternalApi("/api/work-order", { requestId: ctx.requestId });

    await callInternalApi("/api/notify", { requestId: ctx.requestId });

    // Only close the request when landlord approval is complete.
    const approved = await isLandlordApproved(ctx.requestId);
    if (approved) {
      await updateStatus(ctx.requestId, "resolved");
    }

    return { success: true, requestId: ctx.requestId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markFailed(ctx.requestId, message);
    throw error;
  }
}

export async function startMaintenanceWorkflow(requestId: string) {
  return start(maintenanceWorkflow, [{ requestId }]);
}
