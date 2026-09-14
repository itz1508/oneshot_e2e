import type { RuntimeError } from "../types";

export function classifyError(err: unknown): RuntimeError {
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    return err as RuntimeError;
  }
  const message = err instanceof Error ? err.message : String(err) || "An unexpected error occurred.";
  return { code: "unknown_error", message };
}
