import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  Dependency,
  EvidenceRef,
  PlanAssertion,
  PlanStep,
  Prompt,
  ResearchBundle,
  Requirement,
  SuccessCriterion,
} from "../../../contract/types.js";
import { WorkflowRootCauseError } from "../../../core/root-cause-error.js";
import type { GatheredEvidence } from "../tool/evidence/collector.js";

export interface StructuredResearchDraft {
  summary: string;
  requirements: string[];
  dependencies: Array<{ description: string; required_by: number[] }>;
  plan_steps: Array<{
    description: string;
    responsibility: string;
    requirement_indexes: number[];
  }>;
  success_meaning: string;
  success_criteria: Array<{
    statement: string;
    measurement: string;
    expected_result: string;
    requirement_indexes: number[];
  }>;
}

type BundleInput = {
  projectRoot: string;
  prompt: Prompt;
  runId: string;
  draft: StructuredResearchDraft;
  gathered: GatheredEvidence[];
  providerSource: string;
  providerProvenance: string;
  incompleteIssue: string;
  incompleteCorrection: string;
};

function compact<T>(items: T[]): T[] {
  return items.filter((value, index, all) => all.indexOf(value) === index);
}

function normalizedIndexes(values: number[], max: number) {
  return compact(
    values.filter((index) => Number.isInteger(index) && index >= 0 && index < max),
  );
}

/**
 * Convert a provider-owned, strictly validated research draft into the
 * canonical Researcher-owned bundle. Provider SDK response types stop here;
 * the downstream OneShot workflow continues to consume ResearchBundle only.
 */
