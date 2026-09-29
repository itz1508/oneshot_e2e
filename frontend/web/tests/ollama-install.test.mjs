import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf-8");

describe("Ollama [+] install — backend proxy + UI opt-in", () => {
  it("resolves the daemon URL server-side; the browser only ever sends a model name", () => {
    const routesSrc = read("backend/routes/providers.ts");
    assert.match(routesSrc, /GET \/api\/ollama\/status/);
    assert.match(routesSrc, /POST \/api\/ollama\/pull \{ model \}/);
    // The daemon address comes from server env only.
    assert.match(routesSrc, /process\.env\.OLLAMA_BASE_URL/);
    // No client-supplied host/url/port is ever honoured on the pull body.
    assert.doesNotMatch(routesSrc, /body\??\.(baseUrl|url|host|port)\b/);
    // The secret (Ollama Cloud key) is never serialized into a response payload.
    assert.doesNotMatch(routesSrc, /OLLAMA_API_KEY\s*[,:]\s*(?:process\.env|")/);
  });

  it("allow-lists model names on pull (path traversal rejected)", () => {
    const routesSrc = read("backend/routes/providers.ts");
    assert.match(routesSrc, /sanitizeOllamaModel/);
    assert.match(routesSrc, /Invalid model name/);
    assert.match(routesSrc, /Already pulling/);
  });

  it("claims the install slot before dialing, so a double click cannot start two pulls", () => {
    const routesSrc = read("backend/routes/providers.ts");
    // Regression: assigning `ollamaInstalling` only after the upstream
    // responded left a window where a second [+] click began a parallel
    // multi-GB pull. It must be claimed first and always released.
    const claimAt = routesSrc.indexOf("ollamaInstalling = model;");
    const dialAt = routesSrc.indexOf("const upstream = await new Promise");
    assert.ok(claimAt > 0 && dialAt > 0, "both the claim and the dial must exist");
    assert.ok(claimAt < dialAt, "the slot must be claimed before the daemon is dialed");
    assert.match(routesSrc, /\} finally \{[\s\S]{0,200}?ollamaInstalling = null;/);
  });

  it("renders the [+] opt-in on the Ollama card with live daemon progress", () => {
    const cardSrc = read("frontend/web/src/components/Integration/Model/Ollama.tsx");
    assert.match(cardSrc, /pullOllamaModel\(selectedModel/);
    assert.match(cardSrc, /aria-live="polite"/);
    // Button flips to installed state from real /api/ollama/status payload.
    assert.match(cardSrc, /modelInstalled \? "✓" : "\+"/);
    // Install is gated on a self-hosted daemon, not on a remote endpoint.
    assert.match(cardSrc, /canInstall = Boolean\(install\?\.available && install\?\.local\)/);
    assert.match(cardSrc, /disabled=\{isPulling \|\| modelInstalled \|\| !canInstall\}/);
    // No fake timers or synthetic progress.
    assert.doesNotMatch(cardSrc, /setInterval|setTimeout\(\(\) => setPullPct/);
  });

  it("picks the transport from the resolved scheme instead of forcing port 11434", () => {
    const routesSrc = read("backend/routes/providers.ts");
    // Regression: `Number(target.port) || 11434` sent cleartext HTTP to 11434
    // for any default-port base, so an https:// base (Ollama Cloud) never
    // worked — the upstream answered 308 and the pull surfaced as HTTP 502.
    assert.doesNotMatch(routesSrc, /Number\(target\.port\) \|\| 11434/);
    assert.match(routesSrc, /import https from "node:https"/);
    assert.match(routesSrc, /const isTls = target\.protocol === "https:"/);
    assert.match(routesSrc, /fallbackPort = isTls \? 443 : 11434/);
    assert.match(routesSrc, /transport: isTls \? https : http/);
    assert.match(routesSrc, /transport\.request/);
  });

  it("refuses to fake an install when the endpoint is remote", () => {
    const routesSrc = read("backend/routes/providers.ts");
    // A remote endpoint serves models; there is no disk to install onto, so a
    // pull must be refused up front rather than proxied into a confusing 404.
    assert.match(routesSrc, /function isLocalDaemonBase\(base: string\): boolean/);
    assert.match(routesSrc, /if \(!isLocalDaemonBase\(base\)\)/);
    assert.match(routesSrc, /Model installs need a local Ollama daemon/);
    // Status must report the distinction so the UI can explain it.
    assert.match(routesSrc, /const local = isLocalDaemonBase\(base\)/);
    assert.match(routesSrc, /^\s+local,$/m);
  });

  it("streams the pull as NDJSON through the shared API client", () => {
    const apiSrc = read("frontend/web/src/lib/api.ts");
    assert.match(apiSrc, /\/api\/ollama\/pull/);
    assert.match(apiSrc, /\/api\/ollama\/status/);
    assert.match(apiSrc, /application\/x-ndjson|getReader\(\)/);
  });

  it("mounts the Ollama card in the Integrations drawer", () => {
    const drawerSrc = read("frontend/web/src/components/Integration/Integration.tsx");
    assert.match(drawerSrc, /ModelOllama/);
    assert.match(drawerSrc, /"ollama"/);
  });
});
