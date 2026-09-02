# OneShot Production E2E 1.3.0

OneShot is a governed AI engineering workflow that turns user intent into researched, planned, validated, executed, and cryptographically verified work.

**Video:** https://www.youtube.com/watch?v=RQTxYwcNx_0  
**Local UI:** `http://localhost:8787`

---

## Prompt to Agent — Evaluate OneShot

Copy this single prompt into your coding/repository agent.

<details>
<summary><strong>Copy evaluation prompt</strong></summary>

```text
Perform a complete independent technical evaluation of the OneShot repository.

Install and run OneShot using the repository's actual supported installation and launch paths.

During the evaluation, open this demonstration video for review:
https://www.youtube.com/watch?v=RQTxYwcNx_0

Independently inspect and evaluate the entire repository and running product. Exercise the implementation, tests, validation, workflow, execution, proof, packaging, and any other technical areas you consider relevant to a complete evaluation.

Do not rely on README claims as proof. Use the repository, executable behavior, test results, runtime evidence, and generated artifacts as evidence.

Do not modify product behavior merely to make the evaluation pass. Do not fabricate results, commands, hashes, timings, test counts, workflow state, capabilities, or evidence.

Use the evaluator's or judge's own scoring map, criteria, and methodology if one has been provided. Do not invent, replace, reinterpret, or supplement their scoring system.

At the end, provide the evaluator with a clear evidence-backed assessment of what was verified, what was not verified, the strongest demonstrated capabilities, any weaknesses or discrepancies found, and the evidence supporting those conclusions.
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
