// Visual Settings — centralized presentation ownership.
// Runtime emits semantic state; this module maps semantic state to
// configurable visual tokens. No workflow code contains presentation colors.
const VISUAL_KEY = 'oneshot.visual.v1';

export const VISUAL_DEFAULTS = {
  effects: true,
  intensity: 'LOW',
  smartHue: true,
  glow: true,
  particles: false,
  motion: true,
  depth: true,
  stateColors: {
    IDLE: { primary: '#f4f7fb', secondary: '#7e8998', ambientStrength: 0 },
    PLANNING: { primary: '#c9a15a', secondary: '#d8aa64', ambientStrength: 0.08 },
    RUNNING: { primary: '#3a6aa3', secondary: '#2d8690', ambientStrength: 0.12 },
    COMPLETE: { primary: '#4fa88a', secondary: '#72c894', ambientStrength: 0.1 },
    ERROR: { primary: '#c96870', secondary: '#df777e', ambientStrength: 0.12 },
  },
  hueMap: {
    Researcher: 'aqua',
    Planner: 'warm-amber',
    Refactor: 'amber',
    'Gap Analysis': 'cyan',
    Evaluation: 'sapphire',
    'Triple Validation': 'sapphire-aqua',
    Builder: 'blue-green',
    Done: 'green',
  },
};

export const HUE_TOKENS = {
  aqua: '#2d8690',
  'warm-amber': '#c9a15a',
  amber: '#d8aa64',
  cyan: '#4fb3c9',
  sapphire: '#3a6aa3',
  'sapphire-aqua': '#34789a',
  'blue-green': '#3a8f86',
  green: '#4fa88a',
  red: '#c96870',
};

export const STATE_NAMES = ['IDLE', 'PLANNING', 'RUNNING', 'COMPLETE', 'ERROR'];

function clampStrength(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(0.3, x));
}

/** Pure merge of persisted settings over defaults (safe for node tests). */
export function mergeVisual(stored) {
  const base = JSON.parse(JSON.stringify(VISUAL_DEFAULTS));
  if (!stored || typeof stored !== 'object') return base;
  for (const k of ['effects', 'glow', 'particles', 'motion', 'depth', 'smartHue']) {
    if (typeof stored[k] === 'boolean') base[k] = stored[k];
  }
  if (stored.intensity === 'LOW' || stored.intensity === 'HIGH') base.intensity = stored.intensity;
  if (stored.stateColors && typeof stored.stateColors === 'object') {
    for (const name of STATE_NAMES) {
      const c = stored.stateColors[name];
      if (!c || typeof c !== 'object') continue;
      if (typeof c.primary === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.primary)) base.stateColors[name].primary = c.primary;
      if (typeof c.secondary === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.secondary)) base.stateColors[name].secondary = c.secondary;
      if (c.ambientStrength !== undefined) base.stateColors[name].ambientStrength = clampStrength(c.ambientStrength);
    }
  }
  if (stored.hueMap && typeof stored.hueMap === 'object') {
    for (const [k, v] of Object.entries(stored.hueMap)) {
      if (typeof v === 'string' && HUE_TOKENS[v]) base.hueMap[k] = v;
    }
  }
  return base;
}

export function loadVisual() {
  try {
    return mergeVisual(JSON.parse(localStorage.getItem(VISUAL_KEY) || 'null'));
  } catch {
    return mergeVisual(null);
  }
}

export function saveVisual(v) {
  try {
    localStorage.setItem(VISUAL_KEY, JSON.stringify(v));
  } catch {}
}

/** Pure: Smart Hue token for a role, or null when disabled/unmapped. */
export function hueTokenFor(settings, role) {
  if (!settings || !settings.smartHue) return null;
  const key = settings.hueMap?.[role];
  return key ? HUE_TOKENS[key] || null : null;
}

/** Applies settings to the app element as data attributes + CSS variables. */
export function applyVisualSettings(v, app) {
  if (!app) return;
  app.dataset.effects = v.effects ? 'on' : 'off';
  app.dataset.intensity = v.intensity;
  app.dataset.glow = v.glow ? 'on' : 'off';
  app.dataset.particles = v.particles ? 'on' : 'off';
  app.dataset.motion = v.motion ? 'on' : 'off';
  app.dataset.depth = v.depth ? 'on' : 'off';
  app.dataset.smartHue = v.smartHue ? 'on' : 'off';
  for (const name of STATE_NAMES) {
    const c = v.stateColors[name];
    const key = name.toLowerCase();
    app.style.setProperty(`--state-${key}-primary`, c.primary);
    app.style.setProperty(`--state-${key}-secondary`, c.secondary);
    app.style.setProperty(`--state-${key}-strength`, String(c.ambientStrength));
  }
  app.style.setProperty('--ambient-strength', v.intensity === 'HIGH' ? '1.5' : '1');
  app.style.setProperty('--glow-strength', v.glow ? (v.intensity === 'HIGH' ? '1.5' : '1') : '0');
}

