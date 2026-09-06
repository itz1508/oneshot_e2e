// Task Management — RIGHT lane. Concrete TODO hierarchy from canonical
// runtime records only. TODO items come exclusively from Plan.steps[];
// event.activity / processor names / stage state are NEVER converted into
// TODOs (that is Live Activity content).
export const AGENT_STAGES = {
  Planner: ['Planner'],
  Refactor: ['Refactor'],
  'Gap Analysis': ['Gap Analysis'],
  Evaluation: ['Evaluation'],
  'Triple Validation': ['Triple Validation', 'Schema Validation', 'Fixture Validation', 'Goal Validation'],
  Builder: ['Builder', 'Hash Verification'],
  Result: ['Confirmed', 'Done'],
};

const STEP_STATES = ['PENDING', 'RUNNING', 'COMPLETE', 'COMPLETED', 'FAILED'];
const PLAN_EMPTY = 'Plan record not yet provided by the runtime.';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Pure: group canonical Plan steps by their real `responsibility` owner.
 * Only plan.steps[].description is used as TODO text — nothing else. */
export function planToGroups(plan) {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  const groups = new Map();
  for (const s of steps) {
    if (!s || typeof s !== 'object') continue;
    const description = typeof s.description === 'string' ? s.description.trim() : '';
    if (!description) continue;
    const owner = typeof s.responsibility === 'string' && s.responsibility.trim() ? s.responsibility.trim() : 'Plan steps';
    if (!groups.has(owner)) groups.set(owner, []);
    groups.get(owner).push({
      stepId: typeof s.step_id === 'string' ? s.step_id : '',
      description,
      dependsOn: Array.isArray(s.depends_on) ? s.depends_on : [],
    });
  }
  return [...groups.entries()].map(([owner, items]) => ({ owner, items }));
}

/** Pure: per-step state chip only from real step_id-scoped events (contract
 * extension). Regular stage events yield null — no inferred step state. */
export function stepStateFromEvent(e) {
  if (!e || typeof e.stepId !== 'string' || !e.stepId.trim()) return null;
  if (!STEP_STATES.includes(e.state)) return null;
  return { stepId: e.stepId, state: e.state === 'COMPLETED' ? 'COMPLETE' : e.state };
}

/** Pure: map a plan step's real responsibility to its canonical Agent group.
 * Researcher has no stage rows but owns the dedicated Researcher accordion. */
export function agentForResponsibility(owner) {
  if (typeof owner !== 'string') return null;
  const o = owner.trim().toLowerCase();
  if (!o || o === 'result') return null;
  if (o === 'researcher') return 'Researcher';
  if (['schema validation', 'fixture validation', 'goal validation'].includes(o)) return 'Triple Validation';
  for (const agent of Object.keys(AGENT_STAGES)) {
    if (agent.toLowerCase() === o) return agent;
  }
  return null;
}

