import { httpJsonRequest } from "../../transport/http-request.js";
import type { ModelCandidate } from "../../core/types.js";

/**
 * OpenAI-compatible model discovery (M5). `GET /models` against an
 * OpenAI-compatible endpoint and map the response to provider-scoped
 * `ModelCandidate`s. Identity stays provider-scoped (Gap 4): the caller
 * supplies `providerId` + `endpointId`.
 */

export interface DiscoveredModel {
  readonly id: string;
}

export interface ModelDiscovery {
  discoverModels(
    baseUrl: string,
    opts?: { apiKey?: string; timeoutMs?: number },
  ): Promise<DiscoveredModel[]>;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function createOpenAICompatibleDiscovery(): ModelDiscovery {
  return {
    discoverModels: async (baseUrl, opts) => {
      const url = joinUrl(baseUrl, "/models");
      const headers: Record<string, string> = {};
      if (opts?.apiKey) {
        headers.authorization = `Bearer ${opts.apiKey}`;
      }
      const res = await httpJsonRequest(url, { headers, timeoutMs: opts?.timeoutMs });
      if (!res.ok) {
        throw new Error(`models discovery failed: ${res.status}`);
      }
      const data = (await res.json()) as { data?: { id: string }[] };
      return (data.data ?? []).map((m) => ({ id: m.id }));
    },
  };
}

/** Convert discovered models into provider-scoped `ModelCandidate`s. */
export function toModelCandidates(
  discovered: readonly DiscoveredModel[],
  providerId: string,
  endpointId: string,
): ModelCandidate[] {
  return discovered.map((m) => ({
    modelId: m.id,
    providerId,
    endpointId,
    displayName: m.id,
    discovered: true,
  }));
}
