import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRunner } from "@google/adk";
import type { OneShotDynamicResult } from "../backend/workflow/adk/dynamic-root-agent.js";
import { createOneShotDynamicWorkflow } from "../backend/workflow/adk/dynamic-root-agent.js";
import { harness, prompt } from "./harness.js";

test("full OneShot workflow executes through ADK Workflow + ctx.runNode connectors", async () => {
  const h = await harness("adk-dynamic-workflow");
  const jobId = "job-dynamic-001";
  const rootAgent = createOneShotDynamicWorkflow({
    researcher: h.researcher,
    planner: h.planner,
    refactor: h.refactor,
    gapper: h.gapper,
    evaluator: h.evaluator,
    triple: h.triple,
    confirmation: h.confirmation,
    hash: h.hash,
    builder: h.builder,
  });

  const runner = new InMemoryRunner({ agent: rootAgent, appName: "oneshot_dynamic_workflow_test" });
  const session = await runner.sessionService.createSession({
    appName: "oneshot_dynamic_workflow_test",
    userId: jobId,
    sessionId: jobId,
  });

  let output: OneShotDynamicResult | undefined;
  try {
    for await (const event of runner.runAsync({
      userId: jobId,
      sessionId: session.id,
      newMessage: {
        role: "user",
        parts: [{ text: JSON.stringify({ job_id: jobId, prompt: prompt(jobId) }) }],
      },
    })) {
      if ("output" in event && event.output !== undefined) {
        output = event.output as OneShotDynamicResult;
      }
    }

    assert.ok(output, "ADK dynamic workflow produced no terminal output");
    assert.equal(output.result, "PASSED");
    if (output.result !== "PASSED") return;
    assert.equal(output.research.plan.plan_id, output.plan.plan_id);
    assert.equal(output.gap.gap_0, true);
    assert.equal(output.evaluation.result, "PASSED");
    assert.equal(output.triple.all_valid, true);
    assert.equal(output.confirmed.confirmed, true);
    assert.equal(output.builder.result, "PASSED");
    assert.equal(output.hash_proof.equal, true);
    assert.equal(output.created_hash, output.hash_proof.created_hash);
    console.log("DYNAMIC_WORKFLOW_OUTPUT_JSON=" + JSON.stringify(output));
  } finally {
    h.close();
  }
});
