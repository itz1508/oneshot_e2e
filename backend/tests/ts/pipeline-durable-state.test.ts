import test from "node:test";
import assert from "node:assert/strict";
import type { Redis } from "ioredis";
import { advance, refine, terminal } from "../../pipeline/stage-outcome.js";
import type { PipelineIssue } from "../../pipeline/stage-outcome.js";
import {
  PipelineCheckpoints,
  type StageIdentity,
} from "../../pipeline/checkpoints.js";
import { runStage } from "../../pipeline/run-stage.js";
import { applyTransition, type TransitionServices } from "../../pipeline/apply-transition.js";
import { reconcileStage } from "../../pipeline/reconcile.js";
import {
  MAX_REFINEMENT_ITERATIONS,
  resolveTransition,
  resolveTripleValidationTransition,
} from "../../workflow/canonical-transition.js";
import { PipelineIdempotency } from "../../pipeline/idempotency.js";
import { PipelineFaultController } from "../../pipeline/fault-controller.js";
import { stageIteration } from "../../pipeline/stage-scope.js";

/**
 * Minimal in-memory Redis double.
 *
 * Implements exactly the surface the pipeline uses: GET / SET (EX, NX) /
 * DEL / EXISTS plus EVAL for the two Lua scripts the pipeline ships:
 *
 *  - the atomic execution checkpoint (sequential SET ... EX calls), and
 *  - the ownership-checked lock release (GET + token compare + DEL).
 */
interface Entry {
  value: string;
  expiresAt?: number;
}

class InMemoryRedis {
  private store = new Map<string, Entry>();

  enqueued: Array<{
    name: string;
    data: unknown;
    options: unknown;
  }> = [];

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (
      entry.expiresAt !== undefined &&
      entry.expiresAt <= Date.now()
    ) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(
    key: string,
    value: string,
    ...args: Array<string | number>
  ): Promise<unknown> {
    let expiresAt: number | undefined;
    let nx = false;

    for (let i = 0; i < args.length; i += 1) {
      const option = String(args[i]).toUpperCase();
      if (option === "EX") {
        expiresAt = Date.now() + Number(args[i + 1]) * 1000;
        i += 1;
      } else if (option === "NX") {
        nx = true;
      }
    }

    if (nx && this.store.has(key)) {
      return null;
    }

    this.store.set(key, { value, expiresAt });
    return "OK";
  }

  async exists(key: string): Promise<number> {
    return (await this.get(key)) !== null ? 1 : 0;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  /** Test-only visibility into raw key existence. */
  has(key: string): boolean {
    return this.store.has(key);
  }

  async eval(
    script: string,
    numberOfKeys: number,
    ...args: string[]
  ): Promise<unknown> {
    const keys = args.slice(0, numberOfKeys);
    const argv = args.slice(numberOfKeys);

    if (script.includes('ARGV[3]') && argv[2] !== "") {
      if (await this.get(keys[2]) !== argv[2]) return 0;
    }

    if (script.includes('"EXPIRE"')) {
      const current = await this.get(keys[0]);
      if (current !== argv[0]) return 0;
      await this.set(keys[0], current, "EX", argv[1]);
      return 1;
    }

    // Ownership-checked release: GET + token compare + DEL.
    if (script.includes('"GET"') && script.includes('"DEL"')) {
      const current = await this.get(keys[0]);
      if (current !== null && current === argv[0]) {
        this.store.delete(keys[0]);
        return 1;
      }
      return 0;
    }

    // Atomic execution checkpoint: sequential redis.call("SET", ...) statements.
    let result: unknown = null;
    const callRegex =
      /redis\.call\(\s*"([A-Z]+)"\s*,\s*([^)]*?)\s*\)/g;

    for (const match of script.matchAll(callRegex)) {
      const command = match[1];
      const callArgs = match[2]
        .split(",")
        .map((token) => token.trim())
        .map((token) => {
          const key = token.match(/^KEYS\[(\d+)\]$/);
          if (key) return keys[Number(key[1]) - 1] ?? "";
          const arg = token.match(/^ARGV\[(\d+)\]$/);
          if (arg) return argv[Number(arg[1]) - 1] ?? "";
          return token.replace(/^"|"$/g, "");
        });

      if (command === "SET") {
        const [key, value, ...options] = callArgs;
        result = await this.set(key, value, ...options);
      } else if (command === "GET") {
        result = await this.get(callArgs[0]);
      } else if (command === "DEL") {
        result = await this.del(callArgs[0]);
      }
    }

    const returnMatch = script.match(/return\s+(\d+)\s*$/);
    return returnMatch ? Number(returnMatch[1]) : result;
  }
}

