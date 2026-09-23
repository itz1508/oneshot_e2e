import { ProviderDefinition, ProviderId, ProviderConfig } from "../types";

export const PROVIDER_DEFINITIONS: Record<ProviderId, ProviderDefinition> = {
  gemini: {
    id: "gemini",
    name: "Gemini",
    sub: "Google",
    badge: "Default",
    dotGradient: "linear-gradient(135deg, #4285f4, #9b72cb 50%, #ea4335)",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
    baseUrl: "",
    modelHelp: "Default OneShot Gemini model.",
    keyHelp: "Google Gemini API key.",
    note: "Gemini is the bundled default integration.",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    sub: "GPT family",
    dotGradient: "#10a37f",
    models: ["gpt-5.2", "gpt-5-mini", "gpt-4o"],
    baseUrl: "https://api.openai.com/v1",
    modelHelp: "Choose the OpenAI model used by OneShot.",
    keyHelp: "OpenAI API key.",
    note: "OpenAI uses its standard API endpoint unless you override Base URL.",
  },
  nebius: {
    id: "nebius",
    name: "Nebius",
    sub: "Token Factory",
    dotGradient: "linear-gradient(135deg, #76a8ff, #8b5cf6)",
    models: ["moonshotai/Kimi-K2.5", "deepseek-ai/DeepSeek-R1-0528"],
    baseUrl: "https://api.tokenfactory.nebius.com/v1/",
    modelHelp: "Nebius Token Factory model ID.",
    keyHelp: "Nebius Token Factory API key.",
    note: "Nebius Token Factory exposes an OpenAI-compatible API.",
  },
};

const STORAGE_KEY_PREFIX = "oneshot_provider_";

export function getStoredProviderConfig(id: ProviderId): ProviderConfig {
  const def = PROVIDER_DEFINITIONS[id];
  const defaults: ProviderConfig = {
    key: "",
    model: def.models[0],
    baseUrl: def.baseUrl,
    temperature: "0.4",
    configured: false,
  };

  if (typeof window === "undefined") return defaults;

  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${id}`);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function saveProviderConfig(id: ProviderId, config: ProviderConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${id}`, JSON.stringify(config));
  } catch (err) {
    console.error("Failed to save provider config", err);
  }
}

export function removeStoredProviderKey(id: ProviderId): void {
  if (typeof window === "undefined") return;
  try {
    const config = getStoredProviderConfig(id);
    config.key = "";
    config.configured = false;
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${id}`, JSON.stringify(config));
  } catch (err) {
    console.error("Failed to remove provider key", err);
  }
}
