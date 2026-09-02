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

Do not modify product behavior merely to make validation succeed. Do not fabricate results, commands, hashes, timings, test counts, workflow state, capabilities, track requirements, or evidence.

When finished, give the evaluator a concise evidence-backed review that clearly states:
- what you installed and ran
- what you validated
- what evidence supports each finding
- what could not be validated
- any implementation, runtime, test, documentation, or video discrepancies found
- the strongest technically demonstrated capabilities

Then provide your independent technical assessment of the project:
- What do you think of the project after inspecting and executing it?
- Does the demonstrated project appear to meet the stated competition track? Use the actual track requirements or judging materials available to you. If authoritative track criteria are not available, say that track fit cannot be determined instead of inventing criteria.
- Does the project appear worth continuing toward future deployment or real-world use? Explain why or why not.
- Distinguish current production readiness from future potential.
- For every conclusion, state exactly what repository, runtime, test, validation, or other evidence made you reach that conclusion.
- Identify the main evidence or missing evidence that could change your assessment.

Do not assign a score, ranking, competition result, judging result, winner/loser decision, or final judging decision. Leave scoring and judgment entirely to the evaluator or judge.
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