function makeCheckpoints(redis: InMemoryRedis): PipelineCheckpoints {
  return new PipelineCheckpoints(redis as never);
}

const noopHistory = {
  append: async () => "",
};

function strictServices(
  redis: InMemoryRedis,
  checkpoints: PipelineCheckpoints,
): TransitionServices {
  return {
    queue: {
      add: async (name, data, options) => {
        redis.enqueued.push({ name, data, options });
        return name;
      },
    },
    checkpoints,
    waitForHuman: async () => {
      throw new Error(
        "waitForHuman must not be called in this scenario",
      );
    },
    finish: async () => {
      throw new Error(
        "finish must not be called in this scenario",
      );
    },
  };
}

test("stage execution is persisted atomically and the transition commits exactly once", async () => {
  const redis = new InMemoryRedis();
  const checkpoints = makeCheckpoints(redis);
  const identity: StageIdentity = {
    runId: "run-commit",
    stage: "evaluation",
    iteration: 0,
  };

  let evaluationRuns = 0;

  const result = await runStage({
    identity,
    checkpoints,
    history: noopHistory,
    execute: async () => {
      evaluationRuns += 1;
      return advance({ result: "Passed" });
    },
  });

  assert.equal(result.skipped, false);
  assert.equal(evaluationRuns, 1);

  // Outcome + executed marker were written together.
  assert.equal(await checkpoints.isExecuted(identity), true);
  assert.deepEqual(
    await checkpoints.loadOutcome(identity),
    result.outcome,
  );

  const services = strictServices(redis, checkpoints);
  const transition = resolveTransition(
    "evaluation",
    result.outcome,
    identity.iteration,
  );

  await applyTransition(identity, transition, services);

  // triple-validation queued with deterministic v2 identity.
  assert.equal(redis.enqueued.length, 1);
  assert.equal(redis.enqueued[0].name, "triple-validation");
  assert.deepEqual(redis.enqueued[0].data, {
    version: 2,
    runId: "run-commit",
    stage: "triple-validation",
    iteration: 0,
  });
  assert.equal(
    await checkpoints.getTransitionState(identity),
    "committed",
  );

  // Replaying the same transition must not enqueue again.
  await applyTransition(identity, transition, services);
  assert.equal(redis.enqueued.length, 1);
});

test("crash after execution checkpoint recovers without rerunning the agent", async () => {
  const redis = new InMemoryRedis();
  const checkpoints = makeCheckpoints(redis);
  const identity: StageIdentity = {
    runId: "run-recover",
    stage: "evaluation",
    iteration: 0,
  };

  let evaluationRuns = 0;

  const execute = async () => {
    evaluationRuns += 1;
    return advance({ result: "Passed" });
  };

  // First attempt: outcome persisted, then the process "dies" after the
  // transition was marked pending but BEFORE anything was enqueued.
  const first = await runStage({
    identity,
    checkpoints,
    history: noopHistory,
    execute,
  });

  assert.equal(first.skipped, false);
  assert.equal(evaluationRuns, 1);
  await checkpoints.markTransitionPending(identity);

  // Recovery delivery: the retry job finds executed=true, loads the persisted
  // outcome, and skips the agent entirely.
  const retry = await runStage({
    identity,
    checkpoints,
    history: noopHistory,
    execute,
  });

  assert.equal(retry.skipped, true);
  assert.equal(evaluationRuns, 1); // MUST STAY ONE
  assert.deepEqual(retry.outcome, first.outcome);

  // Reconciliation finishes the unfinished transition.
  const enqueued: Array<{ name: string }> = [];
  const services: TransitionServices = {
    queue: {
      add: async (name, data) => {
        enqueued.push({ name });
        assert.deepEqual(data, {
          version: 2,
          runId: "run-recover",
          stage: "triple-validation",
          iteration: 0,
        });
        return name;
      },
    },
    checkpoints,
    waitForHuman: async () => {},
    finish: async () => {},
  };

  const reconciliation = await reconcileStage(
    {
      runId: identity.runId,
      stage: identity.stage,
      iteration: identity.iteration,
    },
    checkpoints,
    services,
  );

  assert.equal(reconciliation.recovered, true);
  assert.equal(evaluationRuns, 1); // still exactly one agent execution
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].name, "triple-validation");
  assert.equal(
    await checkpoints.getTransitionState(identity),
    "committed",
  );
});

