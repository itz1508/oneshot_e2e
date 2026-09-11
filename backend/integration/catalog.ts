export interface IntegrationPackageSpec {
  id: string;
  displayName: string;
  packageName: string;
  packageVersion: string;
  factoryExport: string;
  apiKeyEnv: string;
  baseURLEnv?: string;
  modelEnv: string;
  defaultModel: string;
  bundled: boolean;
}

/**
 * Curated install metadata only. OneShot does not implement vendor SDK behavior;
 * the installed package owns that implementation.
 */
const CATALOG: Record<string, IntegrationPackageSpec> = {
  gemini: {
    id: "gemini",
    displayName: "Gemini",
    packageName: "@ai-sdk/google",
    packageVersion: "4.0.67",
    factoryExport: "createGoogleGenerativeAI",
    apiKeyEnv: "GOOGLE_GENERATIVE_AI_API_KEY",
    baseURLEnv: "GEMINI_BASE_URL",
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-2.5-flash",
    bundled: true,
  },
  openai: {
    id: "openai",
    displayName: "OpenAI",
    packageName: "@ai-sdk/openai",
    packageVersion: "4.0.65",
    factoryExport: "createOpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-5-mini",
    bundled: false,
  },
  anthropic: {
    id: "anthropic",
    displayName: "Anthropic",
    packageName: "@ai-sdk/anthropic",
    packageVersion: "4.0.52",
    factoryExport: "createAnthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    defaultModel: "claude-sonnet-4-5",
    bundled: false,
  },
};

export function integrationPackageSpec(id: string): IntegrationPackageSpec {
  const spec = CATALOG[id];
  if (!spec) throw new Error(`unsupported integration: ${id}`);
  return spec;
}

export function integrationCatalog(): IntegrationPackageSpec[] {
  return Object.values(CATALOG).map((spec) => ({ ...spec }));
}
