# OneShot Web Application — Builder Source of Truth v2.0

**Status:** Builder authority / behavior source of truth  
**Mode:** PRESERVE  
**Date:** 2026-09-06  
**Purpose:** Define the established OneShot web application behavior, runtime/UI boundaries, human gates, task presentation, context/history behavior, workspace behavior, Build/Sandbox behavior, and implementation constraints.

> This document defines what the Builder must preserve and implement. It does not authorize redesign of the established workflow, ownership model, IDs, runtime, authentication, provider model, deployment platform, or execution lifecycle.

---

# 0. Source Classification

Every substantive rule in this document is one of:

- **USER-ESTABLISHED** — directly established by the product design in this work.
- **EVIDENCE-CONFIRMED** — confirmed by the current OneShot runtime/source evidence.
- **DERIVED** — required to connect user-established behavior to confirmed runtime behavior without changing ownership.
- **UNCONFIRMED** — repository/deployment evidence is insufficient; Builder must inspect and must not invent.

No external reference may overwrite a USER-ESTABLISHED workflow rule.

---

# 1. Preserve Rules

The Builder must not:

1. Rename existing IDs.
2. Change which stage produces an ID.
3. Change stage ownership.
4. Insert a new workflow stage.
5. Remove a workflow stage.
6. Reinterpret an existing ID into another artifact.
7. Re-plan the entire system when only a narrow edit was authorized.
8. Start Planner before Research Review is explicitly accepted.
9. Start Builder before Build Ready is explicitly confirmed.
10. Erase Job/run history because active Plan/Phase/Task state was superseded.
11. Treat OneShot's own application source as the target project unless the user explicitly selected it.
12. Invent a new persistence product, database, queue, or deployment platform.
13. Invent a new authentication flow.
14. Invent browser/backend endpoints merely for UI convenience.
15. Simulate successful workflow, Build, Sandbox, validation, file mutation, or hash state when the runtime has not produced it.
16. Display hidden/private model chain-of-thought as Task Management activity.
17. Replace existing runtime stores with a frontend-only state model.
18. Replace the existing run identity with a new Job identifier.

If a concrete repository contract is missing, report the missing contract. Do not fill it with a mock and call the feature complete.

---

# 2. Application Structure

**EVIDENCE-CONFIRMED / USER-ESTABLISHED**

Browser code lives under:

`src/`

Server-side provider integrations live under:

[`cloud/`](../app/web/cloud/README.md)

and are compiled by the root backend build.

The frontend asset build must not copy cloud source or provider credentials into:

`dist/`

The backend serves the built UI from:

`app/web/dist`

with the legacy `ui/` directory usable only according to the current repository fallback behavior.

The runtime bootstrap currently resolves:

```text
app/web/dist
    ↓ if present
served UI

otherwise
    ↓
ui/
```

Do not create another frontend root.

---

# 3. Known Browser Contracts

**USER-ESTABLISHED / PRIOR REPO-CONFIRMED CONTRACTS**

Preserve these established browser contracts:

- `GET /api/health`
- `POST /api/conversations`
- `POST /api/conversations/:id/messages`
- `POST /api/conversations/:id/prompt`
- `POST /api/conversations/:id/run`
- `GET /api/runs/:id`
- `GET /api/runs/:id/events` — SSE
- `GET /v1/workspace/tree?path=.&depth=3`
- `GET /v1/workspace/file?path=...`

Do not replace these routes with new equivalents.

## 3.1 Run contract

The established run response uses:

`run_id`

The browser uses that run identity for:

```text
POST /api/conversations/:id/run
        ↓
run_id
        ↓
GET /api/runs/:run_id
GET /api/runs/:run_id/events
```

SSE is the established live-run transport.

Do not add polling merely to reproduce state already available from SSE/run snapshots.

## 3.2 Action contracts not evidenced here

The current source evidence does **not** establish public HTTP route names for:

- Research Review Accept
- Research Again / redesign
- Plan Edit
- Phase Edit
- Task/Step Edit
- Build Ready Confirm Build
- Build Ready Cancel/return
- target-project upload/materialization

These actions are behaviorally required where specified below, but the Builder must bind them to the existing repository action/transition contract after inspecting the real server implementation.

**Do not invent a route name in the UI.**

If the repository genuinely lacks the required transport/action, report:

`REQUIRED_ACTION_CONTRACT_MISSING`

and identify the exact missing behavior before adding a backend contract.

---

# 4. Authentication

**USER-ESTABLISHED**

Authentication supports:

- same-origin browser sessions
- optional `ONESHOT_API_TOKEN` Bearer authentication

If the browser uses the optional Bearer token, keep it only in:

`sessionStorage`

Do not invent a login endpoint.

Do not invent a CSRF endpoint.

Do not move provider/API credentials into the frontend build.

Authentication state shown in the UI must reflect the real backend relationship.

---

# 5. Generate Readiness

**USER-ESTABLISHED**

Generate readiness is runtime-owned.

Message text alone must never enable Generate.

The frontend must not infer readiness from:

- prompt length
- keyword matching
- local heuristics
- fake intent scores

Generate/Run availability must come from actual conversation/intent/runtime state.

---

# 6. Run Context

**USER-ESTABLISHED**

