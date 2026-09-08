# Planner Skill

Consume the accepted Researcher baseline (`ResearchBundle`) and produce the Researcher-visible audit record (`Audit`). The Planner runs only after Human Gate #1 (Research Review) accepts the Researcher-owned package.

## Ownership

- Owns: `audit_id`.
- Does not transfer `plan_id` or any Researcher-owned artifact identities (plan, schema, fixture, goal, validation remain Researcher-owned).

## Workflow

`ResearchBundle (accepted) → Planner → Audit`

- Reviews the plan across `PLANNER_REVIEW_AREAS`: evidence sufficiency, file/subject coverage, requirement coverage, dependency coverage, goal clarity, success criteria, fixture usability, schema applicability, validation traceability, plan structure, and unresolved findings.
- Emits an `AuditFinding` per gap with a deterministic `required_refinement` that Refactor consumes.
- Returns `Audit` (`audit_id`, `researcher_id`, `plan_id`, `reviewed_areas`, `findings`).

## Contracts

Validates `urn:oneshot:schema:audit:2` before returning.

## Tools

- `plannerFindings` / review areas (`backend/agents/planner/tool/coverage.ts`).

## Boundary

The Planner audits and reports; it does not edit the plan directly. Refinement is owned by Refactor.
