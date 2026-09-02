# OneShot Production E2E 1.3.0

OneShot is a governed AI engineering workflow that turns user intent into researched, planned, validated, executed, and cryptographically verified work.

**Repository:** https://github.com/itz1508/oneshot_e2e  
**Video:** https://www.youtube.com/watch?v=RQTxYwcNx_0  
**Local UI:** `http://localhost:8787`

---

## Prompt to Agent

**This is the only prompt the evaluator needs to use. While viewing this GitHub repository, copy the complete prompt below and paste it into a repository-capable agent. The agent obtains/imports the project, runs the review flow, performs the technical work, and returns the final report.**

```text
You are the OneShot technical review agent.

PHASE 1 — IMPORT ONESHOT
- Source: https://github.com/itz1508/oneshot_e2e
- Obtain the project from GitHub yourself.
- If your environment supports opening or importing a GitHub repository directly, import the repository from the URL above.
- Otherwise, download the GitHub repository ZIP, extract it, and open the extracted OneShot folder as your working repository.
- Cloning the repository is also acceptable when your environment supports Git.
- Work from the project root containing `package.json` and `readme.ts`.

PHASE 2 — PREPARE
- Inspect the repository's actual dependency and runtime definitions.
- Install the dependencies required by the repository-supported path if they are not already available.
- Keep the acquired source unchanged except for normal generated build/runtime output required to execute the review.

PHASE 3 — RUN THE TWO-PROMPT REVIEW FLOW
- From the OneShot project root, run `npm run agent:review`.
- Read Prompt 1 completely.
- Allow the automatic 3-second transition.
- Read and follow Prompt 2.

PHASE 4 — COMPLETE THE TECHNICAL REVIEW
- Perform the full repository and runtime review yourself.
- Run the relevant tests and validation.
- Exercise the product where the environment permits.
- Inspect implementation and proof evidence.
- Collect evidence throughout the review.
- Complete Judge Evaluation after the technical review.

PHASE 5 — RETURN THE REPORT
- Continue through the entire workflow without requiring another start prompt.
- When complete, return the complete evidence-backed technical review results and Judge Evaluation report.
```

<details>
<summary><strong>Click for review flow in full</strong></summary>

### Evaluator flow

- Open the OneShot GitHub repository page.
- Copy the **Prompt to Agent** above.
- Paste it into a repository-capable agent.
- The agent handles repository import/acquisition, preparation, execution, validation, evidence collection, and reporting.

### Agent flow

- **Import / acquire OneShot**
  - Import the GitHub repository directly when supported, or download and extract the GitHub ZIP.
  - Git clone is an equivalent acquisition method when available.
  - Open the project root containing `package.json` and `readme.ts`.

- **Prompt 1 — Agent Review Instruction**
  - Run `npm run agent:review`.
  - Prompt 1 defines the technical-review responsibility and evidence areas.
  - Prompt 1 remains visible in the output.

- **Automatic transition — 3 seconds**
  - Same `readme.ts` process.
  - No screen clear, restart, second command, or manual continue step.

- **Prompt 2 — Start Review**
  - Prompt 2 starts the complete technical review.
  - The agent performs the work itself from beginning to end.
  - The technical review completes before Judge Evaluation.
  - The agent returns one complete evidence-backed report.

```text
Evaluator opens GitHub repository
            ↓
Copies the one Prompt to Agent
            ↓
Agent imports / downloads + extracts / clones OneShot
            ↓
Agent opens OneShot project root
            ↓
Agent prepares required dependencies
            ↓
    npm run agent:review
            ↓
Prompt 1 — Agent Review Instruction
            ↓
        wait 3s
            ↓
Prompt 2 — Start Review
            ↓
Repository / runtime review
            ↓
Tests + validation + evidence
            ↓
Judge Evaluation
            ↓
Complete results / report
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
