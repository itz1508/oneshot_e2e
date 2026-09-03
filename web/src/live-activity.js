// Live Activity — LEFT running lane.
// ACTION feed: what OneShot is observably doing right now (real events only).
// FILES / RECORDS feed: tangible artifacts the runtime actually reports.
// This module never renders TODO content — TODOs belong to Task Management.
export const LIVE_ACTION_CAP = 40;

/** Pure: observable action text from a real event. Prefers producer-declared
 * activity text; falls back to the real processor + state transition. */
export function actionTextFromEvent(e) {
  if (!e) return '';
  const activity = typeof e.activity === 'string' ? e.activity.trim() : '';
  if (activity) return activity;
  const processor = typeof e.processor === 'string' ? e.processor.trim() : '';
  if (!processor) return '';
  return `${processor} ${String(e.state || 'PENDING').toLowerCase()}`;
}

/** Pure: artifact row from a real artifact-registration event (contract
 * extension). Returns null unless the event carries a real artifact object —
 * operation/kind labels are never inferred from generic event state. */
export function artifactRowFromEvent(e) {
  const a = e && e.artifact;
  if (!a || typeof a !== 'object' || typeof a.name !== 'string' || !a.name.trim()) return null;
  return {
    name: a.name.trim(),
    path: typeof a.path === 'string' ? a.path : '',
    operation: typeof a.operation === 'string' ? a.operation : null,
    kind: typeof a.kind === 'string' ? a.kind : null,
    source: 'event',
  };
}

/** Pure: artifact rows from a real run snapshot artifacts map (name -> path). */
export function rowsFromSnapshot(artifacts) {
  if (!artifacts || typeof artifacts !== 'object') return [];
  return Object.entries(artifacts)
    .filter(([name]) => typeof name === 'string' && name.trim())
    .map(([name, path]) => ({
      name: name.trim(),
      path: typeof path === 'string' ? path : '',
      operation: null,
      kind: null,
      source: 'snapshot',
    }));
}

function clampSplit(pct) {
  return Math.max(35, Math.min(70, pct));
}

export function createLiveActivity({ maxRows = LIVE_ACTION_CAP } = {}) {
  let splitDrag = null;
  let liveVisible = null;

  const q = (sel, root = document) => root.querySelector(sel);

  function addAction(text) {
    const box = q('#live-action');
    if (!box) return;
    q('.live-empty', box)?.remove();
    const row = document.createElement('div');
    row.className = 'live-row active';
    const glyph = document.createElement('i');
    glyph.className = 'glyph';
    glyph.textContent = '●';
    glyph.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'live-text';
    label.textContent = text;
    row.append(glyph, label);
    box.prepend(row);
    [...box.children].forEach((r, i) => {
      r.classList.toggle('active', i === 0);
      r.classList.toggle('dim', i > 0);
      if (i >= maxRows) r.remove();
    });
  }

  function upsertArtifact(a) {
    const box = q('#live-files');
    if (!box) return;
    q('.live-empty', box)?.remove();
    let row = box.querySelector(`[data-artifact="${CSS.escape(a.name)}"]`);
    if (!row) {
      row = document.createElement('div');
      row.className = 'live-row artifact';
      row.dataset.artifact = a.name;
      const name = document.createElement('span');
      name.className = 'artifact-name';
      const path = document.createElement('span');
      path.className = 'artifact-path';
      const op = document.createElement('em');
      op.className = 'live-op';
      op.hidden = true;
      row.append(name, path, op);
      box.prepend(row);
    }
    q('.artifact-name', row).textContent = a.name;
    q('.artifact-path', row).textContent = a.path;
    const op = q('.live-op', row);
    // Producer-declared operation only; a snapshot refresh never erases one.
    const operation = a.operation || (a.source === 'snapshot' ? op.textContent : '');
    if (operation) {
      op.textContent = operation;
      op.hidden = false;
    } else {
      op.textContent = '';
      op.hidden = true;
    }
  }
  function restoreSplit() {
    const pane = q('#live-action-pane');
    const saved = parseFloat(localStorage.getItem('oneshot.liveSplit') || '');
    if (pane && !Number.isNaN(saved)) pane.style.flexBasis = `${clampSplit(saved)}%`;
  }

  function bindDivider() {
    const pane = q('#live-action-pane');
    const divider = q('#live-divider');
    const aside = q('#sidebar-live');
    if (!pane || !divider || !aside) return;
    restoreSplit();
    divider.addEventListener('pointerdown', e => {
      splitDrag = { id: e.pointerId, y: e.clientY, start: pane.getBoundingClientRect().height };
      divider.setPointerCapture?.(e.pointerId);
    });
    divider.addEventListener('pointermove', e => {
      if (!splitDrag || splitDrag.id !== e.pointerId) return;
      const total = aside.clientHeight || 1;
      const pct = ((splitDrag.start + (e.clientY - splitDrag.y)) / total) * 100;
      pane.style.flexBasis = `${clampSplit(pct)}%`;
    });
    const end = () => {
      if (!splitDrag) return;
      splitDrag = null;
      const total = aside.clientHeight || 1;
      const current = (pane.getBoundingClientRect().height / total) * 100;
      localStorage.setItem('oneshot.liveSplit', String(clampSplit(current) / 100));
    };
    divider.addEventListener('pointerup', end);
    divider.addEventListener('pointercancel', end);
  }

  return {
    onEvent(e) {
      const text = actionTextFromEvent(e);
      if (text) addAction(text);
      const art = artifactRowFromEvent(e);
      if (art) upsertArtifact(art);
    },
    onSnapshot(snapshot) {
      const rows = rowsFromSnapshot(snapshot?.artifacts);
      const box = q('#live-files');
      if (!box) return;
      if (!rows.length) {
        if (!box.querySelector('.live-row.artifact')) {
          box.innerHTML = '<div class="live-empty">No artifacts reported yet.</div>';
        }
        return;
      }
      for (const r of rows) upsertArtifact(r);
    },
    reset() {
      const action = q('#live-action');
      const files = q('#live-files');
      if (action) action.innerHTML = '<div class="live-empty">Actions will appear when the run starts.</div>';
      if (files) files.innerHTML = '<div class="live-empty">No artifacts reported yet.</div>';
    },
    setLiveVisible(on) {
      const aside = q('#sidebar-live');
      const normal = q('#sidebar-normal');
      if (!aside || !normal || liveVisible === on) return;
      liveVisible = on;
      if (on) {
        normal.hidden = true;
        aside.hidden = false;
        requestAnimationFrame(() => aside.classList.add('enter'));
      } else {
        aside.classList.remove('enter');
        aside.hidden = true;
        normal.hidden = false;
      }
    },
    bindDivider,
  };
}