export async function structuredDraftToResearchBundle(
  input: BundleInput,
): Promise<ResearchBundle> {
  const {
    projectRoot,
    prompt,
    runId,
    draft,
    gathered,
    providerSource,
    providerProvenance,
    incompleteIssue,
    incompleteCorrection,
  } = input;

  if (
    !Array.isArray(draft.requirements) ||
    !draft.requirements.length ||
    !Array.isArray(draft.plan_steps) ||
    !draft.plan_steps.length ||
    !Array.isArray(draft.success_criteria) ||
    !draft.success_criteria.length
  ) {
    throw new WorkflowRootCauseError({
      issue: incompleteIssue,
      expected: "requirements, plan_steps, and success_criteria are non-empty",
      actual: JSON.stringify(draft),
      evidence_ids: [],
      required_correction: incompleteCorrection,
      recheck_target: runId,
    });
  }

  const researcherId = `researcher:${runId}`;
  const planId = `plan:${runId}`;
  const schemaId = `schema:${runId}`;
  const fixtureId = `fixture:${runId}`;
  const goalId = `goal:${runId}`;
  const validationId = `validation:${runId}`;

  const evidence: EvidenceRef[] = [
    {
      evidence_id: `evidence:${runId}:model`,
      source: providerSource,
      statement: draft.summary || prompt.intent,
      provenance: providerProvenance,
    },
    ...gathered.map((item, index) => ({
      evidence_id: `evidence:${runId}:${index + 1}`,
      source: item.source,
      statement: item.statement,
      provenance: item.provenance,
    })),
  ];
  const evidenceIds = evidence.map((item) => item.evidence_id);

  const requirements: Requirement[] = draft.requirements.map(
    (statement, index) => ({
      requirement_id: `req:${runId}:${index + 1}`,
      statement,
      evidence_ids: evidenceIds,
    }),
  );

  const criteria: SuccessCriterion[] = draft.success_criteria.map(
    (criterion, index) => ({
      criterion_id: `criterion:${runId}:${index + 1}`,
      statement: criterion.statement,
      measurement: criterion.measurement,
      expected_result: criterion.expected_result,
      evidence_ids: evidenceIds,
    }),
  );

  const dependencies: Dependency[] = draft.dependencies.map(
    (dependency, index) => ({
      dependency_id: `dependency:${runId}:${index + 1}`,
      description: dependency.description,
      required_by: normalizedIndexes(
        dependency.required_by,
        requirements.length,
      ).map((requirementIndex) => requirements[requirementIndex].requirement_id),
    }),
  );

  let steps: PlanStep[] = draft.plan_steps.map((step, stepIndex) => {
    const requirementIndexes = normalizedIndexes(
      step.requirement_indexes,
      requirements.length,
    );
    const mappedIndexes = requirementIndexes.length
      ? requirementIndexes
      : [Math.min(stepIndex, requirements.length - 1)];
    const criterionRefs = compact(
      criteria
        .filter((_, criterionIndex) =>
          normalizedIndexes(
            draft.success_criteria[criterionIndex].requirement_indexes,
            requirements.length,
          ).some((index) => mappedIndexes.includes(index)),
        )
        .map((criterion) => criterion.criterion_id),
    );

    return {
      step_id: `step:${runId}:${stepIndex + 1}`,
      description: step.description,
      responsibility: step.responsibility || "ResearchPlan",
      depends_on: [],
      requirement_refs: mappedIndexes.map(
        (index) => requirements[index].requirement_id,
      ),
      goal_refs: criterionRefs.length
        ? criterionRefs
        : [criteria[Math.min(stepIndex, criteria.length - 1)].criterion_id],
      fixture_refs: [],
      schema_refs: [schemaId],
    };
  });

  const assertions: PlanAssertion[] = [];
  const assertionsByStep: string[][] = steps.map(() => []);
  const addAssertion = (stepIndex: number, assertion: PlanAssertion) => {
    assertions.push(assertion);
    assertionsByStep[Math.min(stepIndex, assertionsByStep.length - 1)].push(
      assertion.assertion_id,
    );
  };

  addAssertion(0, {
    assertion_id: `assertion:${runId}:plan-id`,
    operator: "equals",
    target: "$.plan_id",
    expected: planId,
    evidence_ids: evidenceIds,
  });

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    for (
      let requirementIndex = 0;
      requirementIndex < steps[stepIndex].requirement_refs.length;
      requirementIndex++
    ) {
      addAssertion(stepIndex, {
        assertion_id: `assertion:${runId}:step-${stepIndex + 1}-req-${requirementIndex + 1}`,
        operator: "references",
        target: `$.steps.${stepIndex}.requirement_refs`,
        expected: steps[stepIndex].requirement_refs[requirementIndex],
        evidence_ids: evidenceIds,
      });
    }
    addAssertion(stepIndex, {
      assertion_id: `assertion:${runId}:step-${stepIndex + 1}-schema`,
      operator: "references",
      target: `$.steps.${stepIndex}.schema_refs`,
      expected: schemaId,
      evidence_ids: evidenceIds,
    });
  }

  steps = steps.map((step, index) => ({
    ...step,
    fixture_refs: assertionsByStep[index],
  }));

  const canonicalSchema = JSON.parse(
    await readFile(resolve(projectRoot, "schema/plan.schema.json"), "utf8"),
  ) as any;
  const schemaDocument = structuredClone(canonicalSchema);
  schemaDocument.$id = `urn:oneshot:research-schema:${runId}`;
  schemaDocument.properties.plan_id = {
    ...schemaDocument.properties.plan_id,
    const: planId,
  };
  schemaDocument.properties.researcher_id = {
    ...schemaDocument.properties.researcher_id,
    const: researcherId,
  };
  schemaDocument.properties.requirements = {
    ...schemaDocument.properties.requirements,
    minItems: requirements.length,
  };
  schemaDocument.properties.steps = {
    ...schemaDocument.properties.steps,
    minItems: steps.length,
  };

  return {
    prompt,
    researcher: {
      researcher_id: researcherId,
      prompt_id: prompt.prompt_id,
      plan_id: planId,
      schema_id: schemaId,
      fixture_id: fixtureId,
      goal_id: goalId,
      validation_id: validationId,
      requirement_ids: requirements.map((item) => item.requirement_id),
      evidence,
      success_definition: {
        success_criteria_ids: criteria.map((item) => item.criterion_id),
        success_meaning: draft.success_meaning,
        evidence_ids: evidenceIds,
      },
    },
    plan: {
      plan_id: planId,
      researcher_id: researcherId,
      requirements,
      dependencies,
      steps,
      revision: 1,
      revision_evidence: [],
    },
    schema_artifact: {
      schema_id: schemaId,
      researcher_id: researcherId,
      target: "plan",
      schema_document: schemaDocument,
      evidence_ids: evidenceIds,
    },
    fixture: {
      fixture_id: fixtureId,
      researcher_id: researcherId,
      plan_assertions: assertions,
    },
    goal: {
      goal_id: goalId,
      researcher_id: researcherId,
      objective: prompt.requested_outcome,
      success_meaning: draft.success_meaning,
      success_criteria: criteria,
    },
    validation: {
      validation_id: validationId,
      researcher_id: researcherId,
      plan_id: planId,
      schema_validation: { plan_id: planId, schema_id: schemaId },
      fixture_validation: {
        plan_id: planId,
        fixture_id: fixtureId,
        assertion_ids: assertions.map((assertion) => assertion.assertion_id),
      },
      goal_validation: {
        plan_id: planId,
        goal_id: goalId,
        criterion_ids: criteria.map((criterion) => criterion.criterion_id),
      },
    },
  };
}
