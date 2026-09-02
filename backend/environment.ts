import { existsSync } from "node:fs";
import { resolveRuntimePaths } from "./runtime-paths.js";

const environmentFile = resolveRuntimePaths().trace.environmentFile;
if (existsSync(environmentFile)) {
  if (typeof process.loadEnvFile !== "function") {
    throw new Error(
      "ROOT_CAUSE: loading .env requires Node.js 20.12+; set variables in the process environment instead",
    );
  }
    process.loadEnvFile(environmentFile);
}

/**
 * Parse a boolean environment variable from process.env.
 *
 * Used by the HTTP security layer to decide security-sensitive cookie policy
 * (e.g. `Secure` attribute) and other flags that must fail-closed by default.
 * Accepts `true`, `1`, or `yes` (case-insensitive); every other value —
 * including the variable being unset — is `false`.
 */
export function parseBooleanEnv(name: string): boolean {
  const raw = (process.env[name] || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}
