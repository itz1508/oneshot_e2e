import test from "node:test";
import assert from "node:assert/strict";
import type { Plan, ResearchBundle } from "../backend/contract/types.js";
import { PythonBridge } from "../backend/validation/python-bridge.js";
import { ValidationLanePool } from "../backend/validation/validation-lane-pool.js";
import { DeterministicValidationRuntime } from "../backend/validation/deterministic-validation.js";

test("Schema Fixture and Goal can enter three independent Python lanes before release", async () => {
  const entered = new Set<string>();
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });

  class BarrierBridge extends PythonBridge {
    constructor(private lane: string) {
      super("python");
    }

    override async call<T>(command: string): Promise<T> {
      entered.add(this.lane);
      if (entered.size === 3) release();
      await barrier;

      const common = { plan_id: "plan:test", evidence: [] };
      if (command === "schema-validation") {
        return {
          ...common,
          schema_id: "schema:test",
          result: "VALID",
        } as T;
      }
      if (command === "fixture-validation") {
        return {
          ...common,
          fixture_id: "fixture:test",
          assertion_results: [],
          result: "VALID",
        } as T;
      }
      if (command === "goal-validation") {
        return {
          ...common,
          goal_id: "goal:test",
          criterion_results: [],
          result: "VALID",
        } as T;
      }
      return { valid: true } as T;
    }

    override close(): void {}
  }

  let lane = 0;
  const lanes = new ValidationLanePool(
    () => new BarrierBridge(["schema", "fixture", "goal"][lane++]),
  );
  const runtime = new DeterministicValidationRuntime(lanes);

  assert.notEqual(lanes.schema, lanes.fixture);
  assert.notEqual(lanes.fixture, lanes.goal);
  assert.notEqual(lanes.schema, lanes.goal);

  const plan = { plan_id: "plan:test" } as Plan;
  const bundle = {
    validation: { validation_id: "validation:test" },
    schema_artifact: { schema_id: "schema:test" },
    fixture: { fixture_id: "fixture:test" },
    goal: { goal_id: "goal:test" },
  } as unknown as ResearchBundle;

  const results = await Promise.all([
    runtime.schema(bundle, plan),
    runtime.fixture(bundle, plan),
    runtime.goal(bundle, plan),
  ]);

  assert.deepEqual([...entered].sort(), ["fixture", "goal", "schema"]);
  assert.deepEqual(
    results.map((result) => result.result),
    ["VALID", "VALID", "VALID"],
  );
});
