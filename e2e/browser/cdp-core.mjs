/**
 * OneShot E2E CDP core — real headless Edge over Chrome DevTools Protocol.
 * Node built-in WebSocket only; no third-party automation stack.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, "..");
export const EVIDENCE = __dirname;
export const SHOTS = join(EVIDENCE, "screenshots");
mkdirSync(SHOTS, { recursive: true });

function loadDotEnv(f) {
  if (!existsSync(f)) return {};
  const out = {};
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
const dotenv = { ...loadDotEnv(join(ROOT, ".env")), ...loadDotEnv(join(ROOT, "..", ".env")) };
export const TOKEN = process.env.ONESHOT_API_TOKEN || dotenv.ONESHOT_API_TOKEN;
export const BASE = process.env.ONESHOT_BASE_URL || "http://127.0.0.1:8787";
export const EDGE =
  process.env.EDGE_PATH ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const CDP_PORT = Number(process.env.CDP_PORT || 9223);
if (!TOKEN) throw new Error("ONESHOT_API_TOKEN missing");
if (!existsSync(EDGE)) throw new Error(`Edge not found: ${EDGE}`);

export const evidence = {
  started_at: new Date().toISOString(),
  browser: null,
  page_title: null,
  dom: {},
  console_errors: [],
  console_warnings: [],
  network: [],
  network_failures: [],
  sse: [],
  requests: [],
  shots: [],
  persistence: {},
  artifacts: {},
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class CDP {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener("message", (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { ok, fail } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
        return;
      }
      if (msg.method) {
        for (const fn of this.handlers.get(msg.method) ?? []) fn(msg.params);
      }
    });
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, new Set());
    this.handlers.get(method).add(fn);
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((ok, fail) => {
      this.pending.set(id, { ok, fail });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          fail(new Error(`CDP timeout: ${method}`));
        }
      }, 120_000);
    });
  }
}

export async function waitFor(name, fn, { timeout = 90_000, poll = 200 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    let v;
    try {
      v = await fn();
    } catch {
      v = undefined;
    }
    if (v !== undefined && v !== false && v !== null) return v;
    if (Date.now() > deadline) throw new Error(`waitFor timeout: ${name}`);
    await sleep(poll);
  }
}

export function dumpEvidence() {
  writeFileSync(
    join(EVIDENCE, "runtime-evidence.json"),
    JSON.stringify(evidence, null, 2),
  );
}

export async function launchBrowser() {
  const proc = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${join(ROOT, "..", "data", "browser-profile")}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1680,1050",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  evidence.browser = { binary: EDGE, cdp_port: CDP_PORT, pid: proc.pid };
  const target = await waitFor(
    "cdp target",
    async () => {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const list = await res.json();
      return list.find((t) => t.type === "page");
    },
    { timeout: 30_000 },
  );
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, err) => {
    ws.addEventListener("open", ok, { once: true });
    ws.addEventListener("error", err, { once: true });
  });
  return new CDP(ws);
}
