#!/usr/bin/env node
/**
 * Preflight Checks Module
 *
 * Verifies environment prerequisites before installation or build.
 */

import { execSync } from "node:child_process";

const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
};

function pass(msg) {
  console.log(`${C.green}✓${C.reset} ${msg}`);
}

function fail(msg) {
  console.error(`${C.red}✗${C.reset} ${msg}`);
}

export function checkNode(minVersion = "24.13.0") {
  try {
    const version = execSync("node --version", { encoding: "utf8" }).trim();
    const major = parseInt(version.slice(1).split('.')[0]);
    const required = parseInt(minVersion.split('.')[0]);

    if (major >= required) {
      pass(`Node.js ${version}`);
      return true;
    }
    fail(`Node.js ${version} found, ${minVersion}+ required`);
    return false;
  } catch {
    fail("Node.js not found");
    return false;
  }
}

export function checkNpm(minVersion = "11.8.0") {
  try {
    const version = execSync("npm --version", { encoding: "utf8" }).trim();
    pass(`npm ${version}`);
    return true;
  } catch {
    fail("npm not found");
    return false;
  }
}

export function checkPython() {
  try {
    const version = execSync("python --version", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    pass(version);
    return true;
  } catch {
    try {
      const version = execSync("python3 --version", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      pass(version);
      return true;
    } catch {
      console.log(`${C.yellow}⚠${C.reset} Python not found (some features limited)`);
      return false;
    }
  }
}

export function runPreflight() {
  console.log("Running preflight checks...");

  const results = {
    node: checkNode(),
    npm: checkNpm(),
    python: checkPython(),
  };

  const allPassed = Object.values(results).every(r => r !== false);

  if (allPassed) {
    console.log("\nPreflight checks passed");
    return true;
  }

  console.error("\nPreflight checks failed");
  return false;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const success = runPreflight();
  process.exit(success ? 0 : 1);
}
