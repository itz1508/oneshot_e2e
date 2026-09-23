#!/usr/bin/env node
/**
 * OneShot Canonical CLI & Application Launcher
 *
 * Usage:
 *   oneshot [options]
 *   pnpm oneshot [options]
 *   npx oneshot [options]
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
import http from "node:http";
import net from "node:net";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

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
  --no-browser      Suppress automatic browser launching

Examples:
  oneshot
  oneshot --dev
  oneshot --bundle my-bundle.json
`);
  process.exit(0);
}

// Switch to target directory
process.chdir(options.dir);

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

// Automated Port Discovery: finds next open port starting at 8787
function findAvailablePort(startPort = 8787) {
  return new Promise((resolvePort) => {
    const server = net.createServer();
    server.listen(startPort, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolvePort(port));
    });
    server.on("error", () => {
      resolvePort(findAvailablePort(startPort + 1));
    });
  });
}

const defaultStartPort = Number(process.env.PORT || 8787);
const activePort = await findAvailablePort(defaultStartPort);

const appUrl = `http://localhost:${activePort}`;
console.log(`📍 Working Directory: ${options.dir}`);
console.log(`🌐 Application Screen: ${appUrl}`);
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
  stdio: "inherit",
  env: serverEnv,
});

process.on("SIGINT", () => {
  serverProc.kill("SIGINT");
  process.exit(0);
});

process.on("SIGTERM", () => {
  serverProc.kill("SIGTERM");
  process.exit(0);
});

// Wait for health check then auto-launch browser
function checkHealth() {
  return new Promise((resolveHealth) => {
    const req = http.get(`http://127.0.0.1:${activePort}/api/health`, (res) => {
      resolveHealth(res.statusCode === 200);
    });
    req.on("error", () => resolveHealth(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolveHealth(false);
    });
  });
}

for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 350));
  if (await checkHealth()) {
    console.log(`\n✅ OneShot Web Console ready at ${appUrl}\n`);
    if (!options.noBrowser) {
      const opener = isWindows ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
      spawn(opener, [appUrl], { shell: true, detached: true, stdio: "ignore" });
    }
    break;
  }
}
