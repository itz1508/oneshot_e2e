import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ProviderManager } from "../../runtime/provider-manager.js";
import { LocalFileSecretStore } from "../../runtime/provider-secret-store.js";
import { ProcessingEventBus } from "../../runtime/event-bus.js";
import { RunRepository } from "../../runtime/run-repository.js";
import { FixtureResearchProvider } from "../../role/researcher/tool/fixture-provider.js";
import { executeRunJob, type RunJobLike } from "../../runtime/queue.js";
import type {
  Prompt,
  RunSnapshot,
} from "../../contracts/schema/types.js";
import type { WorkflowRuntime } from "../../runtime/workflow-runtime.js";
import type { RunQueueDeps } from "../../runtime/queue.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "oneshot-pinfra-"));
}

function makePrompt(runId: string): Prompt {
  return {
    prompt_id: `prompt:${runId}`,
    intent: "Run canonical sample",
    requested_outcome: "Reach DONE",
    context: [{ context_id: `ctx:${runId}`, statement: "E2E" }],
    research_direction: ["contracts"],
  };
}

function makeManager(dir: string): ProviderManager {
  return new ProviderManager({
    projectRoot: process.cwd(),
    runtimePaths: {
      root: dir,
      config: join(dir, "config"),
    } as never,
    secretStore: new LocalFileSecretStore(join(dir, "secrets")),
  });
}

function makeDeps(
  dir: string,
  runtime: WorkflowRuntime,
  resolveProvider: RunQueueDeps["resolveProvider"],
  runs: RunRepository,
  events: ProcessingEventBus,
): RunQueueDeps {
  return {
    runs,
    events,
    projectRoot: dir,
    resolveProvider,
    createRuntime: async () => runtime,
  };
}

const FAKE_SECRET = "sk-test-1234567890abcdef";

/** Wrap a real runtime so we never re-implement canonical wiring in tests. */
function fakeRuntime(runs: RunRepository): WorkflowRuntime {
  return {
    run: async (runId: string, _prompt: Prompt): Promise<RunSnapshot> => {
      runs.finish(runId, "PASSED");
      return runs.require(runId);
    },
  } as unknown as WorkflowRuntime;
}

