import type {
  GapAnalysis,
  Plan,
  ResearchBundle,
  ResolvedGap,
  RootCause,
} from "../../contracts/schema/types.js";
import { clone, unique } from "../../core/clone.js";
import {
  detectGaps,
  GAP_REFERENCE_FIELDS,
  type GapFinding,
} from "./tool/coverage.js";
import { CanonicalContractSkill } from "../../skills/canonical-contract-skill.js";

export interface GapFixResult {
  plan: Plan;
  resolved?: ResolvedGap;
  rootCause?: RootCause;
}

function refsFor(plan: Plan, finding: GapFinding): string[] | undefined {
  const step = finding.target_step_id
    ? plan.steps.find(
        (candidate) => candidate.step_id === finding.target_step_id,
      )
    : undefined;
  if (!step) return undefined;
  if (finding.affected_branch === "requirement") return step.requirement_refs;
  if (finding.affected_branch === "goal") return step.goal_refs;
  if (finding.affected_branch === "fixture") return step.fixture_refs;
  return step.schema_refs;
}

function alreadySatisfied(plan: Plan, finding: GapFinding): boolean {
  return refsFor(plan, finding)?.includes(finding.ref_id) ?? false;
}

function assertNoRegression(before: Plan, after: Plan): void {
  if (before.plan_id !== after.plan_id) {
    throw new Error("Gap Analysis changed logical plan_id");
  }
  if (after.revision < before.revision) {
    throw new Error("Gap improvement reduced plan revision");
  }
  const afterSteps = new Map(after.steps.map((step) => [step.step_id, step]));
  for (const previous of before.steps) {
    const current = afterSteps.get(previous.step_id);
    if (!current)
      throw new Error(`Gap improvement removed step ${previous.step_id}`);
    for (const field of [
      "requirement_refs",
      "goal_refs",
      "fixture_refs",
      "schema_refs",
    ] as const) {
      const currentRefs = new Set(current[field]);
      for (const ref of previous[field]) {
        if (!currentRefs.has(ref)) {
          throw new Error(`Gap improvement regressed ${field}: ${ref}`);
        }
      }
    }
  }
}

function mergeFindings(
  seed: GapFinding[],
  detected: GapFinding[],
): GapFinding[] {
  const merged = new Map<string, GapFinding>();
  for (const finding of [...seed, ...detected]) {
    if (!merged.has(finding.key)) merged.set(finding.key, finding);
  }
  return [...merged.values()];
}

/** Deterministic Gap Analysis operations used by the OneShot workflow. */
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
    const evidenceIds = gap.evidence_ids?.length
      ? [...gap.evidence_ids]
      : bundle.researcher.evidence.map((e) => e.evidence_id);
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
          required_correction:
            "Provide the missing information required to identify the correct plan branch",
          recheck_target: plan.plan_id,
        },
      };
    }

    const field = GAP_REFERENCE_FIELDS[gap.affected_branch];
    const before = step[field].length;
    step[field] = unique([...step[field], gap.ref_id]);

    if (step[field].length <= before) {
      return {
        plan,
        rootCause: {
          issue: "Gap correction produced no plan improvement",
          expected: `${gap.ref_id} adds new validated value to ${gap.affected_branch} traceability`,
          actual: `${gap.ref_id} was already represented or the proposed correction added no value`,
          evidence_ids: evidenceIds,
          required_correction:
            "Provide additional evidence for a different deterministic improvement",
          recheck_target: plan.plan_id,
        },
      };
    }

    plan.revision = input.revision + 1;
    plan.revision_evidence = [
      ...plan.revision_evidence,
      {
        revision: plan.revision,
        affected_area: gap.affected_branch,
        reason: `Resolve ${gap.source === "validation" ? "validation-discovered " : ""}gap ${gap.key}`,
        audit_finding_id: `gap:${gap.key}`,
      },
    ];

    return {
      plan,
      resolved: {
        gap_id: `gap:${gap.key}`,
        affected_branch: gap.affected_branch,
        issue: `Missing ${gap.key}`,
        evidence_ids: evidenceIds,
        required_correction: `Add ${gap.ref_id} to ${gap.affected_branch} traceability`,
        expected_resolved_state: `${gap.key} is represented in plan steps`,
        resolution_evidence: `${gap.ref_id} added to ${step.step_id}; revision=${plan.revision}`,
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
          result: "Failed",
          issue_type: "Root Cause",
          resolved_gaps: resolved,
          gap_0: false,
          root_cause: rootCause,
        }
      : {
          plan_id: plan.plan_id,
          result: "Passed",
          resolved_gaps: resolved,
          gap_0: true,
        };

    await this.contracts.validate("urn:oneshot:schema:plan:2", plan);
    await this.contracts.validate("urn:oneshot:schema:gap:2", gap);
    return gap;
  }

  /** Run deterministic Gap Analysis with optional validation feedback seed findings. */
  async run(
    bundle: ResearchBundle,
    input: Plan,
    seedFindings?: GapFinding[],
  ): Promise<{ plan: Plan; gap: GapAnalysis }> {
    let plan = clone(input);
    const resolved: ResolvedGap[] = [];
    let pending = (seedFindings ?? []).filter(
      (finding) => !alreadySatisfied(plan, finding),
    );
    let iteration = 0;

    for (;;) {
      const checked = this.inspect(bundle, plan);
      pending = pending.filter((finding) => !alreadySatisfied(plan, finding));
      const findings = mergeFindings(pending, checked);

      if (findings.length === 0) {
        return { plan, gap: await this.finalize(plan, resolved) };
      }

      const finding = findings[0];
      const before = plan;
      const fixed = this.resolveOne(bundle, plan, finding);
      plan = fixed.plan;
      assertNoRegression(before, plan);

      if (fixed.rootCause) {
        return {
          plan,
          gap: await this.finalize(plan, resolved, fixed.rootCause),
        };
      }
      if (!fixed.resolved) {
        throw new Error(
          `Gap Analysis produced no improvement for ${finding.key}`,
        );
      }
      resolved.push(fixed.resolved);
      pending = pending.filter((candidate) => candidate.key !== finding.key);
      iteration += 1;
      if (iteration > 256) {
        throw new Error("Gap Analysis exceeded deterministic refinement bound");
      }
    }
  }
}
