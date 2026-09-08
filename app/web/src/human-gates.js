const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list = (items, render) => items?.length ? `<ul>${items.map(item => `<li>${render(item)}</li>`).join('')}</ul>` : '<p class="empty-note">Not provided by this run.</p>';

export function researchSummaryHTML(bundle) {
  return `<h3>Objective</h3><p>${esc(bundle.goal?.objective || bundle.prompt?.requested_outcome)}</p><h3>Requirements</h3>${list(bundle.plan?.requirements, item => esc(item.statement))}<h3>Success criteria</h3>${list(bundle.goal?.success_criteria, item => `${esc(item.statement)}<small>${esc(item.measurement)} · ${esc(item.expected_result)}</small>`)}<details><summary>Research evidence</summary>${list(bundle.researcher?.evidence, item => `<p>${esc(item.statement)}</p><small>${esc(item.source)} · ${esc(item.provenance)}</small>`)}</details>`;
}

function readOnlySections(bundle) {
  return `<h3>Success criteria</h3>${list(bundle.goal?.success_criteria, item => `${esc(item.statement)}<small>${esc(item.measurement)} · ${esc(item.expected_result)}</small>`)}<h3>Research evidence</h3>${list(bundle.researcher?.evidence, item => `<p>${esc(item.statement)}</p><small>${esc(item.source)} · ${esc(item.provenance)}</small>`)}<h3>Fixtures / test cases</h3>${list(bundle.fixture?.plan_assertions, item => `${esc(item.operator)} <code>${esc(JSON.stringify(item.expected))}</code> on ${esc(item.target)}`)}<h3>Design direction</h3>${list(bundle.prompt?.research_direction, item => esc(item))}`;
}

function reviewNotesHTML(notes) {
  return `<label>Add note <input type="text" data-review-note autocomplete="off"></label><button type="button" data-add-note>Add note</button><ul data-review-notes>${notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul>`;
}

function researchReviewFormHTML(bundle, notes) {
  const objective = bundle.goal?.objective || bundle.prompt?.requested_outcome || '';
  const requirements = bundle.plan?.requirements || [];
  const steps = bundle.plan?.steps || [];
  return `<div class="review-form"><label>Objective<textarea data-objective rows="3">${esc(objective)}</textarea></label><h3>Requirements</h3><ul>${requirements.map((item, index) => `<li><textarea data-requirement="${index}" rows="2">${esc(item.statement)}</textarea><input type="hidden" data-requirement-id="${index}" value="${esc(item.requirement_id)}"></li>`).join('')}</ul><h3>Plan steps</h3><ul>${steps.map((item, index) => `<li><textarea data-step="${index}" rows="2">${esc(item.description)}</textarea><input type="hidden" data-step-id="${index}" value="${esc(item.step_id)}"></li>`).join('')}</ul>${reviewNotesHTML(notes)}</div>${readOnlySections(bundle)}`;
}

export function buildReviewHTML(review, collapsed = false) {
  const approved = review.status === 'approved';
  const signals = [
    ['schema', review.validation?.schema || 'Unavailable'],
    ['fixture', review.validation?.fixture || 'Unavailable'],
    ['goal', review.validation?.goal || 'Unavailable'],
    ['plan confirmed', 'CONFIRMED'],
    ['hash created', 'CREATED'],
    ['build package ready', review.status === 'pending' ? 'READY' : 'AUTHORIZED'],
  ];
  return `<header><div><small>HUMAN REVIEW · 02</small><h2>${approved ? 'Build authorized' : 'Build Ready'}</h2></div><span class="review-badge">${approved ? 'Approved' : 'Awaiting authorization'}</span></header><p>${approved ? 'The runtime accepted your build authorization.' : 'Your validated package is ready. Builder waits for your explicit confirmation.'}</p><div class="validation-signals">${signals.map(([key, value]) => `<span>${esc(key)} <strong>${esc(value)}</strong></span>`).join('')}</div><details ${collapsed ? '' : 'open'}><summary>Confirmed package · revision ${esc(review.revision)}</summary><p>Plan ${esc(review.plan_id)}</p><code class="package-hash">${esc(review.hash)}</code>${list(review.steps, step => `${esc(step.description)}<small>${esc(step.responsibility)} · ${esc(step.step_id)}</small>`)}</details><p data-gate-error role="status"></p>${approved ? '' : collapsed ? '<button data-gate-reopen>Review build package</button>' : '<footer><button data-gate-action="return">Cancel / return</button><button class="primary" data-gate-action="approve">Confirm Build</button></footer>'}`;
}

export function hasVerifiedHash(snapshot) {
  const proof = snapshot?.hash_proof;
  return proof?.equal === true && typeof proof.created_hash === 'string' && proof.created_hash.length > 0 && proof.created_hash === proof.recomputed_hash;
}

export function collectEdits(element, bundle, notes) {
  const objective = element.querySelector('[data-objective]')?.value.trim() ?? bundle.goal?.objective ?? '';
  const requirements = [];
  element.querySelectorAll('[data-requirement-id]').forEach(input => {
    const index = input.dataset.requirementId;
    const textarea = element.querySelector(`[data-requirement="${index}"]`);
    if (textarea) requirements.push({ id: input.value, statement: textarea.value.trim() });
  });
  const steps = [];
  element.querySelectorAll('[data-step-id]').forEach(input => {
    const index = input.dataset.stepId;
    const textarea = element.querySelector(`[data-step="${index}"]`);
    if (textarea) steps.push({ id: input.value, description: textarea.value.trim() });
  });
  return { objective, requirements, steps, notes: [...notes] };
}

