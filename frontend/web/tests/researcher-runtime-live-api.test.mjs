import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const liveRaw = read("frontend/web/src/patterns/deep-agent-todo-list/researcher-runtime/LiveApiRuntime.ts");
const live = stripComments(liveRaw);
const factory = read("frontend/web/src/patterns/deep-agent-todo-list/researcher-runtime/createResearcherRuntime.ts");

describe("LiveApiRuntime — real deployed API, no silent fallback", () => {
  it("(live-01) executionMode is LIVE_API", () => {
    assert.match(live, /executionMode\s*=\s*"LIVE_API"/);
  });

  it("(live-02) throws LiveApiNotConfiguredError when apiBaseUrl is missing", () => {
    assert.match(live, /throw new LiveApiNotConfiguredError\(\)/);
    assert.match(factory, /LiveApiNotConfiguredError/);
  });

  it("(live-03) requires an INJECTED fetchImpl — never a bound global", () => {
    assert.doesNotMatch(live, /(^|[^.\w])fetch\s*\(/m);
    assert.match(live, /cfg\.fetchImpl\(/);
  });

  it("(live-04) does NOT import SimulationRuntime (no silent fallback in executable code)", () => {
    assert.doesNotMatch(live, /import[^;]*SimulationRuntime[^;]*from/);
    assert.doesNotMatch(live, /new SimulationRuntime/);
  });

  it("(live-05) maps HTTP 401 to AuthenticationRequiredError", () => {
    assert.match(live, /res\.status === 401[\s\S]{0,300}AuthenticationRequiredError/);
  });

  it("(live-06) maps HTTP 403 to AuthenticationFailedError", () => {
    assert.match(live, /res\.status === 403[\s\S]{0,300}AuthenticationFailedError/);
  });

  it("(live-07) maps transport failure to NetworkError (never swallowed)", () => {
    assert.match(live, /throw new NetworkError\(/);
  });

  it("(live-08) supports cooperative cancellation via AbortController", () => {
    assert.match(live, /new AbortController\(\)|abortController/);
    assert.match(live, /this\.controller\.abort\(\)/);
    assert.match(live, /signal:\s*this\.controller\.signal/);
  });

  it("(live-09) never reads a credential from env or import.meta (in executable code)", () => {
    assert.doesNotMatch(live, /process\.env/);
    assert.doesNotMatch(live, /import\.meta\.env/);
  });

  it("(live-10) never accepts an apiKey in its config", () => {
    assert.doesNotMatch(live, /apiKey\??:\s*string/);
    assert.doesNotMatch(live, /accessToken\??:\s*string/);
    assert.doesNotMatch(live, /refreshToken\??:\s*string/);
  });
});
