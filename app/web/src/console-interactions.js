const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const stageLabel = name => ({ GapAnalysis: 'Gap Analysis', SchemaValidation: 'Schema Validation', FixtureValidation: 'Fixture Validation', GoalValidation: 'Goal Validation', TripleValidation: 'Triple Validation', CreateHash: 'Create Hash', Hash: 'Hash Verification', PlanReview: 'Research Review', BuildReady: 'Build Ready' }[name] || name);

export function createConsoleInteractions({ apiFetch, toast }) {
  const preview = document.querySelector('#file-preview');
  let previewRequest = 0;
  let restoreFocus;
  let latestSnapshot;
  let latestEvents = [];

  preview.querySelector('[data-preview-close]').onclick = () => preview.close();
  preview.addEventListener('click', event => { if (event.target === preview) preview.close(); });
  preview.addEventListener('close', () => restoreFocus?.focus());

  document.querySelector('#preview-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(document.querySelector('#preview-content').textContent); toast('Copied file contents.'); }
    catch { toast('Clipboard unavailable. Select the file contents to copy.'); }
  };

  document.querySelectorAll('[data-status-tab]').forEach(button => {
    button.onclick = () => {
      document.querySelectorAll('[data-status-tab]').forEach(tab => {
        const selected = tab === button;
        tab.classList.toggle('active', selected);
        tab.setAttribute('aria-selected', String(selected));
      });
      document.querySelectorAll('[data-status-panel]').forEach(panel => { panel.hidden = panel.dataset.statusPanel !== button.dataset.statusTab; });
    };
  });

  async function showFile(title, url) {
    const request = ++previewRequest;
    restoreFocus = document.activeElement;
    document.querySelector('#preview-title').textContent = title;
    document.querySelector('#preview-content').textContent = 'Loading…';
    if (!preview.open) preview.showModal();
    try {
      const response = await apiFetch(url);
      if (!response.ok) throw new Error(`File unavailable (${response.status})`);
      const raw = await response.text();
      let content = raw;
      try { const data = JSON.parse(raw); content = data.content ?? data.text ?? JSON.stringify(data, null, 2); } catch { /* Plain text file. */ }
      if (request === previewRequest) document.querySelector('#preview-content').textContent = String(content);
    } catch (error) {
      if (request === previewRequest) document.querySelector('#preview-content').textContent = error.message;
    }
  }

  function renderStatus(snapshot = latestSnapshot, events = latestEvents, runId = '') {
    latestSnapshot = snapshot;
    latestEvents = events;
    const overview = document.querySelector('#status-overview');
    const states = new Map();
    for (const event of events) if (event.scope !== 'ADK') states.set(event.processor, event);
    overview.innerHTML = states.size ? [...states.values()].map(event => `<div class="status-stage" data-state="${esc(event.state)}"><span>${esc(stageLabel(event.processor))}</span><strong>${esc(event.result || event.state)}</strong></div>`).join('') : '<p class="empty-note">Start a run to see its progress.</p>';

    const activity = document.querySelector('#status-activity');
    activity.innerHTML = events.length ? [...events].reverse().map(event => `<div class="status-event"><small>#${esc(event.sequence)} · ${esc(stageLabel(event.processor))} · ${esc(event.state)}</small><p>${esc(event.message || event.activity || event.result || 'State updated')}</p></div>`).join('') : '<p class="empty-note">No runtime events yet.</p>';

    const files = document.querySelector('#status-files');
    files.innerHTML = Object.keys(snapshot?.artifacts || {}).map(name => `<button class="artifact-preview" data-artifact="${esc(name)}"><span>▤</span>${esc(name)}<small>Preview</small></button>`).join('') || '<p class="empty-note">Artifacts appear as the run produces them.</p>';
    files.querySelectorAll('[data-artifact]').forEach(button => { button.onclick = () => showFile(button.dataset.artifact, `/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(button.dataset.artifact)}`); });

    document.querySelector('#status-run-label').textContent = snapshot?.test_result || (events.filter(e => e.state !== 'Pending').at(-1)?.processor ? `${stageLabel(events.filter(e => e.state !== 'Pending').at(-1).processor)}` : 'No active run');
  }

  function reset() { latestSnapshot = undefined; latestEvents = []; renderStatus(); }

  return { showFile, renderStatus, reset };
}
