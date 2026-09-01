# 📚 OneShot Architecture & Documentation Index

This index organizes the definitive architectural specifications, execution trees, canonical contracts, visual diagrams, and runtime graphs that demonstrate the OneShot deterministic execution platform.

---

## 🌟 Core Architecture & Verification Artifacts

| Document | Format | Description | Primary Audience |
|---|---|---|---|
| [`docs/WORKFLOW_TREE`](WORKFLOW_TREE) | Text / ASCII | **Source of Truth Execution Hierarchy**: Complete pipeline flow from Chat/Intent → Prompt → Researcher → Planner → Refactor → Gap Analysis → Evaluation → Triple Validation → Confirmation → SHA-256 Hash → Isolated Sandbox Execution. | All Engineers & Judges |
| [`docs/WORKFLOW_TREE.pdf`](WORKFLOW_TREE.pdf) | PDF Diagram | **Visual Workflow Hierarchy**: Rendered tree diagram of the OneShot canonical execution flow. | Judges & Architects |
| [`docs/source/OneShot_Canonical_Contract_and_Verification.txt`](source/OneShot_Canonical_Contract_and_Verification.txt) | Specification | **Canonical Contract & Verification Specification**: Complete Draft 2020-12 schemas, audit IDs, gap verification, evaluation evidence, canonicalization bytes, and contract registry. | Protocol & Contract Reviewers |
| [`docs/TASK_MANAGEMENT_AND_ADK_GRAPH.md`](TASK_MANAGEMENT_AND_ADK_GRAPH.md) | Markdown | **Task Management & Runtime Graphs**: Monotonic append-only event persistence, Google ADK Gemma 2 LlmAgent graph, and Authority Projection graph. | Runtime & AI Engineers |
| [`docs/Workflow_Processing.pdf`](Workflow_Processing.pdf) | PDF Diagram | **Full Workflow Processing Map**: End-to-end visual diagram showing every processor transition, state gate, and proof artifact. | Judges & System Architects |

---

## 🚀 Quick-Start & Guides

| Document | Format | Description |
|---|---|---|
| [`JUDGE_README.md`](../JUDGE_README.md) | Markdown | **Judge Demonstration Guide**: Under 3-minute quickstart guide for hackathon judges with interactive step-by-step verification instructions. |
| [`README.md`](../README.md) | Markdown | **Complete Repository Documentation**: Full system overview, 60-second setup, architecture hierarchy, and test commands. |
| [`CANONICAL_WORKFLOW.md`](../CANONICAL_WORKFLOW.md) | Markdown | **Workflow Order & Authority**: Defines immutable workflow sequencing, role separation (`ROLE != SKILL != TOOL != WORKFLOW`), and proof boundaries. |

---

## 🔬 Subsystem & Integration Records

| Document | Description |
|---|---|
| [`docs/ADK_GEMMA2_INTEGRATION.md`](ADK_GEMMA2_INTEGRATION.md) | Google ADK LlmAgent / Runner integration with local Ollama Gemma 2 9B. |
| [`docs/WORKSPACE_API_DESIGN.md`](WORKSPACE_API_DESIGN.md) | Standalone FastAPI Workspace API control plane, database models, and path security policy. |
| [`docs/INTENT_AUTHORITY_AND_HELP.md`](INTENT_AUTHORITY_AND_HELP.md) | Multi-turn conversational intent collection, revision loops, and targeted help request mechanisms. |
| [`docs/ONESHOT_IDE_BUILD_RECORD.md`](ONESHOT_IDE_BUILD_RECORD.md) | Architecture and implementation record for the OneShot React IDE. |
| [`docs/RESEARCH_PROVIDER_BUILD_RECORD.md`](RESEARCH_PROVIDER_BUILD_RECORD.md) | Multi-provider AI research architecture (Sample, ADK Gemma 2, Featherless). |
| [`docs/WORKSPACE_API_BUILD_RECORD.md`](WORKSPACE_API_BUILD_RECORD.md) | FastAPI control plane endpoints, SQLite persistence, and token rotation. |
| [`docs/source/Create_Script_Skills_and_Contracts.txt`](source/Create_Script_Skills_and_Contracts.txt) | Comprehensive guide on creating script skills, schema contracts, and validator bindings. |

---

## 🔒 13-Stage Canonical Execution Pipeline

```text
[1]  Chat / Intent Collection    → Multi-turn intent revision loop
[2]  Prompt Generation           → Canonical Prompt(id) creation
[3]  Researcher                  → Verifiable ResearchProvider (ADK / Gemma 2 / Featherless / Sample)
[4]  Planner                     → Audit-tracked Plan(id) generation
[5]  Refactor                    → Plan preservation and dependency alignment
[6]  Gap Analysis                → Gap verification (gap_0 validation)
[7]  Evaluation                  → 9-point evidence matrix verification
[8]  Schema Validation           ──┐
[9]  Fixture Validation          ──┼─ Triple Validation Gate (all must be VALID)
[10] Goal Validation             ──┘
[11] Confirmation                → Confirmed immutable execution package
[12] Canonical SHA-256 Hash      → RFC 8785 canonicalization & cryptographic hash proof
[13] Hardened Sandbox Execution  → Isolated process runner with exact hash matching
```
