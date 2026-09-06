# Branch reconciliation — 6 September 2026

The comparison starts from `main` at `c5f482e`. The selection criterion is working behavior and evidence, not branch age or commit count. Every local branch commit was already reachable on GitHub at the start of this pass. Branch-only counts below overlap and do not establish that a feature is missing.

## Scope and authority

Reviewed all 15 local branches, all 20 remote branch heads, and all three worktrees. Compared outstanding commit subjects and changed paths, then inspected provider, Builder output, workflow trace, recovery, packaging, license-check, and CI implementations. The active paths remain `backend/agents`, `backend/pipeline`, `app/web/cloud`, `app/web/src`, and `backend/schema` as documented in AGENTS and the canonical workflow. Old React UI and role-named provider trees are not restored.

This is a branch reconciliation, not a claim that every historical file or live provider was executed. Stashes, tool checkpoints, ignored credentials, and runtime data are not publication targets. No branch is deleted or marked merged with an `ours` merge merely to remove divergence counts.

## Complete remote-branch disposition

| Remote branch (without origin/) | Commits outside starting main | Decision and evidence |
|---|---:|---|
| main | 0 | Current architecture and baseline. |
| adk-workflow-v2 | 0 | Already integrated by ancestry. |
| backup/main-before-reconcile | 0 | Already integrated; retain backup. |
| feature/tavily-researcher-evidence | 0 | Already integrated; current evidence collector retained. |
| integration/adk-v2-main | 0 | Already integrated. |
| migration/oneshot-executable-v1 | 0 | Already integrated; synchronize pointer with final main. |
| reconcile/all-into-main | 0 | Already integrated; synchronize pointer with final main. |
| safety/pre-main-sync | 0 | Already integrated; retain backup. |
| safety/remote-757bfc | 0 | Already integrated; retain backup. |
| repair/runtime-provider-ui | 17 | Selectively port generated output and persistent trace. Retain current native transports, model pinning, canonical event vocabulary, and durable recovery. Preserve the old branch for alternatives described below. |
| ui-e2e-observability | 15 | Its output/trace concepts were ported through the repair branch into the current plain-JS UI. Do not restore its retired React tree or legacy PASSED/COMPLETE vocabulary. |
| handoff-native-gemini-e2e-20260902 | 10 | Historical license reconciliation. Current package already declares Apache-2.0 and legal files live under docs/license. Its verifier requires deleted root LICENSE/NOTICE paths and a removed ADK provider, so it is not a valid current gate. Preserve history. |
| integrate-main | 11 | Old stage baseline with React docs-index/UI and prior packaging/runtime paths. Current migration and durable pipeline supersede that whole-tree merge. Preserve historical UI/documentation alternatives. |
| backup/local-main-before-oneshot-repair | 11 | Same tip as integrate-main (`f79e3a0`); not separate missing work. |
| stage/verified-1.3.0 | 10 | Ancestor of integrate-main; preserve old baseline, not a separate integration. |
| safety/local-stage-cd79561 | 9 | Ancestor of stage/verified-1.3.0; preserve backup. |
| safety/worktree-snapshot | 11 | Stash-style snapshot of the old stage tree, including an index parent. Preserve explicitly; do not treat snapshot metadata as product changes. |
| backup/pre-reconciliation-local-4a91d9e | 5 | Includes obsolete layout/pins, opposing historical license changes, and deletion of a gap-loop test. Retain current legal layout, passing gap-loop coverage, and durable state implementation. |
| backup/adk-workflow-v2-before-reconcile | 2 | Old verification YAML still references web/ and root requirements. Current YAML uses app/web and app/requirements; preserve old branch only. |

There are 19 remote branch heads, excluding the symbolic origin/HEAD alias. The initial shell listing included that alias as a twentieth remote entry. The initial 15 local branches are all represented by the same-named remote branch; `main`, `migration/oneshot-executable-v1`, and `reconcile/all-into-main` needed pointer synchronization rather than missing commits.

## Working behavior selected

