export type ProviderId = "openai" | "anthropic" | "gemini";

export interface ProviderDefinition {
  id: ProviderId;
  displayName: string;
  protocol: "https";
  credentialType: "api_key";
  envVar: string;
  fallbackEnvVar?: string;
  defaultModel: string;
  defaultApiBase: string;
  supportsTemperature(model: string): boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  openai: {
    id: "openai",
    displayName: "OpenAI",
    protocol: "https",
    credentialType: "api_key",
    envVar: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
    defaultApiBase: "https://api.openai.com/v1",
    supportsTemperature: (model) => /^gpt-4/.test(model),
  },
  anthropic: {
    id: "anthropic",
    displayName: "Anthropic",
    protocol: "https",
    credentialType: "api_key",
    envVar: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-20250514",
    defaultApiBase: "https://api.anthropic.com/v1",
    supportsTemperature: () => true,
  },
  gemini: {
    id: "gemini",
    displayName: "Gemini",
    protocol: "https",
    credentialType: "api_key",
    envVar: "GEMINI_API_KEY",
    fallbackEnvVar: "GOOGLE_API_KEY",
    defaultModel: "gemini-3.6-flash",
    defaultApiBase: "https://generativelanguage.googleapis.com/v1beta",
    supportsTemperature: () => true,
  },
};

export function providerDefinition(id: string): ProviderDefinition | undefined {
  return PROVIDERS[id as ProviderId];
}
