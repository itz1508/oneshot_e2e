const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  conversationId: localStorage.getItem('oneshot.v8.conversationId') || '',
  runId: localStorage.getItem('oneshot.v8.runId') || '',
  authToken: sessionStorage.getItem('oneshot.accessToken') || '',
  connected: false,
  connecting: true,
  run: null,
  conversation: null,
  seenEvents: new Set(),
  intentKind: 'normal',
  loading: false,
  eventSource: null,
  targetRoot: '',
  creatingResearchCard: false,
  creatingBuildCard: false,
};

const STAGE_ORDER = ['Researcher','Planner','Refactor','Gap Analysis','Evaluation','Triple Validation','Builder','Hash Verification','Confirmed','Done'];

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function headers(extra = {}) {
  const h = { ...extra };
  if (state.authToken) h.Authorization = `Bearer ${state.authToken}`;
  return h;
}

async function apiFetch(url, options = {}) {
  const opts = { credentials: 'same-origin', ...options };
  if (opts.body && typeof opts.body === 'string' && !opts.headers?.['Content-Type']) {
    opts.headers = { ...opts.headers, 'Content-Type': 'application/json' };
  }
  const res = await fetch(url, { ...opts, headers: headers(opts.headers || {}) });
  if (res.status === 401) {
    setConnection('auth');
    toast('Authentication required');
    throw new Error('Authentication required');
  }
  return res;
}

async function apiJson(url, options = {}) {
  const res = await apiFetch(url, options);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text || `HTTP ${res.status}` }; }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function setConnection(kind, detail = '') {
  const badge = $('#connection-badge');
  const left = $('#left-rail-status');
  const right = $('#right-rail-status');
  const labels = { connected: 'Connected', connecting: 'Connecting', reconnecting: 'Reconnecting', disconnected: 'Disconnected', auth: 'Auth required' };
  badge.textContent = detail ? `${labels[kind] || kind} · ${detail}` : (labels[kind] || kind);
  badge.className = `connection-badge ${kind}`;
  left.className = `rail-status ${kind}`;
  right.className = `rail-status ${kind}`;
  state.connecting = kind === 'connecting' || kind === 'reconnecting';
  state.connected = kind === 'connected';
}

async function checkHealth() {
  try {
    const data = await apiJson('/api/health');
    const detail = [data.mode, data.provider].filter(Boolean).join(' · ');
    setConnection(data.status === 'ok' ? 'connected' : 'degraded', detail);
  } catch (e) {
    setConnection('disconnected', e.message);
  }
}

async function loadTargetInfo() {
  try {
    const data = await apiJson('/api/workspace-context');
    state.targetRoot = data.root || '';
    $('#target-value').textContent = data.root ? data.root.split(/[\\/]/).filter(Boolean).pop() : 'Default workspace';
  } catch {
    $('#target-value').textContent = 'Workspace';
  }
}

function renderTreeNodes(nodes, container, depth = 0) {
  container.textContent = '';
  for (const n of nodes || []) {
    const name = n?.name || String(n?.path || '').split(/[\\/]/).filter(Boolean).pop() || 'item';
    const path = n?.path || name;
    const children = Array.isArray(n?.children) ? n.children : Array.isArray(n?.entries) ? n.entries : [];
    const folder = n?.type === 'folder' || n?.type === 'directory' || n?.kind === 'folder' || n?.directory === true || children.length > 0;
    const row = document.createElement('button');
    row.className = `tree-row${folder ? ' folder' : ''}`;
    row.style.paddingLeft = `${12 + depth * 12}px`;
    row.innerHTML = `<span class="tree-icon">${folder ? '▾' : '·'}</span><span class="tree-name">${escapeHtml(name)}</span>${children.length ? `<span class="tree-badge">${children.length}</span>` : ''}`;
    container.append(row);
    if (folder) {
      const group = document.createElement('div');
      group.className = 'tree-children';
      container.append(group);
      let expanded = true;
      row.addEventListener('click', () => {
        expanded = !expanded;
        group.hidden = !expanded;
        row.querySelector('.tree-icon').textContent = expanded ? '▾' : '▸';
      });
      if (children.length) renderTreeNodes(children, group, depth + 1);
    } else {
      row.addEventListener('click', () => openFile(path));
    }
  }
}

