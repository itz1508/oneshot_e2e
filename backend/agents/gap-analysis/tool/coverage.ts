import type { Plan, ResearchBundle } from "../../../contracts/schema/types.js";

export interface GapFinding {
  key: string;
  affected_branch: "requirement" | "goal" | "fixture" | "schema";
  ref_id: string;
  target_step_id?: string;
  evidence_ids?: string[];
  source?: "coverage" | "validation";
}

export const GAP_REFERENCE_FIELDS = {
  requirement: "requirement_refs",
  goal: "goal_refs",
  fixture: "fixture_refs",
  schema: "schema_refs",
} as const;

export function detectGaps(bundle: ResearchBundle, plan: Plan): GapFinding[] {
  const findings: GapFinding[] = [];
  const targetStepId = plan.steps[0]?.step_id;
  const collect = (
    branch: GapFinding["affected_branch"],
    required: string[],
  ) => {
    const field = GAP_REFERENCE_FIELDS[branch];
    const represented = new Set(plan.steps.flatMap((step) => step[field]));
    for (const refId of required) {
      if (represented.has(refId)) continue;
      findings.push({
        key: `${branch}:${refId}`,
        affected_branch: branch,
        ref_id: refId,
        target_step_id: targetStepId,
        source: "coverage",
      });
    }
  };

  // Callers resolve the first finding per iteration; preserve branch order.
  collect(
    "requirement",
    plan.requirements.map((requirement) => requirement.requirement_id),
  );
  collect(
    "goal",
    bundle.goal.success_criteria.map((criterion) => criterion.criterion_id),
  );
  collect("fixture", bundle.validation.fixture_validation.assertion_ids);
  collect("schema", [bundle.schema_artifact.schema_id]);
  return findings;
}

export function remainingGaps(bundle: ResearchBundle, plan: Plan): string[] {
  return detectGaps(bundle, plan).map((finding) => finding.key);
}