Run Context must render only fields actually present in the run/conversation/runtime snapshot.

Do not create example IDs, fake hashes, fake provider names, fake file counts, or invented validation state to fill empty UI.

Possible real fields may include:

- `run_id`
- Prompt ID
- Research ID
- Plan ID
- validation results
- Build ID
- processor/workflow state
- artifacts
- evidence
- hashes
- final verification result

Render a field only when the runtime actually provides it.

---

# 7. Existing Runtime Ownership

**EVIDENCE-CONFIRMED**

The current runtime already owns the major state systems.

```text
ConversationStore
    ↓
IntentCollectionService

AppendOnlyProcessingEventStore
    ↓
ProcessingEventBus
    ↓
TaskManagement
    +
CheckpointStore

RunRepository

FileArtifactStore

PipelineHistory
    ↓
Redis-backed pipeline transition/history support

SandboxService
    ├─ HardenedProcessRunner
    └─ ContainerSandboxRunner
```

The global event observer already connects processing events into:

- RunRepository snapshots
- TaskManagement/checkpoint state

Therefore:

**The frontend must consume/project existing runtime state.  
The frontend must not become the new canonical run store.**

---

# 8. JobId = Existing Run Identity

**DERIVED — closes JobId/runId ambiguity**

The UI term **JobId** maps to the existing OneShot run identity:

`JobId = run_id`

This is a **presentation alias**, not a new identifier.

Do not create:

```text
job_id != run_id
```

for the same execution.

One UI JobId spans the complete existing run.

Example:

```text
JobId: 8F31A2
displayed from:
run_id: 8F31A2
```

Existing artifact IDs remain separate and retain their ownership:

- prompt_id
- research_id
- plan_id
- audit_id
- schema_id
- fixture_id
- goal_id
- build_id
- artifact IDs
- other established IDs

Queue jobs already carry only the run identity.

Do not add another run-level ID.

---

# 9. Canonical Pipeline

**USER-ESTABLISHED**

The successful accepted path contains six LLM reasoning/build phases.

Validators and hash checks are deterministic.

```text
User Prompt
   |
   v
1. Researcher                      LLM #1
   |
   v
STOP — Research Review             HUMAN GATE #1
   |-- edit Research sections
   |-- request more Research
   `-- ACCEPT
        |
        v
Accepted Research Baseline
        |
        v
2. Planner                         LLM #2
        |
        v
3. Refactor                        LLM #3
        |
        v
4. Gap Analysis                    LLM #4
        |
        v
5. Evaluation                      LLM #5
        |
        v
Triple Validation                  DETERMINISTIC
   |-- Schema VALID
   |-- Fixture VALID
   `-- Goal VALID
        |
        v
CONFIRMED
        |
        v
Create confirmation hash           DETERMINISTIC
        |
        v
STOP — BUILD READY                 HUMAN GATE #2
        |-- Cancel / return
        `-- CONFIRM BUILD
              |
              v
6. Builder                         LLM #6
              |
              v
Sandbox execution                  CODE / RUNTIME
              |
              v
Post-build validation/hash check   DETERMINISTIC
              |
              v
DONE
```

No stage may be removed or inserted.

---

# 10. Primary Pipeline and Fallback Runtime

**EVIDENCE-CONFIRMED**

The runtime has:

1. a per-stage BullMQ pipeline as the primary execution path
2. a legacy inline runtime fallback when the pipeline/Redis path is unavailable

The UI must remain runtime-mode agnostic.

It must display actual events/snapshots from the active runtime path.

Do not:

- assume the BullMQ worker is always available
- show queued-stage state when the runtime is operating inline
- fabricate missing events so both modes appear identical

The UI may normalize real runtime data into the same human-readable presentation, but it must not manufacture state.

---

# 11. Target Project Boundary

**USER-ESTABLISHED**

OneShot operates on a **selected target project workspace**.

```text
OneShot Application
        |
        | controls/orchestrates
        v
Selected Target Workspace
        |
        v
Pipeline
```

The OneShot application is not automatically the target project.

## 11.1 Existing runtime evidence

**EVIDENCE-CONFIRMED**

The backend currently resolves workspace root as:

```text
ONESHOT_WORKSPACE_ROOT
        ||
