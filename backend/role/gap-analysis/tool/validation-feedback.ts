import type {
  Plan,
  ResearchBundle,
  TripleValidation,
} from "../../../contract/types.js";
import type { GapFinding } from "./coverage.js";

export interface ValidationFeedback {
  findings: GapFinding[];
  unresolved: string[];
}

const branchByField = {
  requirement_refs: "requirement",
  goal_refs: "goal",
  fixture_refs: "fixture",
  schema_refs: "schema",
} as const;

function fixtureFindings(
  bundle: ResearchBundle,
  plan: Plan,
  triple: TripleValidation,
): ValidationFeedback {
  const findings: GapFinding[] = [];
  const unresolved: string[] = [];
  if (triple.fixture_validation.result === "VALID") return { findings, unresolved };

  const assertions = new Map(bundle.fixture.plan_assertions.map((assertion) => [assertion.assertion_id, assertion]));
  const evidenceIds = triple.fixture_validation.evidence.map((evidence) => evidence.evidence_id);

  for (const result of triple.fixture_validation.assertion_results) {
    if (result.satisfied) continue;
    const assertion = assertions.get(result.assertion_id);
    if (!assertion) {
      unresolved.push(`fixture assertion ${result.assertion_id} is routed but missing from Fixture`);
      continue;
    }

    const match = /^\$\.steps\.(\d+)\.(requirement_refs|goal_refs|fixture_refs|schema_refs)$/.exec(assertion.target);
    const additive = assertion.operator === "contains" || assertion.operator === "references" || assertion.operator === "allFilesSpecified";
    if (!match || !additive) {
      unresolved.push(`fixture assertion ${assertion.assertion_id} cannot be mapped to a monotonic Plan refinement`);
      continue;
    }

    const step = plan.steps[Number(match[1])];
    if (!step) {
      unresolved.push(`fixture assertion ${assertion.assertion_id} targets missing plan step ${match[1]}`);
      continue;
    }

    const expected = Array.isArray(assertion.expected)
      ? assertion.expected.filter((value): value is string => typeof value === "string")
      : typeof assertion.expected === "string"
        ? [assertion.expected]
        : [];
    if (!expected.length) {
      unresolved.push(`fixture assertion ${assertion.assertion_id} has no additive string expectation`);
      continue;
    }

    const field = match[2] as keyof typeof branchByField;
    const currentRefs = new Set(step[field]);
    for (const ref of expected) {
      if (currentRefs.has(ref)) continue;
      findings.push({
        key: `validation:fixture:${assertion.assertion_id}:${ref}`,
        affected_branch: branchByField[field],
        ref_id: ref,
        target_step_id: step.step_id,
        evidence_ids: evidenceIds,
        source: "validation",
      });
    }
  }
  return { findings, unresolved };
}

function goalFindings(
  bundle: ResearchBundle,
  plan: Plan,
  triple: TripleValidation,
): ValidationFeedback {
  const findings: GapFinding[] = [];
  const unresolved: string[] = [];
  if (triple.goal_validation.result === "VALID") return { findings, unresolved };

  const evidenceIds = triple.goal_validation.evidence.map((evidence) => evidence.evidence_id);
  for (const result of triple.goal_validation.criterion_results) {
    if (result.satisfied) continue;
    const knownCriterion = bundle.goal.success_criteria.some((criterion) => criterion.criterion_id === result.criterion_id);
    if (!knownCriterion) {
      unresolved.push(`goal criterion ${result.criterion_id} is routed but missing from Goal`);
      continue;
    }

    // Use Researcher's original Plan mapping as evidence for where the missing
    // criterion belongs. Never guess a new target step.
    const originalTargets = bundle.plan.steps.filter((step) => step.goal_refs.includes(result.criterion_id));
    if (!originalTargets.length) {
      unresolved.push(`goal criterion ${result.criterion_id} has no evidence-backed target step`);
      continue;
    }

    for (const original of originalTargets) {
      const current = plan.steps.find((step) => step.step_id === original.step_id);
      if (!current) {
        unresolved.push(`goal criterion ${result.criterion_id} targets removed step ${original.step_id}`);
        continue;
      }
      if (current.goal_refs.includes(result.criterion_id)) continue;
      findings.push({
        key: `validation:goal:${result.criterion_id}:${current.step_id}`,
        affected_branch: "goal",
        ref_id: result.criterion_id,
        target_step_id: current.step_id,
        evidence_ids: evidenceIds,
        source: "validation",
      });
    }
  }
  return { findings, unresolved };
}

/**
 * Translate NOT_VALID proof results into additive Gap findings when the
 * existing Researcher/Fixture evidence identifies an exact improvement.
 * Findings that cannot be resolved without guessing are returned unresolved.
 */
export function validationFeedback(
  bundle: ResearchBundle,
  plan: Plan,
  triple: TripleValidation,
): ValidationFeedback {
  const fixture = fixtureFindings(bundle, plan, triple);
  const goal = goalFindings(bundle, plan, triple);
  const unresolved = [...fixture.unresolved, ...goal.unresolved];

  if (triple.schema_validation.result === "NOT_VALID") {
    unresolved.push(
      ...triple.schema_validation.evidence.map(
        (evidence) => `schema validation requires additional information: ${evidence.statement}`,
      ),
    );
  }

  const deduped = new Map<string, GapFinding>();
  for (const finding of [...fixture.findings, ...goal.findings]) deduped.set(finding.key, finding);
  return { findings: [...deduped.values()], unresolved };
}
