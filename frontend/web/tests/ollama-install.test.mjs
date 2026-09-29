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

  it("renders the [+] opt-in on the Ollama card with live daemon progress", () => {
    const cardSrc = read("frontend/web/src/components/Integration/Model/Ollama.tsx");
    assert.match(cardSrc, /Install \$\{selectedModel\} locally/);
    assert.match(cardSrc, /pullOllamaModel\(selectedModel/);
    assert.match(cardSrc, /aria-live="polite"/);
    // Button flips to installed state from real /api/ollama/status payload.
    assert.match(cardSrc, /modelInstalled \? "✓" : "\+"/);
    // No fake timers or synthetic progress.
    assert.doesNotMatch(cardSrc, /setInterval|setTimeout\(\(\) => setPullPct/);
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