export function createHumanGates({ apiFetch, toast, onChanged, onResearchAgain }) {
  let activeRun = '', generation = 0, build, snapshot, request;
  let collapsed = false, deciding = false;
  let researchNotes = [];
  function card(id) {
    let element = document.querySelector(`#${id}`);
    if (!element) { element = document.createElement('article'); element.id = id; element.className = 'review-card'; document.querySelector('#chat').prepend(element); }
    return element;
  }
  function renderBuild() {
    const element = card('build-review-card');
    element.dataset.status = build.status;
    element.innerHTML = buildReviewHTML(build, collapsed);
    element.querySelector('[data-gate-reopen]')?.addEventListener('click', () => { collapsed = false; renderBuild(); });
    element.querySelectorAll('[data-gate-action]').forEach(button => button.addEventListener('click', async () => {
      if (deciding) return;
      deciding = true;
      const runId = activeRun, hash = build.hash, action = button.dataset.gateAction;
      element.querySelectorAll('button').forEach(item => { item.disabled = true; });
      const error = element.querySelector('[data-gate-error]');
      error.textContent = action === 'approve' ? 'Confirming build…' : 'Returning to the confirmed summary…';
      try {
        const response = await apiFetch(`/api/runs/${encodeURIComponent(runId)}/build-review`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ hash, action }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Build review failed (${response.status}). Refresh the package and try again.`);
        if (runId !== activeRun) return;
        build = data; collapsed = action === 'return'; renderBuild(); await onChanged?.();
      } catch (failure) { error.textContent = failure.message; element.querySelectorAll('button').forEach(item => { item.disabled = false; }); }
      finally { deciding = false; }
    }));
  }
  async function refresh(runId, nextSnapshot = snapshot) {
    if (!runId) return;
    if (runId !== activeRun) { reset(); activeRun = runId; }
    snapshot = nextSnapshot;
    if (request) return request;
    const token = generation;
    request = (async () => {
      try {
        const response = await apiFetch(`/api/runs/${encodeURIComponent(runId)}/build-review`);
        if (response.ok) { const data = await response.json(); if (token === generation && !deciding) { build = data; renderBuild(); } }
        else if (response.status !== 404) throw new Error(`Build review unavailable (${response.status})`);
        if (snapshot?.artifacts?.research_bundle) {
          const research = await apiFetch(`/api/runs/${encodeURIComponent(runId)}/artifacts/research_bundle`);
          if (!research.ok) throw new Error(`Research summary unavailable (${research.status})`);
          const bundle = await research.json();
          if (token !== generation) return;
          const events = snapshot.events || [];
          const accepted = events.some(event => event.processor === 'Planner' && event.execution_status !== 'Pending');
          const closed = Boolean(snapshot.test_result);
          const reviewResponse = await apiFetch(`/api/runs/${encodeURIComponent(runId)}/review`);
          const reviewContract = reviewResponse.ok ? await reviewResponse.json() : null;
          const editable = !accepted && !closed;
          const element = card('research-summary-card');
          element.innerHTML = `<header><div><small>HUMAN REVIEW · 01</small><h2>Research Summary</h2></div><span class="review-badge">${accepted ? 'Accepted baseline' : closed ? 'Run closed' : 'Research Review'}</span></header>${editable ? researchReviewFormHTML(bundle, researchNotes) : researchSummaryHTML(bundle)}<p class="empty-note">${editable ? 'Edit the objective, requirements, and steps before accepting.' : 'This runtime exposes a read-only research baseline.'}</p><p class="gate-note">${editable ? 'Research Again requests a new research pass before you accept.' : 'This runtime exposes a read-only research baseline.'}</p><p data-research-error role="status"></p>${accepted || closed ? '' : '<footer><button type="button" class="secondary" data-research-again>Research Again</button><button class="primary" data-accept-research>Accept Research</button></footer>'}`;
          if (editable) {
            const noteInput = element.querySelector('[data-review-note]');
            const addNote = () => { const value = noteInput.value.trim(); if (!value) return; researchNotes.push(value); noteInput.value = ''; const list = element.querySelector('[data-review-notes]'); list.insertAdjacentHTML('beforeend', `<li>${esc(value)}</li>`); };
            element.querySelector('[data-add-note]')?.addEventListener('click', addNote);
            noteInput?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addNote(); } });
          }

          element.querySelector('[data-research-again]')?.addEventListener('click', () => {
            if (!editable) return;
            onResearchAgain?.();
          });

          element.querySelector('[data-accept-research]')?.addEventListener('click', async event => {
            event.target.disabled = true;
            try {
              const edits = collectEdits(element, bundle, researchNotes);
              const result = reviewContract
                ? await apiFetch(`/api/runs/${encodeURIComponent(runId)}/review`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ action:'approve', revision:reviewContract.revision, edits })})
                : await apiFetch(`/api/runs/${encodeURIComponent(runId)}/confirm-plan`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ edits })});
              const data = await result.json();
              if (!result.ok) throw new Error(data.error || `Research acceptance failed (${result.status})`);
              if (activeRun !== runId) return;
              event.target.textContent = 'Research accepted'; await onChanged?.();
            } catch (error) { element.querySelector('[data-research-error]').textContent = error.message; event.target.disabled = false; }
          });
        }
      } catch (error) { if (token === generation) toast(error.message); }
      finally { if (token === generation) request = undefined; }
    })();
    return request;
  }
  function reset() { generation++; activeRun = ''; request = undefined; build = undefined; snapshot = undefined; collapsed = false; researchNotes = []; document.querySelector('#build-review-card')?.remove(); document.querySelector('#research-summary-card')?.remove(); }
  return { refresh, reset };
}
