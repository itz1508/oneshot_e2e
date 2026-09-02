# OneShot Production E2E 1.3.0

OneShot is a governed AI engineering workflow that turns user intent into researched, planned, validated, executed, and cryptographically verified work.

**Video:** https://www.youtube.com/watch?v=RQTxYwcNx_0  
**Local UI:** `http://localhost:8787`

---

## Prompt to Agent — Workflow Skill 1: Install & Run OneShot

Copy this workflow skill into your coding/repository agent.

<details>
<summary><strong>Copy installation workflow skill</strong> · Install, launch, and run the sample</summary>

```text
You are executing the OneShot installation workflow skill.

Work from the repository itself. Inspect the current files and environment before taking action. Do not invent commands or rely on stale documentation when the repository provides the actual launcher, package, or scripts.

EXECUTE THIS WORKFLOW IN ORDER.

STEP 1 — INSPECT ENVIRONMENT
- Identify the operating system.
- Inspect the repository and supported installation paths.
- Check Docker when using the packaged path.
- Check Node.js, Python, and Git only when the selected source path requires them.
- Check required environment configuration.
- Check port 8787 availability.

STEP 2 — INSTALL
- Prefer the packaged Docker/ZIP path when the release package is available and appropriate.
- Otherwise use the repository's supported CLI/source installation path.
- Do not change application source code merely to make installation succeed.
- Do not push, publish, tag, or create a release.
- If a required dependency or service is unavailable, stop and report the exact root cause instead of bypassing it.

STEP 3 — LAUNCH
- Use the repository's real launch path, such as the packaged start script or supported CLI/source launcher.
- Wait for the real backend health endpoint.
- Verify `http://localhost:8787` is available.
- Confirm the frontend is served by the running backend.

STEP 4 — RUN SAMPLE
- Run the deterministic/sample OneShot job.
- Observe the real workflow execution for the active Job_id.
- Confirm the job reaches its legitimate terminal result.
- If successful, confirm the final proof/hash verification is present.

DO NOT fabricate timings, hashes, test counts, health results, or workflow status.

RETURN
INSTALL_PATH
COMMANDS_RUN
HEALTH_RESULT
SAMPLE_JOB_RESULT
WORKFLOW_RESULT
HASH_VERIFICATION_RESULT
FINAL_RESULT: PASSED | ROOT CAUSE
```

</details>

---

## Prompt to Agent — Workflow Skill 2: Technical Evaluation & Validation

Copy this workflow skill into your coding/repository agent after installation.

<details>
<summary><strong>Copy evaluation workflow skill</strong> · Video review, launch verification, tests, validation, graph, and proof</summary>

```text
You are executing the OneShot technical evaluation workflow skill after installation.

Do not evaluate OneShot from README claims. Inspect and execute the actual implementation, tests, schemas, fixtures, workflow graph, runtime evidence, and verification scripts.

EXECUTE THIS WORKFLOW IN ORDER.

STEP 1 — CONFIRM INSTALLED STATE
- Confirm the repository/install from Workflow Skill 1 is available.
- Inspect package.json, pyproject.toml, requirements/, tests/, tests_ts/, validation/, schema/, workflow/, backend/graph/, backend/workflow/, and the verification scripts.
- Do not modify product behavior to make evaluation pass.

STEP 2 — OPEN THE VIDEO FOR REVIEW
Open and keep the OneShot demonstration video available while you perform the remaining evaluation steps:

https://www.youtube.com/watch?v=RQTxYwcNx_0

Use the video only as a visual reference for the product flow being evaluated. Do not treat it as proof. While executing each later step, compare the demonstrated behavior with the real application, source code, tests, graph, fixtures, schemas, and generated evidence. Record any material difference under the relevant evaluation result.

STEP 3 — CONFIRM / LAUNCH THE REAL APPLICATION
- If OneShot is already running from Workflow Skill 1, verify its current health instead of starting a duplicate instance.
- Otherwise launch it through the repository's supported path.
- Verify the backend health endpoint.
- Verify `http://localhost:8787`.
- Run or observe a deterministic/sample Job_id.
- Confirm the live workflow is driven by backend execution evidence rather than a simulated frontend timer.

