import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRunner, node, type NodeContext, Workflow } from "@google/adk";
import type { Audit, GapAnalysis, Plan, ResearchBundle } from "../../contracts/schema/types.js";
import { createGapAnalysisNode } from "../../workflow/adk/node/gap-analysis-node.js";
import { createPlannerNode } from "../../workflow/adk/node/planner-node.js";
import { createRefactorNode } from "../../workflow/adk/node/refactor-node.js";
import { createResearcherNode } from "../../workflow/adk/node/researcher-node.js";
import { harness, prompt } from "./harness.js";

interface ProbeOutput {
  research: ResearchBundle;
  audit: Audit;
  refactored: Plan;
  gapPlan: Plan;
  gap: GapAnalysis;
}

test("ADK runs Refactor then existing Gap Analysis until fresh gap_0", async () => {
  const h = await harness("adk-gap-analysis-node");
  const jobId = "job-gap-001";
  const researcherNode = createResearcherNode(h.researcher);
  const plannerNode = createPlannerNode(h.planner);
  const refactorNode = createRefactorNode(h.refactor);
  const gapNode = createGapAnalysisNode(h.gapper);

  const probe = node(
    async (ctx: NodeContext): Promise<ProbeOutput> => {
      const researchResult = await ctx.runNode(
        researcherNode,
        { job_id: jobId, prompt: prompt(jobId) },
        { runId: `${jobId}-researcher` },
      );
      const research = researchResult.output as ResearchBundle;

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
      const refactored = refactorResult.output as Plan;

      // Leave one real missing traceability edge for Gap Analysis itself.
      refactored.steps[0].schema_refs = [];

      const gapResult = await ctx.runNode(
        gapNode,
        { job_id: jobId, research, plan: refactored },
        { runId: `${jobId}-gap` },
      );
      const out = gapResult.output as { plan: Plan; gap: GapAnalysis };

      return { research, audit, refactored, gapPlan: out.plan, gap: out.gap };
    },
    { name: "refactor_gap_probe", rerunOnResume: true },
  );

  const rootAgent = new Workflow({ name: "refactor_gap_connector_test", edges: [["START", probe]] });
  const runner = new InMemoryRunner({ agent: rootAgent, appName: "refactor_gap_connector_test" });
  const session = await runner.sessionService.createSession({
    appName: "refactor_gap_connector_test",
    userId: jobId,
    sessionId: jobId,
  });

  let output: ProbeOutput | undefined;
  try {
    for await (const event of runner.runAsync({
      userId: jobId,
      sessionId: session.id,
      newMessage: { role: "user", parts: [{ text: "Run through Gap Analysis" }] },
    })) {
      if ("output" in event && event.output !== undefined) output = event.output as ProbeOutput;
    }

    assert.ok(output, "ADK workflow produced no Gap Analysis output");
    assert.equal(output.gap.result, "PASSED");
    assert.equal(output.gap.gap_0, true);
    assert.equal(output.gapPlan.plan_id, output.refactored.plan_id);
    assert.ok(output.gap.resolved_gaps.length >= 1);
    assert.ok(output.gapPlan.steps[0].schema_refs.includes(output.research.schema_artifact.schema_id));
    console.log("GAP_OUTPUT_JSON=" + JSON.stringify(output.gap));
    console.log("GAP_PLAN_JSON=" + JSON.stringify(output.gapPlan));
  } finally {
    h.close();
  }
});
