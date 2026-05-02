export type RequestLanguageOption = {
  code: string;
  label: string;
};

export const REQUEST_LANGUAGE_OPTIONS: RequestLanguageOption[] = [
  { code: "en-GB", label: "English (UK)" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "it-IT", label: "Italian" },
  { code: "pt-PT", label: "Portuguese" },
  { code: "pl-PL", label: "Polish" },
  { code: "ro-RO", label: "Romanian" },
  { code: "ar-SA", label: "Arabic" },
  { code: "hi-IN", label: "Hindi" },
] as const;

const DEFAULT_REQUEST_LANGUAGE = REQUEST_LANGUAGE_OPTIONS[0];

function toObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

export function normalizeRequestLanguage(
  raw: string | null | undefined
): RequestLanguageOption {
  if (!raw?.trim()) {
    return DEFAULT_REQUEST_LANGUAGE;
  }

  const normalized = raw.trim().toLowerCase();
  const exact =
    REQUEST_LANGUAGE_OPTIONS.find(
      (option) => option.code.toLowerCase() === normalized
    ) ?? null;
  if (exact) {
    return exact;
  }

  const prefix = normalized.split("-")[0];
  return (
    REQUEST_LANGUAGE_OPTIONS.find((option) =>
      option.code.toLowerCase().startsWith(`${prefix}-`)
    ) ?? DEFAULT_REQUEST_LANGUAGE
  );
}

export function getRequestLanguageMeta(raw: string | null | undefined) {
  const language = normalizeRequestLanguage(raw);
  return {
    preferred_language: language.code,
    preferred_language_label: language.label,
  };
}

export function getRequestLanguageFromMetadata(value: unknown) {
  const object = toObject(value);
  return normalizeRequestLanguage(
    typeof object.preferred_language === "string"
      ? object.preferred_language
      : null
  );
}

export function isEnglishRequestLanguage(raw: string | null | undefined) {
  return normalizeRequestLanguage(raw).code === DEFAULT_REQUEST_LANGUAGE.code;
}
