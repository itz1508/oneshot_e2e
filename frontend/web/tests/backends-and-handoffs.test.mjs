import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";

import {
  StateBackend,
  FilesystemBackend,
  CompositeBackend,
} from "../../../packages/agent-runtime/src/backends/index.ts";
import {
  OneShotStageSupervisor,
  computeCanonicalCoreHash,
  createHandoffPair,
  executeHandoff,
} from "../../../packages/agent-runtime/src/handoffs/index.ts";

describe("DeepAgents Pluggable Backends Architecture", () => {
  it("StateBackend performs in-memory virtual filesystem operations", async () => {
    const backend = new StateBackend();

    // 1. Write
    const writeRes = await backend.write("/scratch/notes.txt", "Initial agent reasoning\nLine 2 target content");
    assert.strictEqual(writeRes.success, true);
    assert.strictEqual(writeRes.path, "/scratch/notes.txt");

    // 2. Read
    const readRes = await backend.read("/scratch/notes.txt");
    assert.strictEqual(readRes.error, undefined);
    assert.ok(readRes.content?.includes("Initial agent reasoning"));

    // 3. Edit
    const editRes = await backend.edit("/scratch/notes.txt", "Initial agent reasoning", "Refined synthesis");
    assert.strictEqual(editRes.success, true);
    const readAfterEdit = await backend.read("/scratch/notes.txt");
    assert.ok(readAfterEdit.content?.includes("Refined synthesis"));

    // 4. Grep
    const grepRes = await backend.grep("target content", "/scratch/");
    assert.strictEqual(grepRes.matches.length, 1);
    assert.strictEqual(grepRes.matches[0].lineNumber, 2);

    // 5. Ls
    const lsRes = await backend.ls("/scratch/");
    assert.ok(lsRes.entries.some((e) => e.name === "notes.txt"));

    // 6. Delete
    const delRes = await backend.delete("/scratch/notes.txt");
    assert.strictEqual(delRes.success, true);
    const readAfterDel = await backend.read("/scratch/notes.txt");
    assert.ok(readAfterDel.error);
  });

  it("FilesystemBackend enforces virtual_mode path traversal security", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "oneshot-fs-test-"));
    try {
      const backend = new FilesystemBackend({ rootDir: tempDir, virtualMode: true });

      // Safe write within rootDir
      const writeRes = await backend.write("/src/index.ts", "console.log('hello');");
      assert.strictEqual(writeRes.success, true);

      // Traversal attempt escaping rootDir must be rejected
      const escapeAttempts = ["../../etc/passwd", "../secret.env", "/../../root"];
      for (const attempt of escapeAttempts) {
        // Direct resolveSafePath throws
        assert.throws(() => {
          backend.resolveSafePath(attempt);
        }, /Security Violation|escapes/);

        // Protocol method returns structured error rather than throwing unhandled exception
        const readRes = await backend.read(attempt);
        assert.ok(readRes.error);
        assert.match(readRes.error, /Security Violation|escapes/);
      }
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("CompositeBackend routes prefixes and preserves namespaces", async () => {
    const defaultState = new StateBackend();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "oneshot-composite-test-"));

    try {
      const workspaceFs = new FilesystemBackend({ rootDir: tempDir, virtualMode: true });
      const composite = new CompositeBackend({
        default: defaultState,
        routes: {
          "/workspace/": workspaceFs,
        },
      });

      // 1. Offloaded large tool results go to ephemeral StateBackend (default)
      await composite.write("/scratch/tool_output.json", '{"huge": true}');
      const stateRead = await defaultState.read("/scratch/tool_output.json");
      assert.ok(stateRead.content?.includes('"huge": true'));

      // 2. Project code goes to physical FilesystemBackend under /workspace/
      await composite.write("/workspace/app.js", "const a = 1;");
      const diskContent = await fs.readFile(path.join(tempDir, "app.js"), "utf8");
      assert.strictEqual(diskContent, "const a = 1;");

      // 3. Composite ls aggregates preserving prefixes
      const lsRes = await composite.ls("/workspace/");
      assert.ok(lsRes.entries.some((e) => e.path === "/workspace/app.js"));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

describe("LangChain Multi-Agent Handoffs & Canonical Stage Gates", () => {
  it("enforces strict AIMessage + ToolMessage pairing with matching toolCallId", () => {
    const pair = createHandoffPair("planner", "call-stage-transfer-42", { reason: "Research complete" });

    assert.strictEqual(pair.aiMessage.toolCall.id, "call-stage-transfer-42");
    assert.strictEqual(pair.aiMessage.toolCall.name, "transfer_to_planner");
    assert.strictEqual(pair.toolMessage.toolCallId, "call-stage-transfer-42");
    assert.strictEqual(pair.toolMessage.stageConfirmed, "planner");
  });

  it("blocks transition to Planner until Research Review gate is approved", () => {
    const supervisor = new OneShotStageSupervisor("researcher");
    assert.strictEqual(supervisor.getCurrentStage(), "researcher");

    // Attempting handoff to planner without human review approval fails
    const blockedResult = supervisor.handoffTo("planner", "call-handoff-1");
    assert.strictEqual(blockedResult.success, false);
    assert.strictEqual(blockedResult.pendingGate, "research_review");
    assert.strictEqual(supervisor.getCurrentStage(), "researcher");

    // User approves Research Review gate
    supervisor.approveGate("research_review");
    const approvedResult = supervisor.handoffTo("planner", "call-handoff-2");
    assert.strictEqual(approvedResult.success, true);
    assert.strictEqual(supervisor.getCurrentStage(), "planner");
  });

  it("blocks transition to Builder until Build Ready gate is approved and verifies package core hash", () => {
    const supervisor = new OneShotStageSupervisor("evaluation");
    supervisor.approveGate("research_review");

    const packageCore = {
      planId: "plan-canonical-101",
      stage: "evaluation",
      objectives: ["Add composite backends", "Implement handoff gates"],
      tasks: [{ id: "t1", description: "Build router", status: "ready" }],
      version: 1,
    };
    const confirmedPkg = supervisor.setPackage(packageCore);
    assert.ok(confirmedPkg.coreHash);

    // 1. Blocked if Build Ready gate is not approved
    const unapproved = supervisor.handoffTo("builder", "call-builder-1", {}, packageCore);
    assert.strictEqual(unapproved.success, false);
    assert.strictEqual(unapproved.pendingGate, "build_ready");

    // 2. Approve Build Ready gate
    supervisor.approveGate("build_ready");

    // 3. Tampered package core hash should be rejected
    const tamperedCore = {
      ...packageCore,
      objectives: ["Tampered unauthorized action!"],
    };
    const tamperedHandoff = supervisor.handoffTo("builder", "call-builder-2", {}, tamperedCore);
    assert.strictEqual(tamperedHandoff.success, false);
    assert.match(tamperedHandoff.error || "", /Cryptographic Mismatch/);

    // 4. Genuine package core succeeds
    const successHandoff = supervisor.handoffTo("builder", "call-builder-3", {}, packageCore);
    assert.strictEqual(successHandoff.success, true);
    assert.strictEqual(supervisor.getCurrentStage(), "builder");
  });

  it("prunes conversation context to prevent noisy subagent trace pollution", () => {
    const supervisor = new OneShotStageSupervisor("researcher");
    supervisor.approveGate("research_review");
    supervisor.handoffTo("planner", "call-h1");
    supervisor.handoffTo("refactor", "call-h2");

    const pruned = supervisor.getPrunedContext();
    assert.strictEqual(pruned.currentStage, "refactor");
    assert.strictEqual(pruned.handoffPairs.length, 2);
    // Handoff pairs contain only the transfer pair, not raw subagent intermediate thoughts
    assert.strictEqual(pruned.handoffPairs[0].toolMessage.stageConfirmed, "planner");
    assert.strictEqual(pruned.handoffPairs[1].toolMessage.stageConfirmed, "refactor");
  });
});
