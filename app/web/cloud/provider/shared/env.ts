import { delimiter, resolve } from "node:path";

export function positiveInt(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Deterministic adapter drafts are only honored in explicit test mode; the
 * configured path is resolved against the project root.
 */
export function resolveTestDraftFile(
  projectRoot: string,
  envName: string,
): string | undefined {
  const mode = (process.env.ONESHOT_MODE || "sample").toLowerCase();
  const configured = process.env[envName];
  return mode === "test" && configured
    ? resolve(projectRoot, configured)
    : undefined;
}

/** Module search path handed to spawned Python workers. */
export function pythonPath(projectRoot: string): string {
  const parts = [projectRoot, resolve(projectRoot, ".venv/Lib/site-packages")];
  if (process.env.PYTHONPATH) parts.push(process.env.PYTHONPATH);
  return parts.filter(Boolean).join(delimiter);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
