import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("provider contract is transport-only", () => {
  const source = readFileSync("backend/provider/model-provider.ts", "utf8");
  assert.match(source, /generate\(input: ModelGenerateRequest\)/);
  assert.doesNotMatch(source, /research\s*\(/);
  assert.doesNotMatch(source, /Promise<ResearchBundle>/);
});

test("Researcher owns canonical bundle construction", () => {
  const source = readFileSync("backend/agents/researcher/bundle-builder.ts", "utf8");
  assert.match(source, /researchDraftToBundle/);
  assert.match(source, /fixture_id/);
  assert.match(source, /goal_id/);
});
