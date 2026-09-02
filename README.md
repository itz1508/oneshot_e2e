# OneShot Production E2E 1.3.0

OneShot is a governed AI engineering workflow that turns user intent into researched, planned, validated, executed, and cryptographically verified work.

**Video:** https://www.youtube.com/watch?v=RQTxYwcNx_0  
**Local UI:** `http://localhost:8787`

---

## Prompt to Agent — Install, Run, Test, Score & Evaluate OneShot

Copy this single workflow prompt into your coding/repository agent. The agent should perform the entire evaluation from installation through final technical score and evidence report.

<details>
<summary><strong>Copy complete OneShot evaluation workflow</strong></summary>

```text
You are performing a complete independent technical evaluation of the OneShot repository.

Your job is to install OneShot, launch the real application, review the demonstration video while evaluating it, run the complete supported test and validation matrix, inspect the implementation, identify actual technical strengths and weaknesses, and produce an evidence-backed technical score and final result.

Do not evaluate OneShot from README claims alone.
Do not invent commands, results, hashes, test counts, timings, workflow state, or capabilities.
Use the repository, executable tests, runtime evidence, schemas, fixtures, graph implementation, and generated proof artifacts as the primary evidence.
Do not modify product behavior merely to make the evaluation pass.
Do not push, publish, tag, or create a release.

EXECUTE THIS WORKFLOW IN ORDER.

STEP 1 — INSPECT THE ENVIRONMENT AND REPOSITORY
- Identify the operating system and current repository state.
- Inspect package.json, pyproject.toml, requirements/, scripts/, tests/, tests_ts/, validation/, schema/, workflow/, backend/graph/, backend/workflow/, Docker/release files, and launch scripts.
- Determine the supported installation path for this environment.
- Check Docker when using the packaged path.
- Check Node.js, Python, and Git only when the selected source path requires them.
- Check required environment configuration and port 8787 availability.

STEP 2 — INSTALL ONESHOT
- Prefer the packaged Docker/ZIP path when the release package is available and appropriate.
- Otherwise use the repository's supported CLI/source installation path.
- Use the actual repository scripts and package definitions.
- If a required dependency or service is unavailable, stop only that affected path and report the exact root cause instead of bypassing it.

Record:
INSTALL_PATH
INSTALL_COMMANDS
INSTALL_RESULT

STEP 3 — OPEN THE DEMONSTRATION VIDEO FOR REVIEW
Open and keep this video available while performing the remaining evaluation:

https://www.youtube.com/watch?v=RQTxYwcNx_0

Use the video as a visual reference for the demonstrated product flow.
Do not treat the video as proof.
As you continue, compare what is shown in the video with the actual running application, implementation, tests, workflow graph, fixtures, schemas, and generated evidence.
Record any material mismatch under the relevant technical section.

STEP 4 — LAUNCH THE REAL APPLICATION
- Use the actual packaged start script or supported source/CLI launcher.
- Wait for the real backend health endpoint.
- Verify `http://localhost:8787`.
- Confirm the frontend is served by the running backend.
- Run the deterministic/sample OneShot job.
- Observe the active Job_id and real workflow execution.
- Confirm the job reaches a legitimate terminal state.
- If successful, confirm the final proof/hash verification is present.
- Determine whether the visible workflow is driven by backend runtime evidence rather than a simulated frontend timer.

Record:
HEALTH_RESULT
SAMPLE_JOB_RESULT
WORKFLOW_RESULT
HASH_VERIFICATION_RESULT

STEP 5 — RUN THE COMPLETE SUPPORTED TEST MATRIX
Run the repository's supported verification commands. At minimum, where supported by the environment, execute:

python scripts/verify_dependencies.py --profile all
python -m unittest discover -s tests -v
npm run verify
npm --prefix web test
python scripts/verify_manifest.py

For every command record:
- exact command
- exit status
- actual test count/result
- important output

Do not substitute expected README values for real execution results.