async function loadWorkspace() {
  const treeEl = $('#explorer-tree');
  const stateEl = $('#explorer-state');
  stateEl.textContent = 'Loading workspace…';
  try {
    const data = await apiJson('/v1/workspace/tree?path=.&depth=3');
    if (!data.children || data.children.length === 0) {
      stateEl.textContent = 'Workspace is empty.';
      return;
    }
    stateEl.hidden = true;
    renderTreeNodes(data.children, treeEl, 0);
  } catch (e) {
    stateEl.textContent = `Workspace unavailable: ${e.message}`;
  }
}

async function openFile(path) {
  const dialog = $('#file-preview');
  const contentEl = $('#preview-content');
  const titleEl = $('#preview-title');
  titleEl.textContent = path.split(/[\\/]/).pop();
  contentEl.textContent = 'Loading…';
  dialog.showModal();
  try {
    const data = await apiJson(`/v1/workspace/file?path=${encodeURIComponent(path)}`);
    contentEl.textContent = data.content ?? '(empty file)';
  } catch (e) {
    contentEl.textContent = `Could not read file: ${e.message}`;
  }
}

function closePreview() {
  $('#file-preview').close();
}

function copyPreview() {
  const text = $('#preview-content').textContent;
  navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard'));
}

async function loadConversation() {
  if (!state.conversationId) return;
  try {
    state.conversation = await apiJson(`/api/conversations/${encodeURIComponent(state.conversationId)}`);
    renderConversation();
  } catch (e) {
    if (String(e).includes('404')) {
      state.conversationId = '';
      localStorage.removeItem('oneshot.v8.conversationId');
    }
  }
}

async function startConversation(message) {
  const data = await apiJson('/api/conversations', { method: 'POST', body: JSON.stringify({ message }) });
  state.conversationId = data.conversation_id;
  localStorage.setItem('oneshot.v8.conversationId', state.conversationId);
  state.conversation = data;
  renderConversation();
}

async function addTurn(message, intentKind = 'normal') {
  if (!state.conversationId) await startConversation(message);
  const body = { message };
  if (state.runId) body.run_id = state.runId;
  if (intentKind !== 'normal') body.intent_kind = intentKind;
  const data = await apiJson(`/api/conversations/${encodeURIComponent(state.conversationId)}/messages`, { method: 'POST', body: JSON.stringify(body) });
  state.conversation = data;
  renderConversation();
}

async function startRun(reviewPlan = true) {
  const data = await apiJson(`/api/conversations/${encodeURIComponent(state.conversationId)}/run`, { method: 'POST', body: JSON.stringify({ review_plan: reviewPlan }) });
  state.runId = data.run_id;
  localStorage.setItem('oneshot.v8.runId', state.runId);
  $('#run-info').hidden = false;
  $('#run-value').textContent = state.runId;
  renderLoadingIndicator('Starting run…');
  await refreshRunState();
  startEventStream();
}

function renderConversation() {
  const container = $('#messages');
  container.textContent = '';
  $('#empty-state').hidden = true;
  const turns = Array.isArray(state.conversation?.turns) ? state.conversation.turns : [];
  let rendered = 0;
  for (const turn of turns) {
    const userText = turn.user_message || '';
    const assistantText = turn.assistant_message || turn.message || turn.text || '';
    if (userText) {
      const group = document.createElement('div');
      group.className = 'message-group';
      const bubble = document.createElement('div');
      bubble.className = 'message user';
      bubble.textContent = userText;
      group.append(bubble);
      container.append(group);
      rendered++;
    }
    if (assistantText) {
      const group = document.createElement('div');
      group.className = 'message-group';
      const bubble = document.createElement('div');
      bubble.className = 'message assistant';
      bubble.innerHTML = `<div class="message-text">${escapeHtml(assistantText)}</div>`;
      group.append(bubble);
      container.append(group);
      rendered++;
    }
  }
  if (rendered === 0) {
    $('#empty-state').hidden = false;
  }
  scrollToBottom();
}

