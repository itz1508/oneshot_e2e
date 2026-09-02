# Google ADK 2.0 Graph Workflow Architecture — Core Invariants

## 1. DAG Authority vs. Prompt Agency
- Workflow topology, routing, and execution order are defined strictly in CODE as a Directed Acyclic Graph (DAG).
- An LLM must NEVER self-direct the workflow stage or self-certify its own outputs.
- Transition from stage A to stage B requires explicit edge resolution or router evaluation.

## 2. Parallel Fan-Out & JoinNode Barriers
- Independent concurrent validations (Schema, Fixture, Goal) must fan out in parallel.
- All parallel branches MUST converge into an `AdkJoinNode` barrier before downstream gate evaluation.
- Gate conditions are deterministic boolean expressions (`all_valid = schema == VALID && fixture == VALID && goal == VALID`).

## 3. Fail-Fast Invariant
- Any validation failure or evaluation failure routes directly to terminal `done` with a structured `ROOT_CAUSE`.
- No infinite recovery or prompt-based re-prompt loops are permitted.

## 4. Cryptographic Proof Invariant
- Package promotion to Builder sandbox requires immutable `confirmed_package.core` canonicalized via RFC 8785 JCS.
- Completion requires `created_hash == recomputed_hash`.

## 5. UI Observability
- The UI must project real-time append-only task telemetry onto the interactive ADK DAG flowchart.
