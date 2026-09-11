import test from "node:test";
import assert from "node:assert/strict";
import type {
  GapAnalysis,
  Plan,
  ResearchBundle,
  ResolvedGap,
} from "../../contracts/schema/types.js";
import type { GapFinding } from "../../agents/gap-analysis/tool/coverage.js";
import { GapAnalysisWorkflow } from "../../agents/gap-analysis/workflow.js";
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
      reason: "Resolve synthetic native Gap proof",
      audit_finding_id: `gap:${gap.key}`,
    });
    const resolved: ResolvedGap = {
      gap_id: `gap:${gap.key}`,
      affected_branch: gap.affected_branch,
      issue: "Synthetic missing traceability for native Gap proof",
      evidence_ids: bundle.researcher.evidence.map((e) => e.evidence_id),
      required_correction: "Apply one deterministic additive correction",
      expected_resolved_state: "Synthetic gap removed",
      resolution_evidence: "Synthetic deterministic correction applied",
    };
    return { plan: next, resolved };
  }
}

test("native Gap analysis fixes, rechecks, and exits at gap_0", async () => {
  const h = await harness("gap-refinement-loop");
  try {
    const jobId = "gap-loop-run";
    const bundle = await h.researcher.run(prompt(jobId), jobId);
    const gapper = new OneIterationGapWorkflow(h.contracts);

    const output: { plan: Plan; gap: GapAnalysis } = await gapper.run(
      bundle,
      bundle.plan,
    );

    assert.ok(output, "native Gap analysis produced no response");
    assert.equal(gapper.fixes, 1);
    assert.ok(gapper.checks >= 2, `expected fresh recheck, got ${gapper.checks}`);
    assert.equal(output.gap.result, "Passed");
    assert.equal(output.gap.gap_0, true);
    assert.equal(output.plan.plan_id, bundle.plan.plan_id);
    assert.ok(output.plan.revision > bundle.plan.revision);
    console.log("GAP_LOOP_RESPONSE_JSON=" + JSON.stringify(output));
  } finally {
    h.close();
  }
});
