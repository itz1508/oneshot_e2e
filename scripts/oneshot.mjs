#!/usr/bin/env node
/**
 * OneShot Canonical CLI & Application Launcher
 *
 * Usage:
 *   oneshot [options]
 *   pnpm oneshot [options]
 *   pnpm oneshot [options]
 *
 * Options:
 *   -h, --help        Show this help message and exit
 *   -d, --dir <path>  Set workspace root directory (default: current directory)
 *   --bundle <file>   Load and execute a portable bundle snapshot
 *   --dev             Run in development mode with live TypeScript compilation
 *   --rebuild         Force clean re-compilation of backend and static frontend
 *   --sample          Run in deterministic sample fixture mode
 *   --no-browser      Suppress automatic browser launching
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { extractListeningPort, findAvailablePort, probeHealth } from "./lib/ports.mjs";

const isWindows = process.platform === "win32";
const pkgCmd = isWindows ? "pnpm.cmd" : "pnpm";

// Parse CLI flags and arguments
const args = process.argv.slice(2);
const options = {
  help: false,
  dir: process.cwd(),
  bundle: null,
  dev: false,
  rebuild: false,
  sample: false,
  dryRun: false,
  noBrowser: Boolean(process.env.NO_BROWSER),
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "-h" || arg === "--help") {
    options.help = true;
  } else if ((arg === "-d" || arg === "--dir") && args[i + 1]) {
    options.dir = resolve(args[++i]);
  } else if (arg === "--bundle" && args[i + 1]) {
    options.bundle = resolve(args[++i]);
  } else if (arg === "--dev") {
    options.dev = true;
  } else if (arg === "--rebuild") {
    options.rebuild = true;
  } else if (arg === "--sample") {
    options.sample = true;
  } else if (arg === "--dry-run") {
    options.dryRun = true;
  } else if (arg === "--no-browser") {
    options.noBrowser = true;
  }
}

if (options.help) {
  console.log(`
⚡ OneShot CLI — Autonomous AI Agent Workflow Platform

Usage:
  oneshot [options]
  pnpm oneshot [options]

Options:
  -h, --help        Show this help message and exit
  -d, --dir <path>  Set workspace directory (default: current directory)
  --bundle <file>   Load and execute a portable OneShot bundle snapshot
  --dev             Run in development mode with live TypeScript reload
  --rebuild         Force clean re-compilation of backend and Next.js UI
  --sample          Run in deterministic sample fixture mode
  --dry-run         Execute deterministic contract fixture dry-run verification
  --no-browser      Suppress automatic browser launching

Examples:
  oneshot
  oneshot --dev
  oneshot --dry-run
  oneshot --bundle my-bundle.json
`);
  process.exit(0);
}

// Switch to target directory
process.chdir(options.dir);

if (options.dryRun) {
  const dryRunScript = join(options.dir, "scripts", "dry-run.mjs");
  const proc = spawn(process.execPath, [dryRunScript], { stdio: "inherit" });
  proc.on("close", (code) => {
    process.exit(code ?? 0);
  });
} else {

console.log("\n⚡ OneShot — Automated Launcher");
console.log("==============================\n");

function runCommand(cmd, cmdArgs) {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(cmd, cmdArgs, { stdio: "inherit", shell: isWindows });
    proc.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${cmd} ${cmdArgs.join(" ")} exited with code ${code}`));
    });
  });
}

// Check and build if necessary
const backendDist = join(options.dir, "dist", "backend", "index.js");
const frontendDist = join(options.dir, "frontend", "web", "dist", "index.html");

if (options.rebuild || (!options.dev && (!existsSync(backendDist) || !existsSync(frontendDist)))) {
  console.log("📦 Compiling backend and exporting Next.js frontend...");
  await runCommand(pkgCmd, ["run", "build"]);
}

// Automated Port Discovery: first port at or above the default that nothing can
// answer on (loopback connect probes + wildcard bind probes, see lib/ports.mjs)
const defaultStartPort = Number(process.env.PORT || 8787);
let activePort;
try {
  activePort = await findAvailablePort(defaultStartPort);
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}

console.log(`📍 Working Directory: ${options.dir}`);
console.log(`🔎 Port ${activePort} verified free (loopback + wildcard occupancy probes)`);
console.log(`🚀 Starting OneShot server...\n`);

const serverEnv = {
  ...process.env,
  PORT: String(activePort),
};

if (options.sample) {
  serverEnv.ONESHOT_MODE = "sample";
}
if (options.bundle) {
  serverEnv.ONESHOT_INITIAL_BUNDLE = options.bundle;
}

const execArgs = options.dev
  ? ["--import", "tsx", "backend/index.ts"]
  : ["dist/backend/index.js"];

const serverProc = spawn("node", execArgs, {
  stdio: ["inherit", "pipe", "inherit"],
  env: serverEnv,
});

// The backend prints "[OneShot] Listening on http://<host>:<port>" once bound,
// so the launcher reports the port that is actually serving.
let boundPort = null;
let stdoutBuffer = "";
serverProc.stdout.setEncoding("utf8");
serverProc.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  if (boundPort === null) {
    stdoutBuffer += chunk;
    boundPort = extractListeningPort(stdoutBuffer);
  }
});

let serverExit = null;
serverProc.on("close", (code, signal) => {
  serverExit = signal ? `signal ${signal}` : `exit code ${code}`;
});

process.on("SIGINT", () => {
  serverProc.kill("SIGINT");
  process.exit(0);
});

process.on("SIGTERM", () => {
  serverProc.kill("SIGTERM");
  process.exit(0);
});

// Wait for the verified health payload, then auto-launch the browser
const servingPort = boundPort ?? activePort;
let readiness = { healthy: false, status: 0, payload: null };

for (let i = 0; i < 40 && serverExit === null; i++) {
  readiness = await probeHealth(servingPort, { timeoutMs: 800 });
  if (readiness.healthy) break;
  await new Promise((r) => setTimeout(r, 350));
}

if (readiness.healthy) {
  const appUrl = `http://localhost:${servingPort}`;
  console.log(`\n✅ OneShot Web Console ready at ${appUrl}`);
  console.log(`   Verified /api/health -> HTTP ${readiness.status} ${JSON.stringify(readiness.payload)}\n`);
  if (servingPort !== activePort) {
    console.log(`ℹ️  Port ${activePort} was taken at bind time; the server bound ${servingPort}.\n`);
  }
  if (!options.noBrowser) {
    const opener = isWindows ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
    spawn(opener, [appUrl], { shell: true, detached: true, stdio: "ignore" });
  }
} else {
  console.error(`\n❌ OneShot did not become ready: no healthy /api/health payload on port ${servingPort}.`);
  if (readiness.status) {
    console.error(`   Last response: HTTP ${readiness.status} ${JSON.stringify(readiness.payload)}`);
  } else {
    console.error("   Last response: connection refused");
  }
  if (serverExit) {
    console.error(`   Server process ended before readiness (${serverExit}).`);
  }
  serverProc.kill();
  process.exit(1);
}
}
