type SendQuoteEmailInput = {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type QuoteEmailResult = {
  ok: boolean;
  id?: string;
  error?: string;
};

export async function sendQuoteRequestEmail({
  apiKey,
  from,
  to,
  subject,
  text,
  html,
}: SendQuoteEmailInput): Promise<QuoteEmailResult> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error: `Resend ${response.status}: ${
        typeof payload?.message === "string" ? payload.message : "unknown error"
      }`,
    };
  }

  return {
    ok: true,
    id: typeof payload?.id === "string" ? payload.id : undefined,
  };
}
