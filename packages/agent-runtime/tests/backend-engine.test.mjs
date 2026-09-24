import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  OneShotWorkflowEngine,
  TavilySearchBackend,
  TodoChainManager,
  SessionLedger,
  CompositeBackend,
  FilesystemBackend,
  StateBackend,
  session,
  job,
  analysis,
  plan,
  fixture,
  goal,
  schema,
  validation,
  task,
  artifact,
  build,
} from "../src/index.ts";

describe("OneShot Canonical Workflow Engine (Backend)", () => {
  it("initializes at the research stage with pending gates", () => {
    const engine = new OneShotWorkflowEngine();
    assert.strictEqual(engine.getCurrentStage(), "research");
    assert.strictEqual(engine.getGate1().status, "PENDING_APPROVAL");
    assert.strictEqual(engine.getGate2().status, "PENDING_APPROVAL");
  });

  it("blocks transition to planning stage until Gate 1 is confirmed", () => {
    const engine = new OneShotWorkflowEngine();
    const result = engine.transitionTo("planning");
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("Gate 1 (Research Review) invariant violation"));
    assert.strictEqual(engine.getCurrentStage(), "research");
  });

  it("allows transition to planning once Gate 1 is confirmed by human", () => {
    const engine = new OneShotWorkflowEngine();
    const confirmedGate = engine.confirmGate1("developer_test");
    assert.strictEqual(confirmedGate.status, "CONFIRMED");
    assert.strictEqual(confirmedGate.confirmedBy, "developer_test");

    const result = engine.transitionTo("planning");
    assert.strictEqual(result.success, true);
    assert.strictEqual(engine.getCurrentStage(), "planning");
  });

  it("blocks transition to builder until Gate 2 is confirmed with a verified package hash", () => {
    const engine = new OneShotWorkflowEngine();
    engine.confirmGate1();
    engine.transitionTo("planning");
    engine.transitionTo("gap_analysis");
    engine.transitionTo("evaluation");

    // Try transitioning to builder without Gate 2
    const blocked = engine.transitionTo("builder");
    assert.strictEqual(blocked.success, false);
    assert.ok(blocked.error?.includes("Gate 2 (Build Ready) invariant violation"));

    // Confirm Gate 2 with package core
    const packageCore = { name: "oneshot-core", version: "1.0.0", files: ["index.ts"] };
    const confirmedGate2 = engine.confirmGate2(packageCore, "lead_reviewer");
    assert.strictEqual(confirmedGate2.status, "CONFIRMED");
    assert.ok(confirmedGate2.packageHash?.startsWith("sha256:"));

    // Now transition succeeds
    const allowed = engine.transitionTo("builder");
    assert.strictEqual(allowed.success, true);
    assert.strictEqual(engine.getCurrentStage(), "builder");
  });

  it("verifies Gate 2 computes deterministic canonical SHA-256 hash regardless of key ordering", () => {
    const engine1 = new OneShotWorkflowEngine();
    const engine2 = new OneShotWorkflowEngine();

    const payloadA = { version: "1.0.0", name: "oneshot-core", alpha: true };
    const payloadB = { alpha: true, name: "oneshot-core", version: "1.0.0" };

    const gateA = engine1.confirmGate2(payloadA);
    const gateB = engine2.confirmGate2(payloadB);

    assert.strictEqual(gateA.packageHash, gateB.packageHash);
    assert.ok(gateA.packageHash?.startsWith("sha256:"));
  });

  it("ensures StageTodos and Steps conform to NodeInvocation structure", () => {
    const engine = new OneShotWorkflowEngine();
    const stage = engine.getStageInfo("research");
    assert.ok(stage);
    assert.ok(stage.todos.length > 0);

    for (const todo of stage.todos) {
      assert.ok(todo.id);
      assert.ok(todo.text);
      assert.ok(["wait", "active", "done", "fail"].includes(todo.state));
      // Conforms to NodeInvocation interface
      assert.strictEqual(typeof todo.id, "string");
    }
  });
});

describe("OneShot Tavily Research Engine (Backend)", () => {
  it("executes search query and returns structured results with scores", async () => {
    const research = new TavilySearchBackend();
    const response = await research.search(
      "OneShot architecture invariants",
      { depth: "advanced", maxResults: 3, deterministicFixture: true }
    );

    assert.strictEqual(response.query, "OneShot architecture invariants");
    assert.strictEqual(response.depth, "advanced");
    assert.ok(response.results.length > 0);
    assert.ok(response.results[0].title);
    assert.ok(response.results[0].url.startsWith("http"));
    assert.ok(response.results[0].score >= 0.8);
  });

  it("formats citations markdown correctly", async () => {
    const research = new TavilySearchBackend();
    const response = await research.search("TypeScript ESM contracts", { deterministicFixture: true });
    const markdown = research.formatCitationsMarkdown(response);
    assert.ok(markdown.includes("[1]"));
    assert.ok(markdown.includes("http"));
  });

  it("rejects live research when Tavily is not configured", async () => {
    const research = new TavilySearchBackend();
    await assert.rejects(
      () => research.search("No provider should be silently substituted"),
      /Research search is unavailable/
    );
  });

  it("validates empty query input with descriptive error", async () => {
    const research = new TavilySearchBackend();
    await assert.rejects(async () => {
      await research.search("   ");
    }, /Research query cannot be empty/);
  });
});

