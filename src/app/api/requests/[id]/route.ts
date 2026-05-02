import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  canAccessRequest as canAccessLocalRequest,
  getRequestWithRelations,
  isLocalDevDataMode,
  updateRequest as updateLocalRequest,
} from "@/lib/local-dev-store";

type UnitWithProperty = {
  unit_label?: string;
  tenant_id?: string | null;
  properties?: {
    address: string;
    city?: string;
    state?: string;
    zip?: string;
    landlord_id: string;
  } | null;
};

type MaintenanceRequestRow = {
  id: string;
  tenant_id: string;
  unit_id: string;
  photo_url: string;
  description: string | null;
  status: string;
  diagnosis: unknown;
  contractors: unknown;
  vetting: unknown;
  work_order: unknown;
  voice_update_url: string | null;
  voice_transcript?: string | null;
  assigned_contractor: unknown;
  estimated_cost_low: number | null;
  estimated_cost_high: number | null;
  landlord_approved: boolean;
  created_at: string;
  updated_at: string;
  units?: UnitWithProperty | UnitWithProperty[] | null;
};

function normalizeUnits(
  units: MaintenanceRequestRow["units"]
): UnitWithProperty | null {
  if (!units) return null;
  if (Array.isArray(units)) return units[0] ?? null;
  return units;
}

function normalizeProperty(
  p: UnitWithProperty["properties"]
): { landlord_id: string; address?: string } | null {
  if (!p) return null;
  if (Array.isArray(p)) return (p[0] as { landlord_id: string }) ?? null;
  return p as { landlord_id: string; address?: string };
}

function canAccessRequest(
  userId: string,
  row: MaintenanceRequestRow
): boolean {
  if (row.tenant_id === userId) return true;
  const u = normalizeUnits(row.units);
  const props = normalizeProperty(u?.properties ?? null);
  const landlordId = props?.landlord_id;
  if (landlordId && landlordId === userId) return true;
  return false;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    if (isLocalDevDataMode()) {
      const request = getRequestWithRelations(id);
      if (!request) {
        return NextResponse.json({ error: "Request not found" }, { status: 404 });
      }
      if (!canAccessLocalRequest(userId, id)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.json({ request });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("maintenance_requests")
      .select(
        `
        *,
        units (
          unit_label,
          tenant_id,
          properties (
            address,
            city,
            state,
            zip,
            landlord_id
          )
        )
      `
      )
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Request not found" },
        { status: 404 }
      );
    }

    const row = data as MaintenanceRequestRow;
    if (!canAccessRequest(userId, row)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    return NextResponse.json({ request: row });
  } catch (e) {
    console.error("[GET /api/requests/[id]]", e);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const body = (await req.json()) as {
      assigned_contractor?: Record<string, unknown>;
      landlord_approved?: boolean;
      status?: string;
      diagnosis_patch?: Record<string, unknown>;
    };

    if (
      !body.assigned_contractor &&
      body.landlord_approved == null &&
      !body.status &&
      !body.diagnosis_patch
    ) {
      return NextResponse.json(
        {
          error:
            "assigned_contractor, landlord_approved, status, or diagnosis_patch is required",
        },
        { status: 400 }
      );
    }

    if (isLocalDevDataMode()) {
      if (!canAccessLocalRequest(userId, id)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const updated = updateLocalRequest(id, {
        assigned_contractor: body.assigned_contractor,
        landlord_approved: body.landlord_approved,
        status: body.status,
        diagnosis_patch: body.diagnosis_patch,
      });

      if (!updated) {
        return NextResponse.json({ error: "Request not found" }, { status: 404 });
      }

      return NextResponse.json({ request: updated });
    }

    const supabase = createAdminClient();
    const { data: existing, error: fetchError } = await supabase
      .from("maintenance_requests")
      .select(
        `
        id,
        tenant_id,
        diagnosis,
        assigned_contractor,
        landlord_approved,
        status,
        units (
          properties ( landlord_id )
        )
      `
      )
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Request not found" },
        { status: 404 }
      );
    }

    const row = existing as unknown as MaintenanceRequestRow;
    if (!canAccessRequest(userId, row)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const currentDiagnosis =
      row.diagnosis && typeof row.diagnosis === "object" && !Array.isArray(row.diagnosis)
        ? (row.diagnosis as Record<string, unknown>)
        : {};

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.assigned_contractor !== undefined) {
      updatePayload.assigned_contractor = body.assigned_contractor;
    }
    if (body.landlord_approved !== undefined) {
      updatePayload.landlord_approved = body.landlord_approved;
    }
    if (body.status !== undefined) {
      updatePayload.status = body.status;
    }
    if (body.diagnosis_patch) {
      updatePayload.diagnosis = {
        ...currentDiagnosis,
        ...body.diagnosis_patch,
      };
    }

    const { data: updated, error: updateError } = await supabase
      .from("maintenance_requests")
      .update(updatePayload)
      .eq("id", id)
      .select(
        `
        *,
        units (
          unit_label,
          tenant_id,
          properties (
            address,
            city,
            state,
            zip,
            landlord_id
          )
        )
      `
      )
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ request: updated });
  } catch (e) {
    console.error("[PATCH /api/requests/[id]]", e);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
