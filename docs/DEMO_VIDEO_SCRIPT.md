# OneShot — Demo Video Kit (≤ 5 minutes)

Everything needed to record the submission video: deliverable specs, a
timecoded storyboard, the full voiceover script, on-screen captions, a
recording checklist, and publishing steps. Target length **4:45** (hard cap
5:00). The pitch explicitly covers the three required beats: **the problem**
(§3, 0:00), **who it's for** (§3, 0:20), and **why it matters** (§3, 0:40 and
§3, 4:30).

Slides, screen recordings, and voiceover only — no on-camera appearance
required.

## 1. Deliverable specs

| Property | Value |
| --- | --- |
| Length | 4:45 target, 5:00 hard cap |
| Resolution / frame rate | 1920×1080, 30 fps |
| Audio | Voiceover only (any USB mic); normalize to about −16 LUFS |
| Format | MP4 (H.264 + AAC) |
| Captions | Burn in the on-screen captions from the storyboard; also export an `.srt` if the form supports it |
| File name | `oneshot-demo-2026-09.mp4` |

## 2. Record in sample mode (reproducible, no keys)

The whole demo runs with the Deterministic Sample Provider — the real
workflow, validators, and cryptographic proofs, with no external API calls:

```powershell
Copy-Item app/env/.env.example app/env/.env
# edit app/env/.env:  ONESHOT_WORKSPACE_ROOT=<path to a scratch target project>
npm run demo
# opens http://localhost:8787
```

Prepare a small scratch target project (a folder with a `README.md`) so the
Builder's sandbox writes land somewhere you can show in the Explorer.

## 3. Storyboard

| Time | Screen | Action | On-screen caption |
| --- | --- | --- | --- |
| 0:00–0:20 | Slide 1 | Title card over a chat where an agent silently rewrites files | "AI coding agents are fast — and unaccountable." |
| 0:20–0:40 | Slide 2 | Split: dev team / approval checklist | "Built for teams who must prove what they approved." |
| 0:40–1:00 | OneShot UI shell | Pan across the five-region workspace | "OneShot: human-gated, hash-verified builds." |
| 1:00–1:40 | Demo A — launch | `npm run demo` terminal, then the UI loads; open Provider Configuration (sample active) | "Runs locally. Real pipeline, no keys required." |
| 1:40–2:30 | Demo B — gate 1 | Chat the request, answer intent questions, Researcher runs, Research Review card appears → **Accept** | "🛑 Human gate 1: nothing proceeds until you accept." |
| 2:30–3:20 | Demo C — plan → proof | Planner → Refactor → Gap Analysis → Evaluation light up; Triple Validation shows Schema/Fixture/Goal **VALID**; CONFIRMED + hash appear | "Three deterministic validators. One immutable hash." |
| 3:20–4:05 | Demo D — gate 2 → build | Build Ready card, **Confirm Build**, sandbox execution, `HASH == hash_sandbox`, **DONE**; open Job History + Explorer | "🛑 Human gate 2: only the approved package executes." |
| 4:05–4:30 | Architecture slide | `docs/ARCHITECTURE.md` system diagram; highlight the two gates and the hash equality check | "Six governed stages. Two gates. One hash." |
| 4:30–4:45 | Slide 3 — close | Repo page with Apache-2.0 badge + `npm run demo` command | "Try it: github.com/itz1508/oneshot_e2e" |

## 4. Voiceover script (~115 wpm; leave 1–2 s between beats)

**0:00 — The problem (~55 words).** "AI coding agents are fast. They can
research, plan, and write software in minutes. But they also rewrite files
when you are not looking, claim success they cannot prove, and leave no
trace of what you actually approved. If you are shipping that code, that is
a problem."

**0:20 — Who it's for (~45 words).** "OneShot is for developers and teams
who need autonomous builds they can prove — teams adopting AI agents under
review or compliance requirements, where 'which artifact did we approve,
and does the build match it' has to be answerable after the fact."

**0:40 — What OneShot is (~40 words).** "OneShot is a local-first build
pipeline with two hard guarantees. No stage runs past a human gate without
your explicit action. And only the exact, hash-verified package you
approved ever executes. Let me show you."

