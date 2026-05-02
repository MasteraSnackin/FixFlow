export const DEFAULT_LANDLORD_PHONE = "+447727821753";
export const DEFAULT_QUOTE_NOTIFY_EMAIL = "ethan.chkrn@gmail.com";
export const DEFAULT_RESEND_FROM_EMAIL = "onboarding@resend.dev";

export function getLandlordOverridePhone() {
  return (
    process.env.LANDLORD_OVERRIDE_PHONE?.trim() || DEFAULT_LANDLORD_PHONE
  );
}

export function getQuoteNotifyEmail() {
  return process.env.QUOTE_NOTIFY_EMAIL?.trim() || DEFAULT_QUOTE_NOTIFY_EMAIL;
}

export function getElevenLabsVoiceId() {
  return process.env.ELEVENLABS_VOICE_ID?.trim() || "JBFqnCBsd6RMkjVDRZzb";
}

export function getElevenLabsModelId() {
  return process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2";
}

export function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}

export function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail =
    process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_RESEND_FROM_EMAIL;
  if (!apiKey) return null;
  return { apiKey, fromEmail };
}

export function getAppUrl(): string {
  const explicit =
    process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

/**
 * Twilio must fetch webhook URLs over the public internet. Localhost / HTTP
 * bases cannot receive those requests — use inline TwiML instead, or set
 * APP_URL to an HTTPS tunnel (ngrok) or your deployed origin.
 */
export function isPublicHttpsAppUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1"
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
