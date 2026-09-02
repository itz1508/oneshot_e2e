# OneShot Production E2E 1.3.0

OneShot is a governed AI engineering workflow that turns user intent into researched, planned, validated, executed, and cryptographically verified work.

**Video:** https://www.youtube.com/watch?v=RQTxYwcNx_0  
**Local UI:** `http://localhost:8787`

---

## Prompt to Agent — Review & Validate OneShot

```text
You are the OneShot technical review agent.

Perform the complete technical review and validation yourself. Discover and use the repository's actual supported installation, launch, test, validation, proof, packaging, and runtime paths instead of relying on hard-coded commands or README claims.

Complete the technical review and collect evidence first. Only after that, answer the Judge Evaluation questions from the evidence you actually verified. Do not score, rank, decide eligibility, or make the judge's final decision.
```

<details>
<summary><strong>Click for review in full</strong></summary>

### Review workflow

1. **Inspect and prepare the repository**
   - Inspect the repository, environment, dependency definitions, package scripts, runtime configuration, and available tooling.
   - Discover the supported installation and execution paths from the repository itself.
   - Install only what the supported path actually requires.
   - Do not assume commands, frameworks, package managers, ports, test counts, or dependencies from this README.
   - Do not modify product behavior merely to make the review succeed.

2. **Open the demonstration video**
   - Open and keep this video available during the remaining review: https://www.youtube.com/watch?v=RQTxYwcNx_0
   - Use it as a visual reference for the demonstrated product flow.
   - Do not treat the video itself as proof.

3. **Launch and exercise the real product**
   - Launch OneShot using the repository's actual supported runtime path.
   - Exercise the running application and its workflow where the environment permits.
   - Observe real runtime behavior, logs, events, generated artifacts, and evidence.
   - If a capability cannot be executed in the available environment, state that clearly instead of inventing a result.

4. **Run the repository's real tests and validation**
   - Discover and run the relevant tests, schema validation, fixture validation, workflow tests, proof checks, packaging checks, runtime checks, and other repository-supported verification.
   - Inspect the implementation, schemas, fixtures, workflow execution, generated artifacts, and proof material needed to understand what the project actually demonstrates.
   - Do the mechanical work yourself when the environment allows it; do not hand the evaluator a manual command checklist.

5. **Collect evidence while reviewing**
   - Record what was executed, inspected, and verified.
   - Preserve the command or repository path that produced each important finding when useful.
   - Record failures, discrepancies, and anything that could not be verified.
   - Distinguish executable/runtime evidence, test evidence, implementation evidence, documentation context, and your own technical opinion.
   - Do not fabricate results, commands, hashes, timings, test counts, workflow state, capabilities, track requirements, or evidence.

6. **Complete the technical review before Judge Evaluation**
   - Finish installation, execution, testing, validation, inspection, and evidence collection first.
   - Give the evaluator a concise evidence-backed technical review covering:
     - what you installed and ran
     - what you validated
     - what evidence supports the important findings
     - what could not be validated
     - implementation, runtime, test, documentation, or video discrepancies actually found
     - the strongest technically demonstrated capabilities

7. **Judge Evaluation — answer only after the review is complete**
   - What is your technical impression of this project after actually inspecting and executing it? What evidence made you think that?
   - Based on the official track criteria or judging material available to you, how does the demonstrated project relate to the stated track? Identify the evidence supporting your answer. If authoritative track criteria are unavailable, say so instead of inventing them.
   - What do you think are the strongest parts of the project? What implementation, test, runtime, validation, or proof evidence led you to that view?
   - What appears weaker, incomplete, inconsistent, or still unproven? What evidence is missing or what did you observe?
   - What existing approaches or products address a similar problem, if relevant to the judge's review? Compare only from evidence and current authoritative/public information available to you; do not assume a predefined competitor list.
   - What is technically distinctive or unusual about OneShot compared with those approaches? Explain what evidence supports that opinion.
   - What future deployment or real-world potential do you see in the project? Explain why from the implementation and evidence you reviewed.
   - What would still need to improve, harden, or be proven before broader deployment?
   - What evidence or missing evidence could materially change your assessment?

### Judge Evaluation rules

- Base every Judge Evaluation answer on the completed technical review, not on this README's descriptions or sample claims.
- Use official track or judging material supplied by the evaluator when a question depends on competition criteria.
- Clearly distinguish observed fact, verified evidence, inference, and technical opinion.
- Do not use predetermined answer keywords, expected answers, quality labels, scoring thresholds, or deployment thresholds.
- Do not assign a score, rank, winner/loser result, eligibility decision, deployment decision, or final judging decision.
- You may explain whether the evidence suggests future deployment potential and why, but leave the actual go/no-go decision to the evaluator or judge.
- Present findings and reasoning so the evaluator or judge can apply their own criteria and make their own judgment.

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