projectRoot
```

This creates a possible self-target fallback.

## 11.2 Required behavior

**DERIVED**

For the production/hackathon UI:

- Run must not silently present OneShot's own `projectRoot` as a user-selected target.
- The selected target must be explicit in Run Context before Research begins.
- If `ONESHOT_WORKSPACE_ROOT` intentionally points at the target, use it.
- A `projectRoot` fallback is permitted only when that root is explicitly the selected target or an established local/demo mode intentionally uses it.
- If target identity cannot be established, do not claim that the selected project is isolated from OneShot.

The UI must show the actual target root/source from real runtime state where available.

---

# 12. Target Sources

**USER-ESTABLISHED**

The intended product supports:

1. **Bundled Sample** — zero-setup hackathon/demo target
2. **Uploaded / user-selected project** — arbitrary target project

Both must eventually converge into the same target-workspace pipeline behavior.

## 12.1 Bundled Sample

Bundled Sample is the guaranteed zero-setup hackathon path.

It must materialize/select a real target workspace, not a fake Explorer-only tree.

## 12.2 Upload Project

Upload Project must not be faked.

Current supplied route evidence does not establish an upload/materialization endpoint.

Therefore:

- the UI may not pretend browser-selected files are available to the backend unless they have actually been materialized into the target workspace
- the Builder must inspect the repository for an existing ingestion/import/upload mechanism
- if none exists, the upload feature is **not complete**
- do not invent an HTTP endpoint in frontend code

Report:

`TARGET_UPLOAD_CONTRACT_MISSING`

until a real approved transport/materialization contract exists.

This is a transport gap, not permission to redesign the pipeline.

---

# 13. Explorer

**USER-ESTABLISHED**

The Explorer is the **complete selected target workspace tree**.

It must not be merely a list of artifacts created by the current run.

Show:

- existing folders
- existing files
- unchanged files
- created files
- mutated files
- deleted files only if deletion is actually represented by runtime evidence

Created/mutated state decorates the tree.

It does not generate the tree.

Example:

```text
checkout-api/
├─ package.json
├─ src/
│  ├─ api.ts
│  ├─ auth.ts
│  └─ validator.ts        Modified
├─ tests/
│  └─ validator.test.ts   Created
└─ ...
```

Explorer reads real workspace state through the existing workspace contracts.

---

# 14. File Viewer

**USER-ESTABLISHED**

Opening a file:

- reads the real workspace path
- shows actual file contents
- must not mutate the file merely because it was opened
- may show loading/error states
- may show mutation metadata only when supplied by runtime/history evidence

Where real evidence exists, the UI may show:

- current content
- before state
- after state
- diff
- operation
- associated JobId/run_id
- artifact/event metadata
- hashes

Do not fabricate before/after state or hashes.

---

# 15. File Mutation Record

**USER-ESTABLISHED REQUIREMENT + EVIDENCE-CONSTRAINED IMPLEMENTATION**

Job History must be able to show files created/mutated within the selected JobId/run.

The existing runtime provides:

- append-only processing events
- RunRepository state
- FileArtifactStore
- checkpoints
- PipelineHistory

However, the supplied bootstrap evidence alone does not prove that every target-workspace mutation is currently represented as a durable per-file mutation record.

Therefore:

1. First derive the file record from existing runtime event/artifact/history data.
2. Do not create a second frontend-only mutation ledger and call it canonical.
3. If existing event/artifact records are insufficient to reconstruct required file mutations, report:

`FILE_MUTATION_LEDGER_CONTRACT_MISSING`

4. Do not add a new database merely to solve this UI feature.
5. Any minimal runtime contract extension must preserve existing event/artifact ownership and compatibility.

The UI must clearly distinguish:

- known created/mutated files
- unknown/unavailable mutation metadata

---

# 16. Research Review — Human Gate #1

**USER-ESTABLISHED**

Research completion is a hard stop.

When Research completes:

1. stop downstream execution
2. show Research Summary in the main workspace
3. put Task Management in Waiting / Human Hook
4. permit appropriate Research-section edits
5. permit Research Again / redesign request
6. require explicit Accept before Planner
7. if Research runs again, return here and stop again

Planner calls remain zero until acceptance.

---

# 17. Research Summary

Render the actual Research result in human-readable sections.

Possible sections, only where real output exists:

- Current User Intent
- Requirements
- Evidence / Findings
- Goals
- Success Criteria
- Fixtures / Test Cases
- Constraints
- Design / Implementation Direction

Do not call the Research result the final Plan.

Research prepares the accepted baseline.

Planner owns planning after acceptance.

---

# 18. Accepted Research Baseline

**USER-ESTABLISHED**

After acceptance:

```text
Planner input
=
Accepted Research Baseline
+
accepted narrow requested change
```

Acceptance freezes the broader baseline for downstream work.

Planner must not automatically reinterpret the entire system.

Broader replanning is authorized only by an explicit global Plan Edit.

---

# 19. Main Workspace

**USER-ESTABLISHED**

The center is the primary communication/work surface.

It changes with workflow state.

It is not only a chat thread.

## 19.1 Research Review mode

Show:

- Research Summary
- review state
- permitted edit/actions
- Accept / Research Again as available

## 19.2 Active Plan mode

After Research acceptance and Plan generation, replace Research Review with current Plan Summary / Plan Details.

Render actual available Plan fields such as:

- Current Intent
- Accepted Scope
- Plan Summary
- Requirements
- Tasks
- affected files
- constraints
- validation state
- plan/revision metadata

## 19.3 Human Question mode

Show:

- question
- reason/context intended for the user
- only actions/edit scope allowed by the current hook

## 19.4 Build Ready mode

Show:

- Schema VALID
- Fixture VALID
- Goal VALID
- Plan/package CONFIRMED
- confirmation hash
- build package/scope summary
- Confirm Build
- Cancel/return

## 19.5 Final Result mode

Show actual:

- JobId/run_id
- result
- changed files
- validation result
- confirmation hash
- sandbox/result hash
- verification result
- final state

---

# 20. Conversation Behavior

**USER-ESTABLISHED**

Conversation is the human-readable record of:

- original Intent
- follow-up messages
- clarification questions
- Research completion
- Research Review changes
- Research acceptance
- global Plan revisions
- phase-scoped edits
- task-scoped edits
- runtime questions
- user answers
- confirmations
- Build authorization
- final outcome

Conversation and current working state must remain synchronized.

The chat is a history/communication surface.

It is not allowed to silently become a second independent Plan store.

---

# 21. Normal Running Chat

During normal execution:

- Plan/Phase/Task edit controls are closed
- Plan surface is read-only
- Task Management is read-only
- ordinary chat does not silently authorize global replanning

If the existing runtime allows normal messages while a run is active, those messages remain conversation input only until the runtime explicitly creates an allowed hook/transition.

Do not silently mutate an active Plan from an ordinary running-state message.

---

# 22. Human Hook Authority

**USER-ESTABLISHED**

Edits exist only when the runtime is intentionally waiting for user input.

```text
RUNNING
   |
   v
