# Gap Analysis Skill

Inspect the refactored plan, resolve concrete remaining gaps by restoring traceability, and produce `gap_0` (or a `ROOT_CAUSE`) plus the same `plan_id` when no gaps remain.

## Ownership

- Consumes: `ResearchBundle` + `Plan`.
- Produces: a `GapAnalysis` with `resolved_gaps` and `gap_0: true`, or a `root_cause` when a gap cannot be deterministically resolved.

## Workflow

`ResearchBundle + Plan → inspect → resolve gaps (requirement/goal/fixture/schema traceability) → recheck → GapAnalysis`

- Detects gaps via `detectGaps` over `requirement_refs` / `goal_refs` / `fixture_refs` / `schema_refs`.
- Resolves one gap per iteration (validation-discovered gaps join coverage gaps) and enforces a deterministic progress invariant: each iteration removes at least one gap key and introduces no new key.
- On completion returns `GapAnalysis` (`result: Passed`, `gap_0: true`), or `Failed` with `issue_type: Root Cause` and a recheck target.

## Contracts

Validates `urn:oneshot:schema:plan:2` and `urn:oneshot:schema:gap:2`.

## Tools

- `detectGaps` (`tool/coverage.ts`), `validation-feedback` (`tool/validation-feedback.ts`).

## Boundary

Gap Analysis only restores traceability; it does not re-plan the whole system and does not change `plan_id`.