function appendAssistantMessage(html) {
  const container = $('#messages');
  $('#empty-state').hidden = true;
  const group = document.createElement('div');
  group.className = 'message-group';
  const bubble = document.createElement('div');
  bubble.className = 'message assistant';
  bubble.innerHTML = `<div class="message-text">${html}</div>`;
  group.append(bubble);
  container.append(group);
  scrollToBottom();
}

function appendAssistantCard(cardHtml) {
  const container = $('#messages');
  $('#empty-state').hidden = true;
  const group = document.createElement('div');
  group.className = 'message-group';
  const bubble = document.createElement('div');
  bubble.className = 'message assistant';
  bubble.innerHTML = cardHtml;
  group.append(bubble);
  container.append(group);
  scrollToBottom();
}

function scrollToBottom() {
  const scroll = $('#conversation-scroll');
  scroll.scrollTop = scroll.scrollHeight;
}

function listHtml(items, render) {
  if (!items?.length) return '<p class="empty-note">Not provided by this run.</p>';
  return `<ul>${items.map(item => `<li>${render(item)}</li>`).join('')}</ul>`;
}

function renderLoadingIndicator(text = 'OneShot is working…') {
  if ($('#loading-indicator')) return;
  const container = $('#messages');
  $('#empty-state').hidden = true;
  const group = document.createElement('div');
  group.className = 'message-group';
  group.id = 'loading-indicator';
  const bubble = document.createElement('div');
  bubble.className = 'message assistant';
  bubble.innerHTML = `<div class="message-text loading"><span class="spinner"></span><span>${escapeHtml(text)}</span></div>`;
  group.append(bubble);
  container.append(group);
  scrollToBottom();
}

function removeLoadingIndicator() {
  $('#loading-indicator')?.remove();
}

async function ensureResearchCard() {
  if (!state.runId) return;
  if ($('#research-review-card') || state.creatingResearchCard) return;
  state.creatingResearchCard = true;
  try {
    const review = await apiJson(`/api/runs/${encodeURIComponent(state.runId)}/review`);
    if (!review || review.status !== 'pending') return;
    removeLoadingIndicator();
    const bundle = review.research || {};
    const objective = bundle.goal?.objective || bundle.prompt?.requested_outcome || '';
    const requirements = Array.isArray(bundle.plan?.requirements) ? bundle.plan.requirements : [];
    const steps = Array.isArray(bundle.plan?.steps) ? bundle.plan.steps : [];
    const evidence = Array.isArray(bundle.researcher?.evidence) ? bundle.researcher.evidence : [];
    const card = document.createElement('div');
    card.className = 'message assistant card research-summary-card';
    card.id = 'research-review-card';
    card.innerHTML = `<header><div><small>Human Review · 01</small><h3>Research Review</h3></div><span class="badge awaiting">Awaiting acceptance</span></header>
      <p>Review the research baseline for this target. Accept to continue to planning, or request Research Again.</p>
      <h4>Objective</h4><p>${escapeHtml(objective)}</p>
      <h4>Requirements</h4>${listHtml(requirements, r => escapeHtml(r.statement))}
      <h4>Plan steps</h4>${listHtml(steps, s => escapeHtml(s.description))}
      <details><summary>Research evidence (${evidence.length})</summary>${listHtml(evidence, e => `<p>${escapeHtml(e.statement)}</p><small>${escapeHtml(e.source)} · ${escapeHtml(e.provenance)}</small>`)}</details>
      <footer><button class="btn secondary" data-research-again>Research Again</button><button class="btn primary" data-accept-research>Accept Research</button></footer>`;
    appendAssistantCard(card.outerHTML);
    bindResearchCard();
  } finally { state.creatingResearchCard = false; }
}