describe("OneShot Hierarchical Todo & Subtask Engine (Backend)", () => {
  it("initializes default skills and subtasks", () => {
    const manager = new TodoChainManager();
    const snapshot = manager.getSnapshot();
    assert.ok(snapshot.skills.length >= 3);
    assert.ok(snapshot.totalCount >= 5);
  });

  it("updates subtask states and recalculates parent skill state", () => {
    const manager = new TodoChainManager();
    // Complete all subtasks in skill-plan
    manager.updateSubtaskState("skill-plan", "t4", "done");
    manager.updateSubtaskState("skill-plan", "t5", "done");

    const snapshot = manager.getSnapshot();
    const planSkill = snapshot.skills.find((s) => s.id === "skill-plan");
    assert.strictEqual(planSkill?.state, "done");
  });

  it("filters active-only snapshot suppressing pending noise", () => {
    const manager = new TodoChainManager();
    const activeView = manager.getActiveOnlySnapshot();
    assert.ok(activeView.activeSkill);
    assert.strictEqual(activeView.activeSkill?.id, "skill-plan");
    assert.strictEqual(activeView.activeSubtask?.id, "t4");
  });

  it("triggers subscriber callbacks on task state change", () => {
    const manager = new TodoChainManager();
    let notified = false;
    const unsubscribe = manager.subscribe(() => {
      notified = true;
    });

    manager.updateSubtaskState("skill-research", "t1", "active");
    assert.strictEqual(notified, true);
    unsubscribe();
  });
});

describe("OneShot Session Ledger (Backend)", () => {
  it("manages session checkpoints and rewinds state", () => {
    const ledger = new SessionLedger("session-primary-01");
    const initCp = ledger.getCheckpoint("RES-7702-INIT");
    assert.ok(initCp);
    assert.strictEqual(initCp?.restoreId, "RES-7702-INIT");

    const restoreResult = ledger.restoreToCheckpoint("RES-7702-INIT");
    assert.strictEqual(restoreResult.success, true);
    assert.strictEqual(restoreResult.checkpoint?.restoreId, "RES-7702-INIT");
  });

  it("forks conversation branch while maintaining audit log", () => {
    const ledger = new SessionLedger("session-root");
    const forkResult = ledger.forkBranch("msg-tokyo-001");

    assert.strictEqual(forkResult.forked, true);
    assert.strictEqual(forkResult.parentSessionId, "session-root");
    assert.strictEqual(forkResult.originMessageId, "msg-001".replace("001", "tokyo-001"));
    assert.ok(forkResult.newSessionId.startsWith("session-fork-"));

    const logs = ledger.getAuditHookLogs();
    assert.ok(logs.some((l) => l.data.action === "session_forked"));
  });
});

describe("DeepAgents Pluggable Sandboxed Backends (Backend)", () => {
  it("enforces path traversal containment in FilesystemBackend", () => {
    const backend = new FilesystemBackend({
      rootDir: process.cwd(),
      virtualMode: true,
    });

    assert.throws(() => {
      backend.resolveSafePath("../../../etc/passwd");
    }, /escapes allowed root directory/);
  });

  it("routes prefix partitions cleanly in CompositeBackend", async () => {
    const workspace = new StateBackend();
    const scratch = new StateBackend();
    const composite = new CompositeBackend({
      default: workspace,
      routes: {
        "/scratch/": scratch,
      },
    });

    await composite.write("/scratch/temp.txt", "ephemeral buffer");
    await composite.write("/workspace/code.ts", "const x = 1;");

    const scratchRes = await scratch.read("/temp.txt");
    assert.strictEqual(scratchRes.content, "ephemeral buffer");

    const wsRes = await workspace.read("/workspace/code.ts");
    assert.strictEqual(wsRes.content, "const x = 1;");
  });
});