STEP 6 — RUN THE FULL E2E PROOF
Inspect and execute:
- tests/test_e2e.py
- fixtures/e2e/complete-success.json

Run:
python -m unittest tests.test_e2e -v

Determine whether the E2E proof demonstrates:
- successful evaluation
- Triple Validation success
- confirmed package creation
- hash generation
- hash equality success
- deliberate schema failure
- deliberate goal failure
- meaningful mutation causing hash mismatch

Report implementation and test evidence.

STEP 7 — EVALUATE SCHEMA VALIDATION
Inspect:
- validation/schema_validator.py
- tests/test_schemas.py
- tests/test_parity.py
- schema/

Run:
python -m unittest tests.test_schemas -v
python -m unittest tests.test_parity -v

Determine:
- whether JSON Schema Draft 2020-12 is actually executed
- which artifacts are structurally validated
- whether invalid structures are rejected
- whether schema/runtime parity is tested

STEP 8 — EVALUATE FIXTURE VALIDATION
Inspect:
- validation/fixture_runner.py
- validation/triple_validation.py
- tests/test_fixture.py
- tests/test_fixture_operators.py
- fixtures/e2e/complete-success.json

Run:
python -m unittest tests.test_fixture -v
python -m unittest tests.test_fixture_operators -v

Determine whether fixture assertions are actually executed against the Plan rather than merely stored as descriptive JSON.
List every supported deterministic fixture operator from implementation.
Identify positive and negative evidence.

STEP 9 — EVALUATE TRIPLE VALIDATION
Inspect validation/triple_validation.py and its tests.

Verify independently:
- Schema Validation
- Fixture Validation
- Goal Validation

Confirm `all_valid` becomes true only when all three validator results are `VALID`.
Confirm validator vocabulary is `VALID | NOT_VALID`.

STEP 10 — EVALUATE THE GOOGLE ADK WORKFLOW GRAPH
Inspect:
- backend/graph/
- backend/workflow/
- workflow/
- tests_ts/adk-workflow-graph.test.ts
- installed @google/adk version

Verify executable evidence for:
- explicit routing
- Gap Analysis gaps-found branch
- Gap Fix
- Recheck/back-edge loop
- gap_0 route
- Evaluation PASSED/ROOT_CAUSE branching
- Schema/Fixture/Goal fan-out
- JoinNode fan-in
- validation gate
- Builder route
- hash MATCH/MISMATCH routing

Determine whether Google ADK is the actual workflow execution authority or whether another engine duplicates/replaces it.

STEP 11 — EVALUATE CRYPTOGRAPHIC VERIFICATION
Inspect:
- validation/canonicalize.py
- validation/hash_proof.py
- tests/test_canonicalize.py
- tests/test_e2e.py
- Builder/sandbox proof code

Determine whether:
1. confirmed_package.core is the comparable representation
2. RFC 8785/JCS canonicalization is applied
3. SHA-256 is generated from that representation
4. post-execution verification uses the same comparable representation
5. equality routes to success
6. meaningful mutation causes mismatch

STEP 12 — EVALUATE BUILDER, SANDBOX, SSE, AND PROVIDERS
Inspect the real implementations and tests for:
- Builder handoff
- sandbox admission/execution
- filesystem/process/network/resource isolation where claimed
- HTTP/SSE runtime event streaming
- task/event persistence
- frontend graph event consumption
- deterministic/sample provider
- Google ADK + Gemma provider
- Featherless provider

Classify each capability as:
EXECUTION_VERIFIED
TEST_VERIFIED
IMPLEMENTATION_ONLY
NOT_PROVEN

Do not award credit for documentation-only claims.

STEP 13 — EVALUATE DOCKER AND CLEAN-ROOM RELEASE PROOF
If Docker and the repository's release verification scripts are available:
- run the supported Docker audit
- run the clean-room package verification
- verify the packaged application launches independently of the source workspace

Do not claim Docker or clean-room success unless the checks actually execute successfully.

