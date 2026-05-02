import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAppUrl,
  getElevenLabsModelId,
  getElevenLabsVoiceId,
  getLandlordOverridePhone,
  getQuoteNotifyEmail,
  getResendConfig,
  getTwilioConfig,
  isPublicHttpsAppUrl,
} from "@/lib/comm/config";
import { placeTwilioCall } from "@/lib/comm/twilio";
import { sendQuoteRequestEmail } from "@/lib/comm/email";
import { translateTextForRequestLanguage } from "@/lib/ai/translate";
import {
  getRequestLanguageFromMetadata,
  getRequestLanguageMeta,
} from "@/lib/request-language";

type RequestRow = {
  id: string;
  photo_url: string | null;
  diagnosis: Record<string, unknown> | null;
  contractors: Record<string, unknown>[] | null;
  assigned_contractor: Record<string, unknown> | null;
  vetting: Record<string, unknown>[] | null;
  estimated_cost_low: number | null;
  estimated_cost_high: number | null;
  landlord_approved: boolean | null;
  units:
    | {
        unit_label?: string | null;
        tenant_name?: string | null;
        tenant_phone?: string | null;
        properties?:
          | { address?: string | null }
          | { address?: string | null }[]
          | null;
      }
    | {
        unit_label?: string | null;
        tenant_name?: string | null;
        tenant_phone?: string | null;
        properties?:
          | { address?: string | null }
          | { address?: string | null }[]
          | null;
      }[]
    | null;
};

const MOCK_AUDIO_URL =
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

function toObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function firstFromUnknownArray<T>(value: unknown): T | null {
  return Array.isArray(value) ? ((value[0] as T | undefined) ?? null) : null;
}

function escapeXml(raw: string) {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncateText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

/** Short script for the phone call (ElevenLabs / Twilio Say) — not the full email body. */
function buildQuoteVoiceScript(params: {
  category: string;
  issueDescription: string;
  costLow: number;
  costHigh: number;
  propertyHint: string | null;
  isEmergency: boolean;
  safetyHint: string | null;
}): string {
  const desc = truncateText(params.issueDescription, 130);
  const where = params.propertyHint
    ? ` at ${truncateText(params.propertyHint, 55)}`
    : "";
  const urgent = params.isEmergency
    ? " This is time-sensitive. "
    : " ";
  const safe = params.safetyHint
    ? ` Safety note: ${truncateText(params.safetyHint, 85)}. `
    : "";
  return `Hi, this is FixFlow.${urgent}Quick summary: ${params.category} issue${where}. ${desc}.${safe}Rough range about ${params.costLow} to ${params.costHigh} pounds. What's your quote?`;
}

/** Inline TwiML when Twilio cannot reach APP_URL (local dev without ngrok). */
function buildInlineQuoteCallTwiml(opts: {
  audioUrl: string;
  audioSource: string;
  voiceScript: string;
  notifyEmail: string;
}) {
  const { audioUrl, audioSource, voiceScript, notifyEmail } = opts;
  const outro = `If you prefer, you can also email your quote to ${notifyEmail}. Goodbye.`;
  let inner = "";
  if (audioSource === "elevenlabs") {
    inner += `<Play>${escapeXml(audioUrl)}</Play><Pause length="1"/>`;
  } else {
    inner += `<Say voice="alice">${escapeXml(voiceScript)}</Say><Pause length="1"/>`;
  }
  inner += `<Say voice="alice">${escapeXml(outro)}</Say>`;
  return `<Response>${inner}</Response>`;
}

function pickEstimatedCost(request: RequestRow) {
  const fallbackLow = 150;
  const fallbackHigh = 450;
  const vettingTop = firstFromUnknownArray<Record<string, unknown>>(request.vetting);
  const fromVettingLow = Number(vettingTop?.estimated_cost_low ?? 0);
  const fromVettingHigh = Number(vettingTop?.estimated_cost_high ?? 0);

  const low =
    (request.estimated_cost_low && request.estimated_cost_low > 0
      ? request.estimated_cost_low
      : fromVettingLow > 0
      ? fromVettingLow
      : fallbackLow) ?? fallbackLow;
  const high =
    (request.estimated_cost_high && request.estimated_cost_high > 0
      ? request.estimated_cost_high
      : fromVettingHigh > 0
      ? fromVettingHigh
      : fallbackHigh) ?? fallbackHigh;

  return {
    low: Math.min(low, high),
    high: Math.max(low, high),
  };
}

async function buildAudioUrl(
  supabase: ReturnType<typeof createAdminClient>,
  requestId: string,
  script: string
) {
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!elevenLabsKey) {
    return { audioUrl: MOCK_AUDIO_URL, source: "mock", filePath: null };
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
    console.error("ElevenLabs API failed:", errText);
    return { audioUrl: MOCK_AUDIO_URL, source: "mock", filePath: null };
  }

  const audioBuffer = await response.arrayBuffer();
  const filePath = `voice-updates/${requestId}_${Date.now()}.mp3`;
  const { error: uploadError } = await supabase.storage
    .from("maintenance-photos")
    .upload(filePath, audioBuffer, {
      contentType: "audio/mpeg",
      upsert: true,
    });

  if (uploadError) {
    console.error("Failed to upload audio to Supabase Storage:", uploadError);
    return { audioUrl: MOCK_AUDIO_URL, source: "mock", filePath: null };
  }

  const { data: signedData, error: signError } = await supabase.storage
    .from("maintenance-photos")
    .createSignedUrl(filePath, 3600);

  if (signError || !signedData?.signedUrl) {
    console.error("Failed to create signed URL:", signError);
    const { data: publicUrlData } = supabase.storage
      .from("maintenance-photos")
      .getPublicUrl(filePath);
    return {
      audioUrl: publicUrlData?.publicUrl || MOCK_AUDIO_URL,
      source: publicUrlData?.publicUrl ? "elevenlabs" : "mock",
      filePath,
    };
  }

  return {
    audioUrl: signedData.signedUrl,
    source: "elevenlabs",
    filePath,
  };
}