function bindResearchCard() {
  const card = $('#research-review-card');
  if (!card) return;
  const againBtn = card.querySelector('[data-research-again]');
  const acceptBtn = card.querySelector('[data-accept-research]');
  if (againBtn && !againBtn.dataset.bound) {
    againBtn.dataset.bound = '1';
    againBtn.addEventListener('click', () => {
      state.intentKind = 'research-again';
      updatePromptMode();
      toast('Research Again mode active. Type your follow-up instruction.');
    });
  }
  if (acceptBtn && !acceptBtn.dataset.bound) {
    acceptBtn.dataset.bound = '1';
    acceptBtn.addEventListener('click', async () => {
      acceptBtn.disabled = true;
      try {
        const review = await apiJson(`/api/runs/${encodeURIComponent(state.runId)}/review`);
        await apiJson(`/api/runs/${encodeURIComponent(state.runId)}/review`, { method: 'POST', body: JSON.stringify({ action: 'approve', revision: review.revision }) });
        card.querySelector('.badge').textContent = 'Accepted';
        card.querySelector('.badge').className = 'badge';
        card.querySelector('footer').remove();
      } catch (e) {
        toast(e.message);
        acceptBtn.disabled = false;
      }
    });
  }
}

async function ensureBuildCard() {
  if (!state.runId) return;
  if ($('#build-ready-card') || state.creatingBuildCard) return;
  state.creatingBuildCard = true;
  try {
    const review = await apiJson(`/api/runs/${encodeURIComponent(state.runId)}/build-review`);
    if (!review) return;
    removeLoadingIndicator();
    const card = document.createElement('div');
    card.className = 'message assistant card build-ready-card';
    card.id = 'build-ready-card';
    card.innerHTML = `<header><div><small>Human Review · 02</small><h3>Build Ready</h3></div><span class="badge awaiting">Awaiting authorization</span></header>
      <p>The confirmed package passed deterministic validation. Review and confirm to start Builder in the sandbox.</p>
      <div class="validation-grid">
        <span>Schema<strong>${escapeHtml(review.validation?.schema || '—')}</strong></span>
        <span>Fixture<strong>${escapeHtml(review.validation?.fixture || '—')}</strong></span>
        <span>Goal<strong>${escapeHtml(review.validation?.goal || '—')}</strong></span>
      </div>
      <div class="hash-row"><span>Hash:</span><code>${escapeHtml(review.hash || '')}</code></div>
      <footer><button class="btn secondary" data-cancel-build>Cancel / Return</button><button class="btn primary" data-confirm-build>Confirm Build</button></footer>`;
    appendAssistantCard(card.outerHTML);
    bindBuildCard();
  } finally { state.creatingBuildCard = false; }
}

function bindBuildCard() {
  const card = $('#build-ready-card');
  if (!card) return;
  const confirmBtn = card.querySelector('[data-confirm-build]');
  const cancelBtn = card.querySelector('[data-cancel-build]');
  if (confirmBtn && !confirmBtn.dataset.bound) {
    confirmBtn.dataset.bound = '1';
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      try {
        const review = await apiJson(`/api/runs/${encodeURIComponent(state.runId)}/build-review`);
        await apiJson(`/api/runs/${encodeURIComponent(state.runId)}/build-review`, { method: 'POST', body: JSON.stringify({ action: 'approve', hash: review.hash }) });
        card.querySelector('.badge').textContent = 'Authorized';
        card.querySelector('.badge').className = 'badge';
        card.querySelector('footer').remove();
      } catch (e) {
        toast(e.message);
        confirmBtn.disabled = false;
      }
    });
  }
  if (cancelBtn && !cancelBtn.dataset.bound) {
    cancelBtn.dataset.bound = '1';
    cancelBtn.addEventListener('click', async () => {
      try {
        const review = await apiJson(`/api/runs/${encodeURIComponent(state.runId)}/build-review`);
        await apiJson(`/api/runs/${encodeURIComponent(state.runId)}/build-review`, { method: 'POST', body: JSON.stringify({ action: 'return', hash: review.hash }) });
        toast('Returned to confirmed summary. Build remains waiting.');
      } catch (e) { toast(e.message); }
    });
  }
}


