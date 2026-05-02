import { Buffer } from "buffer";
import { diagnoseFromPhoto } from "@/lib/ai/diagnose";
import {
  assertCategory,
  discoverLiveContractors,
  generateAiQuoteEstimate,
  type VettedContractor,
  vetLiveContractors,
} from "@/lib/ai/contractor-intelligence";
import { translateTextForRequestLanguage } from "@/lib/ai/translate";
import { getFixFlowProviderLabel } from "@/lib/ai/provider";
import { getFixFlowWebProviderLabel } from "@/lib/brightdata";
import {
  getRequestLanguageFromMetadata,
  getRequestLanguageMeta,
} from "@/lib/request-language";
import {
  type Diagnosis,
  WorkOrderSchema,
} from "@/lib/schemas";
import {
  getElevenLabsModelId,
  getElevenLabsVoiceId,
} from "@/lib/comm/config";
import {
  getRequestWithRelations,
  updateRequestRecord,
} from "@/lib/local-dev-store";

type LocalRequestWithRelations = NonNullable<
  ReturnType<typeof getRequestWithRelations>
>;

type LocalUnitWithProperty = {
  unit_label?: string | null;
  tenant_name?: string | null;
  tenant_phone?: string | null;
  properties?: {
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
  } | null;
};

function toObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function requireLocalRequest(requestId: string): LocalRequestWithRelations {
  const request = getRequestWithRelations(requestId);
  if (!request) {
    throw new Error(`Local request ${requestId} was not found`);
  }
  return request;
}

function normalizeUnit(request: LocalRequestWithRelations): LocalUnitWithProperty {
  const unit = request.units as LocalUnitWithProperty | undefined;
  if (!unit) {
    throw new Error("Local request is missing its linked unit");
  }
  return unit;
}

function buildFullAddress(unit: LocalUnitWithProperty) {
  const property = unit.properties;
  if (!property?.address) {
    throw new Error("Local request is missing its linked property address");
  }

  return [property.address, property.city, property.state, property.zip]
    .filter(Boolean)
    .join(", ")
    .replace(", ,", ",");
}