async function persistNotifyUpdate(
  supabase: ReturnType<typeof createAdminClient>,
  requestId: string,
  payload: {
    audioUrl: string;
    transcript: string;
    estimatedCostLow: number;
    estimatedCostHigh: number;
    mergedDiagnosis: Record<string, unknown>;
  }
) {
  const baseUpdate = {
    voice_update_url: payload.audioUrl,
    estimated_cost_low: payload.estimatedCostLow,
    estimated_cost_high: payload.estimatedCostHigh,
    diagnosis: payload.mergedDiagnosis,
    updated_at: new Date().toISOString(),
  };

  const withTranscript = {
    ...baseUpdate,
    voice_transcript: payload.transcript,
  };

  const { error: firstError } = await supabase
    .from("maintenance_requests")
    .update(withTranscript)
    .eq("id", requestId);

  if (!firstError) return null;

  // Backward-compatible fallback for schemas that don't have voice_transcript yet.
  const missingVoiceTranscript =
    firstError.code === "PGRST204" &&
    firstError.message.includes("voice_transcript");
  if (!missingVoiceTranscript) {
    return firstError;
  }

  const mergedDiagnosisWithTranscript = {
    ...payload.mergedDiagnosis,
    voice_transcript_fallback: payload.transcript,
  };
  const { error: fallbackError } = await supabase
    .from("maintenance_requests")
    .update({
      ...baseUpdate,
      diagnosis: mergedDiagnosisWithTranscript,
    })
    .eq("id", requestId);

  return fallbackError ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const { requestId } = (await req.json()) as { requestId?: string };
    if (!requestId) {
      return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error: fetchError } = await supabase
      .from("maintenance_requests")
      .select(
        `
        id,
        photo_url,
        diagnosis,
        contractors,
        assigned_contractor,
        vetting,
        estimated_cost_low,
        estimated_cost_high,
        landlord_approved,
        units (
          unit_label,
          tenant_name,
          tenant_phone,
          properties ( address )
        )
      `
      )
      .eq("id", requestId)
      .single();

    if (fetchError || !data) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const request = data as RequestRow;
    const diagnosis = toObject(request.diagnosis);
    const requestLanguage = getRequestLanguageFromMetadata(diagnosis);
    const unit = Array.isArray(request.units)
      ? request.units[0]
      : request.units || null;
    const property = Array.isArray(unit?.properties)
      ? unit?.properties[0]
      : unit?.properties;

    const contractor =
      request.assigned_contractor ||
      firstFromUnknownArray<Record<string, unknown>>(request.vetting) ||
      firstFromUnknownArray<Record<string, unknown>>(request.contractors) ||
      {};

    const contractorName =
      (typeof contractor.name === "string" && contractor.name) ||
      "selected contractor";
    const contractorPhone =
      (typeof contractor.phone === "string" && contractor.phone) || "unknown";
    const category =
      (typeof diagnosis.category === "string" && diagnosis.category) ||
      "maintenance";
    const issueDescription =
      (typeof diagnosis.description === "string" && diagnosis.description) ||
      "the reported issue";
    const safetyHint =
      typeof diagnosis.tenant_safety_note === "string" &&
      diagnosis.tenant_safety_note.length > 0
        ? diagnosis.tenant_safety_note
        : null;
    const isEmergency =
      typeof diagnosis.urgency === "string" &&
      diagnosis.urgency.toLowerCase() === "emergency";

    const { low: costLow, high: costHigh } = pickEstimatedCost(request);
    const landlordPhone = getLandlordOverridePhone();
    const notifyEmail = getQuoteNotifyEmail();

    const voiceScript = buildQuoteVoiceScript({
      category,
      issueDescription,
      costLow,
      costHigh,
      propertyHint: property?.address ?? null,
      isEmergency,
      safetyHint,
    });
    const localizedVoice = await translateTextForRequestLanguage({
      text: voiceScript,
      targetLanguage: requestLanguage.code,
      purpose: "tenant voice update audio and contractor quote request",
    }).catch((error) => {
      console.error("[notify] Voice translation failed:", error);
      return {
        text: voiceScript,
        translated: false,
        languageCode: requestLanguage.code,
        languageLabel: requestLanguage.label,
        originalText: voiceScript,
      };
    });

    const emailSubject = `FixFlow quote request: ${category} for ${unit?.unit_label || "unit"}`;
    const emailText = [
      "FixFlow quote request",
      `Request ID: ${request.id}`,
      `Property: ${property?.address || "Unknown address"}`,
      `Issue: ${issueDescription}`,
      `Category: ${category}`,
      `Contractor: ${contractorName} (${contractorPhone})`,
      `Estimated quote range: £${costLow} - £${costHigh}`,
      "",
      "Please reply with your approved quote amount and any constraints.",
      ...(safetyHint ? [`Safety: ${safetyHint}`] : []),
    ].join("\n");
    const emailHtml = `<p><strong>FixFlow quote request</strong></p>
<p>Request ID: ${request.id}</p>
<p>Property: ${property?.address || "Unknown address"}</p>
<p>Issue: ${issueDescription}</p>
<p>Category: ${category}</p>
<p>Contractor: ${contractorName} (${contractorPhone})</p>
<p>Estimated quote range: £${costLow} - £${costHigh}</p>
<p>Please reply with your approved quote amount and any constraints.</p>
${safetyHint ? `<p><strong>Safety:</strong> ${safetyHint}</p>` : ""}
${
  request.photo_url
    ? `<p><strong>Photo evidence:</strong></p><p><img src="${request.photo_url}" alt="Maintenance issue photo" style="max-width: 100%; border: 1px solid #ddd;" /></p><p><a href="${request.photo_url}">Open original image</a></p>`
    : ""
}`;

    const audio = await buildAudioUrl(supabase, request.id, localizedVoice.text);

    const twilioConfig = getTwilioConfig();
    const resendConfig = getResendConfig();

    const appUrl = getAppUrl();
    const voiceWebhookUrl = `${appUrl}/api/twilio/voice/${request.id}`;
    const useVoiceWebhook = isPublicHttpsAppUrl(appUrl);

    if (twilioConfig && !useVoiceWebhook) {
      console.warn(
        "[notify] APP_URL is not a public https URL; Twilio will use inline TwiML (no speech capture). Set APP_URL to ngrok or your deployed site for interactive calls."
      );
    }

    const callResult = twilioConfig
      ? useVoiceWebhook
        ? await placeTwilioCall({
            accountSid: twilioConfig.accountSid,
            authToken: twilioConfig.authToken,
            from: twilioConfig.fromNumber,
            to: landlordPhone,
            url: voiceWebhookUrl,
          })
        : await placeTwilioCall({
            accountSid: twilioConfig.accountSid,
            authToken: twilioConfig.authToken,
            from: twilioConfig.fromNumber,
            to: landlordPhone,
            twiml: buildInlineQuoteCallTwiml({
              audioUrl: audio.audioUrl,
              audioSource: audio.source,
              voiceScript: localizedVoice.text,
              notifyEmail,
            }),
          })
      : ({ ok: false, error: "Twilio is not configured (mock mode)." } as const);

    const emailResult = resendConfig
      ? await sendQuoteRequestEmail({
          apiKey: resendConfig.apiKey,
          from: resendConfig.fromEmail,
          to: notifyEmail,
          subject: emailSubject,
          text: emailText,
          html: emailHtml,
        })
      : ({ ok: false, error: "Resend is not configured (mock mode)." } as const);

    const communicationSources: string[] = [];
    if (callResult.ok) communicationSources.push("twilio_call");
    if (emailResult.ok) communicationSources.push("resend_email");
    const isMockMode = !twilioConfig && !resendConfig;
    if (isMockMode) communicationSources.push("mock");

    const speechCaptureUnavailable =
      Boolean(twilioConfig) &&
      callResult.ok &&
      !useVoiceWebhook;

    const mergedDiagnosis = {
      ...diagnosis,
      quote_status: speechCaptureUnavailable
        ? "requested_no_capture"
        : callResult.ok || emailResult.ok
          ? "requested"
          : isMockMode
          ? "mock_requested"
          : "request_failed",
      quote_source: communicationSources,
      quote_requested_phone: landlordPhone,
      quote_notify_email: notifyEmail,
      quote_comms: {
        call: callResult,
        email: emailResult,
        audio_source: audio.source,
      },
      quote_requested_at: new Date().toISOString(),
      audio_file_path: audio.filePath,
      call_script: localizedVoice.text,
      ...getRequestLanguageMeta(requestLanguage.code),
      voice_transcript_language: localizedVoice.languageCode,
      voice_transcript_language_label: localizedVoice.languageLabel,
      ...(localizedVoice.translated
        ? { voice_transcript_original: voiceScript }
        : {}),
    };

    const dbError = await persistNotifyUpdate(supabase, requestId, {
      audioUrl: audio.audioUrl,
      transcript: localizedVoice.text,
      estimatedCostLow: request.estimated_cost_low ?? costLow,
      estimatedCostHigh: request.estimated_cost_high ?? costHigh,
      mergedDiagnosis,
    });

    if (dbError) {
      console.error("DB Error updating notify payload:", dbError);
      return NextResponse.json({ error: "Failed to update record" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      audioUrl: audio.audioUrl,
      transcript: localizedVoice.text,
      call: callResult,
      email: emailResult,
      quote_status: mergedDiagnosis.quote_status,
      quote_source: mergedDiagnosis.quote_source,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Notify API Error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