STEP 4 — RUN THE COMPLETE TEST MATRIX
Run the repository's supported verification commands. At minimum, where supported by the environment, execute:

python scripts/verify_dependencies.py --profile all
python -m unittest discover -s tests -v
npm run verify
npm --prefix web test
python scripts/verify_manifest.py

Record the real command, exit status, test count, and important output. Do not substitute expected README values for execution results.

STEP 5 — RUN THE FULL E2E PROOF
Inspect and run:
- tests/test_e2e.py
- fixtures/e2e/complete-success.json

Command:
python -m unittest tests.test_e2e -v

Determine whether the test proves the successful confirmation/hash-equality path and deliberate negative mutation/failure cases.

STEP 6 — RUN SCHEMA VALIDATION
Inspect:
- validation/schema_validator.py
- tests/test_schemas.py
- tests/test_parity.py
- schema/

Run:
python -m unittest tests.test_schemas -v
python -m unittest tests.test_parity -v

Report exactly which artifacts are structurally validated and whether invalid structures are rejected.

STEP 7 — RUN FIXTURE VALIDATION
Inspect:
- validation/fixture_runner.py
- validation/triple_validation.py
- tests/test_fixture.py
- tests/test_fixture_operators.py
- fixtures/e2e/complete-success.json

Run:
python -m unittest tests.test_fixture -v
python -m unittest tests.test_fixture_operators -v

Prove whether fixture assertions are actually executed against the Plan rather than merely stored as descriptive JSON. List the supported deterministic fixture operators from implementation and identify positive and negative evidence.

STEP 8 — RUN TRIPLE VALIDATION
Inspect validation/triple_validation.py and its tests.

Verify independently:
- Schema Validation
- Fixture Validation
- Goal Validation

Confirm `all_valid` becomes true only when all three validator results are `VALID`.

STEP 9 — EVALUATE THE GOOGLE ADK WORKFLOW GRAPH
Inspect:
- backend/graph/
- backend/workflow/
- workflow/
- tests_ts/adk-workflow-graph.test.ts
- installed @google/adk version

Verify executable evidence for:
- explicit routing
- Gap Analysis fix/recheck loop
- Evaluation branching
- Schema/Fixture/Goal fan-out
- JoinNode fan-in
- validation gate
- Builder route
- hash MATCH/MISMATCH routing

Determine whether Google ADK is the actual workflow execution authority or whether another engine duplicates/replaces it.

STEP 10 — EVALUATE HASH PROOF
Inspect:
- validation/canonicalize.py
- validation/hash_proof.py
- tests/test_canonicalize.py
- tests/test_e2e.py

Determine whether the confirmed comparable core is canonicalized using RFC 8785/JCS, hashed with SHA-256, verified against the same comparable representation after execution, and whether meaningful mutation causes mismatch.

STEP 11 — EVALUATE DOCKER / CLEAN ROOM
If Docker and the repository's release verification scripts are available, run the supported Docker audit and clean-room package verification. Do not claim these passed unless they actually execute successfully.

STEP 12 — DETERMINE ACTUAL STRENGTHS AND WEAKNESSES
For every claimed strength provide:
- implementation evidence
- test evidence
- runtime evidence when available
- negative/failure evidence when available
- confidence

Actively identify:
- documentation-only claims
- mocked or unexecuted behavior
- duplicate workflow authorities
- stale tests/docs
- validation bypasses
- security claims without executable proof
- video behavior that does not match repository evidence

RETURN
1. INSTALL / RUNTIME CONFIRMATION
2. COMPLETE TEST RESULTS
3. FULL E2E RESULT
4. SCHEMA VALIDATION RESULT
5. FIXTURE VALIDATION RESULT
6. TRIPLE VALIDATION RESULT
7. GOOGLE ADK GRAPH RESULT
8. HASH VERIFICATION RESULT
9. DOCKER / CLEAN-ROOM RESULT
10. STRONGEST VERIFIED CAPABILITIES
11. UNPROVEN CLAIMS
12. EVIDENCE INDEX
13. FINAL_RESULT: PASSED | ROOT CAUSE
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
