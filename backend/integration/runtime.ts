import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  integrationCatalog,
  integrationPackageSpec,
  type IntegrationPackageSpec,
} from "./catalog.js";

export interface IntegrationStatus {
  id: string;
  displayName: string;
  packageName: string;
  packageVersion: string;
  installed: boolean;
  configured: boolean;
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
  return {
    id: spec.id,
    displayName: spec.displayName,
    packageName: spec.packageName,
    packageVersion: spec.packageVersion,
    installed,
    configured: Boolean((process.env[spec.apiKeyEnv] || "").trim()),
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
 * Instantiate the model exported by the installed AI SDK provider package.
 * Vendor-specific SDK code remains inside app/integration/<id>; Core only
 * knows the declarative factory export recorded in the curated catalog.
 */
export async function loadIntegrationModel(
  projectRoot: string,
  integrationId: string,
  config: IntegrationModelConfig,
): Promise<unknown> {
  const spec = integrationPackageSpec(integrationId);
  const loaded = await loadIntegrationPackage(projectRoot, integrationId);
  const factory = loaded[spec.factoryExport];
  if (typeof factory !== "function") {
    throw new Error(
      `integration ${integrationId} does not export ${spec.factoryExport}`,
    );
  }

  const apiKey = (config.apiKey || process.env[spec.apiKeyEnv] || "").trim();
  if (!apiKey) {
    throw new Error(`integration ${integrationId} is not configured`);
  }

  const providerOptions: Record<string, string> = { apiKey };
  if (config.baseURL?.trim()) providerOptions.baseURL = config.baseURL.trim();

  const provider = (factory as (options: Record<string, string>) => unknown)(
    providerOptions,
  );
  if (typeof provider !== "function") {
    throw new Error(`integration ${integrationId} factory did not return a model factory`);
  }

  return (provider as (model: string) => unknown)(config.model);
}

export interface ActiveIntegrationModel {
  id: string;
  model: any;
  source: string;
  provenance: string;
}

export async function resolveActiveIntegrationModel(
  projectRoot: string,
  preferredId?: string,
): Promise<ActiveIntegrationModel | undefined> {
  try {
    const statuses = await listIntegrationStatus(projectRoot);
    const candidate = preferredId
      ? statuses.find((s) => s.id === preferredId && s.installed && s.configured)
      : statuses.find((s) => s.installed && s.configured);

    if (!candidate) return undefined;

    const spec = integrationPackageSpec(candidate.id);
    const modelName = (process.env[spec.modelEnv] || spec.defaultModel).trim();

    // Honor the base URL saved through the configure endpoint so
    // self-hosted/proxied endpoints are used at runtime.
    const baseURL = spec.baseURLEnv
      ? (process.env[spec.baseURLEnv] || "").trim()
      : "";

    const model = await loadIntegrationModel(projectRoot, candidate.id, {
      model: modelName,
      ...(baseURL ? { baseURL } : {}),
    });

    return {
      id: candidate.id,
      model,
      source: `integration:${candidate.id}`,
      provenance: `${candidate.packageName}@${candidate.packageVersion}`,
    };
  } catch {
    return undefined;
  }
}
