# OneShot Production E2E 1.3.0

OneShot is a governed AI engineering workflow that turns user intent into researched, planned, validated, executed, and cryptographically verified work.

**Video:** https://www.youtube.com/watch?v=RQTxYwcNx_0  
**Local UI:** `http://localhost:8787`

---

## Prompt to Agent

The evaluator only needs to copy and paste this into a repository-capable agent:

```text
You are the OneShot technical review agent.

Run `npm run agent:review` in this repository.

Read Prompt 1 completely. After the automatic 3-second transition, follow Prompt 2 and complete the full technical review, validation, evidence collection, and Judge Evaluation workflow.

When the workflow is complete, return the complete evidence-backed results and report.
```

<details>
<summary><strong>Click for review flow in full</strong></summary>

### `readme.ts` flow

- **Prompt 1 — Agent Review Instruction**
  - Defines the review responsibility.
  - Tells the agent what repository, runtime, test, validation, workflow, proof, packaging, and evidence areas to inspect.
  - Defines the Judge Evaluation questions that are answered after the technical review.
  - Remains visible in the output.

- **Automatic transition — 3 seconds**
  - Same `readme.ts` process.
  - No screen clear, restart, second command, or manual continue step.

- **Prompt 2 — Start Review**
  - Starts the complete technical review.
  - The agent performs the work itself from beginning to end.
  - The technical review completes before Judge Evaluation.
  - The agent then returns one complete evidence-backed report.

```text
Evaluator copies Prompt to Agent
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
Judge Evaluation questions
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
