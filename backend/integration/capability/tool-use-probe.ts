import type { CapabilityEvidence } from "../core/capability.js";
import { httpJsonRequest } from "../transport/http-request.js";
import { nowIso, type CapabilityProbe, type ProbeTarget } from "./probe.js";

/**
 * Tool-use probe (M6). Sends a chat completion request with a function-tool
 * definition and `tool_choice: auto`; `verified` when the model emits at least
 * one `tool_calls` entry, `failed` otherwise. Uses the raw HTTP helper (not
 * the chat client) because tool payloads are probe-specific. No creds stored.
 */

const GET_WEATHER_TOOL = {
  type: "function" as const,
  function: {
    name: "get_weather",
    description: "Get the current weather for a city",
    parameters: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
  },
};

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function createToolUseProbe(): CapabilityProbe {
  return {
    capability: "tool-use",
    probe: async (target: ProbeTarget): Promise<CapabilityEvidence> => {
      const url = joinUrl(target.baseUrl, "/chat/completions");
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (target.apiKey) headers.authorization = `Bearer ${target.apiKey}`;
      try {
        const res = await httpJsonRequest(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: target.modelId,
            messages: [
              {
                role: "user",
                content:
                  "What is the weather in Tokyo? Use the get_weather tool.",
              },
            ],
            tools: [GET_WEATHER_TOOL],
            tool_choice: "auto",
          }),
        });
        if (!res.ok) {
          return {
            capability: "tool-use",
            state: "failed",
            source: "probe",
            checkedAt: nowIso(),
            failureReason: `http ${res.status}`,
          };
        }
        const data = (await res.json()) as {
          choices?: Array<{ message?: { tool_calls?: unknown[] } }>;
        };
        const toolCalls = data.choices?.[0]?.message?.tool_calls;
        const ok = Array.isArray(toolCalls) && toolCalls.length > 0;
        return {
          capability: "tool-use",
          state: ok ? "verified" : "failed",
          source: "probe",
          checkedAt: nowIso(),
          failureReason: ok ? undefined : "no tool_calls in response",
        };
      } catch (err) {
        return {
          capability: "tool-use",
          state: "failed",
          source: "probe",
          checkedAt: nowIso(),
          failureReason: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
