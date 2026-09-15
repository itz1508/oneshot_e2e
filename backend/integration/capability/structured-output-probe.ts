import type { CapabilityEvidence } from "../core/capability.js";
import { createOpenAICompatibleClient } from "../transport/openai-compatible-client.js";
import { nowIso, type CapabilityProbe, type ProbeTarget } from "./probe.js";

/**
 * Structured-output probe (M6). Asks the model to return a single JSON object
 * and verifies the response parses as JSON (fenced ```json blocks allowed).
 * Returns `verified` on success, `failed` otherwise. No credentials stored.
 */
export function createStructuredOutputProbe(): CapabilityProbe {
  const client = createOpenAICompatibleClient();
  return {
    capability: "structured-output",
    probe: async (target: ProbeTarget): Promise<CapabilityEvidence> => {
      try {
        const result = await client.chat({
          baseUrl: target.baseUrl,
          modelId: target.modelId,
          apiKey: target.apiKey,
          messages: [
            {
              role: "system",
              content:
                "Respond with a single valid JSON object and nothing else.",
            },
            { role: "user", content: 'Return the JSON object {"ok": true}.' },
          ],
        });
        const ok = tryParseJson(result.content);
        return {
          capability: "structured-output",
          state: ok ? "verified" : "failed",
          source: "probe",
          checkedAt: nowIso(),
          failureReason: ok ? undefined : "response was not valid JSON",
        };
      } catch (err) {
        return {
          capability: "structured-output",
          state: "failed",
          source: "probe",
          checkedAt: nowIso(),
          failureReason: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

function tryParseJson(text: string): boolean {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
  }
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}