| Area | Selection | Evidence and limits |
|---|---|---|
| Provider authentication, model pinning, write-only secrets | Current main | Current native-provider transport and HTTP tests exercise OpenAI/Anthropic/Gemini with controlled servers, credential replacement, failures and captured run configuration. Live paid inference is not claimed. |
| Generated document output | Port from repair/observability | Research draft text is carried in the confirmed Plan, returned in the Builder artifact only after matching sandbox proof and a successful output step. The UI reads the existing artifact endpoint after successful workflow completion. Both builder-result and build_result artifact names are supported. No new RunSnapshot wire fields are required. |
| Persistent completed workflow trace | Port from repair/observability | Current normalized events feed an escaped expandable trace in Task Management. Deduplicated replay restores events from durable runtime snapshots. A new conversation resets the trace. |
| Failure recovery | Current durable pipeline | Current checkpoint, lease ownership, transition idempotency, and explicit reconciliation have regression coverage. The older classifier/policy tests pass, but recommendation text claims automatic backoff without proving an active scheduling path. Its old event vocabulary and backend/role imports also conflict with main. This optional recommendation/Tavily-settings UI remains only on the preserved repair branch; it is not claimed integrated. |
| Visual settings | Repair current implementation | STATE_NAMES used title case while stateColors used uppercase keys, breaking initialization and saved colors. Derive keys from the defaults. Task state tests now exercise current Running/Completed/Failed values. |
| Source integrity | Repair current implementation | Exclude transient log/pid/tmp files from the shared source/ZIP policy. Normalize working text to the repository's LF policy and regenerate registry/manifest hashes from those bytes. A regression test compares the saved registry to the current schema bytes. |
| GitHub validation | Repair current workflows | Prior main CI failed on missing Python dependencies and platform-dependent registry hashes. Pipeline jobs now install the Python validator; canonical CI installs workspace dependencies, serializes the backend suite, runs frontend tests, and checks the committed manifest. |

The generated-output proof establishes faithful transport of provider text through the confirmed package and successful sandbox boundary. It does not establish that generated source code was compiled or that a generated application meets arbitrary user requirements.

## Worktrees and evidence

- D:/oneshot_e2e: active reconciliation, starting at c5f482e.
- D:/oneshot_repair: clean at b019e84. Its backend build and 47 focused provider/recovery/output tests pass in its own checkout. Passing isolated old-branch tests do not prove integration with the new pipeline.
- D:/oneshot_reconcile: five dirty files were line-ending-only changes; `git diff --ignore-space-at-eol --exit-code` passed. There was no missing substantive implementation in those files. The earlier chat report incorrectly attributed them to the repair worktree.
- Current selected implementation: build, frontend lint/typecheck and 27 frontend tests pass; 135 backend tests pass, one live-provider test is skipped. The source-policy tests and saved-registry regression also pass.
- Browser execution is unverified on this host: agent-browser could not launch Chrome and reported that it exited before providing a DevTools URL. Rendering unit tests and Vite build are not a visual browser proof.

## Reproduce the branch inventory

```powershell
git fetch origin --prune
python scripts/audit-branches.py
git worktree list
```

The inventory reports all branch refs, exact hashes, ancestry differences, patch-distinct commits and whether any local branch commit is absent from every origin branch. It intentionally distinguishes published from integrated. Historical alternatives remain available on GitHub; only selected, tested changes enter main.

## Reference boundaries

- [Git merge semantics](https://git-scm.com/docs/git-merge): no force-push or history-discarding merge is used.
- [Git text attributes](https://git-scm.com/docs/gitattributes): checked-out source must obey LF policy before hashing bytes.
- [Python setup action](https://github.com/actions/setup-python/blob/main/docs/advanced-usage.md): CI installs dependencies into the interpreter used by runtime workers.
- [JSON Schema validation](https://json-schema.org/draft/2020-12/json-schema-validation) and [Pydantic JSON Schema](https://pydantic.dev/docs/validation/latest/concepts/json_schema/): preserve the existing canonical Plan contract while extending the provider-owned draft boundary.
