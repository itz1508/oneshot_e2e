// Active Run Panel — 50/50 Status + Artifacts split with draggable separator.

const PROCESSOR_PHASES = {
  'Researcher': 'research',
  'Planner': 'planning',
  'Refactor': 'refactor',
  'Gap Analysis': 'gap-analysis',
  'Evaluation': 'evaluation',
  'Schema Validation': 'validation',
  'Fixture Validation': 'validation',
  'Goal Validation': 'validation',
  'Builder': 'building',
  'Hash Verification': 'hashing',
  'Confirmed': 'terminal',
  'Done': 'success',
};

const STAGE_LABELS = {
  PENDING: '○',
  RUNNING: '◉',
  COMPLETE: '✓',
  COMPLETED: '✓',
  FAILED: '✗',
};

export function createActiveRunPanel() {
  let visible = false;
  let currentRun = null;
  let processorStates = new Map();
  let artifacts = new Map();
  let dragState = null;

  const $ = sel => document.querySelector(sel);
  const $$ = sel => [...document.querySelectorAll(sel)];

  function show() {
    const panel = $('#sidebar-live');
    const normal = $('#sidebar-normal');
    if (panel && normal) {
      visible = true;
      normal.hidden = true;
      panel.hidden = false;
      panel.classList.add('enter');
    }
  }

  function hide() {
    const panel = $('#sidebar-live');
    const normal = $('#sidebar-normal');
    if (panel && normal) {
      visible = false;
      panel.hidden = true;
      normal.hidden = false;
    }
  }

  function updateProcessor(name, state, message = '') {
    processorStates.set(name, { state, message });
    renderProcessors();
  }

  function renderProcessors() {
    const container = $('#processor-timeline');
    if (!container) return;

    container.innerHTML = Object.entries(PROCESSOR_PHASES)
      .filter(([_, phase]) => phase !== 'terminal' && phase !== 'success')
      .map(([processor]) => {
        const p = processorStates.get(processor);
        const state = p?.state || 'PENDING';
        const label = state === 'RUNNING' ? `◉ ${processor}` : `${STAGE_LABELS[state] || '○'} ${processor}`;
        return `<div class="processor-row ${state.toLowerCase()}">${label}</div>`;
      })
      .join('');
  }

  function addArtifact(artifact) {
    artifacts.set(artifact.name, artifact);
    renderArtifacts();
  }

  function updateArtifact(name, status) {
    if (artifacts.has(name)) {
      artifacts.get(name).status = status;
      renderArtifacts();
    }
  }

  function renderArtifacts() {
    const container = $('#run-artifacts');
    if (!container) return;

    if (artifacts.size === 0) {
      container.innerHTML = '<div class="artifact-empty">No artifacts yet</div>';
      return;
    }

    const byKind = new Map();
    artifacts.forEach((a, name) => {
      const kind = a.kind || 'other';
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind).push(a);
    });

    container.innerHTML = [...byKind.entries()]
      .map(([kind, items]) => `
        <div class="artifact-group">
          <div class="artifact-group-title">${kind}</div>
          ${items.map(a => `
            <div class="artifact-item ${a.status || ''}">
              <span class="artifact-name">${a.name}</span>
              <span class="artifact-status">${a.status || ''}</span>
            </div>
          `).join('')}
        </div>
      `).join('');
  }

  function bindDraggableSplit() {
    const actionPane = $('#live-action-pane');
    const filesPane = $('#live-files-pane');
    const divider = $('#live-divider');

    if (!actionPane || !filesPane || !divider) return;

    // Restore saved split
    const saved = localStorage.getItem('oneshot.runPanelSplit');
    if (saved && actionPane) actionPane.style.flex = saved;

    divider.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      dragState = {
        id: e.pointerId,
        startY: e.clientY,
        startHeight: actionPane.getBoundingClientRect().height,
      };
      divider.setPointerCapture?.(e.pointerId);
    });

    divider.addEventListener('pointermove', e => {
      if (!dragState || dragState.id !== e.pointerId) return;
      const dy = e.clientY - dragState.startY;
      const totalHeight = actionPane.parentElement.getBoundingClientRect().height;
      const newHeight = Math.max(100, Math.min(totalHeight - 100, dragState.startHeight + dy));
      actionPane.style.flex = `${newHeight}px 0 0`;
    });

    const endDrag = () => {
      if (dragState) {
        dragState = null;
        const saved = actionPane.style.flex;
        if (saved) localStorage.setItem('oneshot.runPanelSplit', saved);
      }
    };

    divider.addEventListener('pointerup', endDrag);
    divider.addEventListener('pointercancel', endDrag);
  }

  // Auto-bind on creation
  setTimeout(() => bindDraggableSplit(), 100);

  function setRunStatus(status) {
    const statusEl = $('#run-status-label');
    if (statusEl) {
      statusEl.textContent = status;
    }
  }

  return {
    show,
    hide,
    updateProcessor,
    addArtifact,
    updateArtifact,
    setRunStatus,
    bindDraggableSplit,
    isVisible: () => visible,
    getProcessorStates: () => processorStates,
    getArtifacts: () => artifacts,
    refresh: () => { renderProcessors(); renderArtifacts(); },
    onEvent(e) {
      if (e.processor && e.state) {
        this.updateProcessor(e.processor, e.state, e.message);
      }
      if (e.artifact) {
        this.addArtifact(e.artifact);
      }
    },
  };
}
