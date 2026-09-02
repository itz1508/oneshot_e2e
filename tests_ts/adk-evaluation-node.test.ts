import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRunner, node, type NodeContext, Workflow } from "@google/adk";
import type { Audit, Evaluation, GapAnalysis, Plan, ResearchBundle } from "../backend/contract/types.js";
import { createEvaluationNode } from "../backend/workflow/adk/node/evaluation-node.js";
import { createGapAnalysisNode } from "../backend/workflow/adk/node/gap-analysis-node.js";
import { createPlannerNode } from "../backend/workflow/adk/node/planner-node.js";
import { createRefactorNode } from "../backend/workflow/adk/node/refactor-node.js";
import { createResearcherNode } from "../backend/workflow/adk/node/researcher-node.js";
import { harness, prompt } from "./harness.js";

interface ProbeOutput {
  plan: Plan;
  gap: GapAnalysis;
  evaluation: Evaluation;
}

test("ADK passes gap_0 Plan directly into existing Evaluation Role", async () => {
  const h = await harness("adk-evaluation-node");
  const jobId = "job-evaluation-001";
  const researcherNode = createResearcherNode(h.researcher);
  const plannerNode = createPlannerNode(h.planner);
  const refactorNode = createRefactorNode(h.refactor);
  const gapNode = createGapAnalysisNode(h.gapper);
  const evaluationNode = createEvaluationNode(h.evaluator);

  const probe = node(
    async (ctx: NodeContext): Promise<ProbeOutput> => {
      const research = (await ctx.runNode(
        researcherNode,
        { job_id: jobId, prompt: prompt(jobId) },
        { runId: `${jobId}-researcher` },
      )).output as ResearchBundle;

      const audit = (await ctx.runNode(
        plannerNode,
        { job_id: jobId, research },
        { runId: `${jobId}-planner` },
      )).output as Audit;

      const refactored = (await ctx.runNode(
        refactorNode,
        { job_id: jobId, research, audit },
        { runId: `${jobId}-refactor` },
      )).output as Plan;

      refactored.steps[0].schema_refs = [];
      const gapOutput = (await ctx.runNode(
        gapNode,
        { job_id: jobId, research, plan: refactored },
        { runId: `${jobId}-gap` },
      )).output as { plan: Plan; gap: GapAnalysis };

      assert.equal(gapOutput.gap.gap_0, true);
      const evaluation = (await ctx.runNode(
        evaluationNode,
        { job_id: jobId, research, plan: gapOutput.plan },
        { runId: `${jobId}-evaluation` },
      )).output as Evaluation;

      return { plan: gapOutput.plan, gap: gapOutput.gap, evaluation };
    },
    { name: "gap_evaluation_probe", rerunOnResume: true },
  );

  const rootAgent = new Workflow({ name: "gap_evaluation_connector_test", edges: [["START", probe]] });
  const runner = new InMemoryRunner({ agent: rootAgent, appName: "gap_evaluation_connector_test" });
  const session = await runner.sessionService.createSession({
    appName: "gap_evaluation_connector_test",
    userId: jobId,
    sessionId: jobId,
  });

  let output: ProbeOutput | undefined;
  try {
    for await (const event of runner.runAsync({
      userId: jobId,
      sessionId: session.id,
      newMessage: { role: "user", parts: [{ text: "Run through Evaluation" }] },
    })) {
      if ("output" in event && event.output !== undefined) output = event.output as ProbeOutput;
    }
    assert.ok(output, "ADK workflow produced no Evaluation output");
    assert.equal(output.evaluation.plan_id, output.plan.plan_id);
    assert.equal(output.evaluation.result, "PASSED");
    assert.ok(output.evaluation.evidence.length > 0);
    console.log("EVALUATION_OUTPUT_JSON=" + JSON.stringify(output.evaluation));
  } finally {
    h.close();
  }
});
