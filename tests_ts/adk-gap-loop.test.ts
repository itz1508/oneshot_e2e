import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRunner, node, type NodeContext, Workflow } from "@google/adk";
import type {
  GapAnalysis,
  Plan,
  ResearchBundle,
  ResolvedGap,
} from "../backend/contract/types.js";
import type { GapFinding } from "../backend/role/gap-analysis/tool/coverage.js";
import { GapAnalysisWorkflow } from "../backend/role/gap-analysis/workflow.js";
import { createGapAnalysisNode } from "../backend/workflow/adk/node/gap-analysis-node.js";
import { harness, prompt } from "./harness.js";

class OneIterationGapWorkflow extends GapAnalysisWorkflow {
  checks = 0;
  fixes = 0;
  private fixed = false;

  override inspect(_bundle: ResearchBundle, plan: Plan): GapFinding[] {
    this.checks += 1;
    if (this.fixed) return [];
    return [
      {
        key: "synthetic:one-iteration",
        affected_branch: "schema",
        ref_id: "schema:synthetic",
        target_step_id: plan.steps[0].step_id,
      },
    ];
  }

  override resolveOne(
    bundle: ResearchBundle,
    plan: Plan,
    gap: GapFinding,
  ) {
    this.fixes += 1;
    this.fixed = true;
    const next = structuredClone(plan);
    next.revision += 1;
    next.steps[0].schema_refs.push(gap.ref_id);
    next.revision_evidence.push({
      revision: next.revision,
      affected_area: "schema",
      reason: "Resolve synthetic dynamic Gap node proof",
      audit_finding_id: `gap:${gap.key}`,
    });
    const resolved: ResolvedGap = {
      gap_id: `gap:${gap.key}`,
      affected_branch: gap.affected_branch,
      issue: "Synthetic missing traceability for dynamic Gap proof",
      evidence_ids: bundle.researcher.evidence.map((e) => e.evidence_id),
      required_correction: "Apply one deterministic additive correction",
      expected_resolved_state: "Synthetic gap removed",
      resolution_evidence: "Synthetic deterministic correction applied",
    };
    return { plan: next, resolved };
  }
}

test("dynamic Gap node fixes, rechecks, and exits at gap_0", async () => {
  const h = await harness("adk-gap-loop");
  try {
    const jobId = "adk-gap-loop-run";
    const bundle = await h.researcher.run(prompt(jobId), jobId);
    const gapper = new OneIterationGapWorkflow(h.contracts);
    const gapNode = createGapAnalysisNode(gapper);

    const probe = node(
      async (ctx: NodeContext): Promise<{ plan: Plan; gap: GapAnalysis }> => {
        const result = await ctx.runNode(
          gapNode,
          { job_id: jobId, research: bundle, plan: bundle.plan },
          { runId: `${jobId}-gap` },
        );
        return result.output as { plan: Plan; gap: GapAnalysis };
      },
      { name: "gap_dynamic_probe", rerunOnResume: true },
    );

    const rootAgent = new Workflow({
      name: "gap_dynamic_test",
      edges: [["START", probe]],
    });
    const runner = new InMemoryRunner({
      agent: rootAgent,
      appName: "gap_dynamic_test",
    });
    const session = await runner.sessionService.createSession({
      appName: "gap_dynamic_test",
      userId: jobId,
      sessionId: jobId,
    });

    let output: { plan: Plan; gap: GapAnalysis } | undefined;
    for await (const event of runner.runAsync({
      userId: jobId,
      sessionId: session.id,
      newMessage: { role: "user", parts: [{ text: "Run Gap Analysis" }] },
    })) {
      if ("output" in event && event.output !== undefined) {
        output = event.output as { plan: Plan; gap: GapAnalysis };
      }
    }

    assert.ok(output, "dynamic Gap node produced no response");
    assert.equal(gapper.fixes, 1);
    assert.ok(gapper.checks >= 2, `expected fresh recheck, got ${gapper.checks}`);
    assert.equal(output.gap.result, "PASSED");
    assert.equal(output.gap.gap_0, true);
    assert.equal(output.plan.plan_id, bundle.plan.plan_id);
    assert.ok(output.plan.revision > bundle.plan.revision);
    console.log("GAP_LOOP_RESPONSE_JSON=" + JSON.stringify(output));
  } finally {
    h.close();
  }
});
