#!/usr/bin/env node
/**
 * Build Module
 *
 * Compiles TypeScript and builds the UI.
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
};

function log(msg) {
  console.log(`${C.cyan}[build]${C.reset} ${msg}`);
}

function pass(msg) {
  console.log(`${C.green}✓${C.reset} ${msg}`);
}

function fail(msg, detail) {
  console.error(`${C.red}✗${C.reset} ${msg}`);
  if (detail) console.error(String(detail).trim());
  throw new Error(msg);
}

export function buildBackend() {
  log("Compiling TypeScript backend...");

  try {
    execSync("npm run build:backend", { cwd: ROOT, stdio: "inherit" });
    pass("Backend compiled");
    return true;
  } catch (err) {
    fail("Backend build failed", err.message);
  }
}

export function buildUi() {
  log("Building UI...");

  try {
    execSync("npm run build:ui", { cwd: ROOT, stdio: "inherit" });
    pass("UI built");
    return true;
  } catch (err) {
    fail("UI build failed", err.message);
  }
}

export function runBuild(options = {}) {
  const { backend = true, ui = true } = options;

  if (backend) {
    buildBackend();
  }

  if (ui) {
    buildUi();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    runBuild({});
  } catch (err) {
    process.exit(1);
  }
}
