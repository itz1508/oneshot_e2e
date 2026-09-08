# Refactor Skill

Apply Planner-identified refinements to the plan while preserving the same logical `plan_id` and Researcher-owned evidence/artifact identities.

## Ownership

- Consumes: `plan_id` (Researcher-owned) + `Audit` (`audit_id`).
- Produces: a revised `Plan` with the same logical `plan_id`, incremented revision, and revision evidence.

## Workflow

`ResearchBundle + Audit → Refactor → Plan (same plan_id)`

- Maps each `AuditFinding.required_refinement` of the form `add <refs> <id>` onto `affected_plan_refs`.
- Adds requirement/goal/fixture/schema references to the identified steps; increments `revision` and appends `revision_evidence` for applied findings.
- Raises `ROOT_CAUSE` if a finding cannot be deterministically mapped.

## Contracts

Validates `urn:oneshot:schema:plan:2` before returning. A changed logical `plan_id` is an error.

## Tools

- `applyAudit` (`backend/agents/refactor/tool/apply-audit.ts`).

## Boundary

Refactor corrects the same logical plan; it does not re-research, re-audit, or reassign Researcher ownership.
