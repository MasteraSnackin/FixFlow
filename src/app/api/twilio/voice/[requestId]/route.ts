import { NextResponse } from "next/server";
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
  console.log("[twilio/voice] Returning TwiML:", xml);
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

async function handleRequest(requestId: string) {
  console.log("[twilio/voice] Handling request:", requestId);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("maintenance_requests")
    .select("id, diagnosis")
    .eq("id", requestId)
    .single();

  if (error || !data) {
    console.error("[twilio/voice] DB lookup failed:", error);
    return twimlResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="alice">Sorry, we could not find this request. Goodbye.</Say></Response>`
    );
  }

  const diagnosis =
    data.diagnosis && typeof data.diagnosis === "object" && !Array.isArray(data.diagnosis)
      ? (data.diagnosis as Record<string, unknown>)
      : {};

  const callScript =
    typeof diagnosis.call_script === "string"
      ? diagnosis.call_script
      : typeof diagnosis.voice_transcript_fallback === "string"
        ? (diagnosis.voice_transcript_fallback as string)
        : null;

  const summaryText = callScript || "We have a maintenance quote request for you.";

  const appUrl = getAppUrl();
  const gatherAction = `${appUrl}/api/twilio/gather/${requestId}?attempt=1`;

  console.log("[twilio/voice] gatherAction URL:", gatherAction);
  console.log("[twilio/voice] summaryText:", summaryText.slice(0, 120));

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello, this is FixFlow calling about a maintenance quote request.</Say>
  <Pause length="1"/>
  <Say voice="alice">${escapeXml(summaryText)}</Say>
  <Pause length="1"/>
  <Gather input="speech" timeout="30" speechTimeout="3" action="${escapeXml(gatherAction)}" method="POST">
    <Say voice="alice">Please say your quote amount now.</Say>
  </Gather>
  <Say voice="alice">We did not receive a response. Goodbye.</Say>
</Response>`;

  return twimlResponse(twiml);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;
  return handleRequest(requestId);
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;
  return handleRequest(requestId);
}
