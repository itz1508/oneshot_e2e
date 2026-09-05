// Visual Settings — centralized presentation ownership.
// Runtime emits semantic state; this module maps semantic state to
// configurable visual tokens. No workflow code contains presentation colors.
const VISUAL_KEY = 'oneshot.visual.v1';

export const VISUAL_DEFAULTS = {
  effects: true,
  intensity: 'LOW',
  smartHue: true,
  glow: true,
  particles: true,
  motion: true,
  depth: true,
  stateColors: {
    IDLE: { primary: '#3b82f6', secondary: '#64748b', ambientStrength: 0.12 },
    PLANNING: { primary: '#f59e0b', secondary: '#d97706', ambientStrength: 0.26 },
    RUNNING: { primary: '#2563eb', secondary: '#06b6d4', ambientStrength: 0.30 },
    COMPLETE: { primary: '#10b981', secondary: '#34d399', ambientStrength: 0.28 },
    ERROR: { primary: '#ef4444', secondary: '#f87171', ambientStrength: 0.30 },
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
  aqua: '#06b6d4',
  'warm-amber': '#f59e0b',
  amber: '#d97706',
  cyan: '#38bdf8',
  sapphire: '#2563eb',
  'sapphire-aqua': '#0ea5e9',
  'blue-green': '#10b981',
  green: '#34d399',
  red: '#ef4444',
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
  app.style.setProperty('--ambient-strength', v.intensity === 'HIGH' ? '1.8' : '1');
  app.style.setProperty('--glow-strength', v.glow ? (v.intensity === 'HIGH' ? '1.8' : '1') : '0');
}

/** Lightweight particle system for ethereal sparse background particles. */
class ParticleSystem {
  constructor(canvas, app) {
    this.canvas = canvas;
    this.app = app;
    this.ctx = canvas?.getContext?.('2d');
    this.particles = [];
    this.animId = null;
    this.active = false;
    if (!this.ctx) return;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.init();
  }

  resize() {
    if (!this.canvas) return;
    this.width = this.canvas.width = window.innerWidth;
    this.height = this.canvas.height = window.innerHeight;
  }

  init() {
    this.particles = [];
    const count = 24;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: Math.random() * 2 + 0.8,
        speedX: (Math.random() - 0.5) * 0.35,
        speedY: -Math.random() * 0.45 - 0.15,
        alpha: Math.random() * 0.6 + 0.2,
        pulse: Math.random() * Math.PI * 2,
      });
    }
  }

  start() {
    if (this.active || !this.ctx) return;
    this.active = true;
    const loop = () => {
      if (!this.active) return;
      this.draw();
      this.animId = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.active = false;
    if (this.animId) cancelAnimationFrame(this.animId);
    this.animId = null;
    if (this.ctx) this.ctx.clearRect(0, 0, this.width, this.height);
  }

  draw() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.width, this.height);
    const color = this.getCurrentColor();
    for (const p of this.particles) {
      p.x += p.speedX;
      p.y += p.speedY;
      p.pulse += 0.03;
      if (p.y < -10) {
        p.y = this.height + 10;
        p.x = Math.random() * this.width;
      }
      if (p.x < -10) p.x = this.width + 10;
      if (p.x > this.width + 10) p.x = -10;
      const currentAlpha = p.alpha * (0.6 + Math.sin(p.pulse) * 0.4);
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fillStyle = color.replace('ALPHA', String(currentAlpha));
      this.ctx.shadowBlur = p.size * 4;
      this.ctx.shadowColor = color.replace('ALPHA', String(currentAlpha * 0.8));
      this.ctx.fill();
    }
  }

  getCurrentColor() {
    const isRunning = this.app?.classList.contains('state-running');
    const isPlanning = this.app?.classList.contains('state-planning');
    const isComplete = this.app?.classList.contains('state-complete');
    if (isRunning) return 'rgba(37, 99, 235, ALPHA)';
    if (isPlanning) return 'rgba(245, 158, 11, ALPHA)';
    if (isComplete) return 'rgba(16, 185, 129, ALPHA)';
    return 'rgba(96, 165, 250, ALPHA)';
  }
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

  let particleSystem = null;
  const canvas = document.getElementById('ambient-particles');
  if (canvas) {
    particleSystem = new ParticleSystem(canvas, app);
    if (settings.effects && settings.particles) particleSystem.start();
  }

  function syncParticles() {
    if (!particleSystem) return;
    if (settings.effects && settings.particles) {
      particleSystem.start();
    } else {
      particleSystem.stop();
    }
  }

  function persist() {
    saveVisual(settings);
    applyVisualSettings(settings, app);
    syncParticles();
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
    apply: () => {
      applyVisualSettings(settings, app);
      syncParticles();
    },
    renderInto,
    bindToggle,
    hueTokenFor: role => hueTokenFor(settings, role),
  };
}
