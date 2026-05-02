type PlaceCallBase = {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
};

type PlaceCallWithTwiml = PlaceCallBase & { twiml: string; url?: never };
type PlaceCallWithUrl = PlaceCallBase & { url: string; twiml?: never };

export type PlaceCallInput = PlaceCallWithTwiml | PlaceCallWithUrl;

export type TwilioCallResult = {
  ok: boolean;
  sid?: string;
  error?: string;
};

export async function placeTwilioCall(input: PlaceCallInput): Promise<TwilioCallResult> {
  const params: Record<string, string> = {
    To: input.to,
    From: input.from,
  };

  if ("url" in input && input.url) {
    params.Url = input.url;
  } else if ("twiml" in input && input.twiml) {
    params.Twiml = input.twiml;
  }

  const body = new URLSearchParams(params);
  const auth = Buffer.from(`${input.accountSid}:${input.authToken}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${input.accountSid}/Calls.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error: `Twilio ${response.status}: ${
        typeof payload?.message === "string" ? payload.message : "unknown error"
      }`,
    };
  }

  return {
    ok: true,
    sid: typeof payload?.sid === "string" ? payload.sid : undefined,
  };
}
