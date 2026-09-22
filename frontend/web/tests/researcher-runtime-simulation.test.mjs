import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

// Strip // line comments and /* ... */ block comments so scans are about
// executable code, not the invariant docstrings that intentionally NAME
// forbidden primitives.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const types = read("frontend/web/src/patterns/deep-agent-todo-list/researcher-runtime/types.ts");
const simRaw = read("frontend/web/src/patterns/deep-agent-todo-list/researcher-runtime/SimulationRuntime.ts");
const sim = stripComments(simRaw);
const factory = read("frontend/web/src/patterns/deep-agent-todo-list/researcher-runtime/createResearcherRuntime.ts");

describe("SimulationRuntime — deterministic, offline, credential-free", () => {
  it("(sim-01) executionMode is SIMULATION", () => {
    assert.match(sim, /executionMode\s*=\s*"SIMULATION"/);
  });

  it("(sim-02) makes zero network calls (no fetch/XMLHttpRequest in executable code)", () => {
    assert.doesNotMatch(sim, /\bfetch\s*\(/);
    assert.doesNotMatch(sim, /XMLHttpRequest/);
    assert.doesNotMatch(sim, /WebSocket/);
    assert.doesNotMatch(sim, /process\.env/);
    assert.doesNotMatch(sim, /import\.meta\.env/);
  });

  it("(sim-03) implements the ResearcherRuntime methods contract", () => {
    for (const method of ["submit", "cancel", "continue", "applyCorrection", "subscribe", "getSnapshot"]) {
      assert.match(sim, new RegExp(`\\b${method}\\s*\\(`), `missing method: ${method}`);
    }
  });

  it("(sim-04) auth.state is always UNSUPPORTED in simulation", () => {
    assert.match(sim, /state:\s*"UNSUPPORTED"/);
    assert.doesNotMatch(sim, /accessToken|refreshToken|clientSecret|apiKey/i);
  });

  it("(sim-05) createResearcherRuntime routes SIMULATION to SimulationRuntime", () => {
    assert.match(factory, /executionMode === "SIMULATION"[\s\S]{0,200}new SimulationRuntime\(\)/);
  });

  it("(sim-06) types.ts declares the required contract members", () => {
    for (const sym of [
      "ExecutionMode", "ResearcherRuntime", "ResearchRequest",
      "ResearchSnapshot", "ResearchEvent", "ResearchCorrection",
      "AuthStatus", "AuthState", "AuthenticationMethod",
      "AuthenticationRequiredError", "AuthenticationFailedError",
      "NetworkError", "LiveApiNotConfiguredError",
    ]) {
      assert.match(types, new RegExp(`\\b${sym}\\b`), `types.ts missing: ${sym}`);
    }
    for (const s of ["NOT_INSTALLED","CONFIG_REQUIRED","CONFIGURED","VERIFYING","READY","ENABLED","DISABLED","FAILED","UNSUPPORTED"]) {
      assert.match(types, new RegExp(`"${s}"`), `AuthState missing: ${s}`);
    }
  });
});