async function loadPhotoBuffer(photoUrl: string): Promise<Buffer> {
  if (photoUrl.startsWith("data:")) {
    const commaIndex = photoUrl.indexOf(",");
    if (commaIndex === -1) {
      throw new Error("Could not parse the submitted image data URL");
    }
    return Buffer.from(photoUrl.slice(commaIndex + 1), "base64");
  }

  const response = await fetch(photoUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download the submitted photo: ${response.status} ${response.statusText}`
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

async function generateLiveWorkOrder(params: {
  unit: LocalUnitWithProperty;
  diagnosis: Diagnosis;
  vetting: VettedContractor[];
}) {
  const topContractor =
    params.vetting[0] ??
    ({
      name: "Pending selection",
      phone: "Not available",
      estimated_cost_low: 0,
      estimated_cost_high: 0,
    } as VettedContractor);

  const costLow = topContractor.estimated_cost_low || 0;
  const costHigh = topContractor.estimated_cost_high || 0;

  const workOrder = WorkOrderSchema.parse({
    property_address: buildFullAddress(params.unit),
    unit_label: params.unit.unit_label || "Unknown Unit",
    tenant_name: params.unit.tenant_name || "Resident",
    tenant_phone: params.unit.tenant_phone || "Not provided",
    issue_description: params.diagnosis.description,
    category: params.diagnosis.category,
    severity: params.diagnosis.severity,
    recommended_action: params.diagnosis.recommended_action,
    assigned_contractor_name: String(topContractor.name || "Pending selection"),
    assigned_contractor_phone: String(topContractor.phone || "Not available"),
    estimated_cost_range:
      costLow > 0 && costHigh > 0 ? `£${costLow} - £${costHigh}` : "Pending",
    alternative_contractors: params.vetting.slice(1, 3).map((contractor) => ({
      name: contractor.name,
      phone: contractor.phone,
    })),
    dispatch_notes:
      params.diagnosis.urgency === "emergency"
        ? "Treat this as a priority attendance. Confirm safety on arrival, isolate risk if required, and update the tenant immediately after inspection."
        : "Review the diagnosed issue on site, confirm scope before starting work, and coordinate access directly with the tenant.",
  });

  return {
    workOrder,
    topContractor,
    costLow,
    costHigh,
  };
}

function truncateText(value: string, max: number) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trim()}...`;
}

function buildQuoteVoiceScript(params: {
  category: string;
  issueDescription: string;
  costLow: number;
  costHigh: number;
  propertyHint: string | null;
  isEmergency: boolean;
  safetyHint: string | null;
}) {
  const desc = truncateText(params.issueDescription, 130);
  const where = params.propertyHint
    ? ` at ${truncateText(params.propertyHint, 55)}`
    : "";
  const urgent = params.isEmergency ? " This is time-sensitive. " : " ";
  const safe = params.safetyHint
    ? ` Safety note: ${truncateText(params.safetyHint, 85)}. `
    : "";
  return `Hi, this is FixFlow.${urgent}Quick summary: ${params.category} issue${where}. ${desc}.${safe}Rough range about ${params.costLow} to ${params.costHigh} pounds. We have prepared a grounded AI estimate and contractor shortlist for review.`;
}

function buildProgressVoiceScript(params: {
  category: string;
  issueDescription: string;
  propertyHint: string | null;
  isEmergency: boolean;
  safetyHint: string | null;
}) {
  const desc = truncateText(params.issueDescription, 130);
  const where = params.propertyHint
    ? ` at ${truncateText(params.propertyHint, 55)}`
    : "";
  const urgent = params.isEmergency ? " This is time-sensitive. " : " ";
  const safe = params.safetyHint
    ? ` Safety note: ${truncateText(params.safetyHint, 85)}. `
    : "";
  return `Hi, this is FixFlow.${urgent}We have reviewed your ${params.category} issue${where}. ${desc}.${safe}We are now preparing the contractor shortlist and next-step plan.`;
}

function buildPipelineDelayVoiceScript(params: {
  category: string;
  issueDescription: string;
  propertyHint: string | null;
  isEmergency: boolean;
  safetyHint: string | null;
}) {
  const desc = truncateText(params.issueDescription, 120);
  const where = params.propertyHint
    ? ` at ${truncateText(params.propertyHint, 55)}`
    : "";
  const urgent = params.isEmergency ? " This remains time-sensitive. " : " ";
  const safe = params.safetyHint
    ? ` Safety note: ${truncateText(params.safetyHint, 85)}. `
    : "";
  return `Hi, this is FixFlow.${urgent}We have reviewed your ${params.category} issue${where}. ${desc}.${safe}We are still finalising the contractor checks, but your request is active and under review.`;
}

async function generateLocalVoiceAudio(script: string) {
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!elevenLabsKey) {
    return {
      audioUrl: null,
      source: "unavailable",
    } as const;
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${getElevenLabsVoiceId()}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": elevenLabsKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: script,
        model_id: getElevenLabsModelId(),
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.4,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`ElevenLabs audio generation failed: ${errText || response.status}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  return {
    audioUrl: `data:audio/mpeg;base64,${audioBuffer.toString("base64")}`,
    source: "elevenlabs",
  } as const;
}

async function persistLocalVoiceUpdate(params: {
  requestId: string;
  script: string;
  preferredLanguage?: string | null;
  diagnosisPatch?: Record<string, unknown>;
}) {
  const localizedScript = await translateTextForRequestLanguage({
    text: params.script,
    targetLanguage: params.preferredLanguage,
    purpose: "tenant voice update audio and transcript",
  }).catch((error) => {
    console.error("[local-ai] Voice translation failed:", error);
    return {
      text: params.script,
      translated: false,
      languageCode: getRequestLanguageFromMetadata({
        preferred_language: params.preferredLanguage,
      }).code,
      languageLabel: getRequestLanguageFromMetadata({
        preferred_language: params.preferredLanguage,
      }).label,
      originalText: params.script,
    };
  });

  const audio = await generateLocalVoiceAudio(localizedScript.text).catch((error) => {
    console.error("[local-ai] Voice update generation failed:", error);
    return {
      audioUrl: null,
      source: "failed",
    } as const;
  });

  const currentDiagnosis = toObject(requireLocalRequest(params.requestId).diagnosis);
  const currentQuoteComms = toObject(currentDiagnosis.quote_comms);
  const patchQuoteComms = toObject(params.diagnosisPatch?.quote_comms);

  const nextDiagnosis: Record<string, unknown> = {
    ...currentDiagnosis,
    ...(params.diagnosisPatch || {}),
    quote_comms: {
      ...currentQuoteComms,
      ...patchQuoteComms,
      audio_source: audio.source,
    },
    call_script: localizedScript.text,
    voice_transcript_language: localizedScript.languageCode,
    voice_transcript_language_label: localizedScript.languageLabel,
    ...(localizedScript.translated
      ? { voice_transcript_original: params.script }
      : {}),
  };

  updateRequestRecord(params.requestId, {
    diagnosis: nextDiagnosis,
    voice_transcript: localizedScript.text,
    ...(audio.audioUrl ? { voice_update_url: audio.audioUrl } : {}),
  });

  return audio;
}

function mergeDiagnosisMeta(
  diagnosis: Diagnosis,
  patch: Record<string, unknown>,
  preferredLanguage?: string | null
): Record<string, unknown> {
  return {
    ...diagnosis,
    ...patch,
    ...getRequestLanguageMeta(preferredLanguage),
    pipeline_mode: "local_live_ai",
    pipeline_provider: getFixFlowProviderLabel(),
    pipeline_web_provider: getFixFlowWebProviderLabel(),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  label: string,
  task: () => Promise<T>,
  attempts: number = 3
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleep(2_000 * attempt);
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label} failed after ${attempts} attempts: ${message}`);
}

