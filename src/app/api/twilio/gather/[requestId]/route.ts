import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/comm/config";

function escapeXml(raw: string) {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function twimlResponse(xml: string) {
  console.log("[twilio/gather] Returning TwiML:", xml);
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function parseParams(req: NextRequest): {
  speechResult: string;
  confidence: string;
  attempt: number;
} {
  const attempt = Number(req.nextUrl.searchParams.get("attempt") || "1");

  const sp = req.nextUrl.searchParams;
  const speech = (sp.get("SpeechResult") || "").trim();
  const digits = (sp.get("Digits") || "").trim();

  return {
    speechResult: speech || digits,
    confidence: (sp.get("Confidence") || "").trim(),
    attempt,
  };
}

async function parseBody(req: NextRequest): Promise<{
  speechResult: string;
  confidence: string;
  attempt: number;
}> {
  const attempt = Number(req.nextUrl.searchParams.get("attempt") || "1");

  try {
    const raw = await req.text();
    const sp = new URLSearchParams(raw);
    const speech = (sp.get("SpeechResult") || "").trim();
    const digits = (sp.get("Digits") || "").trim();

    return {
      speechResult: speech || digits,
      confidence: (sp.get("Confidence") || "").trim(),
      attempt,
    };
  } catch {
    return { speechResult: "", confidence: "", attempt };
  }
}

async function handleGather(
  req: NextRequest,
  requestId: string
) {
  const { speechResult, confidence, attempt } =
    req.method === "GET" ? parseParams(req) : await parseBody(req);

  console.log("[twilio/gather]", {
    requestId,
    attempt,
    method: req.method,
    speechResult: speechResult || "(empty)",
  });

  if (!speechResult) {
    if (attempt < 2) {
      const appUrl = getAppUrl();
      const retryAction = `${appUrl}/api/twilio/gather/${requestId}?attempt=2`;
      return twimlResponse(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="30" speechTimeout="3" action="${escapeXml(retryAction)}" method="POST">
    <Say voice="alice">I did not catch that. Please say your quote amount now.</Say>
  </Gather>
  <Say voice="alice">Sorry, we still did not hear a quote. Goodbye.</Say>
</Response>`
      );
    }

    return twimlResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="alice">Sorry, we could not hear a quote. Please reply by email. Goodbye.</Say></Response>`
    );
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("maintenance_requests")
    .select("diagnosis")
    .eq("id", requestId)
    .single();

  const oldDiagnosis =
    existing?.diagnosis &&
    typeof existing.diagnosis === "object" &&
    !Array.isArray(existing.diagnosis)
      ? (existing.diagnosis as Record<string, unknown>)
      : {};

  const mergedDiagnosis = {
    ...oldDiagnosis,
    contractor_quote: speechResult,
    contractor_quote_confidence: confidence ? parseFloat(confidence) : null,
    contractor_quote_received_at: new Date().toISOString(),
    quote_status: "received",
  };

  const { error: updateError } = await supabase
    .from("maintenance_requests")
    .update({
      diagnosis: mergedDiagnosis,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (updateError) {
    console.error("Failed to store contractor quote:", updateError);
  }

  return twimlResponse(
    `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="alice">Thanks, we got your quote. We will get back to you. Goodbye.</Say></Response>`
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;
  return handleGather(req, requestId);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;
  return handleGather(req, requestId);
}
