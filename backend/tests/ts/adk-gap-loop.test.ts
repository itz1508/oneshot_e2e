import test from "node:test";
import assert from "node:assert/strict";
import { InMemorySessionService, Runner } from "@google/adk";
import type {
  Plan,
  ResearchBundle,
  ResolvedGap,
} from "../../contracts/schema/types.js";
import type { GapFinding } from "../../role/gap-analysis/tool/coverage.js";
import { GapAnalysisWorkflow } from "../../role/gap-analysis/workflow.js";
import { createGapAnalysisAgent } from "../../workflow/adk/gap-loop.js";
import { ADK_STATE } from "../../workflow/adk/state.js";
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
    const resolved: ResolvedGap = {
      gap_id: `gap:${gap.key}`,
      affected_branch: gap.affected_branch,
      issue: "Synthetic missing traceability for LoopAgent proof",
      evidence_ids: bundle.researcher.evidence.map((e) => e.evidence_id),
      required_correction: "Apply one deterministic correction",
      expected_resolved_state: "Synthetic gap removed",
      resolution_evidence: "Synthetic deterministic correction applied",
    };
    return { plan, resolved };
  }
}

test("real LoopAgent performs fix then recheck then exits at gap_0", async () => {
  const h = await harness("adk-gap-loop");
  try {
    const runId = "adk-gap-loop-run";
    const bundle = await h.researcher.run(prompt(runId), runId);
    const gapper = new OneIterationGapWorkflow(h.contracts);
    const emitted: Array<{ processor: string; state: string; data?: Record<string, unknown> }> = [];

    const agent = createGapAnalysisAgent(gapper, {
      event(_runId, processor, state, data) {
        emitted.push({ processor, state, data });
      },
      async save() {
        return "test-artifact";
      },
    });

    const sessionService = new InMemorySessionService();
    const runner = new Runner({
      appName: "oneshot-gap-loop-test",
      agent,
      sessionService,
    });
    const session = await sessionService.createSession({
      appName: "oneshot-gap-loop-test",
      userId: runId,
      sessionId: runId,
      state: {
        [ADK_STATE.runId]: runId,
        [ADK_STATE.bundle]: bundle,
        [ADK_STATE.plan]: bundle.plan,
      },
    });

    for await (const _event of runner.runAsync({
      userId: runId,
      sessionId: session.id,
      newMessage: { role: "user", parts: [{ text: "Run Gap Analysis" }] },
    })) {
      // consume the real ADK event stream
    }

    assert.equal(gapper.fixes, 1);
    assert.ok(gapper.checks >= 2, `expected recheck, got ${gapper.checks} checks`);
    const complete = emitted.find(
      (event) =>
        event.processor === "GapAnalysis" && event.state === "COMPLETE",
    );
    assert.ok(complete, "GapAnalysis did not complete after LoopAgent escalation");
    assert.equal(complete.data?.result, "PASSED");
  } finally {
    h.close();
  }
});