HOOK / QUESTION
   |
   v
appropriate edit/action authority opens
   |
   v
USER RESPONDS
   |
   v
runtime accepts transition
   |
   v
context/history synchronized
   |
   v
edit controls close
   |
   v
RUNNING
```

The frontend must not be the sole enforcement mechanism.

A stale or unauthorized action submitted outside the allowed runtime state must not trigger mutation merely because the browser sends it.

**Required authority rule:**

`Runtime state authorizes the transition; UI visibility only mirrors that authority.`

---

# 23. Hook Idempotency / Stale Actions

**DERIVED from USER-ESTABLISHED gate authority**

A human gate is resolved once per current gate/revision.

The implementation must prevent:

- double-click starting Planner twice
- duplicate Confirm Build starting Builder twice
- stale browser tab applying an edit to a newer Plan revision
- replaying a previous hook action after execution resumed

Use existing run/plan/revision/checkpoint state to validate the action.

Do not invent a second run ID for retries.

If the repository lacks stale-action protection, report:

`HUMAN_GATE_CONCURRENCY_GUARD_MISSING`

before claiming the human-gate behavior production-ready.

---

# 24. Three Edit Scopes

There are exactly three user edit authorities.

---

## 24.1 Plan Edit — global

**USER-ESTABLISHED**

Plan Edit means the user is changing the whole Plan/Intent.

It:

- revises authoritative Intent
- records the revision in conversation
- reopens the entire Plan
- permits whole-Plan replanning
- re-syncs downstream Phase/Step/Task presentation
- may reopen Research if the accepted baseline is no longer sufficient
- reverts applicable recent work from the current Plan revision
- preserves historical evidence of superseded/reverted work

### Rollback boundary

**DERIVED resolution**

"Recent applicable work" means:

- work belonging to the current Job/run
- applied after the currently accepted Plan revision/baseline point
- within the mutable target-workspace/result state owned by that Plan revision

It must **not**:

- rewrite prior Job/run history
- erase previous run evidence
- mutate unrelated historical jobs
- reinterpret accepted Research history as if it never existed

If the runtime does not currently expose enough rollback/checkpoint information to perform this safely, report:

`PLAN_ROLLBACK_CAPABILITY_MISSING`

Do not perform destructive guessed rollback.

---

## 24.2 Phase Edit — phase scope

**USER-ESTABLISHED**

Phase Edit:

- preserves overall Plan
- preserves unrelated phases
- re-syncs selected phase
- regenerates/reprojects that phase's Step/Task breakdown
- resets/removes superseded completion state in the **active current phase view**
- preserves historical task/event evidence

Historical records are append-only evidence even when the current representation changes.

---

## 24.3 Task / Step Edit — narrow immediate scope

**USER-ESTABLISHED**

Task/Step Edit:

- changes only the selected Step/Task
- preserves overall Plan
- preserves phase
- preserves unrelated tasks
- does not globally replan
- does not resync unrelated phases
- acts on the narrow change when execution resumes

Task edit does not silently become Plan Edit.

---

# 25. Build Ready Edit Authority

Build Ready is a human hook.

Established required actions:

- `Confirm Build`
- `Cancel / return`

Plan/Phase/Task edit controls at Build Ready are **not automatically exposed**.

They appear only if the actual runtime hook explicitly exposes that edit authority.

Do not assume that "human hook" means every edit level is available.

---

# 26. Build Ready Cancel / Return

**DERIVED minimal non-destructive semantics**

`Cancel / return` must:

- not start Builder
- not mutate target workspace
- not create a new Job/run
- preserve the current confirmed package/hash until something invalidates it
- return the UI to the current confirmed Plan/summary context while the run remains waiting for build authorization

If the user later performs an authorized Plan/Phase/Task change that changes the confirmed package, the prior confirmation/hash can no longer be presented as authorization for the changed package.

Do not silently reuse an invalidated confirmation hash.

---

# 27. Task Management — Human-Readable View

**USER-ESTABLISHED**

Normal Task Management shows **what work is happening**, not internal agent names as the primary labels.

Use:

```text
Phase
  └── Step
       └── Task / Todo
```

Example:

```text
Phase — Prepare Implementation

Step — Determine Scope
  ✓ Identify affected files
  ✓ Identify affected behavior
  ✓ Preserve unrelated behavior

Step — Prepare Tasks
  ✓ Break accepted work into tasks
  ● Map dependencies
  ○ Define validation coverage