function ensureSandboxCard() {
  if (!state.runId || !state.run || state.run.pipeline_status === 'Done') return;
  if ($('#sandbox-card')) {
    updateSandboxCard();
    return;
  }
  if (state.run.current_processor !== 'Builder' && state.run.pipeline_status !== 'Running') return;
  const statusText = `${phaseLabel(state.run.current_processor || 'Builder')} · ${state.run.pipeline_status || 'Running'}`;
  const card = document.createElement('div');
  card.className = 'message assistant card sandbox-card';
  card.id = 'sandbox-card';
  card.innerHTML = `<header><div><small>Sandbox</small><h3>Build execution</h3></div><span class="badge awaiting">Running</span></header>
    <p>Building the confirmed package in the isolated sandbox.</p>
    <div id="sandbox-status" class="phase-value">${escapeHtml(statusText)}</div>`;
  appendAssistantCard(card.outerHTML);
}

function updateSandboxCard() {
  const card = $('#sandbox-card');
  if (!card || !state.run) return;
  const status = card.querySelector('#sandbox-status');
  if (status) status.textContent = `${phaseLabel(state.run.current_processor || 'Builder')} · ${state.run.pipeline_status || 'Running'}`;
}

function ensureFinalCard() {
  if (!state.runId || !state.run || state.run.pipeline_status !== 'Done') return;
  if ($('#final-result-card')) return;
  const r = state.run;
  const passed = r.test_result === 'Passed';
  const hashEqual = r.hash_proof?.equal === true;
  const card = document.createElement('div');
  card.className = `message assistant card final-result-card`;
  card.id = 'final-result-card';
  card.innerHTML = `<header><div><small>Final Result</small><h3>${passed ? 'Build completed' : 'Run finished'}</h3></div><span class="badge ${passed ? '' : 'awaiting'}">${passed ? 'Passed' : 'Failed'}</span></header>
    <p>Job <code>${escapeHtml(r.run_id)}</code> is ${passed ? 'complete and verified' : 'finished'}.</p>
    <div class="validation-grid">
      <span>Result<strong>${escapeHtml(r.test_result || '—')}</strong></span>
      <span>Hash equal<strong>${hashEqual ? 'Yes' : 'No'}</strong></span>
      <span>Processor<strong>${escapeHtml(r.current_processor || '—')}</strong></span>
    </div>
    ${r.hash_proof?.created_hash ? `<div class="hash-row"><span>Created hash:</span><code>${escapeHtml(r.hash_proof.created_hash)}</code></div>` : ''}
    ${r.hash_proof?.sandbox_hash ? `<div class="hash-row"><span>Sandbox hash:</span><code>${escapeHtml(r.hash_proof.sandbox_hash)}</code></div>` : ''}
    ${r.root_cause ? `<p><strong>Root cause:</strong> ${escapeHtml(r.root_cause.issue)}</p>` : ''}`;
  appendAssistantCard(card.outerHTML);
}

async function refreshRunState() {
  if (!state.runId) return;
  const data = await apiJson(`/api/runs/${encodeURIComponent(state.runId)}`);
  state.run = data;
  renderCurrentJob();
  ensureResearchCard();
  ensureBuildCard();
  ensureSandboxCard();
  ensureFinalCard();
}


function phaseLabel(processor) {
  const labels = {
    Researcher: 'Researching project',
    Planner: 'Preparing work',
    Refactor: 'Refining plan',
    'Gap Analysis': 'Checking gaps',
    Evaluation: 'Evaluating',
    'Triple Validation': 'Validating',
    Builder: 'Building',
    'Hash Verification': 'Verifying',
    Confirmed: 'Confirmed',
    Done: 'Done',
  };
  return labels[processor] || processor || '—';
}

