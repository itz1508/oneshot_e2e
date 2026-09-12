import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  integrationCatalog,
  integrationPackageSpec,
  type IntegrationPackageSpec,
} from "./catalog.js";
import {
  clearIntegrationState,
  deleteSecret,
  readIntegrationStates,
  readSecret,
  removeIntegrationDirectory,
  updateIntegrationState,
  writeSecret,
  type IntegrationTestStatus,
  type PersistedIntegrationState,
} from "./persistence.js";

export interface IntegrationStatus {
  id: string;
  displayName: string;
  packageName: string;
  packageVersion: string;
  installed: boolean;
  configured: boolean;
  enabled: boolean;
  last_test_status: IntegrationTestStatus | null;
  last_test_at: string | null;
  capabilities: string[];
  bundled: boolean;
}

export interface IntegrationModelConfig {
  model: string;
  apiKey?: string;
  baseURL?: string;
}

export function integrationDirectory(projectRoot: string, integrationId: string): string {
  const spec = integrationPackageSpec(integrationId);
  const root = resolve(projectRoot, "app/integration");
  const target = resolve(root, spec.id);
  const rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`integration path escaped integration root: ${integrationId}`);
  }
  return target;
}

export async function integrationStatus(
  projectRoot: string,
  spec: IntegrationPackageSpec,
): Promise<IntegrationStatus> {
  const target = integrationDirectory(projectRoot, spec.id);
  let installed = false;
  try {
    await access(join(target, "node_modules", spec.packageName, "package.json"));
    installed = true;
  } catch {
    installed = false;
  }
  const states = await readIntegrationStates(projectRoot);
  const stored: PersistedIntegrationState = states[spec.id] ?? {};
  const secretKey = await readSecret(projectRoot, spec.id);
  const configured = Boolean(
    secretKey || (process.env[spec.apiKeyEnv] || "").trim(),
  );
  return {
    id: spec.id,
    displayName: spec.displayName,
    packageName: spec.packageName,
    packageVersion: spec.packageVersion,
    installed,
    configured,
    enabled: stored.enabled === true,
    last_test_status: stored.last_test_status ?? null,
    last_test_at: stored.last_test_at ?? null,
    capabilities: [...spec.capabilities],
    bundled: spec.bundled,
  };
}

export async function listIntegrationStatus(projectRoot: string): Promise<IntegrationStatus[]> {
  return Promise.all(
    integrationCatalog().map((spec) => integrationStatus(projectRoot, spec)),
  );
}

export async function loadIntegrationPackage(
  projectRoot: string,
  integrationId: string,
): Promise<Record<string, unknown>> {
  const spec = integrationPackageSpec(integrationId);
  const target = integrationDirectory(projectRoot, integrationId);
  const packageJson = join(target, "package.json");

  try {
    await access(packageJson);
  } catch {
    throw new Error(`integration not installed: ${integrationId}`);
  }

  const localRequire = createRequire(packageJson);
  let entrypoint: string;
  try {
    entrypoint = localRequire.resolve(spec.packageName);
  } catch {
    throw new Error(
      `integration package missing from ${target}: ${spec.packageName}@${spec.packageVersion}`,
    );
  }

  const loaded = await import(pathToFileURL(entrypoint).href);
  return loaded as Record<string, unknown>;
}

/**
 * Instantiate the provider exported by the installed package.
 * Supports both model-producing factories and non-model capability providers (e.g. Tavily).
 */
export async function loadIntegrationProvider(
  projectRoot: string,
  integrationId: string,
  config: IntegrationModelConfig = { model: "" },
): Promise<unknown> {
  const spec = integrationPackageSpec(integrationId);
  const loaded = await loadIntegrationPackage(projectRoot, integrationId);
  const factory = loaded[spec.factoryExport];
  if (typeof factory !== "function") {
    throw new Error(
      `integration ${integrationId} does not export ${spec.factoryExport}`,
    );
  }

  const states = await readIntegrationStates(projectRoot);
  const stored = states[spec.id] ?? {};
  const apiKey = (
    config.apiKey ||
    (await readSecret(projectRoot, spec.id)) ||
    process.env[spec.apiKeyEnv] ||
    ""
  ).trim();
  if (!apiKey) {
    throw new Error(`integration ${integrationId} is not configured`);
  }

  const providerOptions: Record<string, string> = { apiKey };
  const baseURL = (
    config.baseURL?.trim() ||
    stored.config?.baseURL?.trim() ||
    (spec.baseURLEnv ? (process.env[spec.baseURLEnv] || "").trim() : "")
  ).trim();
  if (baseURL) providerOptions.baseURL = baseURL;

  const initialized = (factory as (options: Record<string, string>) => unknown)(
    providerOptions,
  );

  // If the integration does not require a model (e.g. Tavily web.search),
  // return the initialized provider instance directly.
  if (spec.requiresModel === false) {
    return initialized;
  }

  if (typeof initialized !== "function") {
    throw new Error(`integration ${integrationId} factory did not return a model factory`);
  }

  // When available (e.g. @ai-sdk/openai), use .chat(model) to target standard /v1/chat/completions
  if (typeof (initialized as any).chat === "function") {
    return (initialized as any).chat(config.model);
  }

  return (initialized as (model: string) => unknown)(config.model);
}

export async function loadIntegrationModel(
  projectRoot: string,
  integrationId: string,
  config: IntegrationModelConfig,
): Promise<unknown> {
  return loadIntegrationProvider(projectRoot, integrationId, config);
}

