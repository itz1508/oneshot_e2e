import { describe, it } from "node:test";
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(
  CURRENT_DIR,
  "..",
  "..",
  "..",
  "..",
  "app",
  "fixtures",
);

function loadFixture(name: string) {
  const fp = path.join(FIXTURES_DIR, "e2e", name);
  const content = fs.readFileSync(fp, "utf-8");
  return JSON.parse(content);
}

describe("UI E2E Observability Fixtures", () => {
  it("should load fixture 004", () => {
    const f = loadFixture("complete-004.json");
    assert.strictEqual(f.fixture.fixture_id, "fixture:004");
    assert.ok(f.fixture.plan_assertions);
    assert.ok(f.fixture.plan_assertions.length > 0);
  });

  it("should load fixture 005", () => {
    const f = loadFixture("complete-005.json");
    assert.strictEqual(f.fixture.fixture_id, "fixture:005");
    assert.strictEqual(f.audit.plan_id, "plan:005");
    assert.strictEqual(f.evaluation.result, "PASSED");
  });

  it("should load fixture 006", () => {
    const f = loadFixture("complete-006.json");
    assert.strictEqual(f.fixture.fixture_id, "fixture:006");
    assert.strictEqual(f.audit.plan_id, "plan:006");
    assert.strictEqual(f.evaluation.result, "PASSED");
  });

  it("should load fixture 007", () => {
    const f = loadFixture("complete-007.json");
    assert.strictEqual(f.fixture.fixture_id, "fixture:007");
    assert.strictEqual(f.audit.plan_id, "plan:007");
    assert.strictEqual(f.evaluation.result, "PASSED");
  });

  it("should validate fixture-suite", () => {
    const sp = path.join(FIXTURES_DIR, "fixture-suite.json");
    const s = JSON.parse(fs.readFileSync(sp, "utf-8"));
    assert.strictEqual(s.fixture_suite, "ui-e2e-observability-v1");
    assert.ok(s.total_fixtures > 0);
    assert.ok(s.fixtures.length > 0);
  });
});