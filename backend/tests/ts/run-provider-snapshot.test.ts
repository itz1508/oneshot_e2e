import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeRunJob, type RunJobLike } from "../../runtime/queue.js";
import { ProviderManager } from "../../runtime/provider-manager.js";
import { LocalFileSecretStore } from "../../runtime/provider-secret-store.js";
import { RunRepository } from "../../runtime/run-repository.js";
import { ProcessingEventBus } from "../../runtime/event-bus.js";
import { AppendOnlyProcessingEventStore } from "../../task/event/event-store.js";
import type {
  RunQueueDeps,
} from "../../runtime/queue.js";
import type {
  Prompt,
  RunSnapshot,
} from "../../contracts/schema/types.js";
import type { WorkflowRuntime } from "../../runtime/workflow-runtime.js";
import type { ResearchProvider } from "../../role/researcher/provider.js";

async function tempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "oneshot-snapshot-"));
}

function makePrompt(runId: string): Prompt {
  return {
    prompt_id: `prompt:${runId}`,
    intent: "snapshot regression",
    requested_outcome: "provider/model snapshot must stay immutable",
    context: [],
    research_direction: [],
  };
}

function fakeRuntime(runs: RunRepository): WorkflowRuntime {
  return {
    run: async (runId: string, _prompt: Prompt): Promise<RunSnapshot> => {
      runs.finish(runId, "PASSED");
      return runs.require(runId);
    },
  } as unknown as WorkflowRuntime;
}

test("queued run keeps its captured provider/model snapshot (no silent rebind)", async () => {
  const dir = await tempDir();
  const runs = new RunRepository(join(dir, "runs"));
  const events = new ProcessingEventBus(
    new AppendOnlyProcessingEventStore(join(dir, "events")),
  );
  const runId = "snapshot-run-A";
  runs.create(runId);

  // Queue run A: provider = anthropic, model = model-A, configRevision = 10.
  const job: RunJobLike = {
    data: {
      runId,
      prompt: makePrompt(runId),
      version: 1,
      submittedAt: new Date().toISOString(),
      provider: { id: "anthropic", model: "model-A", configRevision: 10 },
    },
    updateProgress: async () => {},
  };

  const resolved: Array<{ providerId: string; modelOverride?: string }> = [];
  const deps: RunQueueDeps = {
    runs,
    events,
    projectRoot: dir,
    resolveProvider: async (providerId, _events, _runId, modelOverride) => {
      resolved.push({ providerId, modelOverride });
      return {
        async ready() {
          return { ready: true, provider: providerId, models: [] };
        },
        async research() {
          throw new Error("not used in this test");
        },
      } as unknown as ResearchProvider;
    },
    createRuntime: async () => fakeRuntime(runs),
  };

  // The administrator switches the active provider to Gemini while run A sits
  // in the queue. The QUEUED snapshot must win.
  const pm = new ProviderManager({
    projectRoot: process.cwd(),
    catalogPath: "backend/config/providers.json",
    runtimePaths: { root: join(dir, "runtime"), config: join(dir, "runtime-config") } as never,
    secretStore: new LocalFileSecretStore(join(dir, "secrets")),
  });
  await pm.activate("gemini");
  await pm.saveRuntimeConfigPatch({
    providers: { gemini: { model: "gemini-model-Z" } },
  });

  const result = await executeRunJob(job, deps);
  assert.equal(result.status, "completed");

  // Run A still resolves EXACTLY the captured snapshot.
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].providerId, "anthropic");
  assert.equal(resolved[0].modelOverride, "model-A");

  // The binding event records the captured selection, not the new active one.
  const binding = events
    .list(runId)
    .find((e) => e.processor === "ProviderBinding" && e.state === "COMPLETE");
  assert.ok(binding);
  assert.match(String(binding.message ?? ""), /anthropic/);
  assert.doesNotMatch(String(binding.message ?? ""), /gemini/);
});

test("ProviderManager pins the captured model via resolveForRun modelOverride", async () => {
  const dir = await tempDir();
  const captured: Array<{ id: string; model: string | undefined }> = [];

  class CapturingManager extends ProviderManager {
    protected override constructProvider(
      providerId: string,
      _projectRoot: string,
      _credentialValue?: string,
      modelOverride?: string,
    ): ResearchProvider {
      captured.push({ id: providerId, model: modelOverride });
      return {
        async ready() {
          return { ready: true, provider: providerId, models: [] };
        },
        async research() {
          throw new Error("not used");
        },
      } as unknown as ResearchProvider;
    }
  }
  const pm = new CapturingManager({
    projectRoot: process.cwd(),
    catalogPath: "backend/config/providers.json",
    runtimePaths: { root: dir, config: join(dir, "config") } as never,
    secretStore: new LocalFileSecretStore(join(dir, "secrets")),
  });

  // Current settings drift to model-B after the run was queued.
  await pm.saveRuntimeConfigPatch({
    providers: { anthropic: { model: "model-B" } },
  });

  // Queued snapshot model-A wins for the pinned run.
  await pm.resolveForRun("anthropic", "model-A");
  assert.deepEqual(captured.at(-1), { id: "anthropic", model: "model-A" });

  // Without an override, no pin is passed (current runtime settings apply to
  // NEW runs only — never to an already-queued snapshot).
  await pm.resolveForRun("anthropic");
  assert.deepEqual(captured.at(-1), { id: "anthropic", model: undefined });
});
