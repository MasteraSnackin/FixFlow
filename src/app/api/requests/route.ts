import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDiagnosis } from "@/lib/ai/diagnose";
import { discoverContractors } from "@/lib/ai/contractors";
import type { SubmitRequestResponse, ApiError } from "@/lib/api-types";
import { createLocalRequest, isLocalDevDataMode } from "@/lib/local-dev-store";
import { runLocalAiPipeline } from "@/lib/local-ai-pipeline";
import { getRequestLanguageMeta } from "@/lib/request-language";

async function mergePipelineError(
  supabase: ReturnType<typeof createAdminClient>,
  requestId: string,
  message: string
) {
  const { data, error: fetchError } = await supabase
    .from("maintenance_requests")
    .select("diagnosis")
    .eq("id", requestId)
    .single();

  if (fetchError) {
    console.error("[pipeline] Could not load diagnosis for error merge:", fetchError);
  }

  const diagnosis =
    data && typeof data.diagnosis === "object" && data.diagnosis !== null
      ? (data.diagnosis as Record<string, unknown>)
      : {};

  const { error: updateError } = await supabase
    .from("maintenance_requests")
    .update({
      diagnosis: { ...diagnosis, pipeline_error: message },
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (updateError) {
    console.error("[pipeline] Failed to persist pipeline_error:", updateError);
  }
}

async function runPipeline(requestId: string, unitId: string) {
  const supabase = createAdminClient();

  try {
    // runDiagnosis sets status → diagnosed (matches DB CHECK constraint)
    const diagnosis = await runDiagnosis(requestId);

    const { data: unitData, error: unitError } = await supabase
      .from("units")
      .select("property_id, properties(address, city, state, zip)")
      .eq("id", unitId)
      .single();

    if (unitError || !unitData) {
      console.error("[pipeline] Failed to fetch unit/property:", unitError);
      return;
    }

    const property = unitData.properties as unknown as {
      address: string;
      city: string;
      state: string;
      zip: string;
    };
    const fullAddress = `${property.address}, ${property.city}, ${property.state} ${property.zip}`;

    const contractors = await discoverContractors(
      requestId,
      diagnosis.category,
      fullAddress,
      diagnosis.urgency === "emergency"
    );
    let notifySucceeded = true;

    // Trigger Person 3's downstream routes if available
    const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    try {
      const vetResponse = await fetch(`${baseUrl}/api/vet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          contractors: contractors.slice(0, 3),
          repairType: diagnosis.category,
          city: property.city,
        }),
      });
      if (!vetResponse.ok) {
        throw new Error(`Vetting route failed with ${vetResponse.status}`);
      }
    } catch {
      console.warn("[pipeline] Vetting route not available yet, skipping");
    }

    try {
      const workOrderResponse = await fetch(`${baseUrl}/api/work-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      if (!workOrderResponse.ok) {
        throw new Error(`Work-order route failed with ${workOrderResponse.status}`);
      }
    } catch {
      console.warn("[pipeline] Work-order route not available yet, skipping");
    }

    try {
      const notifyResponse = await fetch(`${baseUrl}/api/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      if (!notifyResponse.ok) {
        notifySucceeded = false;
        console.warn("[pipeline] Notification route returned non-OK response");
      }
    } catch {
      notifySucceeded = false;
      console.warn(
        "[pipeline] Notification route not available yet, skipping"
      );
    }

    if (notifySucceeded) {
      const { data: completionState, error: completionError } = await supabase
        .from("maintenance_requests")
        .select("landlord_approved")
        .eq("id", requestId)
        .single();

      if (completionError) {
        throw new Error(
          `Could not verify landlord approval before completion: ${completionError.message}`
        );
      }

      const approved = Boolean(
        (completionState as { landlord_approved?: boolean | null })
          ?.landlord_approved
      );
      if (!approved) {
        return;
      }

      await supabase
        .from("maintenance_requests")
        .update({
          status: "resolved",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);
    } else {
      await mergePipelineError(
        supabase,
        requestId,
        "Notification step failed or /api/notify is unavailable."
      );
    }
  } catch (error) {
    console.error("[pipeline] Error in pipeline for request", requestId, error);
    const message =
      error instanceof Error ? error.message : String(error);
    await mergePipelineError(supabase, requestId, message);
  }
}

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

async function triggerWorkflow(requestId: string) {
  const response = await fetch(`${getBaseUrl()}/api/workflows/maintenance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId }),
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(
      `Workflow trigger failed (${response.status}): ${payload || "unknown"}`
    );
  }
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let photo: File | null = null;
    let photoUrl: string | null = null;
    let description: string | null = null;
    let unitId: string | null = null;
    let tenantId: string | null = null;
    let preferredLanguage: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      photo = formData.get("photo") as File | null;
      description = formData.get("description") as string | null;
      unitId = formData.get("unit_id") as string | null;
      tenantId = formData.get("tenant_id") as string | null;
      preferredLanguage = formData.get("preferred_language") as string | null;
    } else {
      const body = (await req.json()) as {
        photo_url?: string;
        description?: string;
        unit_id?: string;
        tenant_id?: string;
        preferred_language?: string;
      };
      photoUrl = body.photo_url ?? null;
      description = body.description ?? null;
      unitId = body.unit_id ?? null;
      tenantId = body.tenant_id ?? null;
      preferredLanguage = body.preferred_language ?? null;
    }

    if (isLocalDevDataMode()) {
      if ((!photo && !photoUrl) || !unitId || !tenantId) {
        return NextResponse.json(
          {
            error:
              "Request requires unit_id, tenant_id, and either a photo file or photo_url",
          } satisfies ApiError,
          { status: 400 }
        );
      }

      let localPhotoUrl = photoUrl;
      if (photo) {
        const base64 = Buffer.from(await photo.arrayBuffer()).toString("base64");
        localPhotoUrl = `data:${photo.type};base64,${base64}`;
      }

      if (!localPhotoUrl) {
        return NextResponse.json(
          { error: "Photo URL could not be resolved" } satisfies ApiError,
          { status: 400 }
        );
      }

      const requestId = createLocalRequest({
        unitId,
        tenantId,
        photoUrl: localPhotoUrl,
        description: description || null,
        preferredLanguage,
      });

      after(() => {
        return runLocalAiPipeline(requestId).catch((error) => {
          console.error(
            "[/api/requests] Local AI pipeline error:",
            error
          );
        });
      });

      return NextResponse.json(
        { requestId } satisfies SubmitRequestResponse,
        { status: 201 }
      );
    }

    const supabase = createAdminClient();

    if ((!photo && !photoUrl) || !unitId || !tenantId) {
      return NextResponse.json(
        {
          error:
            "Request requires unit_id, tenant_id, and either a photo file or photo_url",
        } satisfies ApiError,
        { status: 400 }
      );
    }

    let filePath: string | null = null;
    let finalPhotoUrl = photoUrl;

    if (photo) {
      if (photo.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { error: "Photo must be under 10MB" } satisfies ApiError,
          { status: 400 }
        );
      }

      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(photo.type)) {
        return NextResponse.json(
          {
            error: "Photo must be JPEG, PNG, or WebP",
          } satisfies ApiError,
          { status: 400 }
        );
      }

      const fileExt =
        photo.type.split("/")[1] === "jpeg" ? "jpg" : photo.type.split("/")[1];
      filePath = `${unitId}/${Date.now()}.${fileExt}`;
      const fileBuffer = Buffer.from(await photo.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from("maintenance-photos")
        .upload(filePath, fileBuffer, {
          contentType: photo.type,
          upsert: false,
        });

      if (uploadError) {
        return NextResponse.json(
          {
            error: "Photo upload failed",
            details: uploadError.message,
          } satisfies ApiError,
          { status: 500 }
        );
      }

      const { data: signedData, error: signedError } = await supabase.storage
        .from("maintenance-photos")
        .createSignedUrl(filePath, 60 * 60 * 24 * 7);

      if (signedError) {
        const {
          data: { publicUrl },
        } = supabase.storage.from("maintenance-photos").getPublicUrl(filePath);
        finalPhotoUrl = publicUrl;
      } else {
        finalPhotoUrl = signedData.signedUrl;
      }
    }

    if (!finalPhotoUrl) {
      return NextResponse.json(
        { error: "Photo URL could not be resolved" } satisfies ApiError,
        { status: 400 }
      );
    }

    const { data: request, error: insertError } = await supabase
      .from("maintenance_requests")
      .insert({
        unit_id: unitId,
        tenant_id: tenantId,
        photo_url: finalPhotoUrl,
        description: description || null,
        diagnosis: getRequestLanguageMeta(preferredLanguage),
        status: "submitted",
      })
      .select("id")
      .single();

    if (insertError || !request) {
      // Clean up uploaded photo on DB failure
      if (filePath) {
        await supabase.storage.from("maintenance-photos").remove([filePath]);
      }
      return NextResponse.json(
        {
          error: "Failed to create maintenance request",
          details: insertError?.message,
        } satisfies ApiError,
        { status: 500 }
      );
    }

    // Prefer WDK workflow trigger for durable orchestration.
    // Keep sequential fallback to avoid blocking demo flow if WDK trigger fails.
    triggerWorkflow(request.id).catch((err) => {
      console.error(
        "[/api/requests] Workflow trigger failed, falling back to sequential pipeline:",
        err
      );
      runPipeline(request.id, unitId).catch((fallbackErr) =>
        console.error(
          "[/api/requests] Background fallback pipeline error:",
          fallbackErr
        )
      );
    });

    return NextResponse.json(
      { requestId: request.id } satisfies SubmitRequestResponse,
      { status: 201 }
    );
  } catch (error) {
    console.error("[/api/requests] Error:", error);
    return NextResponse.json(
      {
        error: "Request submission failed",
        details: error instanceof Error ? error.message : String(error),
      } satisfies ApiError,
      { status: 500 }
    );
  }
}
