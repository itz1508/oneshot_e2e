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

Complete the installation, execution, review, validation, and evidence collection first.

When that work is complete, give the evaluator a concise evidence-backed review that clearly states:
- what you installed and ran
- what you validated
- what evidence supports each finding
- what could not be validated
- any implementation, runtime, test, documentation, or video discrepancies found
- the strongest technically demonstrated capabilities

ONLY AFTER the complete review and validation above is finished, answer these follow-up questions for the judge's review:

1. What is your technical impression of this project after actually inspecting and executing it? What evidence made you think that?

2. Based on the official track criteria or judging materials available to you, how does the project relate to the stated track? Explain which demonstrated capabilities support your answer. If authoritative track criteria are not available, say that clearly. Do not invent track requirements and do not decide eligibility for the judge.

3. What do you think are the strongest parts of the project? Point to the implementation, tests, runtime behavior, validation evidence, or proof artifacts that led you to that view.

4. What appears weaker, incomplete, inconsistent, or still unproven? What evidence is missing or what did you observe?

5. From a technical perspective, what future deployment or real-world potential do you see in the project? Explain why based on the implementation and evidence you reviewed. Distinguish current readiness from future potential.

6. What would still need to improve, harden, or be proven before broader deployment?

7. Is anything technically distinctive or unusual about the project compared with what you normally see? Explain exactly what made you reach that conclusion.

For these follow-up answers:
- Base your answers on the completed review and validation evidence, not on this README's descriptions alone.
- Use official track/judging material supplied by the evaluator when a question depends on competition criteria.
- Clearly distinguish observed fact, test/runtime evidence, and your own technical opinion.
- Explain what evidence or missing evidence could change your opinion.
- Do not assign a score, ranking, competition result, winner/loser decision, eligibility decision, or final judging decision.
- Present your findings and opinions so the evaluator or judge can make their own judgment.
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
