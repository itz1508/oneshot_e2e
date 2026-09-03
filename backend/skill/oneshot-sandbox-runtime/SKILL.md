# OneShot Sandbox Runtime Skill

## Purpose

Expose tools for the external isolated Sandbox execution boundary. This Skill operates strictly after the OneShot canonical workflow has produced an immutable `confirmed_package` and its canonical `HASH`.

## Responsibilities

- verify handoff package structure and canonical hash admission
- execute authorized plan steps in a hardened isolation boundary
- enforce resource, timeout, environment, and network policies
- record execution evidence (commands, exit codes, stdout/stderr refs, file changes, metrics)
- recompute `hash_sandbox` from canonical core and verify `HASH == hash_sandbox`
- perform automatic workspace and process cleanup

## Tools

- `verify_admission`
- `execute_sandbox`
- `audit_sandbox`
- `project_sandbox_graph`

## Authority Boundary

The Sandbox Runtime Skill does not own Intent Collection, Researcher, Planner, Refactor, Gap Analysis, Evaluation, Triple Validation, Confirmation, or Canonical Hash creation. It executes already-confirmed immutable work.
