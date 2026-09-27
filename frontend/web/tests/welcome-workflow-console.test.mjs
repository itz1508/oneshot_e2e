import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

describe("Single-Screen Welcome / Try-It Experience Contract", () => {
  it("verifies WelcomeWorkflowConsole exists and is exported from canonical barrel", () => {
    assert.ok(
      existsSync(join(root, "frontend/web/src/components/WelcomeWorkflowConsole.tsx")),
      "WelcomeWorkflowConsole.tsx must exist"
    );
    const barrel = read("frontend/web/src/components/index.ts");
    assert.match(barrel, /export \* from "\.\/WelcomeWorkflowConsole";/);
  });

  it("verifies single-screen progression: Understand -> Try fixture -> Observe workflow -> Enter own key -> Try live", () => {
    const src = read("frontend/web/src/components/WelcomeWorkflowConsole.tsx");
    assert.match(src, /Understand/);
    assert.match(src, /Try fixture/);
    assert.match(src, /Observe workflow/);
    assert.match(src, /Enter own key/);
    assert.match(src, /Try live/);
  });

  it("provides ready-to-run default fixture without credentials", () => {
    const src = read("frontend/web/src/components/WelcomeWorkflowConsole.tsx");
    assert.match(src, /Agent 4-Partition Sandbox Security Invariants/);
    assert.match(src, /app\/fixtures\/security-invariants\.json/);
    assert.match(src, /SEC-INV-001/);
    assert.match(src, /no credentials needed/);
    assert.match(src, /id="tryItBtn"/);
  });

  it("enforces shared single-screen workflow area without separate demo pages", () => {
    const src = read("frontend/web/src/components/WelcomeWorkflowConsole.tsx");
    assert.match(src, /workflow runs here/);
    assert.match(src, /or use your own/);
    assert.match(src, /id="connectRunLiveBtn"/);
  });

  it("verifies App.tsx mounts WelcomeWorkflowConsole on canonical chat view", () => {
    const appSrc = read("frontend/web/src/components/App.tsx");
    assert.match(appSrc, /WelcomeWorkflowConsole/);
    assert.match(appSrc, /handleConfigureLiveProvider/);
    assert.match(appSrc, /onRunWorkflow/);
  });
});