/** Pure: the canonical Agent group that owns a workflow stage processor. */
export function agentOfStage(processor) {
  for (const [agent, stages] of Object.entries(AGENT_STAGES)) {
    if (stages.includes(processor)) return agent;
  }
  return null;
}
export function createTaskManagement({ apiFetch } = {}) {
  const _apiFetch = apiFetch || ((url, opts) => fetch(url, { credentials: 'same-origin', ...opts }));
  const stepStates = new Map();
  let lastRunningAgent = null;

  const q = (sel, root = document) => root.querySelector(sel);
  const qall = (sel, root = document) => [...root.querySelectorAll(sel)];

  function groupEl(agent) {
    return q(`.agent-group[data-agent="${CSS.escape(agent)}"]`);
  }

  function stageRows(agent) {
    const g = groupEl(agent);
    return g ? [...g.querySelectorAll('.stage')] : [];
  }

  function agentComplete(agent) {
    const rows = stageRows(agent);
    if (rows.length) {
      return rows.every(r => {
        const s = r.dataset.state;
        return s === 'COMPLETE' || s === 'COMPLETED';
      });
    }
    // Stage-less groups (Researcher) carry state on their summary element.
    const s = groupEl(agent)?.querySelector(':scope > summary')?.dataset.state;
    return s === 'COMPLETE' || s === 'COMPLETED';
  }

  function allComplete(agent) {
    return agentComplete(agent);
  }

  function aggregateState(agent) {
    const states = stageRows(agent).map(r => r.dataset.state || 'PENDING');
    if (states.some(s => s === 'RUNNING')) return 'RUNNING';
    if (states.some(s => s === 'FAILED')) return 'FAILED';
    if (states.length && states.every(s => s === 'COMPLETE' || s === 'COMPLETED')) return 'COMPLETE';
    return 'PENDING';
  }

  function taskItem(it) {
    const row = document.createElement('div');
    row.className = 'task-item';
    if (it.stepId) row.dataset.stepId = it.stepId;
    const currentState = it.stepId ? stepStates.get(it.stepId) : null;
    if (currentState) row.dataset.state = currentState;

    const check = document.createElement('span');
    check.className = 'task-check';
    check.setAttribute('aria-hidden', 'true');
    check.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const glyph = document.createElement('i');
    glyph.className = 'task-glyph';
    glyph.textContent = '·';
    glyph.setAttribute('aria-hidden', 'true');

    const desc = document.createElement('span');
    desc.className = 'task-desc';
    desc.textContent = it.description;

    row.append(check, glyph, desc);

    if (it.dependsOn && it.dependsOn.length > 0) {
      const dep = document.createElement('span');
      dep.className = 'task-deps';
      dep.textContent = `deps: ${it.dependsOn.join(', ')}`;
      row.append(dep);
    }

    if (it.stepId) {
      const chip = document.createElement('em');
      chip.className = 'step-state';
      chip.textContent = currentState || '—';
      chip.title = 'Step state (provided only by step-scoped runtime events)';
      if (currentState) chip.dataset.state = currentState;
      row.append(chip);
    }
    return row;
  }

  function renderPlanGroup(group, container, plan) {
    if (!container) return;
    container.textContent = '';
    const source = document.createElement('div');
    source.className = 'plan-source';
    source.textContent = `Plan · rev ${plan?.revision ?? '?'} · owner: ${group.owner}`;
    container.append(source);
    for (const it of group.items) container.append(taskItem(it));
  }

  function clearRoleTaskContainers() {
    qall('.agent-tasks').forEach(el => {
      el.textContent = '';
    });
  }
  return {
    /** Feed one real normalized event: accordion behavior + step chips. */
    onEvent(e) {
      if (!e) return;
      const agent = agentOfStage(e.processor);
      if (agent) {
        const g = groupEl(agent);
        const em = g?.querySelector(':scope > summary em');
        if (em) em.textContent = aggregateState(agent);
        if (e.state === 'RUNNING') {
          g?.classList.add('active-agent');
          if (g && !g.open) g.open = true;
          if (lastRunningAgent && lastRunningAgent !== agent && allComplete(lastRunningAgent)) {
            const prev = groupEl(lastRunningAgent);
            if (prev && !prev.dataset.manual) prev.open = false;
          }
          lastRunningAgent = agent;
        }
        if (e.state === 'COMPLETE' || e.state === 'COMPLETED') {
          g?.classList.remove('active-agent');
        }
      }
      const st = stepStateFromEvent(e);
      if (st) {
        stepStates.set(st.stepId, st.state);
        for (const [stepId, state] of stepStates) {
          const row = q(`[data-step-id="${CSS.escape(stepId)}"]`);
          if (row) {
            row.dataset.state = state;
            const chip = row.querySelector('.step-state');
            if (chip) {
              chip.textContent = state;
              chip.dataset.state = state;
            }
          }
        }
      }
    },
    /** Feed a real run snapshot: render canonical Plan steps as TODOs.
     * Plan contents are read through the runtime artifact API (workspace
     * policy denies data/ paths by design). */
    async onSnapshot(snapshot, runId) {
      const artifacts = snapshot?.artifacts && typeof snapshot.artifacts === 'object' ? snapshot.artifacts : {};
      const name = artifacts['plan.gap'] ? 'plan.gap' : artifacts['plan.reviewed'] ? 'plan.reviewed' : artifacts['plan.researcher'] ? 'plan.researcher' : null;
      if (!name || !runId) {
        this.renderPlanMessage(PLAN_EMPTY);
        return;
      }
      try {
        const r = await _apiFetch(`/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(name)}`);
        if (!r.ok) throw new Error(`Plan record read failed: ${r.status}`);
        const plan = JSON.parse(await r.text());
        this.renderPlan(plan, name);
      } catch (err) {
        this.renderPlanMessage(`Plan record could not be read: ${err.message || err}`);
      }
    },
    renderPlan(plan, sourceName) {
      const groups = planToGroups(plan);
      clearRoleTaskContainers();
      const extras = q('#task-plan-extras');
      if (extras) extras.textContent = '';
      const handled = new Set();
      for (const g of groups) {
        const agent = agentForResponsibility(g.owner);
        if (!agent) continue;
        const container = q(`[data-agent-tasks="${CSS.escape(agent)}"]`);
        if (container) {
          renderPlanGroup(g, container, plan);
          handled.add(agent);
        }
      }
      for (const g of groups) {
        const agent = agentForResponsibility(g.owner);
        if (agent && handled.has(agent)) continue;
        if (!extras) break;
        const det = document.createElement('details');
        det.className = 'agent-group plan-extra';
        det.dataset.agent = g.owner;
        const summary = document.createElement('summary');
        const name = document.createElement('span');
        name.className = 'agent-name';
        name.textContent = g.owner;
        const em = document.createElement('em');
        em.textContent = 'PLAN';
        summary.append(name, em);
        const body = document.createElement('div');
        body.className = 'agent-tasks';
        det.append(summary, body);
        extras.append(det);
        renderPlanGroup(g, body, plan);
      }
      if (sourceName) {
        const meta = q('#run-meta');
        if (meta) meta.title = `TODO source: ${sourceName}`;
      }
    },
    renderPlanMessage(message) {
      clearRoleTaskContainers();
      const extras = q('#task-plan-extras');
      if (extras) {
        extras.textContent = '';
        const note = document.createElement('div');
        note.className = 'plan-note';
        note.textContent = message;
        extras.append(note);
      }
    },
    resetPlan() {
      stepStates.clear();
      lastRunningAgent = null;
      qall('.agent-group').forEach(g => {
        g.classList.remove('active-agent');
        const em = g.querySelector(':scope > summary em');
        if (em) em.textContent = 'PENDING';
      });
      this.renderPlanMessage(PLAN_EMPTY);
    },
    bindManualToggles() {
      qall('.agent-group > summary').forEach(summary => {
        summary.addEventListener('click', () => {
          summary.parentElement.dataset.manual = '1';
        });
      });
    },
  };
}
