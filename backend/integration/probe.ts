import { integrationPackageSpec } from "./catalog.js";
import {
  readIntegrationStates,
  readSecret,
  updateIntegrationState,
  type IntegrationTestStatus,
} from "./persistence.js";
import { loadIntegrationPackage } from "./runtime.js";

export interface IntegrationTestResult {
  id: string;
  ok: boolean;
  status: IntegrationTestStatus;
  last_test_at: string;
  error?: string;
}

export interface ProbeInput {
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

/**
 * Generic, vendor-neutral reachability probe. Every detail of *how* a given
 * integration's connection is tested (URL, headers, timeout) comes from that
 * integration's declarative probe descriptor in the catalog — this engine
 * contains no provider-name routing.
 */
export async function testIntegrationConnection(
  projectRoot: string,
  integrationId: string,
  input: ProbeInput = {},
): Promise<IntegrationTestResult> {
  const spec = integrationPackageSpec(integrationId);
  const finish = async (
    status: IntegrationTestStatus,
    error?: string,
  ): Promise<IntegrationTestResult> => {
    const at = new Date().toISOString();
    await updateIntegrationState(projectRoot, spec.id, (current) => ({
      ...current,
      last_test_status: status,
      last_test_at: at,
    }));
    return { id: spec.id, ok: status === "reachable", status, last_test_at: at, ...(error ? { error } : {}) };
  };

  await updateIntegrationState(projectRoot, spec.id, (current) => ({
    ...current,
    last_test_status: "testing",
  }));

  // 1. Package must be installed and loadable.
  try {
    await loadIntegrationPackage(projectRoot, spec.id);
  } catch (e) {
    return finish(
      "package_missing",
      e instanceof Error ? e.message : String(e),
    );
  }

  // 2. Configuration: explicit input → persisted state/secrets → environment.
  const states = await readIntegrationStates(projectRoot);
  const stored = states[spec.id] ?? {};
  const apiKey = (
    input.apiKey?.trim() ||
    (await readSecret(projectRoot, spec.id)) ||
    (process.env[spec.apiKeyEnv] || "").trim()
  ).trim();
  const model = (
    input.model?.trim() ||
    stored.config?.model?.trim() ||
    (process.env[spec.modelEnv] || "").trim() ||
    spec.defaultModel
  ).trim();
  const baseURL = (
    input.baseURL?.trim() ||
    stored.config?.baseURL?.trim() ||
    (spec.baseURLEnv ? (process.env[spec.baseURLEnv] || "").trim() : "") ||
    spec.probe.defaultBaseURL
  ).replace(/\/+$/, "");

  if (!apiKey) {
    return finish("invalid_config", "API key is required");
  }
  if (spec.requiresModel !== false && !model) {
    return finish("invalid_config", "model is required");
  }

  // 3. Real network probe through the integration's declarative adapter.
  const url = spec.probe.urlTemplate.replace("{baseURL}", baseURL);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), spec.probe.timeoutMs);
  // Preserve header-name casing end to end: some providers (e.g. Featherless
  // on api.featherless.ai) accept only the canonical "Authorization" spelling.
  // Node fetch/undici normalizes header *names* to lowercase on the wire, so
  // the probe sends headers through a raw TCP/TLS request built here instead
  // of fetch(). Response parsing is intentionally minimal: status line only.
  const parsed = new URL(url);
  const rawStatus = await new Promise<number>((resolveRaw, rejectRaw) => {
    const targetPort = parsed.port
      ? Number(parsed.port)
      : parsed.protocol === "https:"
        ? 443
        : 80;
    const lines = [
      `${spec.probe.method} ${parsed.pathname}${parsed.search} HTTP/1.1`,
      `Host: ${parsed.hostname}`,
      "Connection: close",
    ];
    for (const [name, template] of Object.entries(spec.probe.headers)) {
      lines.push(`${name}: ${template.replace("{apiKey}", apiKey)}`);
    }
    let payload = "";
    if (spec.probe.bodyTemplate) {
      const substitute = (value: unknown): unknown =>
        typeof value === "string"
          ? value.replace("{apiKey}", apiKey)
          : Array.isArray(value)
            ? value.map(substitute)
            : value && typeof value === "object"
              ? Object.fromEntries(
                  Object.entries(value as Record<string, unknown>).map(
                    ([k, v]) => [k, substitute(v)],
                  ),
                )
              : value;
      payload = JSON.stringify(substitute(spec.probe.bodyTemplate));
      lines.push(`Content-Length: ${Buffer.byteLength(payload)}`);
    }
    const requestText = lines.join("\r\n") + "\r\n\r\n" + payload;
    const onData = (chunk: Buffer) => {
      const firstLine = chunk.toString("latin1").split("\r\n")[0] ?? "";
      const match = /^HTTP\/\d(?:\.\d)?\s+(\d{3})/.exec(firstLine);
      if (match) {
        clearTimeout(timer);
        resolveRaw(Number(match[1]));
      }
    };
    if (parsed.protocol === "https:") {
      void import("node:tls").then(({ connect }) => {
        const socket = connect(
          { host: parsed.hostname, port: targetPort, servername: parsed.hostname },
          () => socket.write(requestText),
        );
        socket.setTimeout(spec.probe.timeoutMs, () => socket.destroy(new Error("probe timed out")));
        socket.once("data", onData);
        socket.once("error", (err) => {
          clearTimeout(timer);
          rejectRaw(err);
        });
        socket.once("close", (hadError) => {
          if (!hadError) {
            clearTimeout(timer);
            rejectRaw(new Error("connection closed before a response"));
          }
        });
        controller.signal.addEventListener("abort", () => socket.destroy());
      });
    } else {
      void import("node:net").then(({ connect }) => {
        const socket = connect(
          { host: parsed.hostname, port: targetPort },
          () => socket.write(requestText),
        );
        socket.setTimeout(spec.probe.timeoutMs, () => socket.destroy(new Error("probe timed out")));
        socket.once("data", onData);
        socket.once("error", (err) => {
          clearTimeout(timer);
          rejectRaw(err);
        });
        socket.once("close", (hadError) => {
          if (!hadError) {
            clearTimeout(timer);
            rejectRaw(new Error("connection closed before a response"));
          }
        });
        controller.signal.addEventListener("abort", () => socket.destroy());
      });
    }
  });

  try {
    if (rawStatus >= 200 && rawStatus < 300) {
      return finish("reachable");
    }
    // Providers reject bad credentials differently: OpenAI/Anthropic use
    // 401/403, Gemini answers 400 "API key not valid" on metadata probes.
    // The request itself is well-formed, so 4xx here means rejected auth.
    if (rawStatus === 400 || rawStatus === 401 || rawStatus === 403) {
      return finish("auth_failed", `provider rejected credentials (HTTP ${rawStatus})`);
    }
    return finish("unreachable", `provider responded HTTP ${rawStatus}`);
  } catch (e) {
    return finish(
      "unreachable",
      e instanceof Error ? e.message : String(e),
    );
  } finally {
    clearTimeout(timer);
  }
}
