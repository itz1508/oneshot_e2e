import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { Prompt, ResearchBundle } from "../backend/contract/types.js";
import type { ResearchProvider } from "../backend/role/researcher/provider.js";
import { structuredDraftToResearchBundle } from "../backend/role/researcher/provider/structured-draft.js";
import { HardenedProcessRunner } from "../backend/sandbox/runner/process-runner.js";
import { startHttpServer } from "../backend/server/http-server.js";
import { harness } from "./harness.js";

class DynamicDeliverableProvider implements ResearchProvider {
  constructor(private deliverable: string) {}

  async research(prompt: Prompt, runId: string): Promise<ResearchBundle> {
    return await structuredDraftToResearchBundle({
      projectRoot: resolve("."),
      prompt,
      runId,
      draft: {
        summary: "Dynamic provider draft for canonical output handoff.",
        requirements: [
          "Generate the requested artifact through the canonical workflow.",
          "Expose concrete post-build verification evidence.",
        ],
        dependencies: [],
        plan_steps: [
          {
            description: "Prepare the requested artifact.",
            responsibility: "ProductImplementation",
            requirement_indexes: [0],
          },
          {
            description: "Verify the requested artifact.",
            responsibility: "CanonicalProof",
            requirement_indexes: [1],
          },
        ],
        success_meaning:
          "The provider-generated artifact is executed by Builder and verified by canonical hash proof.",
        success_criteria: [
          {
            statement: "Provider output reaches Builder.",
            measurement: "BuilderOutput step is present and executes successfully.",
            expected_result: "successful BuilderOutput execution",
            requirement_indexes: [0],
          },
          {
            statement: "Post-build proof matches confirmation proof.",
            measurement: "created and recomputed canonical hashes are equal.",
            expected_result: "equal hashes",
            requirement_indexes: [1],
          },
        ],
        deliverable: this.deliverable,
      },
      gathered: [],
      providerSource: "test-provider:dynamic",
      providerProvenance: "backend-e2e-runtime",
      incompleteIssue: "dynamic provider draft incomplete",
      incompleteCorrection: "fix dynamic provider fixture",
    });
  }
}

test("provider deliverable follows canonical workflow through Builder, Hash, and persisted artifact", async () => {
  const nonce = randomUUID();
  const deliverable = JSON.stringify({
    kind: "runtime-generated-output",
    nonce,
    evidence_rule: "observed-values-only",
  });

  const h = await harness(
    `ui-observability-${process.pid}`,
    new DynamicDeliverableProvider(deliverable),
    new HardenedProcessRunner(),
  );
  const server = await startHttpServer(
    h.runtime,
    h.runs,
    h.events,
    resolve("ui"),
    0,
    h.task,
  );

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;

    const started = (await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "Generate a runtime artifact",
        requested_outcome: "Return the provider-generated artifact after canonical verification",
      }),
    }).then((response) => response.json())) as { run_id: string };

    let snapshot: any;
    for (let attempt = 0; attempt < 200; attempt++) {
      snapshot = await fetch(`${base}/api/runs/${started.run_id}`).then((response) =>
        response.json(),
      );
      if (snapshot.result) break;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    }

    assert.equal(snapshot.result, "PASSED");
    assert.equal(snapshot.hash_proof.equal, true);

    const builder = await fetch(
      `${base}/api/runs/${started.run_id}/artifacts/builder-result`,
    ).then((response) => response.json()) as any;
    assert.equal(builder.result, "PASSED");
    assert.equal(builder.final_output, deliverable);
    assert.ok(typeof builder.output_step_id === "string");
    const outputIndex = builder.evidence.exit_codes.length - 1;
    assert.equal(builder.evidence.exit_codes[outputIndex], 0);
    assert.match(builder.evidence.commands[outputIndex], /ONESHOT_BUILDER_OUTPUT_BASE64:/);

    const hashProof = await fetch(
      `${base}/api/runs/${started.run_id}/artifacts/hash-proof`,
    ).then((response) => response.json()) as any;
    assert.equal(hashProof.equal, true);
    assert.equal(hashProof.created_hash, hashProof.recomputed_hash);

    const task = await fetch(`${base}/api/runs/${started.run_id}/task`).then(
      (response) => response.json(),
    ) as any;
    assert.equal(task.checkpoint.last_processor, "Done");

    const processors = h.events
      .list(started.run_id)
      .filter((event) => event.state === "COMPLETE")
      .map((event) => event.processor);
    for (const required of [
      "Researcher",
      "Planner",
      "Refactor",
      "GapAnalysis",
      "Evaluation",
      "SchemaValidation",
      "FixtureValidation",
      "GoalValidation",
      "TripleValidation",
      "Confirmed",
      "CreateHash",
      "Builder",
      "Hash",
      "Done",
    ]) {
      assert.ok(processors.includes(required), `missing COMPLETE event for ${required}`);
    }
  } finally {
    try {
      server.closeAllConnections?.();
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    } catch {}
    h.bridge.close();
  }
});
