#!/usr/bin/env node
/**
 * Integration Package Bootstrap
 *
 * Deterministic, package-local installation of every native integration
 * package under app/integration/<id>. Each package owns its vendor SDK
 * dependency; this script only invokes npm ci/npm install within each
 * package's prefix. It never invents integration packages, never adds
 * vendor SDKs to root, and never silently skips a required package.
 *
 * Required by the P0.5 gate. Replaces the stale root `postinstall`
 * which only installed Gemini and used --package-lock=false.
 */
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

import { colors as C } from "../lib/terminal-colors.mjs";

const ROOT = resolve(import.meta.dirname || ".", "..", "..");
const INTEGRATION_ROOT = join(ROOT, "app", "integration");

function log(msg) {
  console.log(`${C.cyan}[integrations]${C.reset} ${msg}`);
}
function pass(msg) {
  console.log(`${C.green}✓${C.reset} ${msg}`);
}
function fail(msg, detail) {
  console.error(`${C.red}✗${C.reset} ${msg}`);
  if (detail) console.error(String(detail).trim());
  throw new Error(msg);
}

/**
 * A native integration package is any directory under app/integration
 * that contains its own package.json. config/ has no package.json and is
 * excluded by definition (it holds only non-secret integration state).
 * MCP-only integrations do not receive package directories merely for
 * vendor SDKs.
 */
function nativePackages() {
  if (!existsSync(INTEGRATION_ROOT)) return [];
  return readdirSync(INTEGRATION_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .filter((d) => existsSync(join(INTEGRATION_ROOT, d.name, "package.json")))
    .map((d) => d.name)
    .sort();
}

export function installIntegrations() {
  const packages = nativePackages();
  if (packages.length === 0) {
    log("No native integration packages found.");
    return [];
  }

  for (const id of packages) {
    const target = join(INTEGRATION_ROOT, id);
    const lock = join(target, "package-lock.json");

    log(`Installing integration: ${id}`);
    try {
      if (existsSync(lock)) {
        // Reproducible install from the package-local lock.
        execSync("npm ci --ignore-scripts --no-audit --no-fund", {
          cwd: target,
          stdio: "inherit",
        });
      } else {
        // No lock yet: install declared deps exactly, then record the lock.
        // --package-lock=false is avoided so the lock is produced.
        execSync(
          "npm install --ignore-scripts --save-exact --no-audit --no-fund",
          { cwd: target, stdio: "inherit" },
        );
      }
      pass(`${id} installed`);
    } catch (err) {
      fail(`integration package install failed: ${id}`, err.message);
    }
  }
  return packages;
}

// Direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    installIntegrations();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