export interface ActiveIntegrationProvider {
  id: string;
  provider: unknown;
  source: string;
  provenance: string;
  capabilities: string[];
  requiresModel: boolean;
}

export interface ActiveIntegrationModel {
  id: string;
  model: any;
  source: string;
  provenance: string;
}

/**
 * Capability-based resolution. There is no implicit global provider winner:
 * only integrations the user explicitly enabled are considered, and the
 * caller names the capability it needs (e.g. "web.search" or "model.execute").
 * If several enabled integrations provide the capability, catalog order is the
 * deterministic tie-break; preferredId makes the choice explicit.
 */
export async function resolveCapabilityProvider(
  projectRoot: string,
  capability: string,
  preferredId?: string,
): Promise<ActiveIntegrationProvider | undefined> {
  try {
    const statuses = await listIntegrationStatus(projectRoot);
    const providers = statuses.filter(
      (s) =>
        s.installed &&
        s.configured &&
        s.enabled &&
        s.capabilities.includes(capability),
    );
    const candidate = preferredId
      ? providers.find((s) => s.id === preferredId)
      : providers[0];
    if (!candidate) return undefined;

    const spec = integrationPackageSpec(candidate.id);
    const states = await readIntegrationStates(projectRoot);
    const stored = states[spec.id] ?? {};
    const modelName = (
      stored.config?.model?.trim() ||
      (process.env[spec.modelEnv] || "").trim() ||
      spec.defaultModel
    ).trim();
    if (spec.requiresModel !== false && !modelName) return undefined;

    const provider = await loadIntegrationProvider(projectRoot, candidate.id, {
      model: modelName,
    });

    return {
      id: candidate.id,
      provider,
      source: `integration:${candidate.id}`,
      provenance: `${candidate.packageName}@${candidate.packageVersion}`,
      capabilities: [...candidate.capabilities],
      requiresModel: spec.requiresModel !== false,
    };
  } catch {
    return undefined;
  }
}

/**
 * Model capability resolver asserting the resolved integration is model-backed.
 * Non-model capabilities (such as web.search / Tavily) return undefined.
 */
export async function resolveCapabilityModel(
  projectRoot: string,
  capability = "model.execute",
  preferredId?: string,
): Promise<ActiveIntegrationModel | undefined> {
  const resolved = await resolveCapabilityProvider(
    projectRoot,
    capability,
    preferredId,
  );
  if (!resolved || !resolved.requiresModel) {
    return undefined;
  }
  return {
    id: resolved.id,
    model: resolved.provider,
    source: resolved.source,
    provenance: resolved.provenance,
  };
}

/** Persist non-secret configuration; API keys go through configureIntegrationSecret. */
export async function configureIntegration(
  projectRoot: string,
  integrationId: string,
  input: { model?: string; baseURL?: string },
): Promise<void> {
  await updateIntegrationState(projectRoot, integrationId, (current) => ({
    ...current,
    config: {
      model: input.model?.trim() || current.config?.model,
      baseURL: input.baseURL?.trim() || current.config?.baseURL,
    },
  }));
}

export async function configureIntegrationSecret(
  projectRoot: string,
  integrationId: string,
  apiKey: string,
): Promise<void> {
  await writeSecret(projectRoot, integrationId, apiKey.trim());
}

export async function removeIntegrationSecret(
  projectRoot: string,
  integrationId: string,
): Promise<void> {
  await deleteSecret(projectRoot, integrationId);
}

export class IntegrationEnableError extends Error {
  constructor(
    public readonly state: {
      installed: boolean;
      configured: boolean;
      last_test_status: IntegrationTestStatus | null;
    },
  ) {
    super(
      "integration cannot be enabled: install, configuration, and a successful test are required first",
    );
  }
}

/** Enable only after install + configuration + a successful (reachable) test. */
export async function enableIntegration(
  projectRoot: string,
  integrationId: string,
): Promise<IntegrationStatus> {
  const spec = integrationPackageSpec(integrationId);
  const status = await integrationStatus(projectRoot, spec);
  if (
    !status.installed ||
    !status.configured ||
    status.last_test_status !== "reachable"
  ) {
    throw new IntegrationEnableError({
      installed: status.installed,
      configured: status.configured,
      last_test_status: status.last_test_status,
    });
  }
  await updateIntegrationState(projectRoot, spec.id, (current) => ({
    ...current,
    enabled: true,
  }));
  return integrationStatus(projectRoot, spec);
}

export async function disableIntegration(
  projectRoot: string,
  integrationId: string,
): Promise<IntegrationStatus> {
  const spec = integrationPackageSpec(integrationId);
  await updateIntegrationState(projectRoot, spec.id, (current) => ({
    ...current,
    enabled: false,
  }));
  return integrationStatus(projectRoot, spec);
}

/**
 * Uninstall removes the installed package/runtime registration, enabled state,
 * and capability registration. Credentials are preserved unless
 * removeCredentials is explicitly requested (separate confirmed action).
 */
export async function uninstallIntegration(
  projectRoot: string,
  integrationId: string,
  options: { removeCredentials?: boolean } = {},
): Promise<IntegrationStatus> {
  const spec = integrationPackageSpec(integrationId);
  await removeIntegrationDirectory(integrationDirectory(projectRoot, spec.id));
  await clearIntegrationState(projectRoot, spec.id);
  if (options.removeCredentials === true) {
    await deleteSecret(projectRoot, spec.id);
  }
  return integrationStatus(projectRoot, spec);
}
