# Google ADK Provider Adapter — Boundary & License Notice

## 1. Scope & Responsibility
This directory (`backend/role/researcher/provider/adk-gemma2/`) contains the optional external provider adapter for Google ADK and Gemma 2.

## 2. License Attribution
- **Google ADK** (`google-adk`, `google-genai`, `google-auth`): Licensed under Apache License 2.0 (Copyright Google LLC).
- **LiteLLM**: Licensed under MIT License (Copyright BerriAI).
- **Redis Client**: Licensed under MIT / BSD-3-Clause (Copyright Redis Ltd.).

## 3. Strict Boundary Isolation
1. **Zero Core Dependencies**: The core Canonical Workflow, Planner, Refactor, Gap Analysis, Evaluation, Triple Validation, Hashing, and Sandbox Runtime never import or depend on Google ADK.
2. **Subprocess Isolation**: All ADK execution runs out-of-process in `worker.py` via standard I/O RPC (`worker-bridge.ts`).
3. **Advisory Output Only**: Output from ADK is treated strictly as an untrusted research draft (`AdkResearchDraft`) subject to strict schema validation and fresh run-scoped ID assignment before entry into the canonical pipeline.
4. **Separate Dependencies**: Dependencies are maintained in `requirements/adk.txt` independently from the base `requirements/base.txt`.
