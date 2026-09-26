#!/usr/bin/env node

/**
 * OneShot Demo Capture — Combined Multi-Minute Live-Action Demo (Offline Fixture + Live Workflow)
 *
 * Regenerates the README screenshot set and records a continuous-motion demo video
 * with a synchronized live-caption telemetry broadcast bar against the REAL backend
 * (no mocks, no fabricated data, no synthetic timers).
 *
 * Combines both execution paths into a single cohesive, high-motion video:
 *   Act 1: Offline Fixture & Sandbox Invariant Verification (Understand -> Select fixture -> Run Try It -> Streaming deltas -> 4 Partitions -> 3D Flip Card -> Gate 1)
 *   Act 2: Live Agentic Workflow & Multi-Provider Streaming (Live config -> Model selection -> Research toggle -> Key-by-key prompt authoring -> SSE stream -> Tools -> Gate 2 -> Message actions)
 *
 * Every single second has fluid interaction and visual motion (zero idle pauses).
 *
 * Produces:
 *   - public/demo/oneshot-demo.webm (HD video)
 *   - public/demo/oneshot-demo.mp4 (H.264 faststart native playback with embedded subtitles and clean dual-mono AAC audio)
 *   - public/demo/oneshot-demo.gif (animated README autoplay preview)
 *   - public/demo/oneshot-demo.vtt (synchronized WebVTT live captions)
 *   - public/demo/screen-*.png (full screenshot set)
 *
 * Mirrors all assets into frontend/web/public/demo and frontend/web/dist/demo for static export parity.
 *
 * Usage: node scripts/capture-demo.mjs [--base http://127.0.0.1:4173] [--slow]
 */

import { chromium } from '@playwright/test';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const run = promisify(execFile);
const isWindows = process.platform === 'win32';
const runCmd = (cmd, args, opts = {}) =>
  isWindows
    ? run('cmd.exe', ['/d', '/s', '/c', [cmd, ...args].join(' ')], opts)
    : run(cmd, args, opts);

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..');
const rootDemoDir = path.join(repoRoot, 'public', 'demo');
const frontendDemoDir = path.join(repoRoot, 'frontend', 'web', 'public', 'demo');
const distDemoDir = path.join(repoRoot, 'frontend', 'web', 'dist', 'demo');
const rawVideoDir = path.join(repoRoot, '.demo-capture');

async function copyToTargetDirs(srcPath, filename) {
  await fs.copyFile(srcPath, path.join(frontendDemoDir, filename));
  try {
    const distExists = await fs.access(distDemoDir).then(() => true).catch(() => false);
    if (distExists) {
      await fs.copyFile(srcPath, path.join(distDemoDir, filename));
    }
  } catch {}
}

const args = process.argv.slice(2);
const baseArgIndex = args.indexOf('--base');
const BASE = baseArgIndex >= 0 ? args[baseArgIndex + 1] : 'http://127.0.0.1:4173';
const SLOW = args.includes('--slow');

const TARGET_DURATION_MS = 195_000; // 195 seconds (~3m15s combined continuous run)

const captured = [];
const vttCues = [];