export async function runLocalAiPipeline(requestId: string) {
  try {
    const request = requireLocalRequest(requestId);
    const unit = normalizeUnit(request);
    const propertyAddress = buildFullAddress(unit);
    const city = unit.properties?.city || "Unknown";
    const photoBuffer = await loadPhotoBuffer(String(request.photo_url));
    const requestLanguage = getRequestLanguageFromMetadata(request.diagnosis);

    updateRequestRecord(requestId, {
      diagnosis_patch: {
        pipeline_mode: "local_live_ai",
        pipeline_provider: getFixFlowProviderLabel(),
        pipeline_web_provider: getFixFlowWebProviderLabel(),
        pipeline_started_at: new Date().toISOString(),
        pipeline_stage: "diagnosis",
      },
    });

    const diagnosis = await withRetry("diagnosis", () =>
      diagnoseFromPhoto(photoBuffer, request.description)
    );
    const diagnosisRecord = mergeDiagnosisMeta(diagnosis, {
      needs_review: diagnosis.confidence < 0.6,
      pipeline_stage: "contractor_discovery",
    }, requestLanguage.code);

    updateRequestRecord(requestId, {
      status: "diagnosed",
      diagnosis: diagnosisRecord,
    });

    const initialVoiceScript = buildProgressVoiceScript({
      category: diagnosis.category,
      issueDescription: diagnosis.description,
      propertyHint: unit.properties?.address || null,
      isEmergency: diagnosis.urgency === "emergency",
      safetyHint: diagnosis.tenant_safety_note,
    });

    await persistLocalVoiceUpdate({
      requestId,
      script: initialVoiceScript,
      preferredLanguage: requestLanguage.code,
      diagnosisPatch: {
        pipeline_stage: "contractor_discovery",
        voice_update_stage: "diagnosis",
      },
    });

    assertCategory(diagnosis.category);
    const contractors = await withRetry("contractor discovery", () =>
      discoverLiveContractors(
        diagnosis.category,
        propertyAddress,
        diagnosis.urgency === "emergency"
      )
    );

    updateRequestRecord(requestId, {
      contractors: contractors as unknown as Record<string, unknown>[],
      diagnosis_patch: {
        pipeline_stage: "vetting",
      },
    });

    const vetting = await withRetry("contractor vetting", () =>
      vetLiveContractors({
        contractors,
        repairType: diagnosis.category,
        city,
      })
    );
    const topContractor = vetting[0] ?? null;
    const estimatedCostLow =
      topContractor && topContractor.estimated_cost_low > 0
        ? topContractor.estimated_cost_low
        : null;
    const estimatedCostHigh =
      topContractor && topContractor.estimated_cost_high > 0
        ? topContractor.estimated_cost_high
        : null;

    updateRequestRecord(requestId, {
      vetting: vetting as unknown as Record<string, unknown>[],
      estimated_cost_low: estimatedCostLow,
      estimated_cost_high: estimatedCostHigh,
      diagnosis_patch: {
        pipeline_stage: "work_order",
      },
    });

    const { workOrder, costLow, costHigh } = await withRetry(
      "work order generation",
      () =>
        generateLiveWorkOrder({
          unit,
          diagnosis,
          vetting,
        })
    );

    updateRequestRecord(requestId, {
      work_order: workOrder as unknown as Record<string, unknown>,
      assigned_contractor:
        topContractor == null
          ? null
          : (topContractor as unknown as Record<string, unknown>),
      estimated_cost_low: costLow > 0 ? costLow : estimatedCostLow,
      estimated_cost_high: costHigh > 0 ? costHigh : estimatedCostHigh,
      landlord_approved: false,
      diagnosis_patch: {
        pipeline_stage: "quote_estimate",
      },
    });

    if (topContractor != null) {
      const aiQuote = await withRetry("AI quote estimate", () =>
        generateAiQuoteEstimate({
          contractor: topContractor,
          diagnosis,
          propertyAddress,
          city,
          costLow: costLow > 0 ? costLow : estimatedCostLow ?? 0,
          costHigh: costHigh > 0 ? costHigh : estimatedCostHigh ?? 0,
        })
      );

      const voiceScript = buildQuoteVoiceScript({
        category: diagnosis.category,
        issueDescription: diagnosis.description,
        costLow: costLow > 0 ? costLow : estimatedCostLow ?? 0,
        costHigh: costHigh > 0 ? costHigh : estimatedCostHigh ?? 0,
        propertyHint: unit.properties?.address || null,
        isEmergency: diagnosis.urgency === "emergency",
        safetyHint: diagnosis.tenant_safety_note,
      });

      await persistLocalVoiceUpdate({
        requestId,
        script: voiceScript,
        preferredLanguage: requestLanguage.code,
        diagnosisPatch: {
          contractor_quote: aiQuote.contractor_quote,
          contractor_quote_confidence: aiQuote.contractor_quote_confidence,
          contractor_quote_received_at: new Date().toISOString(),
          quote_status: "estimated",
          quote_source: [
            "ai_estimate",
            getFixFlowProviderLabel(),
            getFixFlowWebProviderLabel(),
          ],
          quote_generated_at: new Date().toISOString(),
          pipeline_stage: "complete",
          voice_update_stage: "final_quote",
          quote_comms: {
            estimate_mode: "ai_grounded_estimate",
          },
        },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[local-ai] Pipeline failed for ${requestId}:`, error);

    const currentRequest = getRequestWithRelations(requestId);
    const currentDiagnosis = toObject(currentRequest?.diagnosis);
    const failurePatch = {
      pipeline_error: message,
      pipeline_failed_at: new Date().toISOString(),
      pipeline_mode: "local_live_ai",
      pipeline_provider: getFixFlowProviderLabel(),
      pipeline_web_provider: getFixFlowWebProviderLabel(),
      quote_status:
        typeof currentDiagnosis.quote_status === "string"
          ? currentDiagnosis.quote_status
          : "pipeline_delayed",
      voice_update_stage:
        typeof currentDiagnosis.voice_update_stage === "string"
          ? currentDiagnosis.voice_update_stage
          : "pipeline_delay",
    };

    updateRequestRecord(requestId, {
      diagnosis_patch: failurePatch,
    });

    if (!currentRequest?.voice_update_url && currentDiagnosis.description) {
      const propertyAddress =
        currentRequest?.units?.properties &&
        typeof currentRequest.units.properties.address === "string"
          ? currentRequest.units.properties.address
          : null;

      const fallbackScript = buildPipelineDelayVoiceScript({
        category:
          typeof currentDiagnosis.category === "string"
            ? currentDiagnosis.category
            : "maintenance",
        issueDescription:
          typeof currentDiagnosis.description === "string"
            ? currentDiagnosis.description
            : "the reported issue",
        propertyHint: propertyAddress,
        isEmergency:
          typeof currentDiagnosis.urgency === "string" &&
          currentDiagnosis.urgency === "emergency",
        safetyHint:
          typeof currentDiagnosis.tenant_safety_note === "string"
            ? currentDiagnosis.tenant_safety_note
            : null,
      });

      await persistLocalVoiceUpdate({
        requestId,
        script: fallbackScript,
        preferredLanguage:
          typeof currentDiagnosis.preferred_language === "string"
            ? currentDiagnosis.preferred_language
            : "en-GB",
        diagnosisPatch: failurePatch,
      });
    }
  }
}
