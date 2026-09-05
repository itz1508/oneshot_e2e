/**
 * workflow-trace-panel — expandable canonical execution trace renderer.
 *
 * Renders the persistent workflow trace (newest ordering by sequence) inside
 * the Task Management drawer. Raw payloads live here, never in the chat.
 * Ported from ui-e2e-observability e98a8fd (WorkflowTracePanel.tsx).
 */
import { workflowTraceStore } from '/workflow-trace.js';

function escapeText(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function detailValue(value) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function entryHtml(entry) {
  const details = Object.entries(entry.details || {}).map(([key, value]) =>
    `<div class="trace-detail-block"><dt>${escapeText(key)}</dt><dd><pre>${escapeText(detailValue(value))}</pre></dd></div>`,
  ).join('');
  return `<details class="trace-entry" data-event-id="${escapeText(entry.eventId)}">`
    + `<summary><span>#${escapeText(entry.sequence)} ${escapeText(entry.processor)}</span>`
    + `<span>${escapeText(entry.state)}${entry.result ? ` · ${escapeText(entry.result)}` : ''}</span></summary>`
    + `<dl class="trace-details">`
    + `<dt>timestamp</dt><dd>${escapeText(entry.timestamp)}</dd>`
    + `<dt>run_id</dt><dd>${escapeText(entry.runId)}</dd>`
    + (entry.artifactId ? `<dt>artifact_id</dt><dd>${escapeText(entry.artifactId)}</dd>` : '')
    + (entry.message ? `<dt>message</dt><dd>${escapeText(entry.message)}</dd>` : '')
    + details
    + `</dl></details>`;
}

export function createWorkflowTracePanel(container) {
  function render() {
    const trace = workflowTraceStore.getSnapshot();
    if (!trace.length) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML =
      `<details class="trace-group" data-testid="workflow-trace">`
      + `<summary>Canonical execution trace (${trace.length})</summary>`
      + `<div class="trace-list">${trace.map(entryHtml).join('')}</div>`
      + `</details>`;
  }

  workflowTraceStore.subscribe(render);
  render();
  return { render };
}