describe("OneShot Runtime Artifact Rule (...) and Persistence Artifact Rule (_id)", () => {
  it("enforces Runtime Artifact Rule: mutable, in progress, evolves, refines, emits events, fails validation", () => {
    // 1. session(...) ↔ session_id
    const s = session("session-001", { userId: "user-alpha" });
    assert.strictEqual(s.id, "session-001");
    assert.strictEqual(s.isMutable, true);
    assert.strictEqual(s.isInProgress, true);
    s.evolve({ status: "running", messagesCount: 3 });
    assert.strictEqual(s.state.status, "running");
    assert.strictEqual(s.state.messagesCount, 3);
    s.refine((curr) => ({ ...curr, messagesCount: curr.messagesCount + 1 }));
    assert.strictEqual(s.state.messagesCount, 4);

    let eventEmitted = false;
    s.onEvent((evt) => {
      if (evt.type === "session:turn_completed") eventEmitted = true;
    });
    s.emit("turn_completed", { turn: 4 });
    assert.strictEqual(eventEmitted, true);

    const sRecord = s.toStoredRecord();
    assert.strictEqual(sRecord.id, "session-001");
    assert.strictEqual(sRecord.isImmutable, true);
    assert.strictEqual(s.isInProgress, false);

    // 2. job(...) ↔ job_id
    const j = job("job-101", { session_id: "session-001" });
    assert.strictEqual(j.id, "job-101");
    j.evolve({ progress: 50, stage: "code_generation" });
    assert.strictEqual(j.state.progress, 50);

    // 3. analysis(...) ↔ analysis_id
    const a = analysis("analysis-201", { session_id: "session-001" });
    assert.strictEqual(a.id, "analysis-201");
    a.evolve({ findings: ["F1", "F2"], score: 95 });
    assert.strictEqual(a.state.findings.length, 2);

    // 4. plan(...) ↔ plan_id
    const p = plan("plan-301", { session_id: "session-001" });
    assert.strictEqual(p.id, "plan-301");
    p.evolve({ steps: ["Step 1", "Step 2"], coreHash: "sha256:abc1234" });
    assert.strictEqual(p.state.steps.length, 2);

    // 5. fixture(...) ↔ fixture_id (Rebuilt Fixture Behavior)
    const f = fixture("fixture-401", "session-001", {
      path: "app/fixtures/data.json",
      expectedHash: "sha256:valid_hash",
      actualHash: "sha256:valid_hash",
    });
    assert.strictEqual(f.id, "fixture-401");
    assert.strictEqual(f.isMutable, true);
    f.evolve({ status: "in_progress" });
    assert.strictEqual(f.state.status, "in_progress");

    // Fail validation case
    f.evolve({ actualHash: "sha256:corrupted_hash" });
    const fValidation = f.validate();
    assert.strictEqual(fValidation.ok, false);
    assert.ok(fValidation.failures.some((err) => err.rule === "HASH_MISMATCH"));

    // Fix and freeze to persistence artifact
    f.evolve({ actualHash: "sha256:valid_hash" });
    assert.strictEqual(f.validate().ok, true);
    const fRecord = f.toStoredRecord();
    assert.strictEqual(fRecord.id, "fixture-401");
    assert.strictEqual(fRecord.isImmutable, true);

    // 6. goal(...) ↔ goal_id
    const g = goal("goal-501", { description: "100% test coverage" });
    assert.strictEqual(g.id, "goal-501");
    g.evolve({ status: "satisfied" });
    assert.strictEqual(g.state.status, "satisfied");

    // 7. schema(...) ↔ schema_id
    const sc = schema("schema-601", { title: "UserContract" });
    assert.strictEqual(sc.id, "schema-601");
    sc.evolve({ status: "active" });
    assert.strictEqual(sc.state.status, "active");

    // 8. validation(...) ↔ validation_id
    const v = validation("validation-701", { targetId: "fixture-401" });
    assert.strictEqual(v.id, "validation-701");
    v.evolve({ passed: true, status: "validated" });
    assert.strictEqual(v.state.passed, true);
    assert.strictEqual(v.state.status, "validated");

    // 9. task(...) ↔ task_id
    const t = task("task-801", { title: "Implement Auth" });
    assert.strictEqual(t.id, "task-801");
    t.evolve({ status: "completed" });
    assert.strictEqual(t.state.status, "completed");

    // 10. artifact(...) ↔ artifact_id
    const art = artifact("artifact-901", { name: "release-bundle.tar" });
    assert.strictEqual(art.id, "artifact-901");
    art.evolve({ state: "published" });
    assert.strictEqual(art.state.state, "published");

    // 11. build(...) ↔ build_id
    const b = build("build-001", { commitHash: "5baa28f9" });
    assert.strictEqual(b.id, "build-001");
    b.evolve({ status: "completed", artifactsProduced: ["dist/backend/index.js", "frontend/web/dist"] });
    assert.strictEqual(b.state.artifactsProduced.length, 2);
    const bRecord = b.toStoredRecord();
    assert.strictEqual(bRecord.id, "build-001");
    assert.strictEqual(bRecord.isImmutable, true);
  });
});