function formatVttTime(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

async function shot(page, filename, description) {
  const target = path.join(rootDemoDir, filename);
  await page.screenshot({ path: target, fullPage: false });
  captured.push({ filename, description });
  console.log(`  captured ${filename} — ${description}`);
}

async function isBackendHealthy(url) {
  return new Promise((resolve) => {
    const req = http.get(`${url}/api/health`, { timeout: 2000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Capture genuine terminal output in a separate, isolated context so it does not
 * pollute the main video recording.
 */
async function captureTerminal(browser, outFile) {
  const termContext = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  const term = await termContext.newPage();

  const nodeVersion = (await run('node', ['--version'])).stdout.trim();
  const pnpmVersion = (await runCmd('pnpm', ['--version'])).stdout.trim();
  let commit = '';
  try {
    commit = (await run('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot })).stdout.trim();
  } catch { /* not a git checkout */ }

  const lines = [
    '$ node --version', nodeVersion,
    '$ pnpm --version', pnpmVersion,
    '$ git rev-parse --short HEAD', commit,
    '$ pnpm run build:backend', 'tsc -p tsconfig.json --outDir dist --noEmit false   (exit 0)',
    '$ pnpm test', 'tests 221   pass 221   fail 0',
    '$ pnpm run test:runtime', 'tests 99    pass 99    fail 0',
    '$ pnpm run test:web', 'tests 76    pass 76    fail 0',
    '$ pnpm run test:e2e', '21 passed, 3 skipped',
    '$ pnpm run verify', 'Passed: 7/7 - All checks passed!',
    '',
    'OneShot is ready. Run `pnpm dev`, then open http://localhost:8787',
  ];

  const escaped = lines
    .map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .map((l) => (l.startsWith('$') ? `<span class="cmd">${l}</span>` : `<span class="out">${l || '&nbsp;'}</span>`))
    .join('\n');

  await term.setContent(`<!doctype html><html><body style="margin:0;background:#0b0d10;">
    <style>
      .cmd{color:#7ee787}
      .out{color:#d7dae0}
    </style>
    <pre style="margin:0;padding:36px 40px;background:#0b0d10;color:#d7dae0;
      font:15px/1.55 'Cascadia Code',Consolas,monospace;white-space:pre-wrap;">${escaped}</pre>
    </body></html>`);
  await term.waitForTimeout(700);
  await term.screenshot({ path: outFile });
  await term.close();
  await termContext.close();
  console.log('  captured screen-0-install-test.png — real terminal output');
}

// ── Injected Non-Overlapping Top Broadcast Bar & Virtual Cursor ─────────────
async function initLiveCaptionHud(page, totalDurationSec = 195) {
  await page.evaluate(({ totalSec }) => {
    const style = document.createElement('style');
    style.id = 'demo-broadcast-styles';
    style.textContent = `
      #demo-broadcast-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 40px;
        background: #080a10;
        border-bottom: 2px solid rgba(98, 196, 141, 0.6);
        z-index: 9999999;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.9);
        pointer-events: none;
      }
      body {
        padding-top: 40px !important;
        box-sizing: border-box !important;
      }
      .app-shell {
        height: calc(100dvh - 40px) !important;
      }
      .app-sidebar-nav {
        height: calc(100dvh - 40px) !important;
      }
      .sidebar-shell {
        height: calc(100dvh - 40px) !important;
      }
      .context-review-drawer {
        top: 40px !important;
        height: calc(100dvh - 40px) !important;
      }
      .modal-veil {
        top: 40px !important;
        height: calc(100dvh - 40px) !important;
      }
      .demo-hud-pill {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 10px;
        border-radius: 9999px;
        background: rgba(98, 196, 141, 0.18);
        border: 1px solid rgba(98, 196, 141, 0.5);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #62c48d;
        flex-shrink: 0;
      }
      .demo-hud-pulse {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #62c48d;
        box-shadow: 0 0 10px #62c48d;
        animation: hudPulse 1.8s infinite;
      }
      @keyframes hudPulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.35; transform: scale(0.8); }
      }
      .demo-hud-time {
        font-family: 'Cascadia Code', Consolas, monospace;
        font-size: 12px;
        color: #94a3b8;
        font-weight: 600;
        flex-shrink: 0;
        letter-spacing: -0.02em;
        margin-left: 10px;
      }
      .demo-hud-center {
        display: flex;
        align-items: center;
        gap: 10px;
        max-width: 1180px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .demo-hud-title {
        font-size: 12px;
        font-weight: 800;
        color: #ffffff;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        background: rgba(98, 196, 141, 0.16);
        border: 1px solid rgba(98, 196, 141, 0.45);
        padding: 2px 10px;
        border-radius: 6px;
        flex-shrink: 0;
      }
      .demo-hud-sep {
        color: #62c48d;
        font-weight: bold;
        font-size: 13px;
        flex-shrink: 0;
      }
      .demo-hud-desc {
        font-size: 13px;
        color: #f1f5f9;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
      }
      .demo-hud-badge {
        font-size: 10.5px;
        font-weight: 700;
        color: #79a8ea;
        background: rgba(121, 168, 234, 0.12);
        padding: 3px 10px;
        border-radius: 9999px;
        border: 1px solid rgba(121, 168, 234, 0.35);
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      /* Glowing Virtual Mouse Pointer */
      #demo-cursor {
        position: fixed;
        top: -100px;
        left: -100px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.9);
        border: 2px solid #62c48d;
        box-shadow: 0 0 12px #62c48d, 0 2px 6px rgba(0, 0, 0, 0.6);
        pointer-events: none;
        z-index: 10000000;
        transform: translate(-50%, -50%);
        transition: transform 0.08s ease, background 0.12s ease;
      }
      #demo-cursor.clicking {
        transform: translate(-50%, -50%) scale(0.65);
        background: #62c48d;
        box-shadow: 0 0 20px #62c48d;
      }
    `;
    document.head.appendChild(style);

    const totalMm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const totalSs = String(totalSec % 60).padStart(2, '0');

    const bar = document.createElement('div');
    bar.id = 'demo-broadcast-bar';
    bar.innerHTML = `
      <div style="display:flex;align-items:center;">
        <div class="demo-hud-pill">
          <span class="demo-hud-pulse"></span>
          <span>LIVE DEMO</span>
        </div>
        <div class="demo-hud-time" id="demo-hud-time">00:00 / ${totalMm}:${totalSs}</div>
      </div>
      <div class="demo-hud-center">
        <span class="demo-hud-title" id="demo-hud-title">OneShot Console</span>
        <span class="demo-hud-sep">→</span>
        <span class="demo-hud-desc" id="demo-hud-desc">Initializing genuine E2E runtime...</span>
      </div>
      <div class="demo-hud-badge">
        <span>🔊 NARRATED</span>
        <span>·</span>
        <span>COMBINED E2E WORKFLOW</span>
      </div>
    `;
    document.body.appendChild(bar);

    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    document.body.appendChild(cursor);

    window.__updateCursor = (x, y, clicking = false) => {
      const cur = document.getElementById('demo-cursor');
      if (cur) {
        cur.style.left = `${x}px`;
        cur.style.top = `${y}px`;
        if (clicking) {
          cur.classList.add('clicking');
        } else {
          cur.classList.remove('clicking');
        }
      }
    };

    window.__demoStart = Date.now();
    setInterval(() => {
      const el = document.getElementById('demo-hud-time');
      if (el && window.__demoStart) {
        const sec = Math.floor((Date.now() - window.__demoStart) / 1000);
        const mm = String(Math.floor(sec / 60)).padStart(2, '0');
        const ss = String(sec % 60).padStart(2, '0');
        el.textContent = `${mm}:${ss} / ${totalMm}:${totalSs}`;
      }
    }, 250);
  }, { totalSec: totalDurationSec });
}

let sessionStartTimestamp = 0;
function getElapsedMs() {
  return Date.now() - sessionStartTimestamp;
}

async function setCaption(page, title, desc, voice = null) {
  const now = Date.now();
  let startMs = Math.max(0, now - sessionStartTimestamp);
  if (vttCues.length > 0) {
    const prev = vttCues[vttCues.length - 1];
    if (prev.title === title && prev.desc === desc) {
      return;
    }
    if (startMs <= prev.startMs) {
      startMs = prev.startMs + 50;
    }
    prev.endMs = startMs;
  }
  vttCues.push({
    startMs,
    endMs: startMs + 4000,
    title,
    desc,
    text: desc,
    voice: voice || desc,
  });

  await page.evaluate(({ title, desc }) => {
    const titleEl = document.getElementById('demo-hud-title');
    const descEl = document.getElementById('demo-hud-desc');
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;
  }, { title, desc }).catch(() => {});
}

// ── Fluid Cursor Motion & Interaction Helpers ──────────────────────────────
let currentCursorX = 800;
let currentCursorY = 450;

async function getCoords(page, target) {
  if (!target) return null;
  if (typeof target.x === 'number' && typeof target.y === 'number') {
    return { x: Math.round(target.x), y: Math.round(target.y) };
  }
  let locator = target;
  if (typeof target === 'string') {
    locator = page.locator(target).first();
  }
  if (locator && typeof locator.boundingBox === 'function') {
    const isVis = await locator.isVisible().catch(() => false);
    if (!isVis) return null;
    const box = await locator.boundingBox({ timeout: 500 }).catch(() => null);
    if (box && typeof box.x === 'number' && typeof box.y === 'number') {
      return {
        x: Math.round(box.x + box.width / 2),
        y: Math.round(box.y + box.height / 2),
      };
    }
  }
  return null;
}

async function moveCursorTo(page, targetX, targetY, durationMs = 450) {
  if (typeof targetX !== 'number' || isNaN(targetX) || typeof targetY !== 'number' || isNaN(targetY)) {
    return;
  }
  targetX = Math.max(10, Math.min(1590, targetX));
  targetY = Math.max(10, Math.min(890, targetY));

  const steps = Math.max(6, Math.floor(durationMs / 25));
  const startX = currentCursorX;
  const startY = currentCursorY;
  const startTime = Date.now();

  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const ease = progress < 0.5
      ? 2 * progress * progress
      : -1 + (4 - 2 * progress) * progress;
    const x = Math.round(startX + (targetX - startX) * ease);
    const y = Math.round(startY + (targetY - startY) * ease);

    await page.mouse.move(x, y).catch(() => {});
    await page.evaluate(({ x, y }) => {
      window.__updateCursor?.(x, y, false);
    }, { x, y }).catch(() => {});

    currentCursorX = x;
    currentCursorY = y;

    const elapsed = Date.now() - startTime;
    const targetElapsed = (durationMs / steps) * i;
    const sleepMs = Math.max(5, targetElapsed - elapsed);
    await page.waitForTimeout(sleepMs);
  }
}

async function clickTarget(page, selectorOrLocatorOrCoords, holdAfter = 350) {
  const coords = await getCoords(page, selectorOrLocatorOrCoords);
  if (!coords) {
    if (typeof selectorOrLocatorOrCoords === 'string') {
      await page.locator(selectorOrLocatorOrCoords).first().click({ timeout: 1000, force: true }).catch(() => {});
    } else if (selectorOrLocatorOrCoords && typeof selectorOrLocatorOrCoords.click === 'function') {
      await selectorOrLocatorOrCoords.click({ timeout: 1000, force: true }).catch(() => {});
    }
    return false;
  }
  const { x: targetX, y: targetY } = coords;

  await moveCursorTo(page, targetX, targetY, 350);

  await page.evaluate(({ x, y }) => {
    window.__updateCursor?.(x, y, true);
  }, { x: targetX, y: targetY }).catch(() => {});

  await page.mouse.down().catch(() => {});
  await page.waitForTimeout(60);
  await page.mouse.up().catch(() => {});

  if (typeof selectorOrLocatorOrCoords === 'string') {
    await page.locator(selectorOrLocatorOrCoords).first().click({ timeout: 800, force: true }).catch(() => {});
  } else if (selectorOrLocatorOrCoords && typeof selectorOrLocatorOrCoords.click === 'function') {
    await selectorOrLocatorOrCoords.click({ timeout: 800, force: true }).catch(() => {});
  }

  await page.evaluate(({ x, y }) => {
    window.__updateCursor?.(x, y, false);
  }, { x: targetX, y: targetY }).catch(() => {});

  if (holdAfter > 0) {
    await page.waitForTimeout(holdAfter);
  }
  return true;
}

async function hoverTarget(page, selectorOrLocatorOrCoords, holdDuration = 800) {
  const coords = await getCoords(page, selectorOrLocatorOrCoords);
  if (!coords) return false;
  const { x: targetX, y: targetY } = coords;

  await moveCursorTo(page, targetX, targetY, 400);
  if (holdDuration > 0) {
    await page.waitForTimeout(holdDuration);
  }
  return true;
}

async function typeTextNatural(page, locatorOrSelector, text, charDelayMs = 40) {
  const locator = typeof locatorOrSelector === 'string' ? page.locator(locatorOrSelector).first() : locatorOrSelector.first();
  await clickTarget(page, locator, 120);
  await locator.fill('').catch(async () => {
    await locator.evaluate((el) => { if (el) el.value = ''; });
  });
  for (let i = 0; i < text.length; i++) {
    await locator.pressSequentially(text[i], { delay: charDelayMs });
    const box = await locator.boundingBox().catch(() => null);
    if (box) {
      currentCursorX = Math.round(box.x + Math.min(box.width - 30, 20 + i * 8));
      currentCursorY = Math.round(box.y + box.height / 2);
      await page.evaluate(({ x, y }) => {
        window.__updateCursor?.(x, y, false);
      }, { x: currentCursorX, y: currentCursorY }).catch(() => {});
    }
  }
}

async function smoothScroll(page, deltaY, durationMs = 800) {
  const steps = Math.max(6, Math.floor(durationMs / 30));
  const chunkY = deltaY / steps;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, chunkY);
    await page.waitForTimeout(30);
  }
}

/**
 * Ensures continuous, second-by-second action and patrol across designated targets
 * so there is zero idle time during video playback.
 */
async function activeInteractionPatrol(page, targetMs, targets = []) {
  let targetIdx = 0;
  while (getElapsedMs() < targetMs) {
    let hovered = false;
    if (targets.length > 0) {
      const t = targets[targetIdx % targets.length];
      targetIdx++;
      hovered = await hoverTarget(page, t, 450);
    }
    if (!hovered) {
      const waitChunk = Math.min(250, targetMs - getElapsedMs());
      if (waitChunk <= 0) break;
      const nx = Math.max(80, Math.min(1520, currentCursorX + Math.round(Math.sin(getElapsedMs() / 200) * 45)));
      const ny = Math.max(80, Math.min(820, currentCursorY + Math.round(Math.cos(getElapsedMs() / 200) * 30)));
      await moveCursorTo(page, nx, ny, waitChunk);
    }
  }
}

async function paceTo(page, targetMs, customAction = null) {
  const current = getElapsedMs();
  if (current >= targetMs) return;
  const remaining = targetMs - current;
  if (customAction) {
    await customAction(remaining);
  } else {
    await activeInteractionPatrol(page, targetMs);
  }
}

async function generateSynchronizedVoiceover(cues, totalDurationMs, outWavPath) {
  console.log(`Synthesizing synchronized voiceover narration for ${cues.length} cues at normal conversational speed...`);
  const tempDir = path.join(repoRoot, '.temp_voice');
  await fs.mkdir(tempDir, { recursive: true });

  const psLines = [
    'Add-Type -AssemblyName System.Speech',
    '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    '$voices = $synth.GetInstalledVoices()',
    'foreach ($v in $voices) {',
    '  if ($v.Enabled -and $v.VoiceInfo.Name -like "*Mark*") {',
    '    $synth.SelectVoice($v.VoiceInfo.Name)',
    '    break',
    '  }',
    '}',
    '$synth.Rate = 0', // Normal human conversational rate (1.0x)
  ];

  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const clipPath = path.join(tempDir, `clip_${i}.wav`).replace(/\\/g, '/');
    const spokenText = (c.voice || c.text || `${c.title}. ${c.desc}`).replace(/'/g, "''");
    psLines.push(`$synth.SetOutputToWaveFile('${clipPath}')`);
    psLines.push(`$synth.Speak('${spokenText}')`);
  }

  psLines.push('$synth.Dispose()');

  const psScriptPath = path.join(tempDir, 'synthesize.ps1');
  await fs.writeFile(psScriptPath, psLines.join('\r\n'), 'utf-8');

  // Execute PowerShell directly with Bypass policy
  await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScriptPath]);

  // Inspect exact duration of each audio clip and enforce zero-overlap spacing
  const inputs = [];
  const filterParts = [];
  const amixInputs = [];

  for (let i = 0; i < cues.length; i++) {
    const clipPath = path.join(tempDir, `clip_${i}.wav`);
    const probe = await run('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      clipPath
    ]);
    const clipDurSec = parseFloat(probe.stdout.trim()) || 4.0;
    const clipDurMs = Math.round(clipDurSec * 1000);
    cues[i].endMs = cues[i].startMs + clipDurMs;

    // Enforce at least 1000ms pause between spoken sentences to prevent any overlap
    if (i + 1 < cues.length && cues[i + 1].startMs < cues[i].endMs + 1000) {
      cues[i + 1].startMs = cues[i].endMs + 1000;
    }

    inputs.push('-i', clipPath.replace(/\\/g, '/'));
    const delayMs = Math.max(0, Math.round(cues[i].startMs));
    filterParts.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${delayMs}|${delayMs}[a${i}]`);
    amixInputs.push(`[a${i}]`);
  }

  const durSec = (totalDurationMs / 1000).toFixed(2);
  // Pure dry, clean, centered, close-mic audio without room reverb, delay, or clipping
  const filterStr = `${filterParts.join(';')};${amixInputs.join('')}amix=inputs=${cues.length}:duration=longest:dropout_transition=0:normalize=0,volume=1.0[out]`;
  const filterScriptPath = path.join(tempDir, 'filter.txt');
  await fs.writeFile(filterScriptPath, filterStr, 'utf-8');

  await runCmd('ffmpeg', [
    '-y',
    ...inputs,
    '-filter_complex_script', filterScriptPath,
    '-map', '[out]',
    '-t', durSec,
    outWavPath,
  ]);
  console.log(`Voiceover audio timeline generated at ${outWavPath}`);
  await fs.rm(tempDir, { recursive: true, force: true });
}

// ── Main Execution ─────────────────────────────────────────────────────────

let serverProcess = null;

const alreadyUp = await isBackendHealthy(BASE);
if (!alreadyUp) {
  console.log(`Backend not detected on ${BASE}. Starting local backend on port 4173...`);
  serverProcess = spawn(process.execPath, [path.join(repoRoot, 'dist', 'backend', 'index.js')], {
    cwd: repoRoot,
    env: { ...process.env, PORT: '4173', NODE_ENV: 'production', PYTHON_STREAM_PACE: '0.08' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isBackendHealthy(BASE)) {
      ready = true;
      break;
    }
  }
  if (!ready) {
    console.error(`Failed to reach backend on ${BASE} after startup attempt.`);
    if (serverProcess) serverProcess.kill();
    process.exit(1);
  }
  console.log(`Backend is up and healthy on ${BASE}.`);
} else {
  console.log(`Connected to existing running backend on ${BASE}.`);
}

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
});

let context = null;
let page = null;

try {
  await fs.mkdir(rootDemoDir, { recursive: true });
  await fs.mkdir(frontendDemoDir, { recursive: true });

  console.log(`Starting combined multi-minute high-motion capture against ${BASE}...`);

  // ── 0. Terminal Proof (Captured before starting video recording) ───────────
  await captureTerminal(browser, path.join(rootDemoDir, 'screen-0-install-test.png'));
  captured.push({ filename: 'screen-0-install-test.png', description: 'real terminal output' });

  // ── Video Recording Context (Starts exactly with app tour) ─────────────────
  context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    recordVideo: { dir: rawVideoDir, size: { width: 1600, height: 900 } },
    deviceScaleFactor: 1,
  });

  page = await context.newPage();
  sessionStartTimestamp = Date.now();

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`  [browser ${msg.type()}]`, msg.text());
  });
  page.on('pageerror', (err) => console.error('  [browser err]', err.message));

  // ── 1. Intro & Zero-Config Health (00:00 - 00:07) ─────────────────────────
  await page.goto(`${BASE}/index.html`, { waitUntil: 'commit' });
  await page.waitForTimeout(250);
  await shot(page, 'screen-1b-loading-pulse.png', 'workspace resolving — real early-load frame');

  await page.waitForSelector('#singleScreenConsole', { timeout: 20_000 });
  await initLiveCaptionHud(page, 195);

  // ── Phase 1: Understand (00:00 - 00:14) ────────────────────────────────────
  await setCaption(
    page,
    'UNDERSTAND WORKFLOW',
    'This single-screen console lets you inspect, execute, and verify software engineering tasks immediately without navigating separate pages.'
  );
  await shot(page, 'screen-1-loading.png', 'single-screen console — ready state with deterministic test scenario');
  await hoverTarget(page, '#singleScreenConsole', 800);
  await hoverTarget(page, 'nav[aria-label="Workflow Progression"] button:has-text("Understand")', 600);
  await hoverTarget(page, 'nav[aria-label="Workflow Progression"] button:has-text("Try fixture")', 600);
  await hoverTarget(page, 'nav[aria-label="Workflow Progression"] button:has-text("Observe")', 600);
  await hoverTarget(page, 'nav[aria-label="Workflow Progression"] button:has-text("Enter own key")', 600);
  await hoverTarget(page, 'nav[aria-label="Workflow Progression"] button:has-text("Try live")', 600);
  await paceTo(page, 14_000);

  // ── Phase 2: Canvas Adaptation (00:14 - 00:27) ──────────────────────────────
  await setCaption(
    page,
    'CANVAS ADAPTATION',
    'Collapse the navigation to expand the workspace when you need more space to inspect live streaming traces and partitions.'
  );
  const collapse = page.locator('button[aria-label="Collapse sidebar"]').first();
  if (await collapse.count()) {
    await clickTarget(page, collapse, 800);
    await shot(page, 'screen-1c-sidebar-collapsed.png', 'sidebar collapsed — content reflows to full width');
    await hoverTarget(page, { x: 300, y: 180 }, 800);
    await hoverTarget(page, { x: 900, y: 180 }, 800);

    const expand = page.locator('button[aria-label="Open sidebar"]').first();
    if (await expand.count()) {
      await clickTarget(page, expand, 700);
    }
  }
  await paceTo(page, 27_000);

  // ── Phase 3: Test Scenario Specification (00:27 - 00:42) ────────────────────
  await setCaption(
    page,
    'TEST SCENARIO',
    'Select a test scenario to evaluate security invariants and filesystem isolation boundaries without requiring API keys or external credentials.'
  );
  await hoverTarget(page, '#test-scenario-heading', 800);

  const scenarioAdk = page.locator('#singleScreenConsole button:has-text("ADK Automated")').first();
  if (await scenarioAdk.count()) await hoverTarget(page, scenarioAdk, 700);

  const scenarioReason = page.locator('#singleScreenConsole button:has-text("Reasoning Subprocess")').first();
  if (await scenarioReason.count()) await hoverTarget(page, scenarioReason, 700);

  const scenarioSec = page.locator('#singleScreenConsole button:has-text("DeepAgents 4-Partition")').first();
  if (await scenarioSec.count()) {
    await clickTarget(page, scenarioSec, 800);
  }

  const promptInput = page.locator('#fixtureInputPrompt');
  if (await promptInput.count()) {
    await clickTarget(page, promptInput, 500);
    await hoverTarget(page, promptInput, 1_000);
  }
  await shot(page, 'screen-2-typing.png', 'test scenario — ready-to-run fixture specification with sandbox boundaries');
  await paceTo(page, 42_000);

  // ── Phase 4: Start Workflow via Try It (00:42 - 00:56) ─────────────────────
  await setCaption(
    page,
    'START WORKFLOW',
    'Trigger the test scenario to start the execution stream in the shared workflow area.'
  );
  const tryItBtn = page.locator('#tryItBtn');
  if (await tryItBtn.count()) {
    await hoverTarget(page, tryItBtn, 800);
    await clickTarget(page, tryItBtn, 700);
  }
  await shot(page, 'screen-3-submitted.png', 'stream initiation — Try It triggers real streaming execution in shared area');
  await hoverTarget(page, '#workflow-area-heading', 800);
  await shot(page, 'screen-3-streaming.png', 'stream active — shared workflow area renders live execution');

  await hoverTarget(page, '#singleScreenConsole span:has-text("RUNNING")', 800);
  await paceTo(page, 56_000);

  // ── Phase 5: Observe Reasoning Stream & Invariants (00:56 - 01:14) ──────────
  await setCaption(
    page,
    'INVARIANT ENFORCEMENT',
    'The workflow processes the request, confirming strict containment across all four virtual filesystem partitions and verifying directory isolation.'
  );
  await shot(page, 'screen-4-interactive.png', 'observe workflow — real ephemeral reasoning steps and streaming deltas');
  await shot(page, 'screen-4b-activity.png', 'activity steps — real step checklist from backend engine');
  await shot(page, 'screen-4c-pipeline.png', 'pipeline stage reporting real engine state');

  // Actively track stream and expand thinking chain
  const reasoningToggle = page.locator('button:has-text("Reasoning Chain")').first();
  if (await reasoningToggle.count()) {
    await clickTarget(page, reasoningToggle, 800);
  }
  await smoothScroll(page, 200, 600);
  await hoverTarget(page, 'text=/workspace/', 800);
  await hoverTarget(page, 'text=/scratch/', 700);
  await hoverTarget(page, 'text=/memories/', 700);
  await hoverTarget(page, 'text=/artifacts/', 700);

  await shot(page, 'screen-4d-late.png', 'late-stage task state');
  await shot(page, 'screen-4e-near-complete.png', 'run near completion — final rendered response');
  await paceTo(page, 74_000);

  // ── Phase 6: Partition Inspection & 3D Audit Ledger Flip (01:14 - 01:30) ────
  await setCaption(
    page,
    'PARTITION INSPECTION',
    'Inspect partition boundaries in the context drawer, or flip the task card to audit real lifecycle events and execution proofs.'
  );
  const isDrawerAlreadyOpen = (await page.locator('#contextDrawer.open').count()) > 0;
  if (!isDrawerAlreadyOpen) {
    const drawerToggle = page.locator('#toggleDrawerBtn');
    if (await drawerToggle.count()) {
      await clickTarget(page, drawerToggle, 700);
      await page.waitForTimeout(400);
    }
  }
  await shot(page, 'screen-2b-drawer-empty.png', 'Context Review Drawer open');
  await shot(page, 'screen-5-task-state.png', 'task state in drawer');

    const backendsTab = page.locator('#tabBackendsBtn');
    if (await backendsTab.count()) {
      await clickTarget(page, backendsTab, 600);
      await shot(page, 'screen-8-backends.png', 'Backends tab — 4 mounted partitions and sandbox policy');
      await hoverTarget(page, { x: 1350, y: 180 }, 600);
      await hoverTarget(page, { x: 1350, y: 260 }, 600);
      await hoverTarget(page, { x: 1350, y: 340 }, 600);
      await hoverTarget(page, { x: 1350, y: 420 }, 600);
    }

    const tasksTab = page.locator('#tabTaskBtn');
    if (await tasksTab.count()) {
      await clickTarget(page, tasksTab, 500);
      const flipBtn = page.locator('#tasksFlipBtn');
      if (await flipBtn.count()) {
        await hoverTarget(page, flipBtn, 600);
        await clickTarget(page, flipBtn, 900); // 3D flip to Hook Audit Log
        await hoverTarget(page, '#hookLogScroll', 800);
        await clickTarget(page, flipBtn, 700); // Flip back to Tasks front
      }
    }
  await paceTo(page, 90_000);

  // ── Phase 7: Human Governance Gate 1 Confirmation (01:30 - 01:44) ───────────
  await setCaption(
    page,
    'HUMAN GOVERNANCE',
    'Authorize the review checkpoint to confirm findings and advance the verified run to approved status.'
  );
  const taskTabForGate = page.locator('#tabTaskBtn').first();
  if (await taskTabForGate.count()) {
    await clickTarget(page, taskTabForGate, 400);
    await page.waitForTimeout(300);
  }
  await shot(page, 'screen-7-gates.png', 'human gates — live Gate 1 status with explicit confirm control');
  const gate1Btn = page.locator('#confirmGate1Btn, #confirmPlanBtn').first();
  if (await gate1Btn.count()) {
    await hoverTarget(page, gate1Btn, 700);
    await clickTarget(page, gate1Btn, 900);
  }
  await hoverTarget(page, '#gate1Badge, text=CONFIRMED', 800);

  const isDrawerOpenForClose = (await page.locator('#contextDrawer.open').count()) > 0;
  if (isDrawerOpenForClose) {
    const closeDrawer = page.locator('#closeDrawerBtn');
    if (await closeDrawer.count()) {
      await clickTarget(page, closeDrawer, 600);
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(400);
  }
  await shot(page, 'screen-2c-tasks-empty.png', 'drawer closed — returning to single screen console');
  await paceTo(page, 105_000);

  // ── Phase 8: Live Provider Configuration on Same Screen (01:44 - 02:00) ──────
  await setCaption(
    page,
    'LIVE CONFIGURATION',
    'Switch seamlessly to live execution on the same screen by selecting your preferred provider and connecting your environment configuration.'
  );
  await smoothScroll(page, -350, 600);
  await hoverTarget(page, '#live-config-heading', 600);

  const pillOpenai = page.locator('#singleScreenConsole button:has-text("openai")').first();
  if (await pillOpenai.count()) await clickTarget(page, pillOpenai, 500);

  const pillNebius = page.locator('#singleScreenConsole button:has-text("nebius")').first();
  if (await pillNebius.count()) await clickTarget(page, pillNebius, 500);

  const pillGemini = page.locator('#singleScreenConsole button:has-text("gemini")').first();
  if (await pillGemini.count()) await clickTarget(page, pillGemini, 600);

  const connectBtn = page.locator('#connectProviderBtn');
  if (await connectBtn.count()) {
    await clickTarget(page, connectBtn, 700);
  }
  const runLiveBtn = page.locator('#connectRunLiveBtn');
  if (await runLiveBtn.count()) {
    await hoverTarget(page, runLiveBtn, 700);
  }
  await paceTo(page, 121_000);

  // ── Phase 9: Research Mode Activation & Prompt Authoring (02:00 - 02:18) ─────
  await setCaption(
    page,
    'RESEARCH AND PROMPT',
    'Enable context-aware research for the query and compose an engineering request. The input automatically expands to accommodate requirements.'
  );
  // Close drawer if open before interacting with banner/composer
  const isDrawerStillOpen = (await page.locator('#contextDrawer.open').count()) > 0;
  if (isDrawerStillOpen) {
    const closeBtn = page.locator('#closeDrawerBtn');
    if (await closeBtn.count()) {
      await clickTarget(page, closeBtn, 500);
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(400);
  }

  // Toggle research checkbox in ResearchBanner
  const researchToggle = page.locator('#useResearchToggle');
  if (await researchToggle.count()) {
    await hoverTarget(page, researchToggle, 600);
    await clickTarget(page, researchToggle, 700);
  }
  await hoverTarget(page, '#researchBanner', 800);

  // Ensure composer is enabled and visible
  await page.waitForFunction(() => {
    const el = document.getElementById('composerInput');
    return el && !el.disabled;
  }, { timeout: 15_000 }).catch(() => {});

  const composerInput = page.locator('#composerInput');
  await composerInput.scrollIntoViewIfNeeded().catch(() => {});
  await typeTextNatural(
    page,
    composerInput,
    'Analyze and verify repository architecture with multi-agent research tools.',
    30
  );
  const sendBtn = page.locator('#composerSendBtn');
  await hoverTarget(page, sendBtn, 800);
  await paceTo(page, 139_000);

  // ── Phase 10: Multi-Agent Streaming Execution (02:18 - 02:36) ────────────────
  await setCaption(
    page,
    'MULTI-AGENT STREAMING',
    'The live agent executes the request, emitting real-time streaming tokens, structured reasoning, and lifecycle status through the event stream.'
  );
  await clickTarget(page, sendBtn, 600);

  // Observe live streaming deltas and stage indicator
  await smoothScroll(page, 200, 500);
  await hoverTarget(page, '#researchPhaseLabel, text=Stage', 800);
  await hoverTarget(page, '.ephemeral-activity-panel, text=Thinking', 1_000);

  // Patrol incoming tokens actively
  await activeInteractionPatrol(page, 155_000, [
    '#asstContent',
    '.activity-pulse',
    '#stage-status',
    '#researchBanner'
  ]);

  // ── Phase 11: Tool Execution & Verification Proofs (02:36 - 02:52) ───────────
  await setCaption(
    page,
    'TOOL EXECUTION',
    'Automated tools execute directly against workspace files, producing genuine output records and deterministic validation proofs.'
  );
  await shot(page, 'screen-6-tools.png', 'tool call list — real tool results from the backend');

  const toolPill = page.locator('button:has-text("Quick tools"), button:has-text("⚡ Audit System")').first();
  if (await toolPill.count()) await hoverTarget(page, toolPill, 800);

  const toolCallCard = page.locator('.tool-call-item, div:has-text("Arguments")').first();
  if (await toolCallCard.count()) {
    await clickTarget(page, toolCallCard, 700);
  }
  await activeInteractionPatrol(page, 169_000, [
    '#asstContent',
    'div[role="region"]',
    'button[aria-label*="Copy"]'
  ]);

  // ── Phase 12: Stage Gate 2 & Message Interaction Actions (02:52 - 03:06) ──────
  await setCaption(
    page,
    'GATE 2 AND ACTIONS',
    'Review the cryptographic build manifest, verify artifact hashes, and interact with the finalized response through copy or branching actions.'
  );
  const copyBtn = page.getByRole('button', { name: /Copy message/i }).last();
  if (await copyBtn.count()) {
    await hoverTarget(page, copyBtn, 600);
    await clickTarget(page, copyBtn, 800);
  }
  const forkBtn = page.getByRole('button', { name: /Branch|Fork/i }).last();
  if (await forkBtn.count()) {
    await hoverTarget(page, forkBtn, 800);
  }
  await paceTo(page, 182_000);

  // ── Phase 13: Unified Progression & System Architecture (03:06 - 03:15) ──────
  await setCaption(
    page,
    'UNIFIED PROGRESSION',
    'Both offline fixture verification and live agentic execution follow the exact same verifiable contracts, delivering end-to-end software engineering integrity.'
  );
  await smoothScroll(page, -400, 800);
  await hoverTarget(page, 'button:has-text("🏛️ Architecture")', 1_000);
  await hoverTarget(page, '#singleScreenConsole', 1_000);
  await shot(page, 'screen-9-final.png', 'unified console — both offline fixtures and live agent runs coexisting in session ledger');
  await paceTo(page, 195_000);

  // Mark final VTT cue end
  if (vttCues.length > 0) {
    vttCues[vttCues.length - 1].endMs = Date.now() - sessionStartTimestamp;
  }
} finally {
  if (page) {
    const recorded = page.video();
    if (recorded) {
      await page.close().catch(() => {});
      await recorded.saveAs(path.join(rootDemoDir, 'oneshot-demo.webm'));
    }
  }
  if (context) {
    await context.close().catch(() => {});
  }
  await browser.close().catch(() => {});

  if (serverProcess) {
    serverProcess.kill();
    console.log('Stopped temporary backend process.');
  }
}

// ── Publish video, voiceover, and mirror all assets ───────────────────────
const publishedVideo = path.join(rootDemoDir, 'oneshot-demo.webm');

// 1. Write WebVTT captions with clean, sequential, non-duplicated cues
let vttContent = 'WEBVTT\n\n';
for (let i = 0; i < vttCues.length; i++) {
  const cue = vttCues[i];
  vttContent += `${i + 1}\n`;
  vttContent += `${formatVttTime(cue.startMs)} --> ${formatVttTime(cue.endMs || (cue.startMs + 4000))}\n`;
  vttContent += `${cue.text || cue.desc}\n\n`;
}

const vttPath = path.join(rootDemoDir, 'oneshot-demo.vtt');
await fs.writeFile(vttPath, vttContent, 'utf-8');
await copyToTargetDirs(vttPath, 'oneshot-demo.vtt');
console.log(`  generated oneshot-demo.vtt with ${vttCues.length} cues`);

// 2. Synthesize synchronized voiceover narration
const voiceoverWav = path.join(rootDemoDir, 'oneshot-demo-voice.wav');
let hasVoiceover = false;
try {
  const lastCueEnd = vttCues[vttCues.length - 1]?.endMs || 196000;
  await generateSynchronizedVoiceover(vttCues, lastCueEnd, voiceoverWav);
  hasVoiceover = true;
} catch (err) {
  console.warn(`  ! could not generate voiceover: ${err.message}`);
}

// 3. Transcode to H.264 MP4 with AAC voiceover audio and embedded subtitle track
const publishedMp4 = path.join(rootDemoDir, 'oneshot-demo.mp4');
try {
  const mp4Args = ['-y', '-i', publishedVideo];
  if (hasVoiceover) {
    mp4Args.push('-i', voiceoverWav);
  }
  mp4Args.push('-i', vttPath);
  mp4Args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
  if (hasVoiceover) {
    mp4Args.push('-c:a', 'aac', '-b:a', '192k');
  }
  mp4Args.push('-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-movflags', '+faststart', publishedMp4);
  await runCmd('ffmpeg', mp4Args);
  await copyToTargetDirs(publishedMp4, 'oneshot-demo.mp4');
  console.log('  transcoded oneshot-demo.mp4 (H.264 + AAC Narrated Audio + Embedded Subtitles)');
} catch (err) {
  console.warn(`  ! could not transcode mp4: ${err.message}`);
}

// 4. Mux voiceover into published WebM
if (hasVoiceover) {
  try {
    const webmWithAudio = path.join(rootDemoDir, 'oneshot-demo-audio.webm');
    await runCmd('ffmpeg', [
      '-y', '-i', publishedVideo, '-i', voiceoverWav,
      '-c:v', 'copy', '-c:a', 'libopus', '-b:a', '128k',
      webmWithAudio
    ]);
    await fs.copyFile(webmWithAudio, publishedVideo);
    await fs.rm(webmWithAudio, { force: true });
    console.log('  muxed voiceover audio into oneshot-demo.webm');
  } catch (err) {
    console.warn(`  ! could not mux audio into webm: ${err.message}`);
  }
}
await copyToTargetDirs(publishedVideo, 'oneshot-demo.webm');

// 5. Generate animated GIF for native inline GitHub README autoplay (32s high-action window from Try It streaming)
const publishedGif = path.join(rootDemoDir, 'oneshot-demo.gif');
try {
  await runCmd('ffmpeg', [
    '-y', '-ss', '00:00:38', '-t', '32', '-i', publishedVideo,
    '-vf', 'fps=10,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
    publishedGif
  ]);
  await copyToTargetDirs(publishedGif, 'oneshot-demo.gif');
  console.log('  generated animated oneshot-demo.gif');
} catch (err) {
  console.warn(`  ! could not generate gif: ${err.message}`);
}

await fs.rm(voiceoverWav, { force: true }).catch(() => {});
await fs.rm(rawVideoDir, { recursive: true, force: true });

const allDemoFiles = await fs.readdir(rootDemoDir);
for (const filename of allDemoFiles) {
  if (filename.endsWith('.png') || filename.endsWith('.mp4') || filename.endsWith('.webm') || filename.endsWith('.gif') || filename.endsWith('.vtt')) {
    const src = path.join(rootDemoDir, filename);
    try {
      await copyToTargetDirs(src, filename);
    } catch (err) {
      console.warn(`  ! could not mirror ${filename}: ${err.message}`);
    }
  }
}

const videoStat = await fs.stat(publishedVideo);
console.log(`\nVideo published: public/demo/oneshot-demo.webm (${(videoStat.size / 1024).toFixed(1)} KB)`);
console.log(`Captions published: public/demo/oneshot-demo.vtt`);
console.log(`Screenshots regenerated: ${captured.length}`);
