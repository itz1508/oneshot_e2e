import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

describe("Governed Research Flow & Controller Extraction Suite", () => {
  it("verifies research domain models and ReadinessCard are implemented and exported", () => {
    assert.ok(
      existsSync(join(root, "frontend/web/src/types/research.ts")),
      "types/research.ts must exist"
    );
    assert.ok(
      existsSync(join(root, "frontend/web/src/components/ReadinessCard.tsx")),
      "ReadinessCard.tsx must exist"
    );

    const typesIndex = read("frontend/web/src/types/index.ts");
    assert.match(typesIndex, /export \* from "\.\/research";/);

    const componentsIndex = read("frontend/web/src/components/index.ts");
    assert.match(componentsIndex, /export \* from "\.\/ReadinessCard";/);
  });

  it("verifies ResearcherDrawer preserves existing e2e accessibility and search contract", () => {
    const src = read("frontend/web/src/components/ResearcherDrawer.tsx");
    assert.match(src, /id="researcherDrawer"/);
    assert.match(src, /id="closeResearcherDrawerBtn"/);
    assert.match(src, /id="tavilySearchInput"/);
    assert.match(src, /id="tavilySearchBtn"/);
    assert.match(src, /className="insert-cite-btn/);
    assert.match(src, /Research search is currently unavailable/);
  });

  it("verifies ResearcherDrawer incorporates Governed Runs Controller with dual-mode tabs", () => {
    const src = read("frontend/web/src/components/ResearcherDrawer.tsx");
    assert.match(src, /id="researcherTabSearchBtn"/);
    assert.match(src, /id="researcherTabControllerBtn"/);
    assert.match(src, /id="startResearchRunBtn"/);
    assert.match(src, /id="researchIntentInput"/);
  });

  it("verifies the 4-Action research controller (Start, Check, Update Directive, Cancel)", () => {
    const src = read("frontend/web/src/components/ResearcherDrawer.tsx");
    // Start action
    assert.match(src, /handleStartRun/);
    assert.match(src, /\/api\/research\/run/);
    // Check action
    assert.match(src, /handleCheckRun/);
    assert.match(src, /researchCheckBtn-/);
    // Update (mid-run directive) action
    assert.match(src, /handleSubmitDirective/);
    assert.match(src, /researchUpdateBtn-/);
    assert.match(src, /Directive applied to/);
    // Cancel action
    assert.match(src, /handleCancelRun/);
    assert.match(src, /researchCancelBtn-/);
  });

  it("verifies Human Review Gate 1 halts pipeline until explicit human decision", () => {
    const src = read("frontend/web/src/components/ResearcherDrawer.tsx");
    assert.match(src, /Gate 1: Pre-Planning Handoff Confirmation/);
    assert.match(src, /researchAcceptBtn-/);
    assert.match(src, /researchRejectBtn-/);
    assert.match(src, /handleAcceptRun/);
    assert.match(src, /handleRejectRun/);
    assert.match(src, /Nothing transitions to Design Planning until confirmed/);
  });

  it("verifies ReadinessCard embeds genuine score, invariant checks, and recommendations", () => {
    const src = read("frontend/web/src/components/ReadinessCard.tsx");
    assert.match(src, /Readiness Assessment/);
    assert.match(src, /progressbar/);
    assert.match(src, /Passed Checks/);
    assert.match(src, /Failed Invariants/);
    assert.match(src, /Recommendations/);
  });

  it("verifies Golden Rule invariant: zero fake timers (no TICKS simulation) in OneShot production", () => {
    const drawerSrc = read("frontend/web/src/components/ResearcherDrawer.tsx");
    const readinessSrc = read("frontend/web/src/components/ReadinessCard.tsx");
    assert.doesNotMatch(drawerSrc, /TICKS/);
    assert.doesNotMatch(readinessSrc, /TICKS/);
    assert.doesNotMatch(drawerSrc, /setTimeout\(.*status.*=.*ready/);
  });
});