const validationIssue: PipelineIssue = {
  issue_type: "Missing",
  evidence: {
    issue: "Schema validation failed",
    expected: "Plan satisfies the researcher schema",
    actual: "Schema validation reported failures",
    evidence_ids: [],
    required_correction: "Refine the plan and rerun validation",
    recheck_target: "run-routing",
  },
};

test("validation refine transitions to gap-analysis at the next iteration", () => {
  const outcome = refine(
    { all_valid: false },
    validationIssue,
    "schema validation failed",
  );

  // Run-level stages stay pinned to iteration 0; iterative stages advance.
  assert.equal(stageIteration("researcher", 5), 0);
  assert.equal(stageIteration("planner", 5), 0);
  assert.equal(stageIteration("evaluation", 5), 5);
  assert.equal(stageIteration("triple-validation", 5), 5);

  assert.deepEqual(resolveTripleValidationTransition(outcome, 0), {
    type: "next",
    stage: "gap-analysis",
    iteration: 1,
  });

  assert.deepEqual(resolveTripleValidationTransition(outcome, 1), {
    type: "next",
    stage: "gap-analysis",
    iteration: 2,
  });

  // And through the generic resolver used by the worker/reconciler:
  assert.deepEqual(
    resolveTransition("triple-validation", outcome, 2),
    { type: "next", stage: "gap-analysis", iteration: 3 },
  );
});

test("max refinement iterations route to finalize with a failed finalization intent", () => {
  const outcome = refine(
    { all_valid: false },
    validationIssue,
    "still failing",
  );

  const expected = {
    type: "next",
    stage: "finalize",
    iteration: 0,
    finalization: { test_result: "Failed", issue: validationIssue },
  };

  assert.deepEqual(
    resolveTripleValidationTransition(outcome, MAX_REFINEMENT_ITERATIONS),
    expected,
  );

  // And through the generic resolver used by the worker/reconciler:
  assert.deepEqual(
    resolveTransition(
      "triple-validation",
      outcome,
      MAX_REFINEMENT_ITERATIONS,
    ),
    expected,
  );

  // One iteration below the cap still loops instead of finalizing.
  assert.equal(
    resolveTripleValidationTransition(
      outcome,
      MAX_REFINEMENT_ITERATIONS - 1,
    ).type,
    "next",
  );
});

test("stop routing and finalize transitions keep workflow Done with an issue", () => {
  // A stage reporting "stop" routes to finalize with the failed intent;
  // the workflow itself stays Done.
  const hashIssue: PipelineIssue = {
    issue_type: "Root Cause",
    evidence: {
      issue: "Hash proof reported a canonical mismatch",
      expected: "created_hash equals recomputed_hash",
      actual: "Hash mismatch",
      evidence_ids: [],
      required_correction: "Investigate serialization drift",
      recheck_target: "run-stop",
    },
  };
  const stopped = terminal({ equal: false }, hashIssue);

  assert.deepEqual(resolveTransition("hash", stopped, 0), {
    type: "next",
    stage: "finalize",
    iteration: 0,
    finalization: {
      test_result: "Failed",
      issue: hashIssue,
    },
  });

  // The finalize stage replays the checkpointed intent and terminalizes:
  // Done with the issue, never "workflow failed".
  assert.deepEqual(resolveTransition("finalize", stopped, 0), {
    type: "done",
    test_result: "Failed",
    issue: hashIssue,
  });

  // A healthy finalize is Done + Passed with no issue.
  assert.deepEqual(resolveTransition("finalize", advance(undefined), 0), {
    type: "done",
    test_result: "Passed",
  });
});

test("lock release only removes the lock when the token still owns it", async () => {
  const redis = new InMemoryRedis();
  const idempotency = new PipelineIdempotency(
    redis as unknown as Redis,
  );

  const token = await idempotency.acquire("run-lock", "refactor");
  assert.ok(token, "acquire must return a lock token");

  // A foreign token must NOT delete the lock.
  const foreignRelease = await idempotency.release(
    "run-lock",
    "refactor",
    "not-the-owner",
  );
  assert.equal(foreignRelease, false);
  assert.equal(
    await idempotency.acquire("run-lock", "refactor"),
    null,
    "lock must still be held after a foreign release attempt",
  );

  // The owning token releases the lock.
  const ownerRelease = await idempotency.release(
    "run-lock",
    "refactor",
    token as string,
  );
  assert.equal(ownerRelease, true);

  const reacquired = await idempotency.acquire("run-lock", "refactor");
  assert.ok(reacquired, "lock can be re-acquired after owner release");
});

