import test from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryRunner,
  node,
  type NodeContext,
  Workflow,
} from "@google/adk";

import type { Audit, Plan, ResearchBundle } from "../../contracts/schema/types.js";
import { clone } from "../../core/clone.js";
import { createPlannerNode } from "../../workflow/adk/node/planner-node.js";
import { createRefactorNode } from "../../workflow/adk/node/refactor-node.js";
import { createResearcherNode } from "../../workflow/adk/node/researcher-node.js";
import { harness, prompt } from "./harness.js";

interface ProbeOutput {
  audit: Audit;
  plan: Plan;
}

test("ADK passes Planner Audit directly into existing Refactor Role", async () => {
  const h = await harness("adk-refactor-node");
  const jobId = "job-refactor-001";
  const researcherNode = createResearcherNode(h.researcher);
  const plannerNode = createPlannerNode(h.planner);
  const refactorNode = createRefactorNode(h.refactor);

  const probe = node(
    async (ctx: NodeContext): Promise<ProbeOutput> => {
      const researchResult = await ctx.runNode(
        researcherNode,
        { job_id: jobId, prompt: prompt(jobId) },
        { runId: `${jobId}-researcher` },
      );
      const research = clone(researchResult.output as ResearchBundle);

      // Give Planner one real, deterministic traceability gap so Refactor must work.
      research.plan.steps[0].goal_refs = [];

      const auditResult = await ctx.runNode(
        plannerNode,
        { job_id: jobId, research },
        { runId: `${jobId}-planner` },
      );
      const audit = auditResult.output as Audit;

      const refactorResult = await ctx.runNode(
        refactorNode,
        { job_id: jobId, research, audit },
        { runId: `${jobId}-refactor` },
      );
      const plan = refactorResult.output as Plan;
      return { audit, plan };
    },
    { name: "planner_refactor_probe", rerunOnResume: true },
  );

  const rootAgent = new Workflow({
    name: "planner_refactor_connector_test",
    edges: [["START", probe]],
  });
  const runner = new InMemoryRunner({
    agent: rootAgent,
    appName: "planner_refactor_connector_test",
  });
  const session = await runner.sessionService.createSession({
    appName: "planner_refactor_connector_test",
    userId: jobId,
    sessionId: jobId,
  });

  let output: ProbeOutput | undefined;
  try {
    for await (const event of runner.runAsync({
      userId: jobId,
      sessionId: session.id,
      newMessage: {
        role: "user",
        parts: [{ text: "Run Planner then Refactor" }],
      },
    })) {
      if ("output" in event && event.output !== undefined) {
        output = event.output as ProbeOutput;
      }
    }

    assert.ok(output, "ADK workflow produced no Planner -> Refactor output");
    assert.ok(output.audit.findings.length > 0, "Planner did not identify the injected gap");
    assert.equal(output.plan.plan_id, output.audit.plan_id);
    assert.ok(output.plan.steps[0].goal_refs.length > 0, "Refactor did not restore goal traceability");
    assert.equal(output.plan.revision, 2);
    assert.ok(output.plan.revision_evidence.length > 0);

    console.log("PLANNER_OUTPUT_JSON=" + JSON.stringify(output.audit));
    console.log("REFACTOR_OUTPUT_JSON=" + JSON.stringify(output.plan));
  } finally {
    h.close();
  }
});
