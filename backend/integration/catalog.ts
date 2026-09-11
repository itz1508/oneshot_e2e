export interface IntegrationPackageSpec {
  id: string;
  displayName: string;
  packageName: string;
  packageVersion: string;
  factoryExport: string;
  apiKeyEnv: string;
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
    // Keep the first runtime-installed version aligned with the version already
    // admitted by the current repository manifest. Updates are a separate task.
    packageVersion: "4.0.67",
    factoryExport: "createGoogleGenerativeAI",
    apiKeyEnv: "GOOGLE_GENERATIVE_AI_API_KEY",
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
