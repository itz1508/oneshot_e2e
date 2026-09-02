# OneShot E2E 1.3.0

OneShot is a governed AI engineering workflow for turning user intent into research, planning, deterministic validation, sandboxed execution, and hash-verified workflow evidence.

**Repository:** https://github.com/itz1508/oneshot_e2e  
**Download Source ZIP:** https://github.com/itz1508/oneshot_e2e/archive/refs/heads/main.zip  
**Judge View / Demo Video:** https://www.youtube.com/watch?v=RQTxYwcNx_0  
**Local UI:** `http://localhost:8787`

---

## For Evaluators — One Prompt Only

**This is the only prompt the evaluator needs to use.**

1. Copy the complete **Prompt to Agent** below.
2. Paste it into a repository-capable agent.
3. The agent acquires OneShot, prepares the environment, runs `readme.ts`, performs the complete technical review and validation, and returns one evidence-backed report.
4. No second start prompt is required from the evaluator.

While the agent is working, the evaluator can watch the **Judge View / Demo Video** above to see the demonstrated OneShot experience. The video is orientation/reference material; the technical report is based on repository and runtime evidence gathered by the agent.

---

## Prompt to Agent

```text
You are the OneShot technical review agent.

Your task is to acquire OneShot, run its complete technical review workflow, collect evidence, complete Judge Evaluation from that evidence, and return one final report.

PHASE 1 — ACQUIRE ONESHOT
- Source repository: https://github.com/itz1508/oneshot_e2e
- Source ZIP: https://github.com/itz1508/oneshot_e2e/archive/refs/heads/main.zip
- Acquire the project yourself using the method supported by your environment:
  - open/import the GitHub repository directly, or
  - git clone the repository, or
  - download the Source ZIP, extract it, and open the extracted folder.
- Work from the OneShot project root containing `package.json` and `readme.ts`.

PHASE 2 — PREPARE THE ENVIRONMENT
- Inspect `package.json`, the lockfile, runtime configuration, dependency definitions, and repository-supported scripts.
- Install only the dependencies required by the repository-supported execution path.
- Verify that the project root and review entrypoint are available.
- Keep product source unchanged except for normal generated build, test, runtime, cache, or evidence output required by the review.
- Continue automatically to Phase 3 when preparation is complete.

PHASE 3 — RUN `readme.ts`
- Run the OneShot review entrypoint through the repository-supported command:
  `npm run agent:review`
- `readme.ts` displays Prompt 1 first.
- Read Prompt 1 completely.
- Keep the same process running during the automatic 3-second transition.
- Read Prompt 2 when it appears and follow it completely.
- Do not require another start message from the evaluator.

PHASE 4 — COMPLETE THE TECHNICAL REVIEW
- Perform the repository and runtime review yourself.
- Discover and use the repository's actual supported build, launch, test, validation, proof, packaging, and runtime paths.
- Launch and exercise the product where the environment permits.
- Run the relevant tests and deterministic validation.
- Inspect implementation, workflow behavior, schemas, fixtures, generated artifacts, execution evidence, and cryptographic proof material needed to understand what the project actually demonstrates.
- Record the commands or repository paths used for important findings where useful.
- Record failures, discrepancies, and anything that could not be verified.
- For material capability claims, classify the evidence precisely:
  - EXECUTED — directly exercised during this review.
  - TESTED — demonstrated by tests that you actually executed.
  - IMPLEMENTED — present in source but not exercised during this review.
  - DOCUMENTED — described in documentation, diagrams, or video only.
  - UNVERIFIED — available evidence is insufficient to establish the claim.
- Do not infer runtime behavior from documentation, diagrams, intended architecture, or the demonstration video.
- Report discrepancies between claims, implementation, tests, and runtime behavior.
- Use the Judge View / Demo Video only as visual context, not as technical proof.
- After the technical review is complete, answer the Judge Evaluation questions displayed by `readme.ts` from the evidence you collected.

PHASE 5 — RETURN ONE COMPLETE REPORT
Return one final evidence-backed report containing:
- what you acquired, prepared, executed, inspected, and validated;
- build, runtime, test, validation, workflow, and proof results that were actually observed;
- commands or repository paths supporting important findings where useful;
- failures, discrepancies, incomplete areas, and anything that could not be verified;
- the strongest technically demonstrated capabilities;
- the Judge Evaluation questions and evidence-backed answers;
- any review/evidence artifacts actually generated during execution, with their paths when available.

Continue through all phases automatically unless the environment itself requires an external permission or capability that you cannot provide. Return the report only after the complete review workflow is finished.
```

