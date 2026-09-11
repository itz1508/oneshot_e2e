import test from "node:test";
import assert from "node:assert/strict";
import { validateRunJobV1, type RunJobV1, type RunJobData } from "../../runtime/queue.js";

test("validateRunJobV1 validates valid payload without provider", () => {
  const job: RunJobV1 = {
    version: 1,
    runId: "run-test-1",
    prompt: {
      prompt_id: "prompt-1",
      intent: "build media player",
      requested_outcome: "code",
      context: [],
      research_direction: [],
    },
    submittedAt: new Date().toISOString(),
  };

  const res = validateRunJobV1(job);
  assert.equal(res.ok, true);
  assert.equal(res.errors.length, 0);
});

test("validateRunJobV1 validates valid payload with integration selector", () => {
  const job: RunJobV1 = {
    version: 1,
    runId: "run-test-1",
    prompt: {
      prompt_id: "prompt-1",
      intent: "build media player",
      requested_outcome: "code",
      context: [],
      research_direction: [],
    },
    integration: {
      id: "gemini",
      configRevision: 0,
      model: "gemini-2.0-flash",
    },
    submittedAt: new Date().toISOString(),
  };

  const res = validateRunJobV1(job);
  assert.equal(res.ok, true);
  assert.equal(res.errors.length, 0);
});

test("validateRunJobV1 validates valid payload with legacy provider selector", () => {
  const job: RunJobData = {
    version: 1,
    runId: "run-test-1",
    prompt: {
      prompt_id: "prompt-1",
      intent: "build media player",
      requested_outcome: "code",
      context: [],
      research_direction: [],
    },
    provider: {
      id: "standalone",
      configRevision: 0,
    },
    submittedAt: new Date().toISOString(),
  };

  const res = validateRunJobV1(job);
  assert.equal(res.ok, true);
  assert.equal(res.errors.length, 0);
});

test("validateRunJobV1 rejects invalid payloads", () => {
  assert.equal(validateRunJobV1(null).ok, false);
  assert.equal(validateRunJobV1({}).ok, false);
  assert.equal(validateRunJobV1({ version: 2 }).ok, false);
  assert.equal(validateRunJobV1({ version: 1, runId: "r1" }).ok, false);
  assert.equal(
    validateRunJobV1({
      version: 1,
      runId: "r1",
      prompt: {},
      provider: { id: "" },
      submittedAt: new Date().toISOString(),
    }).ok,
    false,
  );
});
