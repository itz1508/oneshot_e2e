# OneShot — Submission Package

Working checklist for the submission form. Repository:
**https://github.com/itz1508/oneshot_e2e** — public, branch `main`, Apache-2.0.

## 1. Requirement status

| # | Requirement | Status | Where it lives |
| --- | --- | --- | --- |
| 1 | Text description — what, who, how | ✅ Drafted | [§2 below](#2-text-description) and [README](../README.md) |
| 2 | Public URL to code repo | ✅ Live, public | https://github.com/itz1508/oneshot_e2e |
| 3 | Source code, assets, setup instructions | ✅ Complete | `app/`, `backend/`, `scripts/`, `docker/`, `docs/`; setup in [README §Quickstart](../README.md#quickstart); `MANIFEST.sha256` hashes every source file |
| 4 | MIT or Apache license visible in About | ✅ Apache-2.0 | [LICENSE](../LICENSE); the GitHub About sidebar already shows "Apache-2.0 license" |
| 5 | README | ✅ Updated | [README](../README.md) — description, quickstart, tests, docs map, license |
| 6 | Architecture diagram | ✅ Added | [ARCHITECTURE.md](ARCHITECTURE.md) — system, workflow, runtime, contracts, deployment views (Mermaid, renders on GitHub) |
| 7 | Demo video, ≤ 5 minutes | 🟡 Kit ready, final recording pending | Script: [DEMO_VIDEO_SCRIPT.md](DEMO_VIDEO_SCRIPT.md); prior recording: `docs/evidence/video/oneshot-live-processing-demo.mp4` · [YouTube](https://www.youtube.com/watch?v=RQTxYwcNx_0) |

Only human actions remain: record and upload the demo, set the About
description/topics, and push these changes ([§4](#4-pre-submission-checklist)).

## 2. Text description

**What it does.** OneShot is a local-first engineering workspace where an AI
pipeline builds software with a human in command. You describe the work in a
chat; a six-stage agent pipeline — Researcher, Planner, Refactor, Gap
Analysis, Evaluation, Builder — researches, plans, and validates it; two
mandatory human gates (Research Review and Build Ready) keep you in control;
and a cryptographic hash binds exactly what you approved to exactly what gets
executed in a sandbox: the run only succeeds when `HASH == hash_sandbox`. It
runs entirely on your machine: a Next.js UI served by a Node backend, Google
ADK TypeScript orchestration (`SequentialAgent`, `LoopAgent`,
`ParallelAgent`), BullMQ/Redis durable queues with an inline fallback,
deterministic Python validators, and hardened process/container sandboxes.

**Who it's for.** (a) Developers and teams who want autonomous code
generation they can audit and trust, not just watch; (b) teams adopting AI
agents under review or compliance requirements, who must prove after the
fact which artifact was approved and that the built output matches it;
(c) judges, researchers, and practitioners studying human-in-the-loop agent
pipelines end to end.

**How it works.** Fixed canonical workflow: Chat/Intent → Prompt →
Researcher → 🛑 **Research Review** (edit, request more research, or accept)
→ Planner → Refactor → Gap Analysis (LoopAgent fix–recheck loop) →
Evaluation → deterministic Triple Validation (Schema · Fixture · Goal, three
independent lanes) → **CONFIRMED** immutable package → SHA-256 hash over
`confirmed_package.core` → 🛑 **Build Ready** (confirm build or return) →
Builder executes that exact package in a sandbox → post-build check
`HASH == hash_sandbox` → DONE. Validators are deterministic code, never an
LLM grading LLM output; the gates cannot be bypassed by the pipeline
(`wait-build` + `BuildReviewService`); the browser only projects real
backend records — progress, evidence, and hashes are never fabricated.
Sample mode runs the entire workflow with no API keys, so anyone can
reproduce the demo in minutes with `npm run demo`.

## 3. Demo video assets

- Script, shot list, voiceover, and recording checklist:
  [DEMO_VIDEO_SCRIPT.md](DEMO_VIDEO_SCRIPT.md) — target length 4:45.
- Prior recording for reference:
  `docs/evidence/video/oneshot-live-processing-demo.mp4`, also on
  [YouTube](https://www.youtube.com/watch?v=RQTxYwcNx_0).
  [APP_REVIEW.md](APP_REVIEW.md) notes a current-interface replacement is
  pending — record the fresh cut with the script.
- After recording: upload to YouTube (unlisted), add the URL to the
  [README demo section](../README.md#demo-video), and save the file under
  `docs/evidence/video/`.

## 4. Pre-submission checklist

1. ⬜ Record the ≤ 5-minute demo with
   [DEMO_VIDEO_SCRIPT.md](DEMO_VIDEO_SCRIPT.md) (sample mode; no API keys
   needed).
2. ⬜ Upload to YouTube (unlisted) and paste the URL into the submission
   form and the README.
3. ⬜ GitHub → repo **About ⚙**: description "Human-gated, hash-verified
   autonomous build pipeline"; topics such as `ai-agents`, `llm`,
   `human-in-the-loop`, `google-adk`, `bullmq`, `nextjs`. The license chip
   already displays.
4. ⬜ Optional: uncheck **Settings → Template** so judges get a normal
   "Code" page instead of "Use this template".
5. ⬜ Commit and push these documentation changes (after manifest
   regeneration and verification pass):
   ```powershell
   git add README.md docs/ARCHITECTURE.md docs/SUBMISSION.md docs/DEMO_VIDEO_SCRIPT.md MANIFEST.sha256
   git commit -m "docs: add submission package, architecture diagram, and demo script"
   git push origin main
   ```
6. ⬜ Re-open https://github.com/itz1508/oneshot_e2e in a signed-out browser
   and verify: README renders, architecture diagrams render, About shows
   Apache-2.0, and the demo video link plays.

## 5. Evidence pointers for judges

- [APP_REVIEW.md](APP_REVIEW.md) — latest local verification: frontend
  typecheck, 46 web tests, backend + Next.js production build, 147 Node
  tests, and a browser walkthrough reaching both human gates.
- [WEB_APP_REQUIREMENTS_RECONCILIATION.md](WEB_APP_REQUIREMENTS_RECONCILIATION.md)
  — requirement-to-implementation status, including known gaps.
- [CANONICAL_WORKFLOW.md](CANONICAL_WORKFLOW.md) ·
  [WORKFLOW_TREE](WORKFLOW_TREE) · [ARCHITECTURE.md](ARCHITECTURE.md).
- One-command reproduction: `npm run demo` (clean build + launch, sample
  provider) → http://localhost:8787.

