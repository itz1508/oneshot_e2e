/**
 * M16: Ollama native model discovery through /api/tags.
 *
 * Ollama exposes a native model listing API at GET /api/tags that
 * returns model names with tags, sizes, and modification times. This
 * is richer than the OpenAI-compatible /v1/models endpoint, which
 * only returns model IDs.
 *
 * The three approved Ollama endpoints are:
 *   http://127.0.0.1:11434
 *   http://localhost:11434
 *   http://host.docker.internal:11434
 *
 * No cloud key is required. All endpoints are local (loopback or
 * container-host). This module uses the undici-free node:http client
 * to avoid the libuv test-process issue.
 */
import { httpJsonRequest } from "../transport/http-request.js";

export interface OllamaModel {
  name: string;
  tag?: string;
  size?: number;
  modifiedAt?: string;
}

export interface OllamaTagsResponse {
  models: OllamaModel[];
}

/** Approved Ollama endpoints (local-only by default). */
export const OLLAMA_APPROVED_ENDPOINTS = [
  "http://localhost:11434",
  "http://127.0.0.1:11434",
] as const;

/**
 * M16: Auto-detect Ollama base URL from common local endpoints.
 * Returns the first reachable endpoint, or undefined if none are available.
 */
export async function autoDetectOllamaBaseUrl(): Promise<string | undefined> {
  const envCandidate = process.env.OLLAMA_BASE_URL?.trim();
  const candidates = envCandidate
    ? [envCandidate, ...OLLAMA_APPROVED_ENDPOINTS]
    : OLLAMA_APPROVED_ENDPOINTS;
  for (const endpoint of candidates) {
    try {
      const response = await httpJsonRequest(`${endpoint}/api/tags`, {
        method: "GET",
        headers: { Accept: "application/json" },
        timeoutMs: 1000,
      });
      if (response.ok && response.status < 400) {
        return endpoint;
      }
    } catch {
      // Continue to next candidate
    }
  }
  return undefined;
}

/**
 * Discover models from an Ollama installation via the native /api/tags
 * endpoint. Returns model names with tags (e.g., "llama3:8b",
 * "mistral:latest"). No authentication required.
 */
export async function discoverOllamaModels(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<OllamaModel[]> {
  const cleanUrl = baseUrl.replace(/\/+$/, "");
  const response = await httpJsonRequest(`${cleanUrl}/api/tags`, {
    method: "GET",
    headers: { Accept: "application/json" },
    timeoutMs: 5000,
  });

  if (!response.ok || response.status >= 400) {
    throw new Error(`Ollama /api/tags failed: HTTP ${response.status}`);
  }

  const body = (await response.json()) as OllamaTagsResponse | OllamaModel[];
  // Ollama /api/tags returns { models: [...] } but some versions may
  // return a bare array. Handle both.
  const models = Array.isArray(body) ? body : body.models ?? [];
  return models.map((m) => ({
    name: m.name,
    tag: m.tag,
    size: m.size,
    modifiedAt: m.modifiedAt,
  }));
}

/**
 * M16: Verify Ollama discovery paths (/api/tags and /v1/models).
 * Returns true if at least one discovery path is reachable.
 */
export async function verifyOllamaDiscoveryPaths(
  baseUrl: string,
): Promise<{ apiTags: boolean; v1Models: boolean }> {
  const cleanUrl = baseUrl.replace(/\/+$/, "");
  let apiTags = false;
  let v1Models = false;

  // Try /api/tags (native Ollama endpoint)
  try {
    const response = await httpJsonRequest(`${cleanUrl}/api/tags`, {
      method: "GET",
      headers: { Accept: "application/json" },
      timeoutMs: 2000,
    });
    apiTags = response.ok && response.status < 400;
  } catch {
    apiTags = false;
  }

  // Try /v1/models (OpenAI-compatible endpoint)
  try {
    const response = await httpJsonRequest(`${cleanUrl}/v1/models`, {
      method: "GET",
      headers: { Accept: "application/json" },
      timeoutMs: 2000,
    });
    v1Models = response.ok && response.status < 400;
  } catch {
    v1Models = false;
  }

  return { apiTags, v1Models };
}

/**
 * Check if a URL is an approved Ollama endpoint.
 */
export function isApprovedOllamaEndpoint(url: string): boolean {
  const normalized = url.replace(/\/+$/, "").toLowerCase();
  return OLLAMA_APPROVED_ENDPOINTS.some(
    (e) => e.toLowerCase() === normalized,
  );
}

/**
 * Convert an Ollama model name to an OpenAI-compatible model ID.
 * Ollama uses "name:tag" format; the OpenAI-compatible /v1/chat/completions
 * endpoint accepts the same "name:tag" as the model field.
 */
export function ollamaModelId(model: OllamaModel): string {
  if (model.tag && !model.name.includes(":")) {
    return `${model.name}:${model.tag}`;
  }
  return model.name;
}
