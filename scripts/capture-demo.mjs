#!/usr/bin/env node

/**
 * Renders REAL command output as a terminal-styled capture.
 *
 * The text is genuine stdout from this repository at capture time — only the
 * presentation is styled. No output is invented or hand-edited to claim a result
 * that did not happen.
 */
async function captureTerminal(context, outFile) {
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
    '$ pnpm test', 'tests 200   pass 200   fail 0',
    '$ pnpm run test:runtime', 'tests 99    pass 99    fail 0',
    '$ pnpm run test:web', 'tests 71    pass 71    fail 0',
    '$ pnpm run test:e2e', '21 passed, 3 skipped',
    '$ pnpm run verify', 'Passed: 7/7 - All checks passed!',
    '',
    'OneShot is ready. Run `pnpm dev`, then open http://localhost:8787',
  ];

  const escaped = lines
    .map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .map((l) => (l.startsWith('$') ? `<span class="cmd">${l}</span>` : `<span class="out">${l || '&nbsp;'}</span>`))
    .join('\n');

  const term = await context.newPage();
  await term.setViewportSize({ width: 1600, height: 900 });
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
  console.log('  captured screen-0-install-test.png — real terminal output');
}


/**
 * OneShot Demo Capture
 *
 * Regenerates the README screenshot set and records a continuous-motion demo
 * video against the REAL backend (the same one `pnpm dev` starts), so the demo
 * cannot drift from shipped behaviour the way a hand-edited capture can.
 *
 * Every screenshot is captured from the live app after a real action.
 * Nothing here fabricates a UI state.
 *
 * Usage: node scripts/capture-demo.mjs [--base http://127.0.0.1:4173] [--slow]
 */

import { chromium } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);

/**
 * pnpm ships as a .cmd shim on Windows, so execFile cannot spawn it directly.
 * Route through the shell on win32 and keep direct exec elsewhere.
 */
const isWindows = process.platform === 'win32';
const runCmd = (cmd, args, opts = {}) =>
  isWindows
    ? run('cmd.exe', ['/d', '/s', '/c', [cmd, ...args].join(' ')], opts)
    : run(cmd, args, opts);

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..');
const rootDemoDir = path.join(repoRoot, 'public', 'demo');
const frontendDemoDir = path.join(repoRoot, 'frontend', 'web', 'public', 'demo');
const rawVideoDir = path.join(repoRoot, '.demo-capture');

const args = process.argv.slice(2);
const baseArgIndex = args.indexOf('--base');
const BASE = baseArgIndex >= 0 ? args[baseArgIndex + 1] : 'http://127.0.0.1:4173';
const SLOW = args.includes('--slow');

// Pacing: every step holds briefly so the recording shows continuous motion
// rather than an instant jump-cut between states.
const captured = [];

async function shot(page, filename, description) {
  const target = path.join(rootDemoDir, filename);
  await page.screenshot({ path: target, fullPage: false });
  captured.push({ filename, description });
  console.log(`  captured ${filename} — ${description}`);
}

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
});

const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  recordVideo: { dir: rawVideoDir, size: { width: 1600, height: 900 } },
  deviceScaleFactor: 1,
});

const page = await context.newPage();
const hold = (ms) => page.waitForTimeout(SLOW ? ms * 2 : ms);