---

## Evaluator Flow

```text
Open OneShot GitHub repository
        ↓
Copy the one Prompt to Agent
        ↓
Paste it into a repository-capable agent
        ↓
Agent acquires/imports/clones/downloads OneShot
        ↓
Agent prepares required dependencies
        ↓
Agent runs readme.ts
(`npm run agent:review`)
        ↓
Prompt 1 — Agent Review Instruction
        ↓
Automatic 3-second transition
        ↓
Prompt 2 — Start Review
        ↓
Full repository + runtime review
        ↓
Tests + validation + evidence collection
        ↓
Judge Evaluation
        ↓
One complete evidence-backed report
```

### While the agent runs

The evaluator can use the waiting time to watch the **Judge View / Demo Video**:

https://www.youtube.com/watch?v=RQTxYwcNx_0

The evaluator does not need to manually repeat the agent's installation, test, validation, or evidence-collection work.

---

## Package / Acquisition Paths

- **GitHub repository:** use `https://github.com/itz1508/oneshot_e2e` for direct import or Git clone.
- **Source ZIP:** use the direct Source ZIP link at the top of this README.
- **Docker:** the repository contains a `Dockerfile` for building OneShot locally from source.
- **GitHub Release package:** not published yet.
- **Public npm package:** not published.

---

## OneShot Workflow

The backend implementation composes the canonical workflow with the official Google ADK TypeScript workflow agents. Runtime/test status must still be determined from executed evidence rather than this diagram alone.

```text
OneShotCanonicalWorkflow — SequentialAgent
        ↓
Researcher(Job_id)
        ↓
Planner
        ↓
Refactor
        ↓
Gap Analysis — LoopAgent
   ├─ Gap Check
   ├─ gaps found → Gap Fix → Gap Recheck ↺
   └─ gap_0 → continue
        ↓
Evaluation
   ├─ ROOT_CAUSE → Done
   └─ PASSED
        ↓
Triple Validation Admission
        ↓
Triple Validation — ParallelAgent
   ├─ Schema Validation
   ├─ Fixture Validation
   └─ Goal Validation
        ↓
Triple Validation Gate
   ├─ any NOT_VALID → ROOT_CAUSE
   └─ all VALID
        ↓
Confirmed immutable core
        ↓
Create H1
        ↓
Builder / Sandbox Execution
   ├─ execution evidence
   └─ hash_sandbox = H2 from the same confirmed core
        ↓
Hash Verification
   ├─ H1 != H2 → ROOT_CAUSE
   └─ H1 == H2 → DONE
```

`H1 == H2` is the immutable confirmed-core handoff integrity check. Builder execution success is established separately by sandbox execution evidence such as command results, exit codes, file-change evidence, resource evidence, timeout evidence, and cleanup evidence.

---

## License

OneShot-owned source is pre-release software provided under the [OneShot Evaluator License](LICENSE) solely for evaluation, judging, technical review, testing, verification, and demonstration. It is not licensed for continuing development, retained personal or internal use, redistribution, resale, production use, or commercial use without prior written authorization.

Third-party software remains governed by its own upstream licenses. Google ADK is licensed separately under Apache License 2.0; see [NOTICE](NOTICE) and [THIRD_PARTY_LICENSES/Google-ADK-Apache-2.0.txt](THIRD_PARTY_LICENSES/Google-ADK-Apache-2.0.txt). The Google ADK license does not license OneShot-owned material under Apache-2.0.
