import type {
  GapAnalysis,
  Plan,
  ResearchBundle,
  ResolvedGap,
  RootCause,
} from "../../contract/types.js";
import { clone, unique } from "../../core/clone.js";
import { detectGaps, type GapFinding } from "./tool/coverage.js";
import { CanonicalContractSkill } from "../../skill/canonical-contract-skill.js";

export interface GapFixResult {
  plan: Plan;
  resolved?: ResolvedGap;
  rootCause?: RootCause;
}

/** Deterministic Gap Analysis operations composed by the ADK LoopAgent. */
export class GapAnalysisWorkflow {
  constructor(private contracts: CanonicalContractSkill) {}

  inspect(bundle: ResearchBundle, plan: Plan): GapFinding[] {
    return detectGaps(bundle, plan);
  }

  resolveOne(
    bundle: ResearchBundle,
    input: Plan,
    gap: GapFinding,
  ): GapFixResult {
    const plan = clone(input);
    const evidenceIds = bundle.researcher.evidence.map((e) => e.evidence_id);
    const step = gap.target_step_id
      ? plan.steps.find((s) => s.step_id === gap.target_step_id)
      : undefined;

    if (!step) {
      return {
        plan,
        rootCause: {
          issue: "Gap correction target unresolved",
          expected: `A plan branch for ${gap.key}`,
          actual: "No deterministic target step",
          evidence_ids: evidenceIds,
          required_correction: "Provide a target plan branch",
          recheck_target: plan.plan_id,
        },
      };
    }

    if (gap.affected_branch === "requirement") {
      step.requirement_refs = unique([...step.requirement_refs, gap.ref_id]);
    }
    if (gap.affected_branch === "goal") {
      step.goal_refs = unique([...step.goal_refs, gap.ref_id]);
    }
    if (gap.affected_branch === "fixture") {
      step.fixture_refs = unique([...step.fixture_refs, gap.ref_id]);
    }
    if (gap.affected_branch === "schema") {
      step.schema_refs = unique([...step.schema_refs, gap.ref_id]);
    }

    return {
      plan,
      resolved: {
        gap_id: `gap:${gap.key}`,
        affected_branch: gap.affected_branch,
        issue: `Missing ${gap.key}`,
        evidence_ids: evidenceIds,
        required_correction: `Add ${gap.ref_id} to ${gap.affected_branch} traceability`,
        expected_resolved_state: `${gap.key} is represented in plan steps`,
        resolution_evidence: `${gap.ref_id} added to ${step.step_id}`,
      },
    };
  }

  async finalize(
    plan: Plan,
    resolved: ResolvedGap[],
    rootCause?: RootCause,
  ): Promise<GapAnalysis> {
    const gap: GapAnalysis = rootCause
      ? {
          plan_id: plan.plan_id,
          result: "ROOT_CAUSE",
          resolved_gaps: resolved,
          gap_0: false,
          root_cause: rootCause,
        }
      : {
          plan_id: plan.plan_id,
          result: "PASSED",
          resolved_gaps: resolved,
          gap_0: true,
        };

    await this.contracts.validate("urn:oneshot:schema:plan:1", plan);
    await this.contracts.validate("urn:oneshot:schema:gap:1", gap);
    return gap;
  }

  /** Compatibility path for direct callers outside the canonical ADK runtime. */
  async run(
    bundle: ResearchBundle,
    input: Plan,
  ): Promise<{ plan: Plan; gap: GapAnalysis }> {
    let plan = clone(input);
    const resolved: ResolvedGap[] = [];

    for (;;) {
      const found = this.inspect(bundle, plan);
      if (found.length === 0) {
        return { plan, gap: await this.finalize(plan, resolved) };
      }

      const beforeKeys = new Set(found.map((g) => g.key));
      const fixed = this.resolveOne(bundle, plan, found[0]);
      plan = fixed.plan;

      if (fixed.rootCause) {
        return {
          plan,
          gap: await this.finalize(plan, resolved, fixed.rootCause),
        };
      }
      if (fixed.resolved) resolved.push(fixed.resolved);

      const remaining = this.inspect(bundle, plan);
      const afterKeys = new Set(remaining.map((g) => g.key));
      const introducedNewGap = [...afterKeys].some(
        (key) => !beforeKeys.has(key),
      );
      const progressed =
        afterKeys.size < beforeKeys.size && !introducedNewGap;

      if (!progressed) {
        return {
          plan,
          gap: await this.finalize(plan, resolved, {
            issue: "Gap Analysis violated deterministic progress invariant",
            expected:
              "Each iteration removes at least one existing gap and introduces no new gap key",
            actual: `before=${[...beforeKeys].join(",")}; after=${[
              ...afterKeys,
            ].join(",")}`,
            evidence_ids: bundle.researcher.evidence.map(
              (e) => e.evidence_id,
            ),
            required_correction:
              "Correct the deterministic gap target or fix rule",
            recheck_target: plan.plan_id,
          }),
        };
      }
    }
  }
}
