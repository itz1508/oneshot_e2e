# OneShot Canonical Workflow

```text
Prompt_id
→ Researcher
→ Researcher(id)
   ├── plan_id
   ├── schema_id
   ├── fixture_id
   ├── goal_id
   └── validation_id
→ Planner
→ audit_id
→ Refactor
→ same logical plan_id
→ Gap Analysis
→ gap_0 + plan_id
→ Evaluation
→ plan_id
→ Triple Validation
   ├── Schema Validation  → VALID | NOT_VALID
   ├── Fixture Validation → VALID | NOT_VALID
   └── Goal Validation    → VALID | NOT_VALID
→ all VALID
→ CONFIRMED
→ CREATE HASH
→ HASH
→ DONE
```

## Ownership

- Researcher owns `Researcher(id)`, `plan_id`, `schema_id`, `fixture_id`, `goal_id`, and `validation_id`.
- Planner consumes `plan_id` and produces `audit_id`.
- Refactor consumes `plan_id + audit_id` and returns the same logical `plan_id` with revision evidence.
- Gap Analysis closes identified gaps and returns `gap_0 + plan_id` after a fresh recheck.
- Evaluation evaluates the completed plan and returns the same `plan_id` with evaluation evidence.
- Schema, Fixture, and Goal validation are independent proofs. Each returns `VALID | NOT_VALID`.
- `CONFIRMED` exists when all three validators are `VALID`.
- Hash creation uses the canonical comparable representation `confirmed_package.core`.

## Result vocabulary

Workflow operations: `PASSED | ROOT_CAUSE`.
Validation operations: `VALID | NOT_VALID`.

## External execution verification boundary

The confirmed immutable package and its created hash may be handed to the external Builder/Sandbox boundary. Verification uses the same canonical comparable representation and direct equality:

```text
HASH == hash_sandbox
```

Execution/checkpoint metadata remains outside `confirmed_package.core`.

## Support layers before and around the canonical workflow

The canonical workflow still begins at `Prompt_id`. Chat/Intent support precedes it:

```text
Chat turns
→ Intent(id) revision
→ required information check
   ├─ missing → ROOT CAUSE + targeted help request → user answer → Intent revision
   └─ sufficient → Prompt(id)
→ canonical workflow above
```

Task Management, ADK graph, Intent graph, and Authority graph are projections/support metadata and are excluded from `confirmed_package.core`.