function renderCurrentJob() {
  const r = state.run;
  const empty = $('#job-empty');
  const content = $('#job-content');
  if (!state.runId || !r) {
    empty.hidden = false;
    content.hidden = true;
    $('#panel-title').textContent = 'Current Job';
    $('#panel-badge').hidden = true;
    return;
  }
  empty.hidden = true;
  content.hidden = false;
  $('#job-id').textContent = r.run_id;
  const statusEl = $('#job-status');
  statusEl.textContent = r.pipeline_status;
  statusEl.className = `job-status ${r.pipeline_status === 'Running' ? 'running' : r.pipeline_status === 'Done' ? (r.test_result === 'Passed' ? 'done' : 'failed') : ''}`;
  $('#phase-value').textContent = phaseLabel(r.current_processor);
  $('#step-value').textContent = r.current_processor || '—';
  const tasks = $('#task-list-wrap');
  const taskList = $('#task-list');
  const realTasks = Array.isArray(r.tasks) && r.tasks.length > 0 ? r.tasks : [];
  if (realTasks.length) {
    tasks.hidden = false;
    taskList.innerHTML = realTasks.map(t => `<li>${escapeHtml(t.description || t.name || t.id)}</li>`).join('');
  } else {
    tasks.hidden = true;
  }
  const progress = STAGE_ORDER.indexOf(r.current_processor);
  $('#progress-bar').style.width = `${progress >= 0 ? ((progress + 1) / STAGE_ORDER.length) * 100 : 0}%`;
  const hook = $('#hook-state');
  const waiting = r.pipeline_status === 'Waiting' || /review|ready|hook|question/i.test(r.current_processor || '');
  hook.hidden = !waiting;
  $('#panel-badge').hidden = false;
  $('#panel-badge').textContent = waiting ? 'Waiting' : r.pipeline_status;
}

async function handleEvent(data) {
  try {
    if (!data || !data.event_id) return;
    if (state.seenEvents.has(data.event_id)) return;
    state.seenEvents.add(data.event_id);
    if (!state.run) state.run = { events: [] };
    state.run.events.push(data);
    state.run.current_processor = data.processor || state.run.current_processor;
    state.run.pipeline_status = data.execution_status || state.run.pipeline_status;
    state.run.test_result = data.test_result ?? state.run.test_result;
    renderCurrentJob();
    if (data.processor === 'Researcher' && data.execution_status === 'Completed') {
      await refreshRunState();
      await ensureResearchCard();
    } else if (data.processor === 'Confirmed' || data.processor === 'Hash Verification') {
      await refreshRunState();
      await ensureBuildCard();
    } else if (data.processor === 'Builder') {
      await refreshRunState();
      ensureSandboxCard();
    } else if (data.execution_status === 'Done' || data.processor === 'Done') {
      await refreshRunState();
      ensureFinalCard();
      removeLoadingIndicator();
    }
  } catch (e) { /* ignore malformed event */ }
}

async function processEventStream(body, signal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');
    let i;
    while ((i = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, i);
      buffer = buffer.slice(i + 2);
      const data = block.split('\n').filter(x => x.startsWith('data:')).map(x => x.slice(5).trimStart()).join('\n');
      if (data) await handleEvent(JSON.parse(data));
    }
  }
}

function isTerminalRun() {
  return state.run?.pipeline_status === 'Done' || !!state.run?.test_result;
}

