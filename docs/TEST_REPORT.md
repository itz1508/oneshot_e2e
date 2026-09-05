# OneShot Production E2E — Verification Report

**Last updated:** 2026-09-04
**Version:** 1.4.0 (Phase 5 — failure-recovery workflow)
**Branch:** `repair/runtime-provider-ui`

## Product result

```text
PASSED
```

The canonical OneShot workflow remains unchanged. Phases 1–5 are complete and intact:
- Phase 1: Provider management, queue infrastructure, run job contract
- Phase 2: Sandbox execution, hardened admission
- Phase 3: BYOK, Tavily evidence, researcher provider
- Phase 4A/4B: Provider UI, provider failure normalization
- Phase 4C: Runtime provider UI integration
- Phase 5: Failure-recovery workflow (`backend/recovery/`)

## Canonical chain exercised

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

## Failure-recovery chain (Phase 5)

```text
Failure detected
→ Classify (normalized FailureCategory)
→ Collect bounded evidence
→ Root-cause analysis
→ Recommendation
   ├── sufficient evidence → recommendation ready
   └── insufficient evidence → bounded research escalation (≤1)
→ Policy-gated retry (if justified)
→ Re-run canonical chain
```

## Test counts (current)

```text
Python canonical/proof suite:       46/46 PASSED
TypeScript backend suite:            170 tests, 168 pass, 2 credential-gated skips
TypeScript source compile:           PASSED
Web frontend tests:                  31/31 PASSED
Recovery scenarios:                  24/24 PASSED
Recovery-view scenarios:             3/3 PASSED
HTTP security header proof:          PASSED
Dependency meaning/step-edge proof:  PASSED
Provider failure → ROOT_CAUSE:       PASSED
Hash equality/mutation proofs:       PASSED
Sandbox execution proofs:            PASSED
Build failure → BUILD_FAILURE:      PASSED
Schema/fixture/goal failure:         VALIDATION_FAILURE as required
Workflow exception → WORKFLOW_INTERNAL: PASSED
Root-cause contains real evidence:   PASSED
No raw stack dump in user-facing:   PASSED
API keys never in root-cause:        PASSED
Sufficient evidence → no escalation: PASSED
Insufficient evidence → ≤1 escalation: PASSED
Tavily disabled → local recovery:   PASSED
Tavily enabled → no provider change: PASSED
Researcher cannot mark DONE:         PASSED
Retry requires policy approval:      PASSED
Auth/model failures don't auto-retry: PASSED
Network retries bounded:             PASSED
Corrected retry passes validation:   PASSED
Failed retry stays ROOT_CAUSE:       PASSED
Persisted/reloaded recovery state:   PASSED
Main UI shows concise root cause:    PASSED
Detailed evidence in Task Management: PASSED
```

## Deterministic/integration test execution

```text
Python canonical/proof suite:       46/46 PASSED
TypeScript backend suite:            170 tests, 168 pass, 2 credential-gated skips
TypeScript source compile:          PASSED
Web frontend tests:                  31/31 PASSED
Recovery scenarios:                  24/24 PASSED
Recovery-view scenarios:             3/3 PASSED
All fixture operators:              PASSED
Provider failure → Done ROOT_CAUSE: PASSED
Hash equality/mutation proofs:      PASSED
HTTP security header proof:         PASSED
Dependency meaning/step-edge proof: PASSED
Job-specific fixture mutation:      NOT_VALID as required
Unresolvable evidence reference:    ROOT_CAUSE as required
```

## Material not activated

- Node.js `cluster`: current SSE subscriptions, run repository and filesystem artifacts are process-local.
- Kubernetes HPA: horizontal replicas require shared run/event/artifact infrastructure first.
- MongoDB/PostgreSQL backup commands: this package does not use either as its canonical artifact store.
- Application-level self-signed TLS: deployment/reverse-proxy concern, not required by this local product runtime.
- JWT identity system: no canonical OneShot user-identity contract exists in this package; optional bearer protection is used instead.

## Final stop condition

```text
PASSED
```