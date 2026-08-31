# OneShot Task Runtime Skill

## Purpose

Expose read-only processing evidence around the canonical OneShot workflow. This Skill does not own Role execution, Triple Validation, confirmation, canonicalization, or hashing.

## Responsibilities

- replay append-only processing events
- expose checkpoint metadata outside canonical artifacts
- project current run state for the UI
- produce audit views with ordering/conflict evidence
- project the Google ADK Researcher provider subgraph
- project authority → responsibility → Skill → Tool → capability → artifact traceability

## Tools

- `project_run`
- `audit_run`
- `project_adk_graph`
- `project_authority_graph`

## Authority Boundary

The canonical workflow remains `Prompt_id -> Researcher -> Planner -> Refactor -> Gap Analysis -> Evaluation -> Triple Validation -> CONFIRMED -> CREATE HASH -> HASH -> DONE`. Task Runtime only observes and projects execution. `confirmed_package.core` is never modified by this Skill.
