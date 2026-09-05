# OneShot Init Skill

## Purpose

Provide reusable repository initialization, directory provisioning, and environment preflight diagnostics for OneShot runtime callers.

## Capabilities

- `init`
- `workspace-initialization`
- `preflight-check`

## Responsibilities

- provision mandatory runtime data directories (`.runtime/runs`, `.runtime/checkpoints`, `.runtime/task-events`, `.runtime/run-state`, `.runtime/conversations`, `.runtime/sandbox-workspaces`)
- verify system dependencies (Python venv, Node.js version, environment configuration)
- perform fast, non-destructive health checks

## Tools

- `init_workspace`: Provision required directory trees safely.
- `check_preflight`: Perform environment and dependency diagnostic checks.

## Allowed Operations

- create runtime directories
- inspect platform environment variables
- verify binary availability (`python`, `node`)

## Forbidden Operations

- mutate canonical contracts or schemas
- alter workflow execution sequence
- execute arbitrary untrusted shell code
