# Builder Skill

Execute the exact confirmed immutable package in the isolated Sandbox only after Human Gate #2 (Build Ready / Confirm Build), then report build execution evidence.

## Ownership

- Consumes: the exact `confirmed_package` plus its canonical `HASH` (handed off only after explicit Confirm Build).
- Produces: a `BuilderWorkflowResult` — `SandboxExecutionResult` plus `final_output` and `output_step_id`.

## Workflow

`confirmed_package + HASH → Builder → SandboxService.execute → BuilderWorkflowResult`

- Runs only after an explicit, hash- and package-bound Confirm Build (`BuildReviewService`; the Builder does not start on pending/return). The pipeline verifies the package still matches the authorized hash before execution (`backend/pipeline/processors.ts::runBuildStage`).
- Executes authorized plan steps in the governed `SandboxService` with the confirmed package and hash.
- Recomputes `hash_sandbox` from the canonical comparable core; post-build verification requires `HASH == hash_sandbox`.
- Recovers the Builder's declared final output from the plan step whose `responsibility === "BuilderOutput"` (decoded from `ONESHOT_BUILDER_OUTPUT_BASE64:`), returning `final_output` + `output_step_id` only when execution passed, the hash matched, and the step exited 0.
- Records execution evidence (commands, exit codes, stdout/stderr refs, file changes, metrics) and performs workspace/process cleanup per the Sandbox boundary.

## Boundary

The Builder executes already-confirmed immutable work. It does not own Intent, Research, Planning, Refinement, Gap Analysis, Evaluation, Triple Validation, Confirmation, or Hash creation — all of those happen before the Build Ready gate. It also never simulates execution state or bypasses the explicit Build approval.