```

Internal owner/processor names may appear in:

- advanced metadata
- Job History
- debug/audit surfaces

but not as the normal human-facing task hierarchy.

---

# 28. Task Data Authority

**EVIDENCE-CONFIRMED + DERIVED**

Task Management must be projected from real runtime evidence.

Existing ownership includes:

- AppendOnlyProcessingEventStore
- ProcessingEventBus
- TaskManagement
- CheckpointStore
- RunRepository snapshots
- PipelineHistory

Therefore the UI must not use a hardcoded fake list as canonical task progress.

Human-readable Phase/Step/Task labels may be a presentation mapping over actual runtime processors/events/checkpoints.

Rules:

- runtime event/state determines completion
- UI labels explain the work
- a label does not mark itself complete
- terminal state cannot be inferred from animation timing
- failure/root-cause state must remain visible

---

# 29. No Hidden Chain-of-Thought

Task Management and Chat may show intentionally exposed product information:

- current phase
- step/task summaries
- status
- short activity descriptions
- tool/runtime events intended for the user
- validations
- evidence
- artifacts
- errors
- user-facing Research summary

Do not display hidden/private model reasoning.

"Researching..." / "Checking dependency coverage..." is acceptable.

Private chain-of-thought is not a product event.

---

# 30. Phase Progression

Normal Phase progression changes the content in the same Task Management face.

Do not flip for ordinary Phase changes.

Human-readable presentation may communicate:

```text
Understand / Research
        ↓
Prepare Tasks
        ↓
Refine Plan
        ↓
Check Gaps
        ↓
Evaluate
        ↓
Validate
        ↓
Build Ready
        ↓
Build / Verify
```

These are display labels only.

Internal ownership and stage IDs remain unchanged.

---

# 31. Task Management 180° Flip

**USER-ESTABLISHED**

The Y-axis 180° flip has one meaning only:

```text
Current Job  ↔  Job History
```

Do not use the same flip for:

- Research → Planner
- Phase transitions
- Plan edits
- Build Ready
- Sandbox opening

Exact CSS/component implementation is Builder-owned.

Behavioral meaning is fixed.

---

# 32. Current Job Face

Show actual current run state:

- JobId (`run_id`)
- human-readable Phase
- Step
- Tasks/Todos
- progress
- health
- hook/waiting state
- current target/workspace context when useful

During normal running, this face is read-only.

---

# 33. Job History Face

Job History shows historical run evidence.

Selecting a JobId/run_id loads:

- status/result
- phase/step/task history where available
- Plan/Phase/Task revision history where available
- files created/mutated for that run where available
- final validation/build/verification evidence

Current state and history are different:

```text
Current Job = truth now
Job History = how it got there
```

Do not delete historical evidence because active work was superseded.

---

# 34. Job History Split View

When a historical Job is selected:

```text
┌─────────────────────────┬─────────────────────────┐
│ Job Records             │ Selected Job Files      │
│                         │                         │
│ Run A      VERIFIED     │ src/validator.ts        │
│ Run B      FAILED       │ tests/validator...      │
│ Run C      VERIFIED     │ ...                     │
│                         │                         │
│        ~50%             │          ~50%           │
└─────────────────────────┴─────────────────────────┘
```

Requirements:

- selected `run_id` controls the right-hand record
- file records belong to that run
- current run changes do not rewrite old history
- exact responsive ratio may adapt

---

# 35. Persistence Ownership

**EVIDENCE-CONFIRMED — closes prior persistence gap**

Persistence ownership is **not globally UNCONFIRMED**.

The runtime already uses:

- `RunRepository(runtimePaths.runState)`
- `FileArtifactStore(runtimePaths.runs)`
- `AppendOnlyProcessingEventStore(runtimePaths.taskEvents)`
- `CheckpointStore(runtimePaths.checkpoints)`
- `ConversationStore(runtimePaths.conversations)`
- `PipelineHistory(getSharedRedis())`

Queue jobs carry only the run identity because durable state is owned outside the queue job payload.

Therefore:

- reuse these stores
- do not add a second canonical browser history store
- do not add Supabase
- do not replace Redis/BullMQ merely for this UI
- do not create a new database solely for Job History

---

# 36. Persistence Durability Scope on Render

**EVIDENCE-CONFIRMED PLATFORM FACT + DEPLOYMENT-CONFIG UNCONFIRMED**

Render services use an ephemeral filesystem by default.

Official Render references:

- https://render.com/docs/disks
- https://render.com/docs/deploys
- https://render.com/docs/web-services

Therefore the runtime's file-backed stores are only durable across restart/redeploy if their paths are placed on already-approved persistent storage.

Redis/PipelineHistory durability similarly depends on the actual deployed Redis/Render Key Value configuration.

The source-of-truth requirement is:

1. inspect where `runtimePaths.*` resolve in production
2. inspect whether those paths are backed by persistent storage
3. inspect Redis/Key Value deployment durability
4. report the actual history scope

UI/runtime must distinguish:

```text
History scope: current service session
```

from:

```text
History scope: durable across restart/deploy
```

Do not claim durable Job History without deployment proof.

### No architecture invention

If current deployment is not durable:

- do not silently add Render Postgres
- do not silently add Render Key Value
- do not silently attach a persistent disk
- do not silently add SQLite/Supabase/external storage

Report:

`DEPLOYED_HISTORY_DURABILITY_NOT_CONFIGURED`

The product behavior remains defined; deployment durability requires approved infrastructure if absent.

---

# 37. Live Run Updates

The browser uses:

`GET /api/runs/:id/events`

as the established SSE live-run path.

Task Management, main workspace, health state, file indicators, hooks, and final state must respond to:

- actual SSE events
- actual run snapshots
- actual backend action results

Do not create a second live transport only for the new UI.

On terminal completion, fetch/render the actual final run state as established by the current client/runtime behavior.

On disconnect before terminal state, show a disconnect/error state.

Do not fabricate completion.

---

# 38. Health Status

Job health and file mutation are separate concepts.

Possible real job presentation states:

- Pending
- Running
- Waiting / Human Hook
- Verified / Done
- Failed / Not Valid
- Disconnected / backend unavailable where connectivity evidence requires it

Possible file presentation states:

- Created
- Modified
- Deleted only where real deletion evidence exists
- Unchanged

Exact colors are visual implementation details unless already established by the current design system.

Health color never overrides the actual text/state.

---

# 39. Triple Validation

**USER-ESTABLISHED + EVIDENCE-CONFIRMED**

Triple Validation remains deterministic.

```text
Schema Validation
Fixture Validation
Goal Validation
```

The runtime already composes deterministic validation lanes/workflow.

Build Ready requires all required validators to be:

`VALID`

Do not use an additional model call merely to decide whether deterministic validation passed.

Do not mark validation complete until actual runtime results establish it.

---

# 40. Confirmation and Hash

After all three validators are VALID:

```text
CONFIRMED
    ↓
