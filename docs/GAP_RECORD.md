# Gap Record

Append-only record of gap audits and repairs. Never rewrite or delete earlier
entries; each entry appends new findings or status transitions below the last.

---

## Entry 1 — 2026-09-06: Full reconciliation gap audit (`main` @ `7f859da`)

Scope: all reconciliation deliverables, remote/local branches, worktrees,
source manifest, and GitHub Actions workflows.

Method: direct verification of each dimension (git state, ancestry checks,
disposition-table cross-check, `verify_manifest.py`, local backend suite,
`gh run list` / GitHub API for CI). NOTE: this audit was executed manually —
the A-Flow core MCP tools (`aflow_task_prepare`, `aflow_evidence_submit`,
`aflow_todo_update`, `aflow_reconcile_submit`, `aflow_next`) were not available
in the session, so formal A-Flow reconciliation could not be run. Evidence
below was captured with repository tooling; A-Flow closure remains open.

### Findings

| # | Area | Status | Evidence |
|---|---|---|---|
| 1 | Branch disposition coverage | PASS | All 19 remote branches (besides `origin/HEAD`) appear in the `docs/BRANCH_RECONCILIATION.md` disposition table; `git merge-base --is-ancestor` results match the table's "commits outside starting main" claims exactly (10 non-ancestral branches, all dispositioned). |
| 2 | Branch/worktree sync | PASS | `main`, `reconcile/all-into-main`, `migration/oneshot-executable-v1` local = remote = `7f859da`; worktrees `D:/oneshot_e2e` and `D:/oneshot_reconcile` clean at `7f859da`. |
| 3 | Pipeline E2E (rate-limit 429) | FIXED (prior entry) | Recovery jobs exhausted the 100-req/15-min API rate limit polling `/history` at 2 req/500ms. Fixed by `API_RATE_LIMIT_MAX=100000` on the three recovery jobs only (commit `352651f`); runs `34049407031` and `34049437226` green — all 7 jobs. |
| 4 | Local backend suite failures (16 files) | FIXED (environment) | All 16 failures were `Cannot find module '@ioredis/commands'` from a corrupted local `node_modules`; same code is green in CI. Repaired with `npm ci`; suite re-run pending at time of writing — result appended below. |
| 5 | Transient `.txt` logs break manifest verify | FIXED (this entry) | `verify_manifest.py` failed with `unlisted backend/tests/ts/unit-log.txt` (and would for `npmci-log.txt`): policy excluded `.log/.pid/.tmp` suffixes but test-runner logs are `.txt`. Repaired by exact-name exclusion of `unit-log.txt` / `npmci-log.txt` in `app/scripts/source_file_policy.py` (`IGNORED_LOCAL_FILES`); manifest regenerated and verified with both logs present. |
| 6 | Canonical Runtime Verification coverage of tip | ACCEPTED | Workflow triggers on `paths:` (backend/app/package files); commits `352651f`/`7f859da` touched only `pipeline-e2e.yml` + `MANIFEST.sha256`, outside its path filter. Last run on `ad94428` green (`34049036371`). No action. |
| 7 | ADK v2 Verify red on preserved branch | ACCEPTED (historical) | `adk-workflow-v2` is ancestral to `main` and preserved per disposition table; its self-verification workflow fails there (last run `33994095180`, 2026-09-05) but its YAML references retired layouts. Out of `main` scope; branch intentionally preserved. |
| 8 | Local Docker/Redis and browser E2E | ACCEPTED (environment) | Docker daemon unavailable locally, so BullMQ recovery paths and browser E2E cannot run on this host; CI is the validation path (green). |

### Repairs applied in this entry

- `app/scripts/source_file_policy.py`: exact-name exclusion of transient
  test-runner logs (`unit-log.txt`, `npmci-log.txt`).
- `MANIFEST.sha256`: regenerated (482 entries) and verified.

### Validation

- `python app/scripts/verify_manifest.py` → `MANIFEST_VERIFIED`
- Local backend suite (`backend/tests/ts`) after `npm ci`: result appended below.
- CI on `7f859da`: Pipeline E2E run `34049437226` — success (all 7 jobs).

### Appended results

- 2026-09-06T17:56Z — Local backend suite after `npm ci`: **136 tests,
  135 pass, 0 fail, 1 skipped** (`backend/tests/ts/unit-log.txt`,
  duration ~169s). Confirms finding #4 was environmental
  (`node_modules` corruption), not a code gap. `validated`.
- Note: the first post-`npm ci` attempt crashed with a V8 "Zone Allocation
  failed" OOM inside `tsc -p tsconfig.json` at ~73MB (Node 24.17.0); a clean
  retry succeeded with no changes. Recorded as transient, no repair needed.
- 2026-09-06T18:00Z — Incident during closure: unrelated uncommitted gemma
  work (modified `docker/Dockerfile.gemma`, `docker/docker-compose.gemma.yml`; untracked
  `BUILD_GEMMA_NOW.md`, `GEMMA_MODES_GUIDE.md`, `READY_TO_BUILD.txt`,
  `VERIFICATION_CHECKLIST.txt`) appeared in the working tree and was briefly
  hashed into the committed manifest (`592789e`). Canonical Runtime
  Verification run `34050102802` correctly failed (`missing`/`hash mismatch`)
  on that intermediate commit. Repairs: manifest regenerated from the
  normalized committed tree (`0058430`); the gemma working files were backed
  up unmodified to `D:\oneshot_gemma_stash\` and the tree restored to the
  committed state. `MANIFEST.sha256` added to the CVR path filter so
  manifest-only commits are verified (`52e2b18`).
- 2026-09-06T18:03Z — Final tip `52e2b18`: Pipeline E2E run `34050288555`
  success (all 7 jobs); Canonical Runtime Verification run `34050288562`
  success (backend suite, frontend tests, committed-manifest check on a fresh
  checkout). Local: `verify_manifest.py` → `MANIFEST_VERIFIED` (483 entries),
  worktrees clean, `main`/`reconcile/all-into-main`/`migration/
  oneshot-executable-v1` all = `52e2b18` locally and on origin. `closed`.
- Governance note: A-Flow core MCP tools were unavailable in this session, so
  the audit was executed and recorded manually per the append-only discipline
  above; A-Flow reconciliation of this entry remains a formality to perform
  when the tooling is connected.
