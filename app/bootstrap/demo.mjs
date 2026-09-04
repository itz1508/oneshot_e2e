/**
 * OneShot Production E2E — Demonstration Launcher
 *
 * Launcher that clean-builds from current source, starts the real OneShot
 * backend, and opens the real OneShot IDE in the default browser.
 *
 * Usage:
 *   npm run demo                          # Demonstration with Deterministic Sample Provider
 *   ONESHOT_MODE=production npm run demo # Demonstration with Production Provider
 *
 * The demonstration runs the REAL OneShot product, real Chat API, real
 * canonical workflow (Prompt_id → DONE), real validators, and real cryptographic proofs.
 */

import { execSync, spawn } from "node:child_process";
import { rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { platform } from "node:os";

const ROOT = resolve(import.meta.dirname || ".", "..", "..");
const environmentFile = resolve(ROOT, ".env");
if (existsSync(environmentFile)) {
  if (typeof process.loadEnvFile !== "function") {
    throw new Error(
      "ROOT_CAUSE: loading .env requires Node.js 20.12+; set variables in the process environment instead",
    );
  }
  process.loadEnvFile(environmentFile);
}

// ── Colors ──────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

function log(msg) {
  console.log(`${C.cyan}[oneshot]${C.reset} ${msg}`);
}

function banner(text) {
  const line = "═".repeat(60);
  console.log(`\n${C.cyan}${C.bold}╔${line}╗${C.reset}`);
  console.log(`${C.cyan}${C.bold}║${C.reset}  ${text.padEnd(58)}${C.cyan}${C.bold}║${C.reset}`);
  console.log(`${C.cyan}${C.bold}╚${line}╝${C.reset}\n`);
}

// ── Step 1: Clean dist/ for fresh build guarantee ───────────────
banner("Launch OneShot for Demonstration");

const mode = (process.env.ONESHOT_MODE || "sample").toLowerCase();
const provider = process.env.ONESHOT_RESEARCH_PROVIDER || (mode === "sample" ? "Deterministic Sample Provider" : "adk_gemma2");

log(`DEMONSTRATION MODE`);
log(`Mode:     ${C.bold}${mode.toUpperCase()}${C.reset}`);
log(`Provider: ${C.bold}${provider}${C.reset}`);
log("");

log("Cleaning stale build output (dist/)...");
const distPath = resolve(ROOT, "dist");
if (existsSync(distPath)) {
  rmSync(distPath, { recursive: true, force: true });
}

// ── Step 2: Compile real TypeScript source & OneShot Web IDE ───
log("Compiling real TypeScript backend and OneShot Web IDE...");
try {
  execSync("npx tsc -p tsconfig.json", {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!existsSync(resolve(ROOT, "app/web/dist"))) {
    log("Building OneShot Web UI bundle...");
    execSync("npm --prefix app/web run build", {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
  log(`${C.green}✓${C.reset} Build complete`);
} catch (err) {
  console.error(`${C.red}✗ Build failed${C.reset}`);
  if (err.stderr) console.error(err.stderr.toString());
  process.exit(1);
}

// ── Step 3: Start the real OneShot backend ──────────────────────
log("Starting real OneShot backend...");

const port = process.env.PORT || "8787";
const bindHost = (process.env.ONESHOT_BIND_HOST || "127.0.0.1").trim() || "127.0.0.1";
const probeHost = bindHost === "0.0.0.0" ? "127.0.0.1" : bindHost === "::" ? "::1" : bindHost;
const probeAddress = probeHost.includes(":") ? `[${probeHost}]` : probeHost;
const apiToken = (process.env.ONESHOT_API_TOKEN || "").trim();
const child = spawn("node", ["dist/backend/index.js"], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: port },
});

// Forward shutdown signals
const shutdown = () => {
  log("Shutting down OneShot backend...");
  child.kill("SIGTERM");
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

child.stderr.on("data", (data) => {
  const errText = data.toString();
  process.stderr.write(errText);
  if (errText.includes("EADDRINUSE")) {
    console.log(`\n${C.yellow}${C.bold}[PORT CONFLICT]${C.reset} Port ${port} is already in use by another process.`);
    console.log(`To run OneShot on a different port, set the PORT environment variable:`);
    console.log(`  ${C.cyan}Windows (PowerShell):${C.reset}  $env:PORT="8788"; npm run demo`);
    console.log(`  ${C.cyan}Linux / macOS:${C.reset}        PORT=8788 npm run demo\n`);
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    log(`Backend terminated by signal ${signal}`);
    process.exit(1);
  }
  log(`Backend exited with code ${code}`);
  process.exit(code ?? 0);
});

// ── Step 4: Wait for backend readiness, then open browser ───────
let isHandlingReady = false;
child.stdout.on("data", async (data) => {
  const text = data.toString();
  process.stdout.write(text);

  if (text.includes("ONESHOT_SERVER_READY") && !isHandlingReady) {
    isHandlingReady = true;
    const url = `http://localhost:${port}`;

    try {
      const res = await fetch(`http://${probeAddress}:${port}/api/health`, {
        headers: apiToken
          ? { Authorization: `Bearer ${apiToken}` }
          : undefined,
      });
      if (!res.ok) {
        throw new Error(`Health endpoint returned status ${res.status}`);
      }
      const health = await res.json();
      if (health.status !== "ok") {
        throw new Error(`Unexpected health status: ${health.status}`);
      }

      const activeMode = (health.mode || mode).toUpperCase();
      const activeProvider = health.provider || provider;

      log("");
      log(`${C.green}${C.bold}✓ Real OneShot IDE is ready${C.reset}`);
      log("");
      log(`  ${C.bold}URL:${C.reset}       ${C.cyan}${url}${C.reset}`);
      log(`  ${C.bold}Mode:${C.reset}      ${activeMode}`);
      log(`  ${C.bold}Provider:${C.reset}  ${activeProvider}`);
      log("");
      log(`${C.dim}  1. Interact with the real OneShot IDE in your browser${C.reset}`);
      log(`${C.dim}  2. Submit a request through the real Chat flow (or click example prompt)${C.reset}`);
      log(`${C.dim}  3. Watch the canonical workflow execute live with real SSE events${C.reset}`);
      log(`${C.dim}  4. Inspect the generated SHA-256 hash proof in the status bar & Proofs tab${C.reset}`);
      log(`${C.dim}  5. Press Ctrl+C to stop${C.reset}`);
      log("");

      // Open the browser
      try {
        const cmd =
          platform() === "win32" ? `start "" "${url}"` :
          platform() === "darwin" ? `open "${url}"` :
          `xdg-open "${url}"`;
        execSync(cmd, { stdio: "ignore", shell: true });
      } catch {
        log(`${C.yellow}Could not open browser automatically. Open ${url} manually.${C.reset}`);
      }
    } catch (err) {
      console.error(`${C.red}Backend health check failed: ${err.message}${C.reset}`);
      child.kill("SIGTERM");
      process.exit(1);
    }
  }
});
