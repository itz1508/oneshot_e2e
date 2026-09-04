#!/usr/bin/env node
/**
 * Verification Module
 *
 * Runs test suites and verification steps.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname || ".", "..", "..");

const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
};

function log(msg) {
  console.log(`${C.cyan}[verify]${C.reset} ${msg}`);
}

function pass(msg) {
  console.log(`${C.green}✓${C.reset} ${msg}`);
}

function info(msg) {
  console.log(`${C.yellow}⚠${C.reset} ${msg}`);
}

export function runTests(options = {}) {
  const { force = false } = options;

  log("Running test suite...");

  try {
    execSync("npm test", { cwd: ROOT, stdio: "inherit" });
    pass("Tests passed");
    return true;
  } catch (err) {
    if (force) {
      throw new Error("Tests failed");
    }
    info("Tests failed (continuing anyway)");
    return false;
  }
}

export function verifyBuild() {
  log("Verifying build...");

  // Check if dist exists
  if (!existsSync(join(ROOT, "dist"))) {
    info("Build artifacts not found");
    return false;
  }

  pass("Build verified");
  return true;
}

// Run if executed directly
if (import.meta.main) {
  const force = process.argv.includes("--force");
  runTests({ force });
}
