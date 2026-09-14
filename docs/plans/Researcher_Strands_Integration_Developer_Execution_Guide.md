# Researcher Strands Integration — Developer Execution Guide

**Companion to:** `docs/plans/Researcher_Strands_Integration_Step_by_Step.md` (the Step-by-Step Plan)
**Audience:** any developer on OneShot · **Time:** ~2 hours
**Platform:** Windows / PowerShell (the repo's environment)
**Verified against this repo** on the date below; all paths, commands, versions, and expected outputs were confirmed live.

> This guide executes nothing for you. **You run every command. You verify every result. You commit only when authorized.** It is the CHECKLIST + VERIFICATION + TROUBLESHOOTING layer on top of the Plan.

---

## 0. How to use this guide

- This guide does **not** duplicate the Plan's code. For the exact content to paste at each step, open the **Step-by-Step Plan** (`docs/plans/Researcher_Strands_Integration_Step_by_Step.md`) and use its code blocks.
- Phases here match the Plan's phases **0 to 12** exactly. Do them in order.
- Every command is PowerShell. Each phase gives: **GOAL then YOU DO then VERIFY then SUCCESS then IF IT FAILS**.

---

## 1. Corrections applied to the source draft (read this first)

The draft this guide replaces contained factual errors. Anything below that still says "Draft said" in another document is the **wrong** document — use this guide + the Plan.

| # | Draft said | Verified reality (this repo) | Source |
|---|---|---|---|
| 1 | `app/web/runtime/workflows/researcher.ts` | `backend/agents/researcher/workflow.ts` | `Test-Path` (exists); AGENTS.md module map |
| 2 | `app/lib/integrations` exports `resolveActiveIntegrationModel` | `backend/integration/runtime.ts` | `Test-Path` (exists); `workflow.ts` imports it |
| 3 | Add `@tavily/core@0.7.11`; use `TavilyClient` | `@tavily/core` is **not** a dep and **not** used. Tavily runs via Python worker `backend/agents/researcher/tool/tavily/worker.py` through `TavilyPythonRunner` (`bridge.ts`). The Strands tool **reuses** that runner — no new Tavily SDK. | `package.json` (no `@tavily/core`); `bridge.ts`; Plan Phase 3 |
| 4 | `zod@^3.22.0` | `zod ^4.1.12` (Strands peer-dep); already present transitively as `4.6.4`. Add `^4.1.12` as a **direct** dep. zod 3.x is **incompatible** with Strands. | Strands `package.json` peerDeps; `npm ls zod` |
| 5 | Node `v18.x.x`, npm `9.x.x` | Node `>=24.13.0`, npm `>=11.8.0` | `package.json` `engines` |
| 6 | Backend tests use `vitest` | Backend tests use `node:test`. `npm test` = build + `node --test dist/backend/tests/ts/*.test.js`. Vitest is only for `app/web`. | `package.json` `scripts.test`; existing tests `import test from "node:test"` |
| 7 | `which python`, `source .venv/bin/activate`, `find -type f`, `ls -la` | Windows/PowerShell: `Get-ChildItem`, `Test-Path`, `Select-String`, `$env:VAR` | environment is `win32` |
| 8 | `npm run build:backend` prints "Build successful" | `tsc -p tsconfig.json` is **silent** on success. Success = no `error TS` lines. | ran it |
| 9 | `npx tsc --noEmit app/integration/strands/` | `tsc` does not accept a directory. Use `npm run build:backend` (authoritative) or `npx tsc -p tsconfig.json --noEmit`. | tsc CLI |
| 10 | `tests/` top-level dir | `backend/tests/ts/` (backend TS tests) | `Test-Path` |
| 11 | Split `researcher.ts` into `researcher-native.ts` + gate; make a `.backup` | The Plan edits `workflow.ts` **in place**: adds Case F inside Case E behind the flag. **No** `researcher-native.ts`, **no** backup. The deterministic `generateText` path stays byte-identical under the new `else`. | Plan Phase 4 |
| 12 | Flag `ONESHOT_RESEARCH_USE_STRANDS_AGENT` (value `true`) | Flag `ONESHOT_RESEARCH_USE_STRANDS` — enable = exactly `"1"`; default OFF. Gate checks `=== "1"`. | Plan Phase 4/5; `workflow.ts` |
| 13 | New files under `app/integration/strands/...` | New files are **server-side** under `backend/agents/researcher/`: `strands-tools/tavily-search.ts`, `strands-agent.ts`; test at `backend/tests/ts/researcher-strands-adapter.test.ts`. ("No Strands SDK in the browser.") | Plan Phase 3/6; `docs/Refactor_plan.md` P6.1 |
| 14 | `.env.local` + `echo >> .gitignore` | Repo uses `app/env/.env` (loaded by `dev` via `--env-file=app/env/.env`) and `app/env/.env.example` as the template. No `.env.local`. | `package.json` `dev` script |

If any Draft-said item still appears in a document you are reading, that document is the wrong one; use this guide and the Plan instead.

---

## 2. PRE-FLIGHT CHECKLIST

Run **all** of these before starting Phase 0. **Stop and fix any failure.**

**P1 — You are in the OneShot repo root.**
- You do: `Get-Location`
- Expected: a path ending in `oneshot_e2e` (e.g. `d:\oneshot_e2e`).
- Also: `Test-Path package.json, backend, app\web` returns `True, True, True`.
- If not: `cd` to the repo root.
- Success: at the root and the three anchors exist.

**P2 — Node and npm versions.**
- You do: `node --version; npm --version`
- Expected: `v24.13.0` or higher; `11.8.0` or higher.
- If too old: install Node 24+ (the repo's `engines` floor).
- Success: both at or above the floors.

**P3 — Strands SDK is a direct dependency.**
- You do: `npm ls @strands-agents/sdk --depth=0`
- Expected: a line `` `-- @strands-agents/sdk@1.17.0 ``
- If missing: it is listed in `package.json`; run `npm install`.
- Success: `@strands-agents/sdk@1.17.0` present.

**P4 — zod is resolvable (transitive is fine before Phase 2).**
- You do: `npm ls zod`
- Expected: `zod@4.6.4` appears under `@strands-agents/sdk` / `@modelcontextprotocol/sdk` / `ai`.
- Note: it is **not** a direct dep yet (Phase 2 adds it). `npm ls zod --depth=0` returning `(empty)` is normal now.
- Success: a `zod@4.x` line appears in the tree.

**P5 — `@ai-sdk/provider` must be root-installed (GAP-STRANDS-01 — updated 2026-09-13).**
- You do: `npm ls @ai-sdk/provider`
- Expected (BEFORE Phase 2): only nested copies under `ai` — **no root entry**. This is the confirmed gap: `VercelModel` runtime-imports `APICallError` from `@ai-sdk/provider` (`dist/src/models/vercel.js:1`), so importing `@strands-agents/sdk/models/vercel` throws `ERR_MODULE_NOT_FOUND` until Phase 2 installs it.
- Phase 2 fixes this with `npm i -E @ai-sdk/provider@4.0.13` (exact `ai` dep version).
- Success AFTER Phase 2: top-level `@ai-sdk/provider@4.0.13` entry; `node -e "import('@strands-agents/sdk/models/vercel').then(()=>console.log('OK'))"` prints `OK`.

**P6 — Researcher workflow exists.**
- You do: `Test-Path backend\agents\researcher\workflow.ts`
- Expected: `True`
- Success: `True`.

**P7 — Tavily bridge + Python worker exist (the runner the Strands tool reuses).**
- You do: `Test-Path backend\agents\researcher\tool\tavily\bridge.ts, backend\agents\researcher\tool\tavily\worker.py`
- Expected: `True, True`
- Success: both exist.

**P8 — Model resolver exists.**
- You do: `Test-Path backend\integration\runtime.ts`
- Expected: `True`
- Success: `True`.

**P9 — Env example + tests dir exist.**
- You do: `Test-Path app\env\.env.example, backend\tests\ts`
- Expected: `True, True`
- Success: both exist.

**P10 — Baseline build is clean (run BEFORE changing anything).**
- You do: `npm run build:backend`
- Expected: the npm banner (`> oneshot-production-e2e@1.3.0 build:backend` / `> tsc -p tsconfig.json`) then **silence**. No `error TS...` lines.
- If errors: they are **pre-existing**, not yours. Stop and report to your lead.
- Success: zero `error TS` lines. This is your "before" baseline so a later failure is provably yours.

**P11 — Baseline tests pass (recommended; slower).**
- You do: `npm test`
- Expected: the existing backend suite is green (`fail 0`).
- If a pre-existing test fails: stop and report — do not proceed.
- Success: `fail 0`.

**Do not start the integration until P1 to P10 pass (P11 recommended).**

---

## 3. PER-PHASE EXECUTION & VERIFICATION

For each phase: paste code from the Plan's matching phase; this guide only validates.

### Phase 0 — Verify environment (Plan Phase 0)
- **GOAL:** confirm the toolchain matches the Plan's assumptions.
- **YOU DO:** run the Plan's Phase 0 commands (`node --version`, `npm --version`, `npm ls @strands-agents/sdk --depth=0`, `npm ls zod --depth=0`, `npm ls @ai-sdk/provider`).
- **VERIFY:** versions per P2 to P5; `npm ls zod --depth=0` returns `(empty)`.
- **SUCCESS:** all match the Plan's "Expected" blocks.
- **IF IT FAILS:** re-run P2 to P5.

### Phase 1 — Create folder structure (Plan Phase 1)
- **GOAL:** create the one new directory.
- **YOU DO:** `New-Item -ItemType Directory -Force backend\agents\researcher\strands-tools`
- **VERIFY:** `Test-Path backend\agents\researcher\strands-tools` returns `True`.
- **SUCCESS:** the directory exists. (`strands-agent.ts` is **not** in this dir — it goes directly in `backend\agents\researcher\` in Phase 3.)
- **IF IT FAILS:** the parent `backend\agents\researcher\` must already exist (P6). `-Force` won't error if the dir already exists.

### Phase 2 — Verify & update dependencies (Plan Phase 2)
- **GOAL:** add zod as a direct dep; root-install `@ai-sdk/provider` (GAP-STRANDS-01); no override.
- **YOU DO:**
  1. Edit `package.json`: in `dependencies`, add `"zod": "^4.1.12",` (alphabetical; Plan Phase 2 Step 2.2 shows the exact resulting block).
  2. Run `npm i -E @ai-sdk/provider@4.0.13` (Plan Phase 2 Step 2.3 — REQUIRED; `VercelModel` runtime-imports it).
  3. `npm install`
- **VERIFY:**
  - `npm ls zod --depth=0` returns a line `` `-- zod@4.6.4 `` (or 4.x).
  - `npm ls @strands-agents/sdk --depth=0` returns `@strands-agents/sdk@1.17.0`.
  - `npm ls @ai-sdk/provider` shows a top-level `4.0.13` entry (GAP-STRANDS-01 fixed; no override added).
  - Import smoke test: `node -e "import('@strands-agents/sdk/models/vercel').then(()=>console.log('OK'))"` → `OK`.
- **SUCCESS:** zod is a direct dep; `@ai-sdk/provider` root-installed; no `ERESOLVE` from `npm install`.
- **IF IT FAILS:**
  - `ERESOLVE` peer-dep conflict: **not expected** (Strands' `@ai-sdk/provider` peer dep is optional; zod already dedupes). Do **not** add `@ai-sdk/provider` to `overrides` and do **not** downgrade zod to 3.x. Read the two versions npm names; if truly stuck, escalate.
  - Import still fails after install: check `npm ls @ai-sdk/provider` placement; escalate with output.

### Phase 3 — Create new files (Plan Phase 3)
- **GOAL:** create the two server-side source files.
- **YOU DO:**
  1. Create `backend\agents\researcher\strands-tools\tavily-search.ts` from Plan Phase 3 Step 3.1.
  2. Create `backend\agents\researcher\strands-agent.ts` from Plan Phase 3 Step 3.2.
- **VERIFY:**
  - `Test-Path backend\agents\researcher\strands-tools\tavily-search.ts, backend\agents\researcher\strands-agent.ts` returns `True, True`.
  - `npm run build:backend` returns **silence** (no `error TS`). This compiles both new files under the repo's **strict** tsconfig — the key correctness check.
- **SUCCESS:** both files exist and the backend build is clean.
- **IF IT FAILS** (TS errors):
  - Read each `error TS...` line: `file(line,col)`.
  - Common: an ESM import missing the `.js` extension (repo convention: `./x.js`, not `./x`); a relative path off by one level; a type-only import not marked `type` (e.g. `import { type AgentResult }`); the `VercelModel` provider not cast `as any`.
  - The subpath import `@strands-agents/sdk/models/vercel` must resolve: the repo tsconfig is `NodeNext` (honors the package `exports` map). If tsc can't find it, your `moduleResolution` is wrong — do **not** switch to `node`; the repo is `NodeNext` by design.
  - Fix and re-run `npm run build:backend`.

### Phase 4 — Modify the existing Researcher (additive, behind a flag) (Plan Phase 4)
- **GOAL:** add the gated Case F branch in `workflow.ts` — the **only** edit to an existing source file.
- **YOU DO:**
  1. In `backend\agents\researcher\workflow.ts`, add the `runResearcherAsStrandsAgent` import exactly as Plan Phase 4 Step 4.1 shows (after the existing `resolveActiveIntegrationModel` import).
  2. Replace the `if (activeModel) { ... }` block with the Plan's AFTER block (adds the `ONESHOT_RESEARCH_USE_STRANDS === "1"` branch; the existing `generateText` body moves under the new `else`).
- **VERIFY:**
  - `Select-String -Path backend\agents\researcher\workflow.ts -Pattern "ONESHOT_RESEARCH_USE_STRANDS"` returns at least 1 match (the gate).
  - `Select-String -Path backend\agents\researcher\workflow.ts -Pattern "runResearcherAsStrandsAgent"` returns one match (import) + one match (call).
  - `npm run build:backend` returns **silence**.
- **SUCCESS:** gate + call present; build clean.
- **IF IT FAILS:**
  - `Cannot find name 'runResearcherAsStrandsAgent'`: the import path is wrong — it must be `./strands-agent.js` (relative to `workflow.ts` in `backend\agents\researcher\`).
  - Case/duplicate-label errors: you replaced the wrong block. The BEFORE text in Plan Phase 4 must match the file **exactly** (including the `const evidenceText = gathered...` lines). Re-copy BEFORE to AFTER from the Plan.
  - Deterministic path changed: the `generateText` body must sit **unchanged** under the new `else`. `git diff backend\agents\researcher\workflow.ts` should show only +1 import and the +Case F/else rewrap — **not** edits to the `generateText` call.

### Phase 5 — Document the flag (Plan Phase 5)
- **GOAL:** add the commented flag line to `app/env/.env.example`.
- **YOU DO:** add `# ONESHOT_RESEARCH_USE_STRANDS=0` after the `# ONESHOT_TAVILY_MAX_EVIDENCE_BYTES=12000` line (Plan Phase 5 Step 5.1 gives the exact location, about line 45).
- **VERIFY:** `Select-String -Path app\env\.env.example -Pattern "ONESHOT_RESEARCH_USE_STRANDS"` returns exactly one match.
- **SUCCESS:** one commented flag line present.
- **IF IT FAILS:** the anchor `# ONESHOT_TAVILY_MAX_EVIDENCE_BYTES=12000` must exist (pre-flight). If it moved, search for `TAVILY` and place the new line near the other Tavily config.

### Phase 6 — Create the test (Plan Phase 6)
- **GOAL:** add the `node:test` unit test (no API key required; runner is mocked).
- **YOU DO:** create `backend\tests\ts\researcher-strands-adapter.test.ts` from Plan Phase 6 Step 6.1.
- **VERIFY:**
  - `Test-Path backend\tests\ts\researcher-strands-adapter.test.ts` returns `True`.
  - `npm run build:test` returns **silence** (compiles the test + the imported source).
  - Run in isolation: `node --test dist\backend\tests\ts\researcher-strands-adapter.test.js` returns `pass 3`, `fail 0`.
- **SUCCESS:** 3 tests pass (name+mapping, missing-key throws, flag-off default).
- **IF IT FAILS:**
  - `Cannot find module '../../agents/researcher/strands-tools/tavily-search.js'`: run `npm run build:backend` first (it compiles the source the test imports); the `.js` extension is correct (NodeNext maps to `.ts` at compile, `.js` at runtime).
  - `0 tests run`: the file isn't at `backend\tests\ts\<name>.test.ts` or didn't compile. Confirm `npm run build:test` emitted `dist\backend\tests\ts\researcher-strands-adapter.test.js`.
  - A test about the TAVILY_API_KEY not-configured case asserts the throw; it PASSES when the key is absent, so do not set a real key for the unit tests.

### Phase 7 — Build (Plan Phase 7)
- **GOAL:** full backend build with all new code.
- **YOU DO:** `npm run build:backend`
- **VERIFY:** silence. Then confirm outputs: `Test-Path dist\backend\agents\researcher\strands-agent.js, dist\backend\agents\researcher\strands-tools\tavily-search.js, dist\backend\tests\ts\researcher-strands-adapter.test.js` returns `True, True, True`.
- **SUCCESS:** build clean + all three `.js` outputs present.
- **IF IT FAILS:** see Phase 3 IF IT FAILS.

### Phase 8 — Run tests (Plan Phase 8)
- **GOAL:** the new test passes within the full suite.
- **YOU DO:** `npm test`
- **VERIFY:** the summary shows `fail 0`; the three new tests appear as pass marks.
- **SUCCESS:** `fail 0` overall; the 3 new tests pass.
- **IF IT FAILS:**
  - Only the new test fails: re-run it in isolation (Phase 6 VERIFY) for a focused error.
  - A pre-existing test now fails: your change is not additive — most likely the `workflow.ts` edit altered the deterministic path. Re-check Phase 4's "deterministic path unchanged" rule.

### Phase 9 — Verify file structure (Plan Phase 9)
- **GOAL:** confirm exactly the expected set of changes.
- **YOU DO:** `git status --short`
- **EXPECTED (set):**
  - untracked: `backend\agents\researcher\strands-agent.ts`, `backend\agents\researcher\strands-tools\tavily-search.ts`, `backend\tests\ts\researcher-strands-adapter.test.ts`
  - modified: `backend\agents\researcher\workflow.ts`, `app\env\.env.example`
  - modified (only if you added zod): `package.json`, `package-lock.json`
- **SUCCESS:** no unexpected paths. `dist\` is build output (gitignored) and must **not** appear.
- **IF IT FAILS:** If you see untracked app\integration\strands paths or a researcher-native.ts file, you followed the old draft; delete those and redo Phases 1 to 6 per this guide.

### Phase 10 — Commit (only when authorized) (Plan Phase 10)
- **GOAL:** stage and commit — **only if your lead/user authorized it.**
- **YOU DO (if authorized):**
  - `git add backend\agents\researcher\strands-agent.ts backend\agents\researcher\strands-tools\tavily-search.ts backend\tests\ts\researcher-strands-adapter.test.ts backend\agents\researcher\workflow.ts app\env\.env.example`
  - (and `package.json package-lock.json` if zod was added)
  - `git commit -m "feat(researcher): add Strands Agent path behind ONESHOT_RESEARCH_USE_STRANDS flag"` (Plan Phase 10 gives the full message body)
- **VERIFY:** `git log --oneline -1` shows your commit; `git status --short` is clean.
- **SUCCESS:** one commit, working tree clean.
- **IF IT FAILS / NOT authorized:** stop. Do not commit. Leave the working tree as-is and hand off.
- **NOTE:** never `git add .` — stage the explicit paths above. Do not stage `dist\` or stray files from the old draft.

### Phase 11 — Post-implementation checklist (Plan Phase 11)
- **GOAL:** prove the integration is inert by default.
- **YOU DO:**
  - `echo $env:ONESHOT_RESEARCH_USE_STRANDS` → empty (off).
  - `Select-String -Path backend\agents\researcher\workflow.ts -Pattern "ONESHOT_RESEARCH_USE_STRANDS"` → the gate.
  - `git diff backend\agents\researcher\workflow.ts` → only +import and +Case F/else; the `generateText` block unchanged.
- **SUCCESS:** flag off by default; deterministic path unchanged.
- **IF IT FAILS:** revisit Phase 4.

### Phase 12 — Next steps / decision point (Plan Phase 12)
- **GOAL (optional):** try the agent path locally without shipping it.
- **YOU DO (local only; do not commit `app\env\.env`):**
  - `Add-Content app\env\.env "`nONESHOT_RESEARCH_USE_STRANDS=1"` (or `$env:ONESHOT_RESEARCH_USE_STRANDS = "1"` for the current shell)
  - Start the server per AGENTS.md and run a research request.
- **VERIFY:** the agent path runs (logs show tool calls); the deterministic path still works when the flag is `"0"` or absent.
- **SUCCESS:** agent path exercises `tavily_search` and returns text `parseStructuredDraft` accepts.
- **IF IT FAILS:** set the flag back to `"0"` (`$env:ONESHOT_RESEARCH_USE_STRANDS = "0"` or remove the line from `app\env\.env`). The deterministic path is unaffected — that is the safety net.
- REVERT entirely: if committed, run git reset --hard HEAD~1; if uncommitted, run git checkout on the modified files then delete the 3 new files.

---

## 4. TROUBLESHOOTING REFERENCE

| Symptom | First check | Fix |
|---|---|---|
| `npm install` → ERESOLVE | duplicate `@ai-sdk/provider` versions | Root-install `@ai-sdk/provider@4.0.13` exactly (GAP-STRANDS-01); do **not** add an `overrides` entry; do **not** use zod 3.x. If stuck, escalate. |
| `error TS2307 Cannot find module '@strands-agents/sdk/models/vercel'` | tsconfig `moduleResolution` | Must be `NodeNext` (it is). Don't switch to `node`. Subpath export exists in the package `exports`. |
| `error TS...` in a new file | import missing `.js`; relative path off; missing `type` modifier | ESM imports use `./x.js`. Mark type-only `import { type X }`. Cast the VercelModel provider `as any`. |
| `npm test` → new test not discovered | file location / compile | Must be `backend\tests\ts\*.test.ts`; run `npm run build:test`; glob is `dist\backend\tests\ts\*.test.js`. |
| `node --test` → `0 tests` | wrong path / not compiled | `npm run build:test` first; run the exact `dist\backend\tests\ts\researcher-strands-adapter.test.js` path. |
| Test fails on "TAVILY_API_KEY not configured" | nothing — that's the asserted throw | That test **passes** when the key is absent. Don't add a real key for unit tests. |
| Flag has no effect | value isn't exactly `1` | Gate is `=== "1"`. Use `$env:ONESHOT_RESEARCH_USE_STRANDS = "1"` (string). Restart the process after changing env. `true`/`TRUE` won't match. |
| Deterministic path changed | Phase 4 replaced the wrong block | `git diff workflow.ts` must not edit the `generateText` call; only +import and +Case F/else. Redo Phase 4 from the Plan. |
| `git status` shows untracked `app\integration\strands\` or `researcher-native.ts` | you followed the old draft | Delete those; redo per this guide. Real new files are under `backend\agents\researcher\`. |
| Strands imported from `app\web\...` | violates "No Strands SDK in the browser" | Move the import to `backend\`. Strands is server-only. |

---

## 5. COMPLETION CHECKLIST

Tick all before declaring done:

- [ ] P1 to P11 pre-flight passed (especially P10 baseline build clean).
- [ ] Phase 2: `zod ^4.1.12` added; `@ai-sdk/provider@4.0.13` root-installed (GAP-STRANDS-01); `npm install` no ERESOLVE; vercel-model import smoke test `OK`; **no** override added.
- [ ] Phase 3: both new files exist; `npm run build:backend` clean.
- [ ] Phase 4: gate `ONESHOT_RESEARCH_USE_STRANDS === "1"` present; `runResearcherAsStrandsAgent` imported + called; `git diff workflow.ts` shows deterministic path unchanged.
- [ ] Phase 5: one `# ONESHOT_RESEARCH_USE_STRANDS=0` line in `app\env\.env.example`.
- [ ] Phase 6/8: new test passes (3/3) and full `npm test` is `fail 0`.
- [ ] Phase 9: `git status` shows **only** the expected new + modified paths.
- [ ] Phase 10: committed **only if authorized**; explicit paths staged (no `git add .`).
- [ ] Phase 11: flag OFF by default; deterministic path intact.
- [ ] No file under `app\integration\strands\` or `app\web\runtime\workflows\researcher-native.ts` exists (those are from the superseded draft).

---

## 6. QUICK REFERENCE (verified)

- **New files:** `backend\agents\researcher\strands-tools\tavily-search.ts`, `backend\agents\researcher\strands-agent.ts`, `backend\tests\ts\researcher-strands-adapter.test.ts`
- **Modified:** `backend\agents\researcher\workflow.ts`, `app\env\.env.example`, `package.json` (+ lock: zod direct + `@ai-sdk/provider@4.0.13` root per GAP-STRANDS-01)
- **Reused (not new):** `backend\agents\researcher\tool\tavily\bridge.ts` (`TavilyPythonRunner`), `backend\integration\runtime.ts` (`resolveActiveIntegrationModel`)
- **Flag:** `ONESHOT_RESEARCH_USE_STRANDS` — enable = `"1"`; default OFF; gate checks `=== "1"`.
- **Build:** `npm run build:backend` (silent on success). **Tests:** `npm test` (node:test).
- **Do NOT use:** `@tavily/core`, zod 3.x, vitest for backend, `app/integration/strands/`, `researcher-native.ts`, `@ai-sdk/provider` override, `.env.local`.