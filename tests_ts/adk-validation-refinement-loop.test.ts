import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRunner, node, type NodeContext, Workflow } from "@google/adk";
import type { Evaluation, GapAnalysis, Plan, ResearchBundle, TripleValidation } from "../backend/contract/types.js";
import { validationFeedback } from "../backend/role/gap-analysis/tool/validation-feedback.js";
import { createEvaluationNode } from "../backend/workflow/adk/node/evaluation-node.js";
import { createGapAnalysisNode } from "../backend/workflow/adk/node/gap-analysis-node.js";
import { createResearcherNode } from "../backend/workflow/adk/node/researcher-node.js";
import { createTripleValidationNode } from "../backend/workflow/adk/node/triple-validation-node.js";
import { harness, prompt } from "./harness.js";

interface ProbeOutput {
  before: TripleValidation;
  improvedPlan: Plan;
  gap: GapAnalysis;
  evaluation: Evaluation;
  after: TripleValidation;
}

test("NOT_VALID becomes Gap feedback, improves same plan, and all three validators re-prove", async () => {
  const h = await harness("adk-validation-refinement-loop");
  const jobId = "job-refinement-001";
  const researcherNode = createResearcherNode(h.researcher);
  const gapNode = createGapAnalysisNode(h.gapper);
  const evaluationNode = createEvaluationNode(h.evaluator);
  const tripleNode = createTripleValidationNode(h.triple);

  const probe = node(
    async (ctx: NodeContext): Promise<ProbeOutput> => {
      const research = (await ctx.runNode(
        researcherNode,
        { job_id: jobId, prompt: prompt(jobId) },
        { runId: `${jobId}-researcher` },
      )).output as ResearchBundle;

      const initialGap = (await ctx.runNode(
        gapNode,
        { job_id: `${jobId}-initial`, research, plan: research.plan },
        { runId: `${jobId}-gap-initial` },
      )).output as { plan: Plan; gap: GapAnalysis };
      assert.equal(initialGap.gap.gap_0, true);

      const initialEvaluation = (await ctx.runNode(
        evaluationNode,
        { job_id: `${jobId}-initial`, research, plan: initialGap.plan },
        { runId: `${jobId}-evaluation-initial` },
      )).output as Evaluation;
      assert.equal(initialEvaluation.result, "PASSED");

      // Simulate a condition that escaped the preceding gap_0 proof. Triple
      // Validation must treat this as refinement feedback, not terminal failure.
      const missedPlan = structuredClone(initialGap.plan);
      missedPlan.steps[0].goal_refs = [];

      const before = (await ctx.runNode(
        tripleNode,
        { job_id: `${jobId}-before`, research, plan: missedPlan },
        { runId: `${jobId}-triple-before` },
      )).output as TripleValidation;
      assert.equal(before.goal_validation.result, "NOT_VALID");
      assert.equal(before.all_valid, false);

      const feedback = validationFeedback(research, missedPlan, before);
      assert.equal(feedback.unresolved.length, 0);
      assert.ok(feedback.findings.length > 0);

      const beforeRevision = missedPlan.revision;
      const refined = (await ctx.runNode(
        gapNode,
        {
          job_id: `${jobId}-repair`,
          research,
          plan: missedPlan,
          seed_findings: feedback.findings,
        },
        { runId: `${jobId}-gap-repair` },
      )).output as { plan: Plan; gap: GapAnalysis };

      assert.equal(refined.plan.plan_id, missedPlan.plan_id);
      assert.ok(refined.plan.revision > beforeRevision);
      assert.equal(refined.gap.gap_0, true);
      assert.ok(refined.plan.steps[0].goal_refs.includes(research.goal.success_criteria[0].criterion_id));

      const evaluation = (await ctx.runNode(
        evaluationNode,
        { job_id: `${jobId}-repair`, research, plan: refined.plan },
        { runId: `${jobId}-evaluation-repair` },
      )).output as Evaluation;
      assert.equal(evaluation.result, "PASSED");

      const after = (await ctx.runNode(
        tripleNode,
        { job_id: `${jobId}-after`, research, plan: refined.plan },
        { runId: `${jobId}-triple-after` },
      )).output as TripleValidation;
      assert.equal(after.schema_validation.result, "VALID");
      assert.equal(after.fixture_validation.result, "VALID");
      assert.equal(after.goal_validation.result, "VALID");
      assert.equal(after.all_valid, true);

      return { before, improvedPlan: refined.plan, gap: refined.gap, evaluation, after };
    },
    { name: "validation_refinement_probe", rerunOnResume: true },
  );

  const rootAgent = new Workflow({ name: "validation_refinement_test", edges: [["START", probe]] });
  const runner = new InMemoryRunner({ agent: rootAgent, appName: "validation_refinement_test" });
  const session = await runner.sessionService.createSession({
    appName: "validation_refinement_test",
    userId: jobId,
    sessionId: jobId,
  });

  let output: ProbeOutput | undefined;
  try {
    for await (const event of runner.runAsync({
      userId: jobId,
      sessionId: session.id,
      newMessage: { role: "user", parts: [{ text: "Run validation refinement" }] },
    })) {
      if ("output" in event && event.output !== undefined) output = event.output as ProbeOutput;
    }
    assert.ok(output, "ADK refinement workflow produced no output");
    console.log("VALIDATION_BEFORE_JSON=" + JSON.stringify(output.before));
    console.log("IMPROVED_PLAN_JSON=" + JSON.stringify(output.improvedPlan));
    console.log("VALIDATION_AFTER_JSON=" + JSON.stringify(output.after));
  } finally {
    h.close();
  }
});