Create confirmation hash
    ↓
STOP — BUILD READY
```

The hash is produced by the existing confirmation/hash workflow.

The frontend must render the actual runtime hash.

Do not generate a placeholder browser SHA-256 and call it the confirmation hash.

---

# 41. Build Ready — Human Gate #2

Build Ready must show actual available state such as:

```text
Build Ready

Schema             VALID
Fixture            VALID
Goal               VALID
Plan               CONFIRMED
Confirmation hash  <actual hash>
Build package      READY

[ Confirm Build ]   [ Cancel / Return ]
```

Do not start Builder automatically.

Build authorization is a runtime transition, not merely a UI animation.

---

# 42. Builder Handoff

**USER-ESTABLISHED**

After Confirm Build:

Builder receives the exact same confirmed immutable package plus the confirmation hash.

Do not:

- generate another pre-build package
- reinterpret the Plan
- recompute a different confirmation input
- silently widen scope
- create a second plan
- create a second run merely for Build

Builder executes only the authorized scope.

---

# 43. Existing Sandbox Runtime

**EVIDENCE-CONFIRMED — closes Sandbox ambiguity**

The runtime already has:

```text
SandboxService
    |
    |-- HardenedProcessRunner
    `-- ContainerSandboxRunner
```

selected by:

`ONESHOT_SANDBOX_RUNNER`

and using:

`runtimePaths.sandboxWorkspaces`

Therefore the Builder is **not** authorized to replace the Sandbox with a fake browser simulation.

The UI's temporary Sandbox panel is a presentation of the existing runtime execution.

---

# 44. Sandbox UI

**USER-ESTABLISHED**

After Build confirmation, show a temporary Sandbox execution/status surface.

It may be:

- drop-down
- drawer
- expandable panel
- temporary overlay
- equivalent component

Show only real states/events available from the runtime.

Possible presentation:

```text
Sandbox

Preparing workspace
Loading confirmed package
Applying authorized build
Collecting result
Computing result hash
Verifying result
```

If the runtime does not expose one of those granular states, do not fake it.

Use the nearest real state.

---

# 45. Sandbox Completion Behavior

When runtime verification completes:

1. show actual resulting hash
2. show actual verification result
3. make the result visible to the user
4. collapse/remove the temporary Sandbox UI
5. leave the Final Build Result visible in the main workspace

The panel disappearing is visual behavior only.

It does not destroy or define the runtime isolate lifecycle.

---

# 46. Post-Build Verification

**USER-ESTABLISHED**

The verification rule is:

```text
hash == hash_sandbox
```

The pre-build confirmation hash and sandbox-result hash use the same established canonical comparable representation.

Do not:

- invent a second hash input
- hash a different representation
- change the comparison contract
- use an LLM to decide equality
- accept mismatch as verified

```text
hash == hash_sandbox
        |
        v
VERIFIED
        |
        v
DONE
```

---

# 47. Final Result

A successful final result is shown only when the real workflow reaches terminal success.

Show actual fields only:

- JobId / run_id
- result
- validation state
- files created/mutated
- build result
- confirmation hash
- sandbox/result hash
- equality verification
- provider/runtime information where real

A failed/root-cause run must show the actual failure.

Do not animate a fake successful ending.

---

# 48. Context Synchronization

**USER-ESTABLISHED + EVIDENCE-CONFIRMED RUNTIME OWNERSHIP**

The following surfaces represent one run:

```text
Conversation
     |
Current Intent
     |
Research / Accepted Research
     |
Current Plan
     |
Task Management
     |
Workspace / File State
     |
Job History
     |
Build / Verification Result
```