function startEventStream() {
  closeEventStream();
  if (!state.runId) return;
  const controller = new AbortController();
  state.eventSource = { close: () => controller.abort(), abort: controller };
  let delay = 900;
  (async () => {
    while (!controller.signal.aborted && !isTerminalRun()) {
      try {
        const res = await apiFetch(`/api/runs/${encodeURIComponent(state.runId)}/events`, {
          headers: { Accept: 'text/event-stream' },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Event stream failed: ${res.status}`);
        if (!res.body) throw new Error('Event stream body unavailable');
        if (!state.connected) setConnection('connected');
        await processEventStream(res.body, controller.signal);
        delay = 900;
      } catch (e) {
        if (controller.signal.aborted || isTerminalRun()) break;
        if (String(e).includes('Authentication')) { removeLoadingIndicator(); setConnection('auth'); break; }
        setConnection('reconnecting', 'event stream');
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(5000, Math.round(delay * 1.7));
      }
    }
  })();
}

function closeEventStream() {
  if (state.eventSource) { state.eventSource.close(); state.eventSource = null; }
}


function updatePromptMode() {
  const mode = $('#promptbar-mode');
  const label = $('#mode-label');
  if (state.intentKind === 'research-again') {
    mode.hidden = false;
    label.textContent = 'Research Again — describe what to change';
    $('#composer-input').placeholder = 'Tell OneShot what to research differently…';
  } else {
    mode.hidden = true;
    $('#composer-input').placeholder = 'Describe the outcome and constraints…';
  }
}

function setLoading(value) {
  state.loading = value;
  $('#send-btn').disabled = value;
  $('#composer-input').disabled = value;
}

async function onSubmit(event) {
  event.preventDefault();
  const input = $('#composer-input');
  const text = input.value.trim();
  if (!text || state.loading) return;
  setLoading(true);
  try {
    const kind = state.intentKind;
    state.intentKind = 'normal';
    updatePromptMode();
    if (!state.conversationId) {
      await startConversation(text);
      if (state.conversation?.intent?.ready_for_prompt) await startRun();
    } else if (kind === 'research-again') {
      renderLoadingIndicator('Researching again…');
      await addTurn(text, 'research-again');
    } else {
      await addTurn(text, 'normal');
      if (!state.runId && state.conversation?.intent?.ready_for_prompt) await startRun();
    }
  } catch (e) {
    toast(e.message);
  } finally {
    setLoading(false);
    input.value = '';
    input.style.height = 'auto';
  }
}

async function loadJobHistory() {
  const stateEl = $('#history-state');
  const select = $('#history-select');
  stateEl.textContent = 'Loading saved jobs…';
  try {
    const data = await apiJson('/api/runs');
    const runs = Array.isArray(data.runs) ? data.runs : [];
    select.innerHTML = '<option value="">Select a job</option>' + runs.map(r => `<option value="${escapeHtml(r.run_id)}">${escapeHtml(r.run_id)} · ${escapeHtml(r.test_result || r.pipeline_status || '—')}</option>`).join('');
    stateEl.textContent = runs.length ? `${runs.length} saved job(s).` : 'No saved jobs.';
  } catch (e) { stateEl.textContent = e.message; }
}

async function showJobDetail(runId) {
  const detail = $('#history-detail');
  if (!runId) { detail.innerHTML = '<p class="empty-note">Select a job to inspect its recorded state and workspace changes.</p>'; return; }
  detail.textContent = 'Loading job…';
  try {
    const [runRes, mutRes] = await Promise.all([
      apiFetch(`/api/runs/${encodeURIComponent(runId)}`),
      apiFetch(`/api/runs/${encodeURIComponent(runId)}/artifacts/file-mutations`),
    ]);
    const run = runRes.ok ? await runRes.json() : null;
    const mutations = mutRes.ok ? await mutRes.json() : null;
    if (!run) throw new Error('Job unavailable');
    const events = Array.isArray(run.events) ? run.events : [];
    const hashEqual = run.hash_proof?.equal === true;
    const rows = mutations?.records?.length ? mutations.records.map(r => `<tr><td><code>${escapeHtml(r.path)}</code></td><td>${escapeHtml(r.action)}</td><td>${r.bytes ?? '—'}</td><td><code>${r.sha256 ? r.sha256.slice(0,16)+'…' : '—'}</code></td></tr>`).join('') : '';
    detail.innerHTML = `<h4>${escapeHtml(run.test_result || run.pipeline_status || '—')}</h4>
      <p class="job-id">JobId ${escapeHtml(run.run_id)}</p>
      <p>${hashEqual ? 'Created and sandbox hashes match.' : 'Hash equality not reported.'}</p>
      ${run.root_cause ? `<p><strong>Root cause:</strong> ${escapeHtml(run.root_cause.issue)}</p>` : ''}
      <h4>Execution history</h4>${events.length ? `<ol class="job-events">${events.map(e => `<li><strong>${escapeHtml(e.processor)}</strong> <span>${escapeHtml(e.execution_status)}${e.test_result ? ` · ${e.test_result}` : ''}</span></li>`).join('')}</ol>` : '<p>No events recorded.</p>'}
      <h4>Workspace changes</h4>${rows ? `<table class="mutation-table"><thead><tr><th>Path</th><th>Action</th><th>Bytes</th><th>Hash</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>No file mutation evidence.</p>'}`;
  } catch (e) { detail.textContent = e.message; }
}


function bindEvents() {
  $('#composer').addEventListener('submit', onSubmit);
  const textarea = $('#composer-input');
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  });
  textarea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#composer').dispatchEvent(new Event('submit')); } });
  $('#mode-close').addEventListener('click', () => { state.intentKind = 'normal'; updatePromptMode(); });
  $('#new-job-btn').addEventListener('click', () => {
    state.conversationId = '';
    state.runId = '';
    state.run = null;
    state.conversation = null;
    localStorage.removeItem('oneshot.v8.conversationId');
    localStorage.removeItem('oneshot.v8.runId');
    closeEventStream();
    $('#messages').textContent = '';
    $('#empty-state').hidden = false;
    $('#run-info').hidden = true;
    $('#run-value').textContent = '';
    $('#research-review-card')?.remove();
    $('#build-ready-card')?.remove();
    $('#sandbox-card')?.remove();
    $('#final-result-card')?.remove();
    removeLoadingIndicator();
    renderCurrentJob();
    textarea.focus();
  });
  $('#explorer-toggle').addEventListener('click', () => {
    const shell = $('#shell');
    const btn = $('#explorer-toggle');
    const showing = shell.style.gridTemplateColumns !== 'var(--rail-w) 0px 1fr var(--task-w) var(--rail-w)';
    shell.style.gridTemplateColumns = showing ? 'var(--rail-w) 0px 1fr var(--task-w) var(--rail-w)' : '';
    btn.classList.toggle('active', !showing);
    btn.setAttribute('aria-pressed', String(!showing));
  });
  $('#refresh-tree').addEventListener('click', loadWorkspace);
  $('#flip-toggle').addEventListener('click', () => {
    const container = $('#flip-container');
    const isHistory = container.classList.toggle('is-history');
    $('#flip-toggle').setAttribute('aria-pressed', String(isHistory));
    $('#current-job-face').setAttribute('aria-hidden', String(isHistory));
    $('#job-history-face').setAttribute('aria-hidden', String(!isHistory));
    $('#job-history-face').inert = !isHistory;
    $('#current-job-face').inert = isHistory;
    $('#panel-title').textContent = isHistory ? 'Job History' : 'Current Job';
    if (isHistory) loadJobHistory();
  });
  $('#preview-close').addEventListener('click', closePreview);
  $('#preview-copy').addEventListener('click', copyPreview);
  $('#history-select').addEventListener('change', (e) => showJobDetail(e.target.value));
  window.addEventListener('beforeunload', closeEventStream);
}

async function bootstrap() {
  setConnection('connecting');
  bindEvents();
  updatePromptMode();
  await checkHealth();
  await loadTargetInfo();
  await loadWorkspace();
  if (state.conversationId) await loadConversation();
  if (state.runId) {
    $('#run-info').hidden = false;
    $('#run-value').textContent = state.runId;
    try {
      await refreshRunState();
      if (state.run?.pipeline_status === 'Done') {
        ensureFinalCard();
      } else {
        await ensureResearchCard();
        await ensureBuildCard();
        if (!$(`#research-review-card`) && !$(`#build-ready-card`) && !$(`#final-result-card`)) renderLoadingIndicator();
        startEventStream();
      }
    } catch (e) { toast(`Could not restore run: ${e.message}`); }
  }
  $('#composer-input').focus();
}

void bootstrap();
