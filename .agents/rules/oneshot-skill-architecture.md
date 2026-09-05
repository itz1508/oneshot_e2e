# OneShot Reusable Skill vs. Role Architecture — Core Rules

## 1. Three-Way Responsibility Partition

| Category | Location | Purpose & Boundary | Examples |
| :--- | :--- | :--- | :--- |
| **Pipeline Roles** | `backend/role/<role>/` | **Workflow responsibility owners.** Own defined responsibilities in the canonical pipeline. They are not registered as generic reusable Skills. | `Researcher`, `Planner`, `Refactor`, `GapAnalysis`, `Evaluation` |
| **Subsystem Domains** | `backend/task/`, `backend/intent/`, `backend/sandbox/`, `backend/recovery/` | **Subsystem responsibility owners.** Own domain state, persistence, execution, replay, or infrastructure behavior. They are not forced into Pipeline Roles or converted wholesale into Skills. | Task Event Store, Conversation Store, Sandbox Runtime, Failure Recovery |
| **Reusable Skills** | `skill/<name>/` + runtime integration under `backend/skills/` when required | **Cross-cutting capabilities.** Reusable procedures callable by multiple authorized callers without transferring workflow responsibility. | Existing examples: `canonical-contracts`, `init`; illustrative future examples: `schema-inspection`, `dependency-discovery` |

A subsystem may expose a reusable Skill surface when part of its capability is genuinely reusable. That does not transfer ownership of the subsystem to the Skill.

### Role `SKILL.md`

```text
backend/role/<role>/SKILL.md
```

is **Role Operating Instructions (SOP)**.

It defines how that Role performs its responsibility, including:

* evidence handling;
* provenance;
* validation expectations;
* inputs and outputs;
* allowed operations;
* forbidden operations;
* Role-specific execution rules.

It is **not** a globally discoverable reusable Skill.

---

## 2. Placement Invariant — Reusability Test

Before adding a capability, ask:

> **Can multiple authorized callers reuse this capability without inheriting a Role's workflow responsibility?**

### YES

Create or resolve a reusable Skill:

```text
skill/<name>/
backend/skills/<runtime-or-binding> (when required)
```

### NO — Role-dependent

Keep the capability private to the Role:

```text
backend/role/<role>/tool/
```

### NO — Subsystem-dependent

Keep it inside the subsystem that owns it:

```text
backend/intent/
backend/task/
backend/sandbox/
```

Do not force every capability into the Skill Catalog.

---

## 3. Authority Separation

When a Pipeline Role invokes a reusable Skill:

```text
Workflow
   ↓
Role
   ↓
Skill Registry
   ↓
Skill
   ↓
Tool / Runtime
```

Other authorized callers may invoke the same reusable Skill without a Pipeline Role:

```text
CLI / MCP / Operator / Subsystem / Authorized Runtime
   ↓
Skill Registry
   ↓
Skill
   ↓
Tool / Runtime
```

Core distinction:

```text
ROLE ≠ SKILL ≠ TOOL ≠ WORKFLOW
```

### Responsibilities

* **Workflow** determines canonical execution ordering and Role routing.
* **Role** owns its assigned workflow responsibility.
* **Skill Registry** discovers, resolves, and activates reusable capabilities.
* **Skill** defines a reusable procedure/capability.
* **Tool / Runtime** performs the concrete operation.

A reusable Skill does not gain authority to alter canonical workflow ordering, route workflow transitions, or take ownership of a Role's responsibility merely because that Role invokes it.

---

## 4. Dynamic Five-Stage Skill Lifecycle

```text
DISCOVER
   ↓
CATALOG
   ↓
RESOLVE EXACT
   ↓
ACTIVATE
   ↓
INVOKE
```

### 1. DISCOVER

Find valid Skill definitions and available runtime/tool surfaces across registered discovery locations.

Discovery does not authorize execution.

### 2. CATALOG

Index validated Skill descriptors.

The catalog is not required to be a permanently hard-coded list.

### 3. RESOLVE EXACT

Resolve the requested capability against the catalog using its exact required contract.

```text
exact match
→ resolve

no exact match
→ unresolved
```

Never silently substitute a merely similar Skill.

If supported:

```text
no exact match
↓
resolveOrCreate
↓
create / validate / register exact capability
↓
resolve exact
```

`resolveOrCreate` is a separate governed path, not fuzzy matching.

### 4. ACTIVATE

Bind the resolved Skill to its applicable runtime and callable surface.

Depending on the Skill, this may involve:

* `ToolRegistry`;
* direct TypeScript runtime;
* Python runtime;
* deterministic scripts;
* another appropriate implementation surface.

`ToolRegistry` is not mandatory merely for structural symmetry.

### 5. INVOKE

Execute the resolved capability and return its typed result to the authorized caller.

---

## 5. Role Skill Composition — Actual Reuse

Roles should compose reusable capabilities rather than duplicate them.

```text
Researcher (Role)                    Planner (Role)
├── Role SOP                         ├── Role SOP
│   evidence/provenance              │   audit/review rules
│                                    │
├── repository-audit Skill (future)  ├── repository-audit Skill (future)
├── dependency-discovery Skill       ├── dependency-discovery Skill
├── schema-inspection Skill          └── schema-inspection Skill
└── evidence-collection Skill
```

A capability such as `schema-inspection` is implemented once and reused.

Do not create `researcher-schema-inspection` and `planner-schema-inspection` unless their actual contracts and responsibilities are genuinely different.

---

## 6. No Forced Symmetry for Scripts

Standalone `scripts/` are **consumer-driven**, not cosmetic.

Use an independent script or adapter only when there is a real execution requirement such as:

* deterministic Python validation;
* canonicalization or hashing;
* CLI invocation;
* MCP invocation;
* external worker execution;
* integration testing;
* process-boundary execution.

Therefore:

```text
Skill A
├── SKILL.md
├── TypeScript runtime
└── Tool surface
```

can be completely valid without `scripts/`.

Likewise:

```text
oneshot-canonical-contracts/
└── scripts/*.py
```

can legitimately have standalone scripts because its deterministic Python operations benefit from independent invocation.

The rule is:

> **Add an external script/adapter because a real consumer requires it—not because another Skill has one.**

A Skill is complete when its required contract, resolution/activation path, runtime behavior, validation, and tests are complete for its responsibility. The presence of a `scripts/` directory does not determine completeness.
