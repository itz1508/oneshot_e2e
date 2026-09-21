# Evaluation Middleware

## Overview

The `evaluation_middleware` package (`backend/validation/python/evaluation_middleware/`) provides framework-level build-requirement evaluation. It is provider-neutral, deterministic-first, and designed to evaluate whether requirements, goals, outputs, and workflows are satisfied before advancing a build.

- **Package Location:** `backend/validation/python/evaluation_middleware/`
- **Test Suite:** `backend/tests/python/evaluation_middleware/` (48 tests, 0 failures)
- **Status:** `FRAMEWORK_PROOF_ONLY` · `DETERMINISTIC_FIRST` · `PROVIDER_NEUTRAL` · `NO_LIVE_MODEL` · `NO_NETWORK` · `NO_COSMOS_INSTALL`

---

## Core Invariants

The evaluation middleware strictly enforces five fundamental invariants:

| Invariant | Statement | Test Coverage |
|---|---|---|
| **INV-1** | A requirement that is blank, missing, skipped, or unevaluated is **NEVER** `SATISFIED`. | `test_requirement_coverage.py` |
| **INV-2** | A model-based score, however high, does **NOT** override a deterministic missing-requirement disposition. | `test_middleware_disposition.py` |
| **INV-3** | Timeout, cancellation, and failure are **DISTINCT** on the receipt. One evaluator's timeout or cancellation does not erase another evaluator's payload. | `test_middleware_disposition.py`, `test_async_partial.py` |
| **INV-4** | The receipt exposes `recommendedDisposition` + `limitations` only — **NO** patch, no deployment instruction, no hidden model reasoning. | `test_middleware_disposition.py`, `test_receipt_shape.py` |
| **INV-5** | `MultimodalObservation` is always `MODEL_DERIVED_VISUAL_OBSERVATION`; it is not automatically a confirmed fact, component, requirement, root cause, or approved implementation. | `test_contracts.py` |

---

## Public Evaluator Roles

1. **`RequirementEvaluator`** (Deterministic):
   - Returns one `RequirementStatus` per requirement: `SATISFIED`, `PARTIALLY_SATISFIED`, `MISSING`, `UNVERIFIED`, `NOT_APPLICABLE`, `BLOCKED`.
   - Never returns `SATISFIED` on missing or unevaluated signal (INV-1).

2. **`GoalEvaluator`** (Deterministic):
   - Evaluates requirement coverage and derives `ACHIEVED`, `PARTIAL`, `NOT_ACHIEVED`, or `UNVERIFIED`.
   - Explicit assertions take precedence via the assertion evaluation layer.

3. **`OutputEvaluator`** (Deterministic):
   - Rubric axes: `completeness`, `correctness`, `contract_compliance`, `evidence_support`, `clarity`, `requested_format`.
   - Grades: `PASS`, `MARGINAL`, `FAIL`, `UNVERIFIED`.

4. **`WorkflowEvaluator`** (Deterministic):
   - Compares an `ExpectedWorkflow` DAG against an `actualWorkflow` step trace.
   - Grades: `HONORED`, `HONORED_WITH_GAPS`, `VIOLATED`, `UNVERIFIED`.
   - A workflow gap is an informational signal — **never** an automatic trigger for refactoring.

---

## Recommended Dispositions

Every evaluation produces an `EvaluationReceipt` with a `recommendedDisposition` belonging to the closed set:
- `READY_FOR_APPROVAL`
- `CORRECTION_REQUIRED`
- `MORE_EVIDENCE_REQUIRED`
- `BLOCKED`
- `CANCELLED`

---

## Multimodal Evidence & Adapters

- **`MultimodalEvidenceAdapter`**: Provider-neutral Python protocol.
- **`DeterministicMultimodalEvidenceAdapter`**: Mandatory, offline adapter for deterministic test suites.
- **`CosmosMultimodalEvidenceAdapter`**: Boundary-only adapter testing unavailability paths (`NOT_INSTALLED`, `HARDWARE_UNSUPPORTED`, `MODEL_UNAVAILABLE`, `CONFIG_REQUIRED`). No live model or GPU runtime is installed.
- **OneShot Adapter**: `evaluation_middleware.oneshot.adapter.build_request_from_capability_snapshot` transforms OneShot capability snapshots into `EvaluationRequest` objects.
