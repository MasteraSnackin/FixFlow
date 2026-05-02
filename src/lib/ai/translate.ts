import { generateObject } from "ai";
import { z } from "zod";
import { getFixFlowLanguageModel } from "@/lib/ai/provider";
import {
  isEnglishRequestLanguage,
  normalizeRequestLanguage,
} from "@/lib/request-language";

const TranslationSchema = z.object({
  translated_text: z.string(),
});

export async function translateTextForRequestLanguage(params: {
  text: string;
  targetLanguage: string | null | undefined;
  purpose?: string;
}) {
  const language = normalizeRequestLanguage(params.targetLanguage);
  const sourceText = params.text.trim();

  if (!sourceText || isEnglishRequestLanguage(language.code)) {
    return {
      text: params.text,
      translated: false,
      languageCode: language.code,
      languageLabel: language.label,
      originalText: params.text,
    };
  }

  const { object } = await generateObject({
    model: getFixFlowLanguageModel(),
    schema: TranslationSchema,
    prompt: `Translate the following maintenance-support text into ${language.label}.

Requirements:
- Preserve contractor names, addresses, phone numbers, money amounts, URLs, and request IDs exactly.
- Keep the tone clear, direct, and natural for a tenant or landlord.
- Do not add explanations or markdown.
- This text is for: ${params.purpose || "property maintenance communication"}.

Text:
${sourceText}`,
  });

  return {
    text: object.translated_text,
    translated: true,
    languageCode: language.code,
    languageLabel: language.label,
    originalText: params.text,
  };
}
