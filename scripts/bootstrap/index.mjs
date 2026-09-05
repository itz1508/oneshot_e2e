#!/usr/bin/env node
/**
 * OneShot Bootstrap - Main Entry Point
 *
 * Unified bootstrap that orchestrates:
 * 1. Preflight checks
 * 2. Installation
 * 3. Build
 * 4. Verification
 * 5. Start (optional)
 */

import { resolve } from "node:path";
import { runPreflight } from "./preflight.mjs";
import { runInstall } from "./install.mjs";
import { runBuild } from "./build.mjs";
import { runTests } from "./verify.mjs";
import { ensureQueueReadiness } from "./redis-readiness.mjs";

const ROOT = resolve(import.meta.dirname || ".", "..", "..");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

function log(msg) {
  console.log(`${C.cyan}[bootstrap]${C.reset} ${msg}`);
}

function pass(msg) {
  console.log(`${C.green}✓${C.reset} ${msg}`);
}

function fail(msg, detail) {
  console.error(`${C.red}✗${C.reset} ${msg}`);
  if (detail) console.error(String(detail).trim());
  process.exit(1);
}

function banner(text) {
  console.log(`\n${C.bold}${C.cyan}╔${"═".repeat(60)}╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║${C.reset}  ${text.padEnd(58)}${C.bold}${C.cyan}║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚${"═".repeat(60)}╝${C.reset}\n`);
}

export async function bootstrap(options = {}) {
  const {
    preflight = true,
    install = true,
    build = true,
    verify = false,
    start = false,
    offline = false,
  } = options;

  banner("OneShot Bootstrap");

  // Step 1: Preflight
  if (preflight) {
    log("Step 1: Preflight checks");
    if (!runPreflight()) {
      fail("Preflight checks failed");
    }
  }

  // Step 2: Installation
  if (install) {
    log("Step 2: Installing dependencies");
    try {
      runInstall({ offline });
      pass("Installation complete");
    } catch (err) {
      fail("Installation failed", err.message);
    }
  }

  // Step 2.5: Queue/Redis readiness — proves Redis/queue readiness when queue
  // mode is required (ONESHOT_QUEUE_REQUIRED); degrades to inline execution
  // otherwise. Never silently downloads/runs infrastructure.
  log("Step 2.5: Queue/Redis readiness");
  try {
    const rr = await ensureQueueReadiness({});
    if (!rr.ok) fail("Redis/queue readiness failed", rr.rootCause || rr.message);
    pass(rr.message);
  } catch (err) {
    fail("Redis/queue readiness check failed", err.message);
  }

  // Step 3: Build
  if (build) {
    log("Step 3: Building application");
    try {
      runBuild({});
      pass("Build complete");
    } catch (err) {
      fail("Build failed", err.message);
    }
  }

  // Step 4: Verification
  if (verify) {
    log("Step 4: Running verification");
    try {
      runTests({ force: false });
      pass("Verification complete");
    } catch (err) {
      // Non-fatal
    }
  }

  // Summary
  pass("Bootstrap complete!");
  console.log(`\n${C.cyan}Next steps:${C.reset}`);
  console.log(`  ${C.cyan}npm start${C.reset}       Start the server`);
  console.log(`  ${C.cyan}npm run demo${C.reset}     Launch demonstration`);
  console.log(`  ${C.cyan}npm run judge${C.reset}    Run judge workflow\n`);
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  bootstrap({
    preflight: !args.includes("--no-preflight"),
    install: !args.includes("--no-install"),
    build: !args.includes("--no-build"),
    verify: args.includes("--verify"),
    offline: args.includes("--offline"),
  }).catch((err) => {
    fail(err.message);
  });
}
