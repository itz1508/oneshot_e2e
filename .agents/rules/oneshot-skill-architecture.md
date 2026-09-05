# OneShot Agent, IAM Role, Skill and Workflow Boundaries

## Authority and definitions

The user's architecture definition governs this repository: **Role is IAM identity.**

| Concept | Responsibility | Placement |
|---|---|---|
| Agent | Executes behavior and owns its workflow outputs | `backend/role/<name>/` (current implementation location) |
| Role | IAM identity associated with access permissions | No IAM implementation exists yet; do not fabricate one |
| Workflow | Controls execution order, transitions and routing | `backend/workflow/` |
| Skill | Reusable capability/procedure available to authorized callers | Existing discovery and bindings under `backend/skills/` |
| Tool | Performs a concrete operation | Shared registry or owning agent/subsystem |
| Subsystem | Owns domain state, persistence or execution services | `backend/task/`, `backend/intent/`, `backend/sandbox/`, runtime services |

Agent, Role, Skill, Tool and Workflow remain distinct. An agent name or an artifact ownership list does not establish IAM authorization. Do not invent an IAM backend or claim permission enforcement from a directory name.

## Current boundary

Workflow execution is implemented under `backend/role/`; a role-named path is not an IAM identity, and do not invent an IAM backend or claim permission enforcement from a directory name.

## Agent instructions and reusable skills

`backend/role/<name>/SKILL.md` files contain agent operating instructions (SOPs). They are not IAM definitions and must not automatically become globally discoverable reusable skills.

Before exposing a capability as a reusable skill, determine whether multiple authorized callers can use it without inheriting an agent's workflow responsibility. Keep agent-private operations with the agent and subsystem-private operations with the subsystem. A reusable surface does not transfer ownership of the underlying subsystem.

The current reusable-skill catalog discovers `backend/skills/*/SKILL.md`. Keep discovery documentation aligned with real callers; do not create a second root merely for symmetry.

## Skill lifecycle and execution

Preserve the lifecycle: discover -> catalog -> resolve exact -> activate -> invoke.

- Discovery indexes available definitions; it does not authorize execution.
- Resolve the requested identity/capability exactly; never silently substitute a similar skill.
- A governed resolve-or-create path must validate and register the required capability before invocation.
- Activation binds a real runtime and callable surface. A descriptor without an executable factory is not proof of a runnable skill.
- Tools may use TypeScript, Python, deterministic scripts or another implementation justified by the actual consumer. A ToolRegistry wrapper is not mandatory for structural symmetry.
- Skills return results to their caller. They do not gain authority to change canonical workflow order or grant IAM permissions.

Agents should reuse capabilities where the contracts genuinely match. Do not duplicate implementations merely to prefix them with an agent name.

## Scripts and process boundaries

Add standalone scripts for concrete consumers such as CLI invocation, deterministic validation, hashing, external workers or integration tests. Do not require every skill to contain a scripts directory.

When moving code, reconcile imports, runtime resource paths, Python module roots, fixtures, tests, packaging and launchers in the same bounded change. Preserve canonical artifact IDs and result vocabulary. Distinguish an applied file move from verified runtime behavior.
