import test from "node:test";
import assert from "node:assert/strict";
import {
  createStrandsAgent,
  invokeDirectTool,
  createInitialAppState,
  validateJsonSerializable,
  OneShotStateBridge,
  streamStrandsToAgUi,
} from "../src/index.ts";

test("Strands 3-Tier State Management — AppState JSON Validation & Isolation", async (t) => {
  await t.test("createInitialAppState returns valid default OneShot appState", () => {
    const state = createInitialAppState();
    assert.equal(state.workflowStage, "research");
    assert.equal(state.gate1Status, "pending");
    assert.equal(state.gate2Status, "pending");
    assert.equal(state.confirmedPackageCore, null);
    assert.equal(state.restorePoint, "RES-7702-INIT");
    assert.equal(state.userPreferences.theme, "dark");
  });

  await t.test("validateJsonSerializable validates primitives and complex objects", () => {
    assert.doesNotThrow(() => {
      validateJsonSerializable({
        str: "hello",
        num: 42,
        bool: true,
        arr: [1, 2, { nested: "data" }],
        nullable: null,
      });
    });

    assert.throws(
      () => {
        validateJsonSerializable({
          fn: () => "invalid",
        });
      },
      /contains a function/
    );

    assert.throws(
      () => {
        const circular = {};
        circular.self = circular;
        validateJsonSerializable(circular);
      },
      /Circular reference/
    );
  });

  await t.test("createStrandsAgent configures appState outside LLM prompt context", () => {
    const agent = createStrandsAgent({
      initialAppState: {
        restorePoint: "RES-TEST-POINT",
        userPreferences: { theme: "light" },
      },
    });

    assert.equal(agent.appState.get("restorePoint"), "RES-TEST-POINT");
    assert.equal(agent.appState.get("workflowStage"), "research");
    assert.deepEqual(agent.appState.get("userPreferences"), { theme: "light" });

    // Modifying appState
    agent.appState.set("customKey", { verified: true });
    assert.deepEqual(agent.appState.get("customKey"), { verified: true });

    // Strands built-in JSON serialization validation
    assert.throws(
      () => {
        agent.appState.set("fn", () => {});
      },
      /cannot be serialized/
    );
  });
});

test("Strands 3-Tier State Management — Conversation History & Sliding Window", async (t) => {
  await t.test("seeds initial messages in conversation history", () => {
    const agent = createStrandsAgent({
      messages: [
        {
          role: "user",
          content: [{ text: "Hello OneShot" }],
        },
        {
          role: "assistant",
          content: [{ text: "Greetings! How can I assist with your build?" }],
        },
      ],
    });

    assert.equal(agent.messages.length, 2);
    assert.equal(agent.messages[0].role, "user");
    assert.equal(agent.messages[1].role, "assistant");
  });
});

test("Strands 3-Tier State Management — State-Aware Workflow Tools & Invariant Gates", async (t) => {
  const agent = createStrandsAgent({
    initialAppState: {
      workflowStage: "research",
      gate1Status: "pending",
      gate2Status: "pending",
      confirmedPackageCore: null,
    },
  });

  await t.test("blocks transition to planning when Gate 1 is pending", async () => {
    const result = await invokeDirectTool(agent, "workflow_transition", {
      targetStage: "planning",
    });

    assert.ok(result.content[0].text.includes("TRANSITION_BLOCKED"));
    assert.ok(result.content[0].text.includes("Gate 1 (Research Review) must be confirmed"));
    assert.equal(agent.appState.get("workflowStage"), "research");
  });

  await t.test("allows transition to planning after Gate 1 is confirmed", async () => {
    OneShotStateBridge.confirmGate1(agent.appState);
    assert.equal(agent.appState.get("gate1Status"), "confirmed");

    const result = await invokeDirectTool(agent, "workflow_transition", {
      targetStage: "planning",
    });

    assert.ok(result.content[0].text.includes("STAGE_TRANSITION_SUCCESS"));
    assert.equal(agent.appState.get("workflowStage"), "planning");
  });

  await t.test("blocks transition to builder when Gate 2 is pending", async () => {
    const result = await invokeDirectTool(agent, "workflow_transition", {
      targetStage: "builder",
    });

    assert.ok(result.content[0].text.includes("TRANSITION_BLOCKED"));
    assert.ok(result.content[0].text.includes("Gate 2 (Build Ready) must be authorized"));
    assert.equal(agent.appState.get("workflowStage"), "planning");
  });

  await t.test("allows transition to builder after Gate 2 is confirmed with package hash", async () => {
    OneShotStateBridge.confirmGate2(
      agent.appState,
      "sha256-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
    );
    assert.equal(agent.appState.get("gate2Status"), "confirmed");
    assert.equal(
      agent.appState.get("confirmedPackageCore"),
      "sha256-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
    );

    const result = await invokeDirectTool(agent, "workflow_transition", {
      targetStage: "builder",
    });

    assert.ok(result.content[0].text.includes("STAGE_TRANSITION_SUCCESS"));
    assert.equal(agent.appState.get("workflowStage"), "builder");
  });

  await t.test("workflow_gate_status inspects all gate properties", async () => {
    const result = await invokeDirectTool(agent, "workflow_gate_status", {});
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.workflowStage, "builder");
    assert.equal(parsed.gate1Status, "confirmed");
    assert.equal(parsed.gate2Status, "confirmed");
    assert.equal(
      parsed.confirmedPackageCore,
      "sha256-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
    );
  });
});

test("Strands 3-Tier State Management — Direct Tool Calling Suppression", async (t) => {
  const agent = createStrandsAgent();
  const initialLength = agent.messages.length;

  // 1. Direct tool invocation without suppressing recording adds messages to conversation history
  await invokeDirectTool(agent, "workflow_gate_status", {});
  const lengthAfterRecorded = agent.messages.length;
  assert.ok(
    lengthAfterRecorded > initialLength,
    "Default direct tool invocation should record to conversation history"
  );

  // 2. Direct tool invocation with recordDirectToolCall: false does NOT pollute conversation history
  await invokeDirectTool(agent, "workflow_gate_status", {}, { recordDirectToolCall: false });
  assert.equal(
    agent.messages.length,
    lengthAfterRecorded,
    "Suppressed direct tool invocation must not add to conversation history"
  );
});

test("Strands 3-Tier State Management — Invocation State & AG-UI Stream Adapter", async (t) => {
  // Mock agent with mock stream that accepts invocationState and emits events
  const mockAgent = {
    stream: async function* (prompt, options) {
      if (options?.invocationState) {
        options.invocationState.receivedPrompt = prompt;
        options.invocationState.counter = (options.invocationState.counter || 0) + 1;
      }
      yield { type: "data", data: "Response text chunk" };
    },
  };

  const invocationState = {
    requestId: "req-101",
    userId: "user-99",
    auditEvents: [],
  };

  const events = [];
  for await (const event of streamStrandsToAgUi({
    agent: mockAgent,
    prompt: "Test prompt with state",
    runId: "run-state-test",
    invocationState,
  })) {
    events.push(event);
  }

  const runFinish = events.find((e) => e.type === "RUN_FINISH");
  assert.ok(runFinish);
  assert.equal(runFinish.status, "COMPLETED");
  assert.equal(runFinish.finalInvocationState.requestId, "req-101");
  assert.equal(runFinish.finalInvocationState.receivedPrompt, "Test prompt with state");
  assert.equal(runFinish.finalInvocationState.counter, 1);
});
