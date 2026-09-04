---
name: oneshot-canonical-contracts
description: Validate and prove OneShot canonical workflow contracts, references, fixtures, graph, canonical bytes, and hash equality.
---

# OneShot Canonical Contracts Skill

## Canonical workflow

`Prompt_id → Researcher → Researcher(id) → Planner → audit_id → Refactor → plan_id → Gap Analysis → gap_0 + plan_id → Evaluation → plan_id → Triple Validation → CONFIRMED → CREATE HASH → HASH → DONE`

Triple Validation consists of independent Schema, Fixture, and Goal validation. Each returns `VALID | NOT_VALID`; all three `VALID` produces `CONFIRMED`.

## Contract authority

JSON Schema Draft 2020-12 is canonical. Python validates canonical schemas, parses strict Pydantic runtime representations, proves schema/runtime parity, resolves cross-artifact references, executes deterministic fixtures, canonicalizes confirmed core bytes, and computes/verifies SHA-256.

## Tool surface

- `validate_schema`
- `validate_artifact`
- `validate_references`
- `validate_parity`
- `validate_registry`
- `validate_graph`
- `resolve_artifact`
- `trace_artifact`
- `run_fixture`
- `canonicalize`
- `create_hash`
- `verify_hash`

The tool registry is a narrow dispatch surface. Deterministic implementations live in `backend/validation/python/validation/` and wrapper scripts live under this Skill's `scripts/` folder.

## Proof sequence

1. Resolve the canonical contract.
2. Validate JSON Schema.
3. Parse the strict Pydantic representation.
4. Validate referenced artifact identities.
5. Run the applicable deterministic fixture/proof operation.
6. Validate the machine workflow graph when workflow topology is involved.
7. For confirmed content, canonicalize `confirmed_package.core` using `oneshot-jcs-rfc8785-v1`.
8. Compute SHA-256.
9. Independently recompute and compare.
10. Return `PASSED` or `ROOT_CAUSE`; validators return `VALID` or `NOT_VALID`.

## Evidence output

Record the operation, contract/artifact identities, expected state, actual result, evidence, and recheck target. Processing/checkpoint metadata is separate from the confirmed comparable core.