test("fault controller: refine-once fires once, minIteration guards, crash markers are per-iteration", async () => {
  const saved = {
    enabled: process.env.PIPELINE_FAULTS_ENABLED,
    multi: process.env.PIPELINE_FAULTS,
    stage: process.env.PIPELINE_FAULT_STAGE,
    mode: process.env.PIPELINE_FAULT_MODE,
  };

  process.env.PIPELINE_FAULTS_ENABLED = "true";
  process.env.PIPELINE_FAULTS = JSON.stringify([
    { stage: "triple-validation", mode: "refine-once" },
    { stage: "evaluation", mode: "crash-after-checkpoint", minIteration: 1 },
  ]);
  delete process.env.PIPELINE_FAULT_STAGE;
  delete process.env.PIPELINE_FAULT_MODE;

  try {
    const redis = new InMemoryRedis();
    const faults = new PipelineFaultController(redis as unknown as Redis);

    // refine-once at triple-validation iteration 0: first call true, once.
    assert.equal(
      await faults.shouldInjectRefine("run-fault", "triple-validation", 0),
      true,
      "refine-once must fire on the first execution",
    );
    assert.equal(
      await faults.shouldInjectRefine("run-fault", "triple-validation", 0),
      false,
      "refine-once must not fire twice",
    );
    // Different stage: unaffected.
    assert.equal(
      await faults.shouldInjectRefine("run-fault", "evaluation", 0),
      false,
    );

    // crash-after-checkpoint is guarded by minIteration = 1.
    await faults.applyAfterCheckpoint("run-fault", "evaluation", 0);
    assert.equal(
      redis.has(
        "oneshot:fault:run-fault:evaluation:crash-after-checkpoint:i0:consumed",
      ),
      false,
      "minIteration=1 must suppress the crash at iteration 0",
    );
    assert.equal(
      redis.has(
        "oneshot:fault:run-fault:evaluation:crash-after-checkpoint:i1:consumed",
      ),
      false,
    );

    // Iteration 1: the hook records the crash and never resolves (the real
    // worker exits 92 here); race it so the test can assert the marker.
    let crashExitCode: number | undefined;
    await Promise.race([
      faults.applyAfterCheckpoint("run-fault", "evaluation", 1, {
        exit: ((code: number) => {
          crashExitCode = code;
          return undefined as never;
        }) as never,
      }),
      new Promise((resolve) => setTimeout(resolve, 200)),
    ]);
    assert.equal(
      redis.has(
        "oneshot:fault:run-fault:evaluation:crash-after-checkpoint:i1:consumed",
      ),
      true,
      "crash marker must be recorded for iteration 1",
    );
    assert.equal(crashExitCode, 92, "crash-after-checkpoint must exit 92");
  } finally {
    if (saved.enabled === undefined) delete process.env.PIPELINE_FAULTS_ENABLED;
    else process.env.PIPELINE_FAULTS_ENABLED = saved.enabled;
    if (saved.multi === undefined) delete process.env.PIPELINE_FAULTS;
    else process.env.PIPELINE_FAULTS = saved.multi;
    if (saved.stage === undefined) delete process.env.PIPELINE_FAULT_STAGE;
    else process.env.PIPELINE_FAULT_STAGE = saved.stage;
    if (saved.mode === undefined) delete process.env.PIPELINE_FAULT_MODE;
    else process.env.PIPELINE_FAULT_MODE = saved.mode;
  }
});

test("lease renewal is token-owned and lock loss prevents checkpoint commit", async () => {
  const redis = new InMemoryRedis();
  const lock = new PipelineIdempotency(redis as unknown as Redis);
  const token = await lock.acquire("lease-run", "evaluation:0");
  assert.ok(token);
  assert.equal(await lock.renew("lease-run", "evaluation:0", token), true);
  assert.equal(await lock.renew("lease-run", "evaluation:0", "stale-token"), false);

  const checkpoints = makeCheckpoints(redis);
  const identity: StageIdentity = { runId: "lease-run", stage: "evaluation", iteration: 0 };
  await redis.del(lock.lockKey("lease-run", "evaluation:0"));
  await assert.rejects(
    checkpoints.saveExecution(identity, advance({ ok: true }), {
      key: lock.lockKey("lease-run", "evaluation:0"),
      token,
    }),
    /Lease ownership lost/,
  );
  assert.equal(await checkpoints.isExecuted(identity), false);
});