STEP 14 — IDENTIFY ACTUAL TECHNICAL STRENGTHS
Based only on collected evidence, identify the strongest and most differentiated OneShot capabilities.

For each strength report:
STRENGTH
WHAT IT DOES
WHY IT MATTERS
IMPLEMENTATION EVIDENCE
TEST EVIDENCE
RUNTIME EVIDENCE
NEGATIVE/FAILURE PROOF
CONFIDENCE: HIGH | MEDIUM | LOW

Pay particular attention to whether OneShot genuinely demonstrates combinations such as:
- probabilistic AI work converted into deterministic artifacts
- Researcher-owned validation inputs
- independent Triple Validation
- executable fixture assertions
- explicit graph routing and recheck loops
- immutable confirmation boundary
- RFC 8785 canonical representation
- SHA-256 post-build verification
- positive and negative proof cases
- sandboxed execution
- runtime provenance

STEP 15 — IDENTIFY WEAKNESSES / UNPROVEN CLAIMS
Actively search for:
- documentation-only claims
- mocked behavior presented as production behavior
- tests that only assert constants
- dead/unexecuted paths
- duplicate workflow authorities
- incomplete provider integration
- security claims without executable proof
- stale tests/docs
- validation bypasses
- video behavior that does not match repository evidence

Report exact file/test/runtime evidence.

STEP 16 — SCORE THE REPOSITORY
Produce an evidence-backed technical score from 0 to 100.

This is an independent technical evaluation score, not an official competition score.
Base the score on demonstrated implementation quality and proof strength.

Score these areas:
- End-to-end functionality: 0-20
- Validation rigor: 0-20
- Workflow / Google ADK implementation: 0-15
- Deterministic proof / hash verification: 0-15
- Test quality and negative cases: 0-10
- Runtime / sandbox / provenance: 0-10
- Packaging / reproducibility: 0-5
- Technical differentiation: 0-5

For every category explain exactly why points were awarded or withheld.
Do not award points for unproven documentation claims.

FINAL REQUIRED REPORT
Return these sections:

1. INSTALLATION RESULT
2. VIDEO / RUNTIME CONSISTENCY
3. COMPLETE TEST RESULTS
4. FULL E2E RESULT
5. SCHEMA VALIDATION RESULT
6. FIXTURE VALIDATION RESULT
7. TRIPLE VALIDATION RESULT
8. GOOGLE ADK GRAPH RESULT
9. HASH VERIFICATION RESULT
10. BUILDER / SANDBOX / SSE / PROVIDER RESULT
11. DOCKER / CLEAN-ROOM RESULT
12. STRONGEST VERIFIED CAPABILITIES
13. WEAKNESSES / UNPROVEN CLAIMS
14. TECHNICAL SCORE
15. EVIDENCE INDEX
16. FINAL RESULT

FINAL RESULT must be only:
PASSED
or
ROOT CAUSE

A PASSED result means the major technical claims are supported by implementation and evidence.
A ROOT CAUSE result must identify exactly what prevents those major claims from being technically established.
```

</details>

---

## Sample Workflow

<details>
<summary><strong>Review workflow</strong></summary>

```text
Researcher(Job_id)
   ↓
Planner
   ↓
Refactor
   ↓
Gap Analysis
   ├─ gaps found → Gap Fix → Recheck ↺
   └─ gap_0
        ↓
Evaluation
   ├─ ROOT_CAUSE
   └─ PASSED
        ↓
Schema ─┐
Fixture ├─ JoinNode
Goal ───┘
        ↓
Validation Gate
   ├─ NOT_VALID → ROOT CAUSE
   └─ VALID
        ↓
Confirmed
   ↓
Builder
   ↓
Hash Verification
   ├─ MATCH → DONE
   └─ MISMATCH → ROOT CAUSE
```

</details>

---

## License

See [LICENSE](LICENSE) and [NOTICE](NOTICE).
