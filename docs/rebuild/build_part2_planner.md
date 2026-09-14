# OneShot — Part 2: Planner Stage Architecture & Build Plan

## 0. Executive Summary & Canonical Workflow Positioning

Following the successful execution and verification of the **Researcher** vertical slice with Strands and Tavily capabilities, the verified package pattern now advances to the next stage: the **Planner**.

### Canonical Stage Sequence
```text
PROMPT
  ↓
RESEARCHER
  ├── Workspace Local Evidence Collector
  ├── Tavily Search & Extract Integration (Live API Key)
  └── ResearchBundle construction & validation
  ↓
[HUMAN GATE 1: RESEARCH REVIEW] (Explicit acceptance required; stops auto-progress)
  ↓
PLANNER  <-- (Current Target Stage)
  ├── Consumes accepted ResearchBundle
  ├── Evaluates 11 canonical PLANNER_REVIEW_AREAS
  └── Produces verified Audit artifact (urn:oneshot:schema:audit:2)
  ↓
REFACTOR (preserves identical logical plan_id; addresses audit findings)
  ↓
GAP ANALYSIS (LoopAgent: GapCheck -> GapFix -> GapRecheck)
  ↓
EVALUATION (produces 9 evidence areas)
  ↓
TRIPLE VALIDATION (SchemaValidation, FixtureValidation, GoalValidation in parallel)
  ↓
CONFIRMED PACKAGE
  ↓
HASH
  ↓
[HUMAN GATE 2: BUILD READY] (Explicit Confirm Build required)
  ↓
BUILDER (Deterministic Sandbox execution)
  ↓
DONE
```

---

## 1. External Research Intelligence (Tavily Search & Extract)

Using the live Tavily research capability (`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`), external architecture practices on AI agent planner governance and audit systems were researched:

### Key Research Findings
1. **DAG Representation & Schema Validation:**
   - Auditor governance requires formal, schema-validated representations of the planner's state and dependency graph.
   - Edge validations must guarantee absence of hallucinated cycles, missing prerequisite dependencies, or unmapped requirements.
2. **Audit Matrix & Typed Finding Objects:**
   - Deviations must be surfaced as structured finding records (`finding_id`, `area`, `affected_plan_refs`, `evidence_ids`, `required_refinement`) rather than untyped natural language critique.
   - Audits must document exact acceptance criteria and trace every step back to researched requirements and evidence IDs.
3. **References Extracted:**
   - *Graph-Based Agent Planning with Parallel Tools* (emergentmind.com/papers/2510.25320)
   - *Build dynamic web research agents with Strands Agents SDK & Tavily* (aws.amazon.com/blogs/machine-learning)
   - *Dependency Graphs for AI Agents* (arunbaby.com/ai-agents/0049-dependency-graphs-for-agents)

---

## 2. Canonical Contracts & Invariants

### 2.1 Contract Authority
- **URN:** `urn:oneshot:schema:audit:2`
- **Schema File:** `backend/schema/audit.schema.json`
- **TypeScript Interface:**
  ```typescript
  export interface AuditFinding {
    finding_id: string;
    area: string;
    finding: string;
    affected_plan_refs: string[];
    evidence_ids: string[];
    required_refinement: string;
  }

  export interface Audit {
    audit_id: string;
    researcher_id: string;
    plan_id: string;
    reviewed_areas: string[];
    findings: AuditFinding[];
  }
  ```

### 2.2 Core Invariants
1. **Human Gate Preservation:** The Planner **never** starts automatically from prompt submission; it executes only after the user accepts the `ResearchBundle` at Human Review 01 (`Research Review`).
2. **Logical Plan Identity:** The `plan_id` must remain identical across Researcher, Planner, and Refactor (`plan.plan_id === audit.plan_id`).
3. **Comprehensive Review Coverage:** All **11 review areas** must be explicitly enumerated in `reviewed_areas`.

---

## 3. The 11 Canonical Review Areas

The Planner evaluates the `ResearchBundle` across 11 deterministic review categories:

| Index | Review Area | Verification Check |
| :--- | :--- | :--- |
| 1 | `evidence sufficiency` | Verifies every requirement evidence_id exists in the bundle's evidence list. |
| 2 | `file or subject coverage` | Ensures at least one plan step covers the researched subject. |
| 3 | `requirement coverage` | Ensures every requirement in `plan.requirements` is referenced in `plan_steps.requirement_refs`. |
| 4 | `dependency coverage` | Verifies all dependencies specify valid `required_by` indices and resolve cleanly. |
| 5 | `goal clarity` | Validates that `goal.objective` and `goal.success_meaning` are non-empty. |
| 6 | `success criteria` | Confirms every `goal.success_criteria` criterion_id is mapped in `researcher.success_definition`. |
| 7 | `fixture usability` | Verifies fixture assertions exist and map to plan steps. |
| 8 | `schema applicability` | Verifies the schema artifact targets the plan and is referenced in step schema_refs. |
| 9 | `validation traceability` | Ensures `validation.schema_validation`, `fixture_validation`, and `goal_validation` route to the same `plan_id`. |
| 10 | `plan structure` | Validates step dependency DAG: no cycles, valid `depends_on` references. |
| 11 | `unresolved findings` | Tracks unresolved findings from prior refinement iterations. |

---

## 4. Implementation Structure

```text
backend/agents/planner/
├── workflow.ts          # PlannerWorkflow class implementing run(bundle, runId): Promise<Audit>
├── tool/
│   ├── coverage.ts      # Deterministic audit findings engine for the 11 PLANNER_REVIEW_AREAS
│   └── reasoning.ts     # Optional model-augmented refinement suggestion generator
└── tests/
    └── planner-workflow.test.ts  # Contract verification, positive 0-finding and negative finding tests
```

### 4.1 Planner Workflow Implementation Pattern
```typescript
export class PlannerWorkflow {
  constructor(private contracts: CanonicalContractSkill) {}

  async run(bundle: ResearchBundle, runId: string): Promise<Audit> {
    // 1. Validate incoming bundle against canonical schema
    await this.contracts.validate("urn:oneshot:schema:research_bundle:2", bundle);

    // 2. Audit against the 11 review areas
    const findings = plannerFindings(bundle);

    // 3. Construct canonical Audit record
    const audit: Audit = {
      audit_id: id("audit", runId),
      researcher_id: bundle.researcher.researcher_id,
      plan_id: bundle.plan.plan_id,
      reviewed_areas: [...PLANNER_REVIEW_AREAS],
      findings,
    };

    // 4. Validate output audit contract
    await this.contracts.validate("urn:oneshot:schema:audit:2", audit);
    return audit;
  }
}
```

---

## 5. Verification Plan

1. **Deterministic Parity Checks:**
   - Run `PlannerWorkflow.run(bundle)` on valid `ResearchBundle` -> Assert `audit.findings.length === 0`, `audit.reviewed_areas.length === 11`, and contract validates.
2. **Negative Mutation Checks:**
   - Delete a requirement reference from step 0 -> Assert finding produced under area `requirement coverage`.
   - Clear goal objective -> Assert finding produced under area `goal clarity`.
3. **Refactor Handoff Integration:**
   - Confirm `RefactorWorkflow.run(bundle, audit)` consumes `audit` and refines plan while incrementing `revision` and preserving logical `plan_id`.
