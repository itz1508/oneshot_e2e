import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

const frontendRoot = join(root, "frontend/web/src");
const embedRoot    = join(root, "frontend/web/public/embed");

describe("Security — credentials never leak into the fixture", () => {
  it("(sec-01) no VITE_*_API_KEY / VITE_*_TOKEN / VITE_*_SECRET anywhere", () => {
    for (const abs of [...walk(frontendRoot), ...walk(embedRoot)]) {
      const c = readFileSync(abs, "utf8");
      assert.doesNotMatch(c, /VITE_[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET)/, `leak in ${abs}`);
    }
  });

  it("(sec-02) no process.env.*_KEY / *_TOKEN / *_SECRET in the frontend tree", () => {
    for (const abs of walk(frontendRoot)) {
      const c = readFileSync(abs, "utf8");
      assert.doesNotMatch(c, /process\.env\.[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET)/, `leak in ${abs}`);
    }
  });

  it("(sec-03) no real credential signatures in any tracked file", () => {
    // Signatures we scan for: OpenAI sk-*, Google AIzaSy*, GitHub ghp_*/gho_*, Slack xox[baprs]-, PEM.
    const patterns = [
      /sk-[A-Za-z0-9]{20,}/,
      /AIzaSy[A-Za-z0-9_\-]{30,}/,
      /ghp_[A-Za-z0-9]{30,}/,
      /gho_[A-Za-z0-9]{30,}/,
      /xox[baprs]-[A-Za-z0-9\-]{10,}/,
      /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
    ];
    const tree = [
      ...walk(join(root, "packages")),
      ...walk(join(root, "tests")),
      ...walk(join(root, "verification")),
      join(root, "app/env/.env.example"),
      join(root, "README.md"),
      join(root, "MANIFEST.sha256"),
    ];
    for (const abs of tree) {
      let c;
      try { c = readFileSync(abs, "utf8"); } catch { continue; }
      for (const p of patterns) {
        assert.doesNotMatch(c, p, `credential-shaped string in ${abs}`);
      }
    }
  });

  it("(sec-04) .env.example values are EMPTY placeholders (no filled secrets)", () => {
    const env = read("app/env/.env.example");
    // Every KEY=VALUE line must have an empty value.
    const lines = env.split("\n").filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l));
    assert.ok(lines.length >= 2, "expected at least GEMINI_API_KEY and ANTHROPIC_API_KEY");
    for (const line of lines) {
      const [k, v] = line.split("=", 2);
      assert.strictEqual(v, "", `${k} must be empty in .env.example, got: ${JSON.stringify(v)}`);
    }
    // Explicitly required keys present:
    assert.match(env, /^GEMINI_API_KEY=$/m);
    assert.match(env, /^ANTHROPIC_API_KEY=$/m);
    // And explicitly forbidden:
    assert.doesNotMatch(env, /VITE_/);
  });

  it("(sec-05) AuthStatus type excludes token/secret/api_key fields", () => {
    const types = read("frontend/web/src/patterns/deep-agent-todo-list/researcher-runtime/types.ts");
    // Locate the AuthStatus interface body.
    const m = types.match(/export interface AuthStatus\s*\{([\s\S]*?)\}/);
    assert.ok(m, "AuthStatus interface not found");
    const body = m[1];
    for (const forbidden of ["accessToken", "refreshToken", "clientSecret", "apiKey", "api_key", "authorization"]) {
      assert.ok(!new RegExp(`\\b${forbidden}\\b`, "i").test(body),
        `AuthStatus must not carry ${forbidden}`);
    }
  });

  it("(sec-06) Gemini-first: .env.example lists GEMINI_API_KEY before ANTHROPIC_API_KEY", () => {
    const env = read(".env.example");
    const iG = env.indexOf("GEMINI_API_KEY=");
    const iA = env.indexOf("ANTHROPIC_API_KEY=");
    assert.ok(iG > -1 && iA > -1);
    assert.ok(iG < iA, "GEMINI_API_KEY must appear before ANTHROPIC_API_KEY");
  });

  it("(sec-07) README documents Gemini as preferred provider before Anthropic", () => {
    const readme = read("README.md");
    const iG = readme.search(/\bGemini\b/i);
    const iA = readme.search(/\bAnthropic\b/i);
    assert.ok(iG > -1, "README must mention Gemini");
    assert.ok(iA === -1 || iG < iA, "Gemini must appear before Anthropic if Anthropic is mentioned");
  });
});
