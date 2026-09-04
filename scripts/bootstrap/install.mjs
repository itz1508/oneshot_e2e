#!/usr/bin/env node
/**
 * Installation Module
 *
 * Installs Node.js and Python dependencies.
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
  console.log(`${C.cyan}[install]${C.reset} ${msg}`);
}

function pass(msg) {
  console.log(`${C.green}✓${C.reset} ${msg}`);
}

function fail(msg, detail) {
  console.error(`${C.red}✗${C.reset} ${msg}`);
  if (detail) console.error(String(detail).trim());
  throw new Error(msg);
}

export function installNodeModules(offline = false) {
  if (existsSync(join(ROOT, "node_modules"))) {
    pass("Node.js dependencies already installed");
    return true;
  }

  log("Installing Node.js dependencies...");

  try {
    const cmd = offline
      ? "npm ci --offline --ignore-scripts --no-audit --no-fund"
      : "npm install --no-audit --no-fund";

    execSync(cmd, { cwd: ROOT, stdio: "inherit" });
    pass("Node.js dependencies installed");
    return true;
  } catch (err) {
    if (!offline) {
      fail("Node.js installation failed", err.message);
    }
    return false;
  }
}

export function installPythonDeps() {
  log("Installing Python dependencies...");

  try {
    execSync("pip install -q -r app/requirements/base.txt", { cwd: ROOT, stdio: "inherit" });
    execSync("pip install -q -r app/requirements/workspace-api.txt", { cwd: ROOT, stdio: "inherit" });
    pass("Python dependencies installed");
    return true;
  } catch (err) {
    console.log(`${C.cyan}[install]${C.reset} Python dependencies skipped (Python may not be available)`);
    return false;
  }
}

export function runInstall(options = {}) {
  const { offline = false, python = true } = options;

  installNodeModules(offline);

  if (python) {
    installPythonDeps();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    runInstall({ offline: process.argv.includes("--offline") });
  } catch (err) {
    process.exit(1);
  }
}