The canonical data remains runtime/store owned.

The UI is a projection.

No view may silently become an independent source of truth.

---

# 49. Context Save Model

Use existing runtime stores for their established responsibilities:

```text
Conversation / intent
    → ConversationStore / IntentCollectionService

Run snapshot/state
    → RunRepository

Task/activity/history
    → AppendOnlyProcessingEventStore
    → TaskManagement
    → CheckpointStore

Artifacts
    → FileArtifactStore

Pipeline transition/history
    → PipelineHistory / Redis
```

Human edit decisions must be synchronized through the existing conversation/run/task transition architecture, not kept only in component memory.

If a UI action appears to succeed but is not represented in runtime state/history, it is not complete.

---

# 50. Plan/Phase/Task Edit History

Edit scope must remain visible in historical context.

Conceptually:

```text
Plan Edit
scope: global

Phase Edit
scope: phase

Task Edit
scope: narrow
```

The exact user-facing text can vary.

The semantics cannot.

History must allow a human to distinguish:

- global intent revision
- phase resync
- task correction
- superseded work
- resumed execution

Do not flatten all edits into indistinguishable chat text if that loses authority scope.

---

# 51. Current State vs Historical State

The current UI may remove/reset superseded tasks after Plan/Phase edits.

Historical evidence must remain append-only according to the existing event/history model.

Example:

```text
CURRENT

Phase 4
○ new task A
● new task B

HISTORY

13:40 old task A completed
13:42 old task B completed
13:45 Phase Edit requested
13:45 previous breakdown superseded
13:46 new breakdown active
```

Do not delete history to make the active task list look clean.

---

# 52. Dependency Rules

Inspect existing dependencies first.

Expected UI dependency delta:

`0 new dependencies`

unless current repository capability is genuinely insufficient.

Do not add:

- another frontend framework
- another state manager solely for Task Management
- an animation framework solely for the flip
- a tree library solely for Explorer
- another backend framework
- Supabase
- another queue
- another persistence product
- another deployment platform

Use existing/browser-native capabilities where already appropriate.

If a new package is genuinely required, report:

- package
- responsibility
- why existing stack cannot satisfy it
- official docs
- production/dev dependency
- Render impact
- affected build artifact

before installation.

---

# 53. Render Deployment

**USER-ESTABLISHED**

Render remains the deployment target.

Do not replace Render.

Preserve the existing service build/start/deploy behavior.

Render's ordinary filesystem is ephemeral unless persistent storage is attached/configured.

Official basis:

- https://render.com/docs/disks
- https://render.com/docs/deploys
- https://render.com/docs/web-services

Do not equate "writes successfully during one run" with "durable after redeploy."

---

# 54. Required Commands

Preserve and run the established project commands:

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

If the root scripts delegate to subprojects, preserve that ownership.

Do not move configs to root merely for convenience.

Do not leave temporary markdown, scripts, test files, or generated scaffolding after implementation unless they are intentional tracked product artifacts.

---

# 55. Visual Layout Contract

The intended active application relationship is:

```text
┌───────────────────────────────────────────────────────────────────────┐
│ OneShot       Target / Run Context              JobId      Health    │
├─────────────────┬─────────────────────────────────┬───────────────────┤
│                 │                                 │                   │
│ Explorer        │ Main Workspace                  │ Task Management   │
│                 │                                 │                   │
│ Target project  │ Research Summary                │ Phase             │
│ folders/files   │ Plan Summary / Details          │  └ Step           │
│                 │ Human Question                  │     └ Todo         │
│ file status     │ Build Ready                     │                   │
│                 │ Final Result                    │ progress/health   │
│                 │                                 │                   │
├─────────────────┴─────────────────────────────────┴───────────────────┤
│ Conversation / message input                                         │
└───────────────────────────────────────────────────────────────────────┘
```

Exact pixel widths are implementation detail.

Responsibility placement is fixed.

---

# 56. Flip Visual Contract

```text
FRONT                                       BACK

Current Job                                Job History
───────────                                ───────────

Phase                                      Job list     | Job files
 Step                                      run_id       | Created
  Task                                     Status       | Modified
  Task                                     Result       | ...
```

Transition:

```text
Current Job
     |
rotateY(180deg)
     |
Job History
```

The flip is a navigation/history metaphor only.

---

# 57. Human Experience

The visible product story is:

```text
Select Target
      |
      v
Describe Intent
      |
      v
Understand / Research
      |
      v
STOP — Research Review
      |
      | edit/research again
      ` ACCEPT
            |
            v
Prepare Work
      |
      v
Refine
      |
      v
Check Gaps
      |
      v
Evaluate
      |
      v
Validate
      |
      v
CONFIRMED + HASH
      |
      v
STOP — Build Ready
      |
      ` Confirm Build
            |
            v
Build
      |
      v
Real Sandbox Runtime
      |
      v
hash == hash_sandbox
      |
      v
Verified Final Result
```

Normal execution is read-only.

Human mutation authority appears only at real hooks/questions.

---

# 58. Completion Blocking Conditions

Do **not** claim the feature set complete if any applicable condition remains:

