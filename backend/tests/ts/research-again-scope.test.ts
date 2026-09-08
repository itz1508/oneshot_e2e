import test from "node:test";
import assert from "node:assert/strict";
import {
  getCurrentResearchRevision,
  incrementResearchRevision,
  stageIteration,
} from "../../pipeline/stage-scope.js";

class InMemoryRedis {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  async set(key: string, value: string): Promise<unknown> {
    this.store.set(key, value);
    return "OK";
  }

  async exists(key: string): Promise<number> {
    return this.store.has(key) ? 1 : 0;
  }
}

test("stageIteration treats researcher iteration as a research revision", () => {
  assert.equal(stageIteration("researcher", 0), 0);
  assert.equal(stageIteration("researcher", 1), 1);
  assert.equal(stageIteration("researcher", 2), 2);
  assert.equal(stageIteration("planner", 5), 0);
  assert.equal(stageIteration("refactor", 2), 2);
  assert.equal(stageIteration("gap-analysis", 1), 1);
});

test("getCurrentResearchRevision defaults to 0 and increments", async () => {
  const redis = new InMemoryRedis();
  const runId = "run-scope";
  assert.equal(await getCurrentResearchRevision(redis, runId), 0);
  assert.equal(await incrementResearchRevision(redis, runId), 1);
  assert.equal(await getCurrentResearchRevision(redis, runId), 1);
  assert.equal(await incrementResearchRevision(redis, runId), 2);
});
