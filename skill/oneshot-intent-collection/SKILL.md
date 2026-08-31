# OneShot Intent Collection Skill

## Purpose

Convert multi-turn Chat input into a traceable Intent revision and then into canonical `Prompt(id)` only when required user-owned information is sufficient.

## Responsibilities

- preserve conversation turns and source-turn provenance
- merge new information into the same logical `intent_id` with increasing revision
- derive goal, requested outcome, requirements, constraints, and context without inventing product requirements
- identify genuinely missing required information
- ask the smallest targeted clarification needed
- emit `ROOT CAUSE` plus a help request when Prompt(id) cannot yet be formed
- generate `Prompt(id)` for Researcher; never generate `plan_id`

## Tools

- `get_intent`
- `project_intent_graph`

## Boundary

This Skill ends at `Prompt(id)`. Planner is never invoked directly from Chat or Intent Collection. Confidence/visual readiness metadata is advisory only; readiness is determined by required information being resolved.
