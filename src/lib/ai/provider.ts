import type { ToolSet } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";

export type FixFlowAiProvider = "anthropic" | "google";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";
const DEFAULT_GOOGLE_MODEL = "gemini-2.5-flash";

function hasAnthropicKey() {
  return Boolean(
    process.env.ANTHROPIC_API_KEY?.trim() ||
      process.env.ANTHROPIC_AUTH_TOKEN?.trim()
  );
}

export function getFixFlowAiProvider(): FixFlowAiProvider {
  const configured = process.env.FIXFLOW_AI_PROVIDER?.trim().toLowerCase();
  if (configured === "anthropic" || configured === "google") {
    return configured;
  }

  return hasAnthropicKey() ? "anthropic" : "google";
}

export function getFixFlowModelId() {
  if (getFixFlowAiProvider() === "anthropic") {
    return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
  }

  return process.env.GOOGLE_MODEL?.trim() || DEFAULT_GOOGLE_MODEL;
}

export function getFixFlowLanguageModel() {
  const modelId = getFixFlowModelId();
  return getFixFlowAiProvider() === "anthropic"
    ? anthropic(modelId)
    : google(modelId);
}

export function getFixFlowProviderLabel() {
  return `${getFixFlowAiProvider()}:${getFixFlowModelId()}`;
}

function asToolSet(tools: Record<string, unknown>): ToolSet {
  return tools as unknown as ToolSet;
}

export function getFixFlowSearchTools(params?: {
  city?: string;
  region?: string;
  country?: string;
  maxUses?: number;
}) {
  if (getFixFlowAiProvider() === "anthropic") {
    return asToolSet({
      web_search: anthropic.tools.webSearch_20250305({
        maxUses: params?.maxUses ?? 4,
        userLocation: {
          type: "approximate",
          country: params?.country || "GB",
          region: params?.region || "England",
          city: params?.city || "London",
          timezone: "Europe/London",
        },
      }),
    });
  }

  return asToolSet({
    google_search: google.tools.googleSearch({}),
  });
}

export function getFixFlowContractorDiscoveryTools(params?: {
  city?: string;
  region?: string;
  country?: string;
  maxUses?: number;
}) {
  if (getFixFlowAiProvider() === "anthropic") {
    return getFixFlowSearchTools(params);
  }

  return asToolSet({
    google_maps: google.tools.googleMaps({}),
  });
}
