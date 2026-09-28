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


  // ── Real Strands SDK event shapes ────────────────────────────────────────────
  // These assert against the shapes the installed @strands-agents/sdk actually
  // emits. The tests above use a simplified `lifecycle`/`data` shim, which is
  // retained for backwards compatibility; these guards exist because the adapter
  // previously matched only the shim and therefore captured nothing from a real
  // agent run (no text, no TOOL_CALL_FINISH).
  it("extracts text from real modelStreamUpdateEvent textDelta frames", async () => {
    const mockAgent = {
      async *stream() {
        yield { type: "beforeModelCallEvent" };
        yield {
          type: "modelStreamUpdateEvent",
          event: { type: "modelContentBlockDeltaEvent", delta: { type: "textDelta", text: "Hello" } },
        };
        yield {
          type: "modelStreamUpdateEvent",
          event: { type: "modelContentBlockDeltaEvent", delta: { type: "textDelta", text: " world" } },
        };
        yield { type: "afterModelCallEvent" };
      },
    };

    const events = [];
    for await (const evt of streamStrandsToAgUi({ agent: mockAgent, prompt: "Say hello" })) {
      events.push(evt);
    }

    const deltas = events.filter((e) => e.type === "TEXT_MESSAGE_DELTA");
    assert.strictEqual(deltas.length, 2);
    assert.strictEqual(deltas[0].delta, "Hello");
    assert.strictEqual(deltas[1].delta, " world");

    const last = events[events.length - 1];
    assert.strictEqual(last.type, "RUN_FINISH");
    assert.strictEqual(last.status, "COMPLETED");
    assert.strictEqual(last.finalMessage, "Hello world");
  });

  it("maps a real beforeToolCallEvent/afterToolCallEvent pair to a correlated tool lifecycle", async () => {
    const mockAgent = {
      async *stream() {
        yield { type: "beforeModelCallEvent" };
        yield {
          type: "modelStreamUpdateEvent",
          event: {
            type: "modelContentBlockStartEvent",
            start: { type: "toolUseStart", name: "workflow_gate_status", toolUseId: "tu-1" },
          },
        };
        // contentBlockEvent repeats the toolUse; it must NOT open a second call.
        yield { type: "contentBlockEvent", contentBlock: { toolUse: { name: "workflow_gate_status", toolUseId: "tu-1", input: {} } } };
        yield { type: "beforeToolsEvent" };
        yield {
          type: "beforeToolCallEvent",
          toolUse: { name: "workflow_gate_status", toolUseId: "tu-1", input: {} },
        };
        yield {
          type: "afterToolCallEvent",
          toolUse: { name: "workflow_gate_status", toolUseId: "tu-1", input: {} },
          result: {
            type: "toolResult",
            toolUseId: "tu-1",
            status: "success",
            content: [{ text: '{"workflowStage":"research"}' }],
          },
          error: undefined,
        };
        yield { type: "afterToolsEvent" };
        yield {
          type: "modelStreamUpdateEvent",
          event: { type: "modelContentBlockDeltaEvent", delta: { type: "textDelta", text: "Stage is research." } },
        };
      },
    };

    const events = [];
    for await (const evt of streamStrandsToAgUi({ agent: mockAgent, prompt: "Check the stage" })) {
      events.push(evt);
    }

    const starts = events.filter((e) => e.type === "TOOL_CALL_START");
    const finishes = events.filter((e) => e.type === "TOOL_CALL_FINISH");

    // Exactly one call: the duplicate from contentBlockEvent must not appear.
    assert.strictEqual(starts.length, 1, "expected exactly one TOOL_CALL_START");
    assert.strictEqual(finishes.length, 1, "expected exactly one TOOL_CALL_FINISH");
    assert.strictEqual(starts[0].toolUseId, "tu-1");
    assert.strictEqual(starts[0].toolName, "workflow_gate_status");
    assert.strictEqual(finishes[0].toolUseId, starts[0].toolUseId, "toolUseId must correlate");
    assert.ok("result" in finishes[0], "TOOL_CALL_FINISH must carry a result field");

    // The real tool payload must survive, not serialise to {}.
    const serialised = JSON.stringify(finishes[0].result);
    assert.match(serialised, /workflowStage/, "tool result payload must be preserved");

    const last = events[events.length - 1];
    assert.strictEqual(last.type, "RUN_FINISH");
    assert.strictEqual(last.status, "COMPLETED");
  });

  it("reports a real tool failure as TOOL_CALL_ERROR, not a silent success", async () => {
    const mockAgent = {
      async *stream() {
        yield { type: "beforeToolCallEvent", toolUse: { name: "workflow_transition", toolUseId: "tu-2", input: {} } };
        yield {
          type: "afterToolCallEvent",
          toolUse: { name: "workflow_transition", toolUseId: "tu-2", input: {} },
          result: { type: "toolResult", toolUseId: "tu-2", status: "error", content: [{ text: "Gate 1 blocks this" }] },
        };
        yield {
          type: "modelStreamUpdateEvent",
          event: { type: "modelContentBlockDeltaEvent", delta: { type: "textDelta", text: "Blocked." } },
        };
      },
    };

    const events = [];
    for await (const evt of streamStrandsToAgUi({ agent: mockAgent, prompt: "Advance stage" })) {
      events.push(evt);
    }

    const errors = events.filter((e) => e.type === "TOOL_CALL_ERROR");
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].toolUseId, "tu-2");
    assert.match(errors[0].error, /Gate 1/);
    assert.strictEqual(events.filter((e) => e.type === "TOOL_CALL_FINISH").length, 0);
  });

  });
});
