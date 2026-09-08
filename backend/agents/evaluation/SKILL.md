# Evaluation Skill

Evaluate the finalized `Plan` against researched requirements, goals, fixtures, schema traceability, dependencies, and execution meaning, returning `PASSED` or `ROOT_CAUSE` with evidence.

## Ownership

- Consumes: `ResearchBundle` + `Plan`.
- Produces: `Evaluation` evidence and a Passed/Failed verdict (does not mutate the plan or hash).

## Workflow

`ResearchBundle + Plan → Evaluation`

- Checks `EVALUATION_AREAS`: research alignment, requirement coverage, dependency coherence, plan coherence, goal traceability, success-criteria traceability, fixture traceability, schema traceability, and execution meaning.
- Returns `result: Passed`, or `Failed` with `issue_type: Root Cause` and a `root_cause` recheck target.

## Contracts

Validates `urn:oneshot:schema:evaluation:2`.

## Tools

- `evaluatePlan` (`backend/agents/evaluation/tool/evaluate-plan.ts`).

## Boundary

Evaluation only verifies and reports. Confirmation and canonical hash creation follow separately and are deterministic.