**1:00 — Demo A: launch (~65 words).** "One command builds and launches the
real product locally. This is the workspace: conversation on the left,
live task tracking, job history, and a file explorer over the target
project. It is running the deterministic sample provider — the entire
pipeline works with zero API keys, so you can reproduce everything you are
about to see."

**1:40 — Demo B: gate 1 (~70 words).** "I will ask for a small CLI app.
OneShot first clarifies intent — it will not start until the request is
unambiguous. Then the Researcher produces the research bundle: plan,
schema, fixtures, goals. And here is the first human gate: Research
Review. I can edit sections, request more research, or accept. The
pipeline is physically stopped until I do."

**2:30 — Demo C: plan → proof (~75 words).** "Once accepted, the plan moves
through Planner, Refactor, Gap Analysis — a fix-and-recheck loop — and
Evaluation. Then the part I trust most: triple validation. Three
independent deterministic validators — schema, fixture, goal — each must
return VALID. No LLM grades its own homework. All three pass, the package
is confirmed, and OneShot creates a cryptographic hash of the confirmed
core."

**3:20 — Demo D: gate 2 → build (~85 words).** "Second human gate: Build
Ready. The card shows exactly what I am approving — every validation and
the hash. I confirm. Only now does the Builder run, inside a hardened
sandbox with no network, writing only into the approved target. And the
proof: the hash recomputed from the built output must equal the hash I
approved. They match — DONE. Job history and the explorer show every
artifact, event, and mutation."

**4:05 — Architecture recap (~35 words).** "That is the architecture: six
governed stages on Google's ADK runtime, durable Redis-backed queues,
deterministic Python validators, and a hash that binds approval to
execution."

**4:30 — Close: problem, who, why (~55 words).** "The problem: agents you
cannot trust. Who it is for: teams who must prove what they approved. Why
it matters: because 'the AI did it' is not an audit trail — a hash is.
OneShot is open source under Apache-2.0 and reproduces in minutes:
`npm run demo`. Link below."

## 5. Shot and recording checklist

1. Run `npm run demo` once before recording to confirm the sample run
   reaches DONE end to end; note where each card appears.
2. Prepare a scratch target project and set `ONESHOT_WORKSPACE_ROOT` in
   `app/env/.env`; keep a `README.md` visible in the Explorer.
3. Browser: zoom 110–125 %, hide bookmarks, enable do-not-disturb. Terminal:
   font ≥ 16, dark background, clear before each command.
4. Record segments separately (Slides 1–3, Demo A–D, Architecture) so a
   mistake never costs the whole take; keep each gate on screen ≥ 2 s.
5. Trim dead waits in the editor; burn in the storyboard captions; add the
   end card (repo URL + `npm run demo`) for the last 3 s.
6. Export 1920×1080 / 30 fps / H.264, length ≤ 5:00 (target 4:45).

## 6. Fair-claims guardrails

- Show the "Deterministic Sample Provider" label during demos; say
  "sample provider" on screen. Do not claim a live-provider run —
  [APP_REVIEW.md](APP_REVIEW.md) notes one is still pending.
- If Redis/worker is not running, runs execute in-process; say so if it
  comes up, and do not claim queued-pipeline readiness.
- Only claim what is visible. Missing hash or mutation evidence renders as
  "unavailable" — never annotate it as verified. No cloud deployment
  claims unless you record one.

## 7. Publish and link

1. Upload to YouTube as **unlisted**: "OneShot — human-gated, hash-verified
   builds (demo)". Description: repo URL + chapter timestamps from the
   storyboard.
2. Save the file to `docs/evidence/video/oneshot-demo-2026-09.mp4`.
3. Paste the YouTube URL into the submission form and into the README
   [Demo video](../README.md#demo-video) section.
4. Update [APP_REVIEW.md](APP_REVIEW.md)'s "replacement recording pending"
   note once the new cut is published.
5. If the `.mp4` is committed, regenerate and verify the manifest:
   `python app/scripts/generate_manifest.py` then
   `python app/scripts/verify_manifest.py`.

