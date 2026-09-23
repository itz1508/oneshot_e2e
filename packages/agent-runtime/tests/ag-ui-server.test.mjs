import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatAgUiSse, streamStrandsToAgUi } from "../src/ag-ui/server-adapter.ts";

describe("Strands AG-UI Backend Server Adapter", () => {
  it("formats AG-UI events as valid Server-Sent Events (SSE)", () => {
    const sse = formatAgUiSse({
      type: "RUN_START",
      runId: "run-test-1",
      timestamp: "2026-09-22T09:00:00Z",
      agentName: "OneShot Test Agent",
    });

    assert.ok(sse.startsWith("event: RUN_START\n"));
    assert.ok(sse.includes('"runId":"run-test-1"'));
    assert.ok(sse.endsWith("\n\n"));
  });

  it("streams real agent events translated to standard AG-UI events", async () => {
    // Mock minimal Strands agent streaming interface
    const mockAgent = {
      async *stream(prompt) {
        yield { type: "lifecycle", lifecycle: "beforeModelCallEvent" };
        yield { type: "data", data: "Hello" };
        yield { type: "data", data: " world" };
        yield { type: "lifecycle", lifecycle: "afterModelCallEvent" };
      },
    };

    const events = [];
    for await (const evt of streamStrandsToAgUi({ agent: mockAgent, prompt: "Say hello" })) {
      events.push(evt);
    }

    // Must start with RUN_START
    assert.strictEqual(events[0].type, "RUN_START");

    // Has step events
    const stepStarts = events.filter((e) => e.type === "STEP_START");
    assert.ok(stepStarts.length > 0);

    // Has text deltas
    const deltas = events.filter((e) => e.type === "TEXT_MESSAGE_DELTA");
    assert.strictEqual(deltas.length, 2);
    assert.strictEqual(deltas[0].delta, "Hello");
    assert.strictEqual(deltas[1].delta, " world");

    // Must finish with RUN_FINISH status COMPLETED
    const finish = events[events.length - 1];
    assert.strictEqual(finish.type, "RUN_FINISH");
    assert.strictEqual(finish.status, "COMPLETED");
    assert.strictEqual(finish.finalMessage, "Hello world");
  });

  it("handles agent stream failure cleanly with RUN_FINISH FAILED status", async () => {
    const failingAgent = {
      async *stream() {
        throw new Error("Provider rate limit reached");
      },
    };

    const events = [];
    for await (const evt of streamStrandsToAgUi({ agent: failingAgent, prompt: "Fail" })) {
      events.push(evt);
    }

    assert.strictEqual(events[0].type, "RUN_START");
    const last = events[events.length - 1];
    assert.strictEqual(last.type, "RUN_FINISH");
    assert.strictEqual(last.status, "FAILED");
    assert.match(last.error || "", /Provider rate limit/);
  });
});
