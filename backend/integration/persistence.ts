import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * Persistent integration state. Two deliberately separate files under the
 * gitignored config seam:
 *
 * - state.local.json   — non-secret lifecycle state (enabled, model, baseURL,
 *                        last test result). Not a credential.
 * - secrets.secret.json — API keys only. Write-only over HTTP; never returned
 *                        by any API. Both filenames are covered by
 *                        app/integration/config/.gitignore.
 */
export type IntegrationTestStatus =
  | "testing"
  | "reachable"
  | "auth_failed"
  | "unreachable"
  | "package_missing"
  | "invalid_config";

export interface IntegrationConfigState {
  model?: string;
  baseURL?: string;
}

export interface PersistedIntegrationState {
  enabled?: boolean;
  config?: IntegrationConfigState;
  last_test_status?: IntegrationTestStatus;
  last_test_at?: string;
}

interface PersistedStateFile {
  version: 1;
  integrations: Record<string, PersistedIntegrationState>;
}

interface SecretFile {
  version: 1;
  keys: Record<string, string>;
}

function configRoot(projectRoot: string): string {
  return resolve(projectRoot, "app", "integration", "config");
}

function statePath(projectRoot: string): string {
  return join(configRoot(projectRoot), "state.local.json");
}

function secretPath(projectRoot: string): string {
  return join(configRoot(projectRoot), "secrets.secret.json");
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export async function readIntegrationStates(
  projectRoot: string,
): Promise<Record<string, PersistedIntegrationState>> {
  const file = await readJson<PersistedStateFile>(statePath(projectRoot), {
    version: 1,
    integrations: {},
  });
  return file.integrations ?? {};
}

export async function updateIntegrationState(
  projectRoot: string,
  id: string,
  update: (current: PersistedIntegrationState) => PersistedIntegrationState,
): Promise<PersistedIntegrationState> {
  const integrations = await readIntegrationStates(projectRoot);
  const next = update(integrations[id] ?? {});
  integrations[id] = next;
  await writeJson(statePath(projectRoot), { version: 1, integrations });
  return next;
}

export async function clearIntegrationState(projectRoot: string, id: string): Promise<void> {
  const integrations = await readIntegrationStates(projectRoot);
  delete integrations[id];
  await writeJson(statePath(projectRoot), { version: 1, integrations });
}

export async function readSecret(projectRoot: string, id: string): Promise<string> {
  const file = await readJson<SecretFile>(secretPath(projectRoot), {
    version: 1,
    keys: {},
  });
  return (file.keys?.[id] ?? "").trim();
}

export async function writeSecret(
  projectRoot: string,
  id: string,
  apiKey: string,
): Promise<void> {
  const file = await readJson<SecretFile>(secretPath(projectRoot), {
    version: 1,
    keys: {},
  });
  file.keys[id] = apiKey;
  await writeJson(secretPath(projectRoot), file);
}

export async function deleteSecret(projectRoot: string, id: string): Promise<void> {
  const file = await readJson<SecretFile>(secretPath(projectRoot), {
    version: 1,
    keys: {},
  });
  if (!(id in file.keys)) return;
  delete file.keys[id];
  await writeJson(secretPath(projectRoot), file);
}

/** Remove the installed package directory (runtime registration). */
export async function removeIntegrationDirectory(target: string): Promise<void> {
  await rm(target, { recursive: true, force: true });
}
