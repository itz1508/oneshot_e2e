# Researcher Workflow Preview

## Overview

The Researcher Workflow Preview demonstrates the Deep Agent todo-list pattern and product-review lifecycle. It provides both live stream agent integration and deterministic educational simulation playback.

- **Frontend pattern path:** `frontend/web/src/patterns/deep-agent-todo-list/`
- **Static embed path:** `frontend/web/public/embed/`
- **Agent reference path:** `packages/agent-runtime/src/agents/deep-agent-todo-list.ts`
- **Test suite:** `frontend/web/tests/researcher-workflow.test.mjs` (23 tests, 0 failures)

---

## Architectural Invariants

1. **One `useStream` boundary**: Normal chat uses a single `useStream` boundary. There is no wrapping adapter, secondary transport, or simulation selector.
2. **Live vs Fixture separation**:
   - Live runs read todos exclusively from `stream.values?.todos ?? []`.
   - Fixture simulation reads todos from local React `useState`.
   - The two states are never merged, and fixture todos are never written into `stream.values`.
   - They render into structurally separate DOM subtrees marked with `data-source="live"` and `data-source="fixture"`.
3. **Zero network calls from preview controls**:
   - Preview controls (Start, Cancel, Continue, Change, Edit, Open, Close) advance local fixture state only.
   - None of these controls issue network requests (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, or `stream.submit`).
4. **Provider-neutral agent boundary**: Model/provider configuration lives entirely server-side behind the agent boundary. No client-side credentials or API keys exist.

---

## Educational Fixtures

The preview includes two deterministic scenarios grounded in public W3C WCAG and MDN specifications:

1. **`straight-success`**:
   - Scenario: Focus visibility research for keyboard accessibility.
   - Sources:
     - [W3C WCAG 2.2 SC 2.4.7: Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
     - [W3C WCAG 2.2 SC 4.1.3: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
     - [MDN Web Docs: aria-live attribute](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-live)

2. **`section-change-reloop`**:
   - Scenario: Live-region guidance comparison with targeted finding correction.
   - Demonstrates the Facts & Sources section edit loop, updating only the affected finding while preserving unaffected sections.

---

## Lifecycle Controls

- **Start**: Initiates the simulation; advances todos to the review stage.
- **Cancel**: Terminates the simulation into a non-successful state without reaching "Ready for planning".
- **Continue**: Validates that all required section reviews or revisions are complete before transitioning to "Ready for planning".
- **Change / Edit**: Opens section-scoped editing for targeted revisions.
