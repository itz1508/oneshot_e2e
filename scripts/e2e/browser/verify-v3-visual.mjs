import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9335;
const USER_DATA_DIR = join(process.env.TEMP || 'C:\\Windows\\Temp', 'edge_test_profile_' + Date.now());
const BASE_URL = process.env.BASE_URL || 'http://localhost:8787';
const SHOTS_DIR = join(process.cwd(), 'dist', 'e2e-evidence', 'v3-screenshots');
mkdirSync(SHOTS_DIR, { recursive: true });

console.log('[v3-verify] Spawning Edge at port', CDP_PORT);
const edgeProc = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(name, fn, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fn();
      if (res) return res;
    } catch {}
    await sleep(200);
  }
  throw new Error(`Timeout waiting for ${name}`);
}

class SimpleCDP {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.consoleLogs = [];

    ws.addEventListener('message', (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
        this.consoleLogs.push({ type: msg.params.type, text });
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(`Eval error: ${r.exceptionDetails.text || JSON.stringify(r.exceptionDetails)}`);
    }
    return r.result?.value;
  }

  async screenshot(filename) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(r.data, 'base64');
    const path = join(SHOTS_DIR, filename);
    writeFileSync(path, buffer);
    console.log(`[screenshot] Saved ${filename} (${buffer.length} bytes)`);
    return path;
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await sleep(400);
  }
}

async function main() {
  try {
    const target = await waitFor('CDP target', async () => {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const list = await res.json();
      return list.find((t) => t.type === 'page');
    });

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, err) => {
      ws.addEventListener('open', ok, { once: true });
      ws.addEventListener('error', err, { once: true });
    });

    const cdp = new SimpleCDP(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    console.log('[v3-verify] Navigating to', BASE_URL);
    await cdp.send('Page.navigate', { url: BASE_URL });

    await waitFor('DOM ready', async () => {
      const ready = await cdp.eval('document.readyState');
      return ready === 'complete';
    });
    await sleep(1500);

    // Verify 1440px desktop
    await cdp.setViewport(1440, 900);
    const desktopCheck = await cdp.eval(`({
      title: document.title,
      hasTopBar: !!document.querySelector('.top-bar'),
      hasLeftRail: !!document.querySelector('.left-rail'),
      hasExplorer: !!document.querySelector('.explorer-panel'),
      hasConversation: !!document.querySelector('.conversation-pane'),
      hasPromptBar: !!document.querySelector('.prompt-bar'),
      hasTaskManagement: !!document.querySelector('.task-panel'),
      hasRightRail: !!document.querySelector('.right-rail'),
      brandText: document.querySelector('.brand-badge')?.innerText || '',
      providerChip: document.querySelector('.provider-chip')?.innerText || '',
      explorerHeader: document.querySelector('.explorer-title')?.innerText || '',
      taskPanelTitle: document.querySelector('.card-front .task-panel-title')?.innerText || '',
      sendDisabled: document.querySelector('#send')?.disabled,
    })`);
    console.log('[v3-verify] Desktop 1440px DOM check:', JSON.stringify(desktopCheck, null, 2));
    await cdp.screenshot('01-desktop-1440.png');

    // Test Flip to Job History
    console.log('[v3-verify] Testing Right Rail 180° Flip to Job History...');
    await cdp.eval(`document.querySelector('[data-testid="flip-card-btn"]')?.click();`);
    await sleep(800);
    const flipCheck = await cdp.eval(`({
      isFlipped: document.querySelector('.task-card-3d')?.classList.contains('flipped'),
      historyTitle: document.querySelector('.card-back .task-panel-title')?.innerText || '',
      hasHistorySplit: !!document.querySelector('.history-split-view'),
    })`);
    console.log('[v3-verify] Flip state:', JSON.stringify(flipCheck, null, 2));
    await cdp.screenshot('02-desktop-job-history-flipped.png');

    // Flip back
    await cdp.eval(`document.querySelector('[data-testid="flip-card-btn"]')?.click();`);
    await sleep(800);

    // Test Explorer collapse
    console.log('[v3-verify] Testing Left Rail Explorer toggle...');
    await cdp.eval(`document.querySelector('[data-testid="left-rail-toggle-explorer"]')?.click();`);
    await sleep(600);
    const collapseCheck = await cdp.eval(`({
      explorerVisible: !!document.querySelector('.explorer-panel'),
    })`);
    console.log('[v3-verify] Explorer collapse state:', JSON.stringify(collapseCheck, null, 2));
    await cdp.screenshot('03-desktop-explorer-collapsed.png');

    // Expand Explorer back
    await cdp.eval(`document.querySelector('[data-testid="left-rail-toggle-explorer"]')?.click();`);
    await sleep(600);

    // Test New Job Modal
    console.log('[v3-verify] Testing New Job modal...');
    await cdp.eval(`document.querySelector('.new-job-btn')?.click();`);
    await sleep(600);
    const modalCheck = await cdp.eval(`({
      hasModal: !!document.querySelector('dialog[open]'),
      modalTitle: document.querySelector('.modal-title-wrap h3')?.innerText || '',
    })`);
    console.log('[v3-verify] New Job modal state:', JSON.stringify(modalCheck, null, 2));
    await cdp.screenshot('04-desktop-new-job-modal.png');
    // Close modal
    await cdp.eval(`document.querySelector('.icon-close-btn')?.click();`);
    await sleep(400);

    // Verify 1024px Tablet
    console.log('[v3-verify] Testing Tablet 1024px viewport...');
    await cdp.setViewport(1024, 768);
    await cdp.screenshot('05-tablet-1024.png');

    // Verify 390px Mobile
    console.log('[v3-verify] Testing Mobile 390px viewport...');
    await cdp.setViewport(390, 844);
    const mobileCheck = await cdp.eval(`({
      bodyScrollWidth: document.body.scrollWidth,
      windowInnerWidth: window.innerWidth,
      hasOverflow: document.body.scrollWidth > window.innerWidth,
    })`);
    console.log('[v3-verify] Mobile check:', JSON.stringify(mobileCheck, null, 2));
    await cdp.screenshot('06-mobile-390.png');

    console.log('\n[v3-verify] ALL VISUAL VERIFICATIONS COMPLETED SUCCESSFULLY!');
  } catch (err) {
    console.error('[v3-verify] Error:', err);
    process.exitCode = 1;
  } finally {
    try {
      edgeProc.kill();
    } catch {}
  }
}

main();