- `REQUIRED_ACTION_CONTRACT_MISSING`
- `TARGET_UPLOAD_CONTRACT_MISSING`
- `FILE_MUTATION_LEDGER_CONTRACT_MISSING`
- `HUMAN_GATE_CONCURRENCY_GUARD_MISSING`
- `PLAN_ROLLBACK_CAPABILITY_MISSING`
- `DEPLOYED_HISTORY_DURABILITY_NOT_CONFIGURED` when durable cross-redeploy history is claimed

A missing optional deployment durability configuration does not invalidate the workflow itself, but the UI/documentation must accurately state history scope.

---

# 59. Verification Before Completion

## Repository

Verify:

- existing package/runtime structure preserved
- no unauthorized migration
- no duplicate root configs
- no temporary implementation debris
- dependency delta reported

## Browser contracts

Verify:

- known routes preserved
- SSE preserved
- no invented auth routes
- Generate readiness runtime-owned
- Run Context contains only actual fields

## Run identity

Verify:

- UI JobId displays existing `run_id`
- no second run-level Job ID introduced
- historical Job selection resolves to that run

## Workflow

Verify:

- Research completion stops
- Planner cannot start before Research Accept
- Research rerun stops again
- normal running state locks edits
- runtime rejects stale/unauthorized hook actions
- Plan/Phase/Task authority remains distinct
- Triple Validation is deterministic
- Build Ready stops
- Builder requires explicit Build confirmation
- Builder receives exact confirmed package/hash
- Sandbox UI uses real runtime state
- final rule remains `hash == hash_sandbox`

## Task Management

Verify:

- Phase → Step → Task is human-readable
- progress derives from runtime events/checkpoints
- no fake timer-completion model
- phase changes do not flip history card
- history flip is Current Job ↔ Job History

## Workspace/files

Verify:

- Explorer shows complete real target workspace
- file content comes from real workspace API
- OneShot source is not silently selected as target
- mutation records come from runtime/artifact/history evidence
- upload feature is not claimed unless backend materialization is real

## Context/history

Verify:

- conversation, Intent, Plan, Task, run, and history remain synchronized
- Plan Edit appears as global revision
- Phase Edit remains phase-scoped
- Task Edit remains narrow
- superseded active tasks remain in history
- persistence uses existing runtime stores
- deployed durability scope is truthfully reported

## Build/Sandbox

Verify:

- no fake Build progress
- no fake Sandbox progress
- actual result hash shown
- temporary Sandbox UI collapses after visible verification
- final result remains visible

## Commands

Run and report actual results:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

Then verify the real browser application.

---

# 60. Completion Report

Final Builder report must include:

```text
Changed
Commands Run
Result
Evidence
Dependency Delta
Browser Contract Changes
Runtime Contract Changes
Persistence Changes
History Durability Scope
Files Created
Files Modified
Files Removed
Stop Condition
```

Also report any blocking contract status from Section 58.

Do not hide a missing real backend contract behind frontend mock behavior.

---

# 61. Gap Closure Matrix

This version closes the prior document gaps as follows:

| Gap | Resolution |
|---|---|
| Persistence globally marked UNCONFIRMED | Existing runtime stores are now EVIDENCE-CONFIRMED; only deployed durability remains configuration-dependent |
| JobId vs runId | JobId is explicitly the UI alias for existing `run_id`; no new run identifier |
| Human gate action route ambiguity | Behavioral/runtime authority is fixed; exact route must bind to existing server contract and cannot be invented |
| Workspace could default to OneShot | UI/run must explicitly establish selected target; projectRoot fallback cannot be silently presented as user target |
| Upload transport undefined | Feature cannot be claimed until a real target materialization contract exists; no fake browser-only upload |
| Edit locking frontend-only | Runtime state is explicitly the mutation authority; UI only mirrors it |
| Sandbox ambiguous/simulated | Existing SandboxService/runners are authoritative; UI must project real Sandbox state |
| Task Management data source unclear | Existing event store, TaskManagement, checkpoints, RunRepository, and history are authoritative |
| Job history data source unclear | Existing run/event/checkpoint/artifact/history stores are first-class sources |
| File mutation ownership unclear | Must derive from existing runtime evidence; missing mutation ledger is explicitly blocking, not silently invented |
| Build Cancel/return ambiguous | Defined as non-mutating, no Builder start, confirmed state preserved until invalidated |
| Research Review label vs backend names | UI labels may differ; backend IDs/functions/ownership must not be renamed |
| Primary vs fallback runtime absent | UI must work from actual active runtime and must not fake parity |
| Duplicate/stale human actions | Runtime must guard gate/revision validity; missing guard is blocking |
| Browser route evidence partial | Known routes stay locked; missing required action transports are explicit contracts to inspect, not guessed URLs |

---

# 62. Final Preserve Statement

The Builder is completing the OneShot application around the established runtime.

The user-facing experience is:

**Understand → Review → Accept → Prepare Work → Refine → Check → Validate → Build Ready → Confirm Build → Build → Verify**

The application must explain real work in human language without exposing hidden model reasoning and without replacing internal ownership.

The runtime remains authoritative.

The UI remains a synchronized projection and human control surface.

The Builder may choose implementation details inside these established responsibilities, but may not redesign the workflow to make implementation easier.