test("secret store is write-only from the browser's perspective", async () => {
  const dir = tempDir();
  try {
    const store = new LocalFileSecretStore(join(dir, "secrets"));
    await store.set("featherless", {
      providerId: "featherless",
      credentialType: "api_key",
      value: FAKE_SECRET,
      createdAt: new Date().toISOString(),
    });
    assert.equal(await store.has("featherless"), true);
    assert.equal((await store.get("featherless"))?.value, FAKE_SECRET);
    assert.equal(await store.has("adk_gemma2"), false);

    // Credential files live outside the workspace and are never web-served.
    assert.ok(!dir.startsWith(resolve(process.cwd())));

    await store.delete("featherless");
    assert.equal(await store.has("featherless"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("provider manager never discloses credential values in catalog or status", async () => {
  const dir = tempDir();
  try {
    const pm = makeManager(dir);
    await pm.setCredential("featherless", {
      providerId: "featherless",
      credentialType: "api_key",
      value: FAKE_SECRET,
      createdAt: new Date().toISOString(),
    });

    const status = await pm.getProviderStatus("featherless");
    assert.equal(status.configured, true);
    assert.equal(status.credentialSource, "local-secret-store");
    assert.ok(!JSON.stringify(status).includes(FAKE_SECRET));

    const statuses = await pm.listProviderStatus();
    assert.ok(!JSON.stringify(statuses).includes(FAKE_SECRET));
    for (const id of ["sample", "featherless", "gemini", "openai", "anthropic"]) {
      assert.ok(statuses.some((s) => s.id === id), `catalog has ${id}`);
    }

    // Catalog is git-tracked and non-secret.
    const catalogPath = resolve(process.cwd(), "backend/config/providers.json");
    const catalogRaw = readFileSync(catalogPath, "utf8");
    assert.ok(!catalogRaw.includes(FAKE_SECRET));
    assert.ok(catalogRaw.includes("featherless"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runtime config store rejects secret-shaped fields", async () => {
  const dir = tempDir();
  try {
    const pm = makeManager(dir);
    assert.throws(
      () =>
        pm.saveRuntimeConfigPatch({
          providers: {
            featherless: {
              apiKey: FAKE_SECRET,
            } as never,
          },
        }),
      /forbidden/i,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unknown provider id is rejected on save and status", async () => {
  const dir = tempDir();
  try {
    const pm = makeManager(dir);
    assert.throws(
      () => pm.saveRuntimeConfigPatch({ activeProvider: "nonexistent" }),
      /Unknown provider/,
    );
    await assert.rejects(
      () => pm.getProviderStatus("nonexistent"),
      /Unknown provider/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("run worker executes the canonical workflow with per-run provider binding", async () => {
  const dir = tempDir();
  try {
    const events = new ProcessingEventBus();
    const runs = new RunRepository(join(dir, "run-state"));
    const runtime = fakeRuntime(runs);
    const provider = new FixtureResearchProvider();

    let resolvedAt = 0;
    const deps = makeDeps(
      dir,
      runtime,
      async () => {
        resolvedAt++;
        return provider;
      },
      runs,
      events,
    );

    const runId = "test-run-1";
    runs.create(runId);
    const progressCalls: Array<number | object> = [];
    const job: RunJobLike = {
      data: {
        runId,
        prompt: makePrompt(runId),
        providerId: "sample",
        revision: 1,
      },
      updateProgress: async (p) => {
        progressCalls.push(p);
      },
    };

    const result = await executeRunJob(job, deps);
    assert.equal(result.status, "completed");
    assert.equal(resolvedAt, 1);
    assert.equal(runs.require(runId).result, "PASSED");

    // Progress carries only non-secret metadata.
    assert.ok(
      !JSON.stringify(progressCalls).includes(FAKE_SECRET),
      "progress must never contain secrets",
    );
    // Progress now carries canonical events (spec §5: {kind:"processing-event", event}).
    // Order: ProviderBinding/COMPLETE (readiness proven before Researcher) →
    // RunWorker/RUNNING → RunWorker/COMPLETE.
    assert.deepEqual(
      progressCalls.map((p) => (p as { kind: string }).kind),
      ["processing-event", "processing-event", "processing-event"],
    );
    assert.deepEqual(
      progressCalls.map(
        (p) => (p as { event: { state: string } }).event.state,
      ),
      ["COMPLETE", "RUNNING", "COMPLETE"],
    );

    // Bus events include RUNNING and COMPLETE for the RunWorker.
    const busEvents = events.list(runId);
    assert.ok(
      busEvents.some(
        (e) => e.processor === "RunWorker" && e.state === "RUNNING",
      ),
    );
    assert.ok(
      busEvents.some(
        (e) => e.processor === "RunWorker" && e.state === "COMPLETE",
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("run worker never re-executes an already-finalized run", async () => {
  const dir = tempDir();
  try {
    const events = new ProcessingEventBus();
    const runs = new RunRepository(join(dir, "run-state"));
    const runtime = fakeRuntime(runs);
    const provider = new FixtureResearchProvider();

    let resolvedCount = 0;
    const deps = makeDeps(
      dir,
      runtime,
      async () => {
        resolvedCount++;
        return provider;
      },
      runs,
      events,
    );

    const runId = "test-run-2";
    runs.create(runId);
    runs.finish(runId, "PASSED");

    const job: RunJobLike = {
      data: {
        runId,
        prompt: makePrompt(runId),
        providerId: "sample",
        revision: 1,
      },
      updateProgress: async () => {},
    };

    const result = await executeRunJob(job, deps);
    assert.equal(result.status, "completed");
    assert.equal(resolvedCount, 0, "provider must not be re-resolved");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("run worker finalizes infrastructure failures durably as ROOT_CAUSE", async () => {
  const dir = tempDir();
  try {
    const events = new ProcessingEventBus();
    const runs = new RunRepository(join(dir, "run-state"));
    const provider = new FixtureResearchProvider();

    const deps = makeDeps(
      dir,
      // Runtime that throws — simulates a mid-run infrastructure failure.
      {
        run: async () => {
          throw new Error("simulated infra failure");
        },
      } as unknown as WorkflowRuntime,
      async () => provider,
      runs,
      events,
    );

    const runId = "test-run-3";
    runs.create(runId);
    const job: RunJobLike = {
      data: {
        runId,
        prompt: makePrompt(runId),
        providerId: "sample",
        revision: 1,
      },
      updateProgress: async () => {},
    };

    const result = await executeRunJob(job, deps);
    assert.equal(result.status, "failed");

    const snap = runs.require(runId);
    assert.equal(snap.result, "ROOT_CAUSE");
    assert.ok(snap.root_cause);
    assert.match(snap.root_cause!.issue, /simulated infra failure/);

    const complete = events
      .list(runId)
      .find((e) => e.processor === "RunWorker" && e.state === "COMPLETE");
    assert.ok(complete);
    assert.equal(complete.result, "ROOT_CAUSE");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("queue progress and bus events never carry secret material", async () => {
  const dir = tempDir();
  try {
    const events = new ProcessingEventBus();
    const runs = new RunRepository(join(dir, "run-state"));
    const runtime = fakeRuntime(runs);
    const provider = new FixtureResearchProvider();

    const deps = makeDeps(
      dir,
      runtime,
      async () => provider,
      runs,
      events,
    );

    const runId = "test-run-4";
    runs.create(runId);
    const progressCalls: Array<number | object> = [];
    const job: RunJobLike = {
      data: {
        runId,
        prompt: makePrompt(runId),
        providerId: "featherless",
        revision: 7,
      },
      updateProgress: async (p) => {
        progressCalls.push(p);
      },
    };

    // With a credential present in env, confirm it never lands in progress
    // payloads or bus events.
    process.env.FEATHERLESS_API_KEY = FAKE_SECRET;
    try {
      const result = await executeRunJob(job, deps);
      assert.equal(result.status, "completed");
      assert.ok(
        !JSON.stringify(progressCalls).includes(FAKE_SECRET),
        "no secret in progress",
      );
      assert.ok(
        !JSON.stringify(events.list(runId)).includes(FAKE_SECRET),
        "no secret in bus events",
      );
    } finally {
      delete process.env.FEATHERLESS_API_KEY;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
