const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const stageLabel = name => ({ GapAnalysis: 'Gap Analysis', SchemaValidation: 'Schema Validation', FixtureValidation: 'Fixture Validation', GoalValidation: 'Goal Validation', TripleValidation: 'Triple Validation', CreateHash: 'Create Hash', Hash: 'Hash Verification', PlanReview: 'Plan review' }[name] || name);

export function reviewEditsFromForm(form, review, notes) {
  return {
    objective: form.querySelector('[data-objective]').value.trim(),
    requirements: review.edits.requirements.map((item, index) => ({ id: item.id, statement: form.querySelector(`[data-requirement="${index}"]`).value.trim() })),
    steps: review.edits.steps.map((item, index) => ({ id: item.id, description: form.querySelector(`[data-step="${index}"]`).value.trim() })),
    notes: [...notes],
  };
}

export function createConsoleInteractions({ apiFetch, toast, onReviewChanged }) {
  const preview = document.querySelector('#file-preview');
  let activeRun = '';
  let review;
  let notes = [];
  let reviewRequest = null;
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

  function renderStatus(snapshot = latestSnapshot, events = latestEvents) {
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
    files.querySelectorAll('[data-artifact]').forEach(button => { button.onclick = () => showFile(button.dataset.artifact, `/api/runs/${encodeURIComponent(activeRun)}/artifacts/${encodeURIComponent(button.dataset.artifact)}`); });
    document.querySelector('#status-run-label').textContent = snapshot?.test_result || (review?.status === 'pending' ? 'Awaiting your review' : events.filter(e => e.state !== 'Pending').at(-1)?.processor ? `${stageLabel(events.filter(e => e.state !== 'Pending').at(-1).processor)}` : 'No active run');
  }

  function addNote(text) {
    if (review?.status !== 'pending') return false;
    const note = String(text || '').trim();
    if (!note) return false;
    if (notes.length >= 50 || note.length > 20000) { toast('Keep notes under 20000 characters, with at most 50 notes.'); return false; }
    notes.push(note);
    const list = document.querySelector('#plan-review-notes');
    list.replaceChildren(...notes.map(value => { const item = document.createElement('li'); item.textContent = value; return item; }));
    return true;
  }

  function renderReview(next) {
    if (review?.run_id === next.run_id && review.revision === next.revision && document.querySelector('#plan-review-card')) return;
    review = next;
    notes = [...next.edits.notes];
    document.querySelector('#plan-review-card')?.remove();
    const pending = next.status === 'pending';
    const card = document.createElement('article');
    card.id = 'plan-review-card';
    card.className = 'review-card';
    card.dataset.status = next.status;
    card.innerHTML = `<header><div><small>RESEARCHER DRAFT</small><h2>Review your plan</h2></div><span class="review-badge">${pending ? 'Awaiting confirmation' : esc(next.status)}</span></header>
      <p>Edit the objective, requirements and tasks. Planner continues after you confirm.</p>
      <div class="review-artifacts"><button type="button" data-review-artifact="fixture">View test cases</button><button type="button" data-review-artifact="schema">View schema</button><button type="button" data-review-artifact="goal">View success criteria</button></div>
      <form id="plan-review-form"><fieldset ${pending ? '' : 'disabled'}>
      <label>Objective<textarea data-objective required maxlength="20000">${esc(next.edits.objective)}</textarea></label>
      <h3>Requirements</h3>${next.edits.requirements.map((item, index) => `<label>Requirement ${index + 1}<textarea data-requirement="${index}" required maxlength="20000">${esc(item.statement)}</textarea></label>`).join('')}
      <h3>Tasks</h3>${next.edits.steps.map((item, index) => `<label>Task ${index + 1}<textarea data-step="${index}" required maxlength="20000">${esc(item.description)}</textarea></label>`).join('')}
      <label>Add information or a correction<input id="plan-review-note" maxlength="20000" autocomplete="off"></label><button type="button" id="plan-review-add">Add note</button>
      <ul id="plan-review-notes">${notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul>
      <p id="plan-review-error" role="status"></p><footer><button type="button" id="plan-review-cancel">Cancel run</button><button class="primary" type="submit">Confirm plan → continue</button></footer>
      </fieldset></form>`;
    document.querySelector('#welcome')?.remove();
    document.querySelector('#chat').append(card);
    card.querySelectorAll('[data-review-artifact]').forEach(button => { button.onclick = () => showFile(button.textContent, `/api/runs/${encodeURIComponent(activeRun)}/artifacts/${button.dataset.reviewArtifact}`); });
    const form = card.querySelector('form');
    const input = card.querySelector('#plan-review-note');
    const add = () => { if (addNote(input.value)) input.value = ''; };
    card.querySelector('#plan-review-add').onclick = add;
    input.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); add(); } };
    async function decide(action) {
      const runId = activeRun;
      if (action === 'approve') add();
      const edits = reviewEditsFromForm(form, next, notes);
      form.querySelector('fieldset').disabled = true;
      const errorElement = card.querySelector('#plan-review-error');
      errorElement.textContent = action === 'approve' ? 'Saving confirmation…' : 'Cancelling…';
      try {
        const response = await apiFetch(`/api/runs/${encodeURIComponent(runId)}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: next.revision, action, edits }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Review failed (${response.status})`);
        renderReview(result);
        await onReviewChanged?.(result);
      } catch (error) { errorElement.textContent = error.message; form.querySelector('fieldset').disabled = false; }
    }
    form.onsubmit = event => { event.preventDefault(); void decide('approve'); };
    card.querySelector('#plan-review-cancel').onclick = () => decide('cancel');
    if (pending) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function refreshReview(runId) {
    if (activeRun !== runId) { activeRun = runId; review = undefined; notes = []; document.querySelector('#plan-review-card')?.remove(); }
    if (reviewRequest) return reviewRequest;
    reviewRequest = (async () => {
      try {
        const response = await apiFetch(`/api/runs/${encodeURIComponent(runId)}/review`);
        if (response.status === 404) return;
        if (!response.ok) throw new Error(`Review unavailable (${response.status})`);
        const data = await response.json();
        if (activeRun === runId) { renderReview(data); renderStatus(); }
      } catch (error) { toast(error.message); }
      finally { reviewRequest = null; }
    })();
    return reviewRequest;
  }

  return { showFile, refreshReview, renderStatus, addNote,
    get pendingReview() { return review?.status === 'pending'; },
    reset() { activeRun = ''; review = undefined; latestSnapshot = undefined; latestEvents = []; document.querySelector('#plan-review-card')?.remove(); renderStatus(); },
  };
}