function seg(host, label, options, current, onPick) {
  const row = document.createElement('div');
  row.className = 'settings-row';
  const name = document.createElement('span');
  name.textContent = label;
  const segEl = document.createElement('div');
  segEl.className = 'seg';
  segEl.setAttribute('role', 'group');
  segEl.setAttribute('aria-label', label);
  for (const opt of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = opt;
    b.classList.toggle('on', opt === current);
    b.setAttribute('aria-pressed', String(opt === current));
    b.onclick = () => {
      segEl.querySelectorAll('button').forEach(x => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      });
      onPick(opt);
    };
    segEl.append(b);
  }
  row.append(name, segEl);
  host.append(row);
}

function toggleRow(host, label, current, onSet) {
  const row = document.createElement('div');
  row.className = 'settings-row';
  const name = document.createElement('span');
  name.textContent = label;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mini-toggle';
  b.textContent = current ? 'ON' : 'OFF';
  b.setAttribute('aria-pressed', String(current));
  b.onclick = () => {
    current = !current;
    b.textContent = current ? 'ON' : 'OFF';
    b.setAttribute('aria-pressed', String(current));
    onSet(current);
  };
  row.append(name, b);
  host.append(row);
}

function sectionTitle(host, text) {
  const h = document.createElement('div');
  h.className = 'settings-sec';
  h.textContent = text;
  host.append(h);
}

export function createVisualSettings(app) {
  const settings = loadVisual();
  applyVisualSettings(settings, app);

  function persist() {
    saveVisual(settings);
    applyVisualSettings(settings, app);
  }

  function renderInto(host) {
    if (!host) return;
    host.textContent = '';
    const title = document.createElement('h3');
    title.textContent = 'Visual Settings';
    host.append(title);
    seg(host, 'Visual Effects', ['ON', 'OFF'], settings.effects ? 'ON' : 'OFF', v => {
      settings.effects = v === 'ON';
      persist();
    });
    seg(host, 'Intensity', ['LOW', 'HIGH'], settings.intensity, v => {
      settings.intensity = v;
      persist();
    });
    sectionTitle(host, 'Channels');
    toggleRow(host, 'Glow', settings.glow, v => {
      settings.glow = v;
      persist();
    });
    toggleRow(host, 'Particles', settings.particles, v => {
      settings.particles = v;
      persist();
    });
    toggleRow(host, 'Motion', settings.motion, v => {
      settings.motion = v;
      persist();
    });
    toggleRow(host, 'Depth', settings.depth, v => {
      settings.depth = v;
      persist();
    });
    toggleRow(host, 'Smart Hue', settings.smartHue, v => {
      settings.smartHue = v;
      persist();
    });
    sectionTitle(host, 'State Colors');
    for (const name of STATE_NAMES) {
      const c = settings.stateColors[name];
      const row = document.createElement('div');
      row.className = 'settings-row state-color-row';
      const label = document.createElement('span');
      label.textContent = name.charAt(0) + name.slice(1).toLowerCase();
      const controls = document.createElement('div');
      controls.className = 'state-color-controls';
      const primary = document.createElement('input');
      primary.type = 'color';
      primary.value = c.primary;
      primary.setAttribute('aria-label', `${name} primary color`);
      primary.oninput = () => {
        if (/^#[0-9a-fA-F]{6}$/.test(primary.value)) {
          c.primary = primary.value;
          persist();
        }
      };
      const secondary = document.createElement('input');
      secondary.type = 'color';
      secondary.value = c.secondary;
      secondary.setAttribute('aria-label', `${name} secondary color`);
      secondary.oninput = () => {
        if (/^#[0-9a-fA-F]{6}$/.test(secondary.value)) {
          c.secondary = secondary.value;
          persist();
        }
      };
      const strength = document.createElement('input');
      strength.type = 'range';
      strength.min = '0';
      strength.max = '30';
      strength.value = String(Math.round(c.ambientStrength * 100));
      strength.setAttribute('aria-label', `${name} ambient strength`);
      strength.oninput = () => {
        c.ambientStrength = clampStrength(Number(strength.value) / 100);
        persist();
      };
      controls.append(primary, secondary, strength);
      row.append(label, controls);
      host.append(row);
    }
  }

  function bindToggle(btn, popover) {
    if (!btn || !popover) return;
    btn.onclick = () => {
      const open = popover.hidden;
      popover.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (open) renderInto(popover);
    };
    document.addEventListener('pointerdown', e => {
      if (popover.hidden) return;
      if (popover.contains(e.target) || btn.contains(e.target)) return;
      popover.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !popover.hidden) {
        popover.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  return {
    settings,
    apply: () => applyVisualSettings(settings, app),
    renderInto,
    bindToggle,
    hueTokenFor: role => hueTokenFor(settings, role),
  };
}
