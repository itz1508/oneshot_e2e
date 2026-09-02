# OneShot Production E2E 1.3.0

OneShot is a governed AI engineering workflow that turns user intent into researched, planned, validated, executed, and cryptographically verified work.

**Video:** https://www.youtube.com/watch?v=RQTxYwcNx_0  
**Local UI:** `http://localhost:8787`

---

## Prompt to Agent — Review & Validate OneShot

Copy this single prompt into your coding/repository agent.

<details>
<summary><strong>Copy review and validation prompt</strong></summary>

```text
Perform a complete technical review and validation of the OneShot repository for the evaluator.

Do the work yourself. Do not ask the evaluator to manually install dependencies, launch services, run commands, inspect files, or execute tests unless an external permission or unavailable capability makes that impossible.

Install and run OneShot using the repository's actual supported installation and launch paths.

During the review, open this demonstration video:
https://www.youtube.com/watch?v=RQTxYwcNx_0

Use the video as a visual reference while reviewing the running product and repository.

Inspect and exercise the implementation, tests, validation, workflow, execution, proof, packaging, runtime behavior, and any other technical areas necessary to validate what the repository actually demonstrates.

Run the repository's real tests, validation code, fixture tests, workflow tests, proof checks, packaging checks, and runtime checks that are relevant and available in the environment. Discover the correct commands from the repository instead of asking the evaluator to perform them.

Do not rely on README claims as proof. Use source code, executable behavior, test results, runtime evidence, schemas, fixtures, workflow execution, and generated artifacts as evidence.

Do not modify product behavior merely to make validation succeed. Do not fabricate results, commands, hashes, timings, test counts, workflow state, capabilities, or evidence.

When finished, give the evaluator a concise evidence-backed review that clearly states:
- what you installed and ran
- what you validated
- what evidence supports each finding
- what could not be validated
- any implementation, runtime, test, documentation, or video discrepancies found
- the strongest technically demonstrated capabilities

Do not assign a score, ranking, competition result, judging result, or final judging decision. Leave scoring and judgment entirely to the evaluator or judge.
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