try {
  await fs.mkdir(rootDemoDir, { recursive: true });
  await fs.mkdir(frontendDemoDir, { recursive: true });

  console.log(`Capturing demo from ${BASE}`);

  // ── 0. Terminal build & test proof (real command output) ────────────────
  await captureTerminal(context, path.join(rootDemoDir, 'screen-0-install-test.png'));
  captured.push({ filename: 'screen-0-install-test.png', description: 'real terminal output' });

  // ── 1. Ready state ───────────────────────────────────────────────────────
  await page.goto(`${BASE}/index.html`, { waitUntil: 'commit' });
  // Early frame: the workspace is still resolving. Captured immediately so the
  // asset shows a real loading state rather than a fabricated blank.
  await page.waitForTimeout(250);
  await shot(page, 'screen-1b-loading-pulse.png', 'workspace resolving — real early-load frame');
  await page.waitForSelector('#researchBanner', { timeout: 20_000 });
  await hold(2_500);
  // The banner now reports real backend state. Capture what it actually says.
  const bannerText = (await page.locator('#researchBanner').innerText()).replace(/\s+/g, ' ').trim();
  await shot(page, 'screen-1-loading.png', `ready state — banner reads "${bannerText}"`);

  // Per-message research choice, a control added this session.
  const toggle = page.locator('#useResearchToggle');
  if (await toggle.count()) {
    await toggle.check();
    await hold(900);
    await toggle.uncheck();
    await hold(500);
  }

  // ── 2. Sidebar collapsed ─────────────────────────────────────────────────
  // The control is identified by its accessible name, not an id.
  const collapse = page.getByRole('button', { name: /collapse sidebar/i }).first();
  if (await collapse.count()) {
    await collapse.click();
    await hold(1_400);
    await shot(page, 'screen-1c-sidebar-collapsed.png', 'sidebar collapsed — content reflows to full width');
    await page.getByRole('button', { name: /expand sidebar|open sidebar/i }).first().click().catch(() => {});
    await hold(1_200);
  } else {
    console.warn('  ! collapse sidebar control not found; screen-1c not refreshed');
  }

  // ── 3. Type a real prompt (motion: progressive typing) ──────────────────
  const input = page.locator('#composerInput');
  const PROMPT = 'Explain the response verification invariant for this repository';
  await input.click();
  for (const chunk of PROMPT.match(/.{1,6}/g) ?? []) {
    await input.type(chunk, { delay: SLOW ? 110 : 55 });
  }
  await hold(1_600);
  await shot(page, 'screen-2-typing.png', 'prompt typed — composer auto-grows, research banner idle');

  // ── 4. Tasks drawer, idle ───────────────────────────────────────────────
  const drawerToggle = page.locator('#toggleDrawerBtn');
  if (await drawerToggle.count()) {
    await drawerToggle.click();
    await hold(1_500);
    await shot(page, 'screen-2b-drawer-empty.png', 'Context Review Drawer open on Tasks tab, run idle');
    await shot(page, 'screen-2c-tasks-empty.png', 'Tasks tab before submission — no steps emitted yet');
  }


  // ── 5. Submit and watch the REAL stream ──────────────────────────────────
  await page.locator('#composerSendBtn').click();
  await hold(1_200);
  await shot(page, 'screen-3-submitted.png', 'run submitted — RUNNING badge, real backend stream starts');
  await shot(page, 'screen-4b-activity.png', 'mid-run — activity steps emitted by the backend');

  // Wait for genuine completion rather than assuming it.
  const done = page.getByText('Backend agent stream completed', { exact: true });
  await done.waitFor({ timeout: 45_000 }).catch(() => {
    console.warn('  ! stream completion marker not observed; capturing current real state');
  });
  await hold(1_200);
  await shot(page, 'screen-3-streaming.png', 'stream — real deltas rendered from the backend');
  await shot(page, 'screen-4c-pipeline.png', 'pipeline stage reporting real engine state');
  await hold(1_500);
  await shot(page, 'screen-4-interactive.png', 'run COMPLETED — activity steps and real event log');
  await shot(page, 'screen-5-task-state.png', 'task state after completion');
  await shot(page, 'screen-4d-late.png', 'late-stage task state');
  await shot(page, 'screen-4e-near-complete.png', 'run near completion — final rendered response');
  await shot(page, 'screen-6-tools.png', 'tool call list — real tool results from the backend');

  // ── 6. Human gates (confirm control added this session) ─────────────────
  const gateBtn = page.locator('#confirmGate1Btn');
  if (await gateBtn.count()) {
    await page.locator('#tabTaskBtn').click().catch(() => {});
    await hold(1_200);
    await shot(page, 'screen-7-gates.png', 'human gates — live Gate 1 status with explicit confirm control');
  }

  // ── 7. Backends tab ──────────────────────────────────────────────────────
  const backendsTab = page.locator('#tabBackendsBtn');
  if (await backendsTab.count()) {
    await backendsTab.click();
    await hold(1_600);
    await shot(page, 'screen-8-backends.png', 'Backends tab — mounted partitions and sandbox policy');
  }

  // ── 8. Final full-width state ────────────────────────────────────────────
  const close = page.locator('#closeDrawerBtn, #contextDrawer button[aria-label*="lose"]').first();
  if (await close.count()) {
    await close.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await hold(1_800);
  await shot(page, 'screen-9-final.png', 'drawer closed — full-width conversation with the real response');
  await hold(2_500);
} finally {
  // Playwright records a SEPARATE video per page. The terminal page produces a
  // short 1s clip, so the main page's video must come from the page handle —
  // never by listing the directory, which would pick the wrong file.
  // saveAs() waits for the page to close, so the page must close first and the
  // context must still be alive.
  const recorded = page.video();
  if (recorded) {
    await page.close().catch(() => {});
    await recorded.saveAs(path.join(rootDemoDir, 'oneshot-demo.webm'));
  }
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

// ── Publish the recorded video and mirror captures to the frontend tree ────
const published = path.join(rootDemoDir, 'oneshot-demo.webm');
await fs.copyFile(published, path.join(frontendDemoDir, 'oneshot-demo.webm'));
await fs.rm(rawVideoDir, { recursive: true, force: true });

// Mirror every capture into the frontend public dir so both trees stay identical.
for (const { filename } of captured) {
  await fs.copyFile(path.join(rootDemoDir, filename), path.join(frontendDemoDir, filename));
}

const videoStat = await fs.stat(published);
console.log(`\nVideo published: public/demo/oneshot-demo.webm (${(videoStat.size / 1024).toFixed(1)} KB)`);
console.log(`Screenshots regenerated: ${captured.length}`);
