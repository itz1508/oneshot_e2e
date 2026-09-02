# OneShot Production E2E 1.3.0

OneShot is a governed AI engineering workflow that turns user intent into researched, planned, validated, executed, and cryptographically verified work.

**Video:** https://www.youtube.com/watch?v=RQTxYwcNx_0  
**Local UI:** `http://localhost:8787`

---

## Prompt to Agent — Install & Run OneShot

Copy this prompt into your coding/repository agent.

<details>
<summary><strong>Copy installation prompt</strong> · Install, launch, and run the sample</summary>

```text
You are installing and launching the OneShot repository.

Work from the repository itself. Inspect the current files and environment before taking action. Do not invent commands or rely on stale README instructions when the repository provides the actual launcher or package scripts.

GOAL
Install OneShot, launch the real application, verify health, and run the deterministic sample flow successfully.

REQUIREMENTS
1. Inspect the repository and determine the supported installation path for this environment.
2. Prefer the packaged Docker/ZIP path when the release package is available and appropriate.
3. Otherwise use the repository's supported CLI/source installation path.
4. Do not change application source code merely to make installation succeed.
5. Do not push, publish, tag, or create a release.
6. If a required dependency or service is unavailable, report the exact root cause instead of bypassing it.

INSTALLATION CHECKS
- operating system
- Docker availability when using the packaged path
- Node.js/Python/Git only when the selected source path requires them
- required environment configuration
- port 8787 availability

LAUNCH
Use the repository's real launch path, such as the packaged start script or the supported OneShot CLI/source launcher.

VERIFY
1. Wait for the real backend health endpoint.
2. Verify `http://localhost:8787` is available.
3. Confirm the frontend is served by the running backend.
4. Run the deterministic/sample OneShot job.
5. Observe the real workflow execution for the Job_id.
6. Confirm the job reaches its legitimate terminal result.
7. If successful, confirm the final proof/hash verification is present.

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

## Prompt to Agent — Run Full Test & Validation

Copy this prompt into your coding/repository agent after installation.

<details>
<summary><strong>Copy test prompt</strong> · Full E2E, validation, fixture, graph, and proof checks</summary>

```text
You are performing an independent technical evaluation of the OneShot repository after installation.

VIDEO REVIEW
Before beginning the technical evaluation, open the OneShot demonstration video for judge review and keep it available while you inspect and execute the repository:

https://www.youtube.com/watch?v=RQTxYwcNx_0

Use the video as a visual reference for the demonstrated product flow. Do not treat the video as proof. Compare what is demonstrated in the video with the actual implementation, tests, runtime behavior, schemas, fixtures, workflow graph, and generated evidence. Report any material difference between the demonstration and the repository evidence.

Do not evaluate the project from README claims. Inspect the actual implementation, tests, schemas, fixtures, workflow graph, runtime evidence, and verification scripts. Run the real commands available in the repository.

GOAL
Execute the complete supported verification matrix and identify what OneShot actually proves.

FIRST
Inspect:
- package.json
- pyproject.toml
- requirements/
- scripts/verify_dependencies.py
- scripts/verify_manifest.py
- tests/
- tests_ts/
- validation/
- schema/
- workflow/
- backend/graph/
- backend/workflow/

RUN THE COMPLETE SUPPORTED TEST MATRIX
At minimum, where supported by the repository/environment, execute:

python scripts/verify_dependencies.py --profile all
python -m unittest discover -s tests -v
npm run verify
npm --prefix web test
python scripts/verify_manifest.py

Also run the focused proof tests below.

FULL E2E SAMPLE
Inspect and run:
- tests/test_e2e.py
- fixtures/e2e/complete-success.json

Command:
python -m unittest tests.test_e2e -v

Determine whether the test proves the successful confirmation/hash-equality path and negative mutation/failure cases.

SCHEMA VALIDATION
Inspect:
- validation/schema_validator.py
- tests/test_schemas.py
- tests/test_parity.py
- schema/

Run:
python -m unittest tests.test_schemas -v
python -m unittest tests.test_parity -v

Report exactly which artifacts are structurally validated and whether invalid structures are rejected.

FIXTURE VALIDATION
Inspect:
- validation/fixture_runner.py
- validation/triple_validation.py
- tests/test_fixture.py
- tests/test_fixture_operators.py
- fixtures/e2e/complete-success.json

Run:
python -m unittest tests.test_fixture -v
python -m unittest tests.test_fixture_operators -v

Prove whether fixture assertions are actually executed against the Plan, not merely stored as descriptive JSON. List the supported deterministic fixture operators from implementation.

TRIPLE VALIDATION
Inspect validation/triple_validation.py and its tests.

Verify independently:
- Schema Validation
- Fixture Validation
- Goal Validation

Confirm `all_valid` becomes true only when all three validator results are `VALID`.

GOOGLE ADK WORKFLOW GRAPH
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

HASH PROOF
Inspect:
- validation/canonicalize.py
- validation/hash_proof.py
- tests/test_canonicalize.py
- tests/test_e2e.py

Determine whether the confirmed comparable core is canonicalized using RFC 8785/JCS, hashed with SHA-256, verified against the same comparable representation after execution, and whether meaningful mutation causes mismatch.

DOCKER / CLEAN ROOM
If Docker and the repository's release verification scripts are available, run the supported Docker audit and clean-room package verification. Do not claim these passed unless they actually execute successfully.

EVALUATION RULE
For every claimed strength, provide:
- implementation evidence
- test evidence
- runtime evidence when available
- negative/failure evidence when available
- confidence

Actively identify documentation-only or unproven claims.

RETURN
1. VIDEO / REPOSITORY CONSISTENCY
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
