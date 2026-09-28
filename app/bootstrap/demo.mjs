#!/usr/bin/env node
/**
 * OneShot Demo Launcher
 * Starts server with demo data and opens browser
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { findAvailablePort, isHealthyPayload } from '../../scripts/lib/ports.mjs';

const modulePath = fileURLToPath(import.meta.url);
const moduleDir = dirname(modulePath);
const repoRoot = join(moduleDir, '..', '..');

console.log('OneShot Demo');
console.log('============\n');

const explicitDemoUrl = process.env.ONESHOT_DEMO_URL || null;
let demoUrl = explicitDemoUrl || 'http://127.0.0.1:8787';
let activeServerProcess = null;

// Check if server is already running
async function checkServer() {
  try {
    const response = await fetch(`${demoUrl}/ping`);
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/json')) return false;
    const payload = await response.json();
    return isHealthyPayload(payload);
  } catch {
    return false;
  }
}

// Adaptive health check polling instead of fixed hardcoded sleep
async function pollServerUntilHealthy(timeoutMs = 15000, intervalMs = 250) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await checkServer()) {
      return true;
    }
    await sleep(intervalMs);
  }
  return false;
}

/** Port declared by an ONESHOT_DEMO_URL override, when it carries one. */
function resolvePortFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.port) return Number(parsed.port);
    return parsed.protocol === 'https:' ? 443 : 80;
  } catch {
    return null;
  }
}

// Start server
async function startServer() {
  const port = resolvePortFromUrl(demoUrl);
  console.log(`[1/3] Starting server on ${demoUrl}...`);
  
  const server = spawn('pnpm', ['run', 'start'], {
    stdio: 'inherit',
    shell: true,
    cwd: repoRoot,
    env: port ? { ...process.env, PORT: String(port) } : process.env
  });
  activeServerProcess = server;
  
  server.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`[WARN] Server process exited with code ${code}`);
    }
    activeServerProcess = null;
  });

  // Adaptive poll for server readiness
  console.log('    Waiting for server to initialize...');
  const isHealthy = await pollServerUntilHealthy();
  
  if (isHealthy) {
    console.log(`[OK] Server started and verified healthy on ${demoUrl}\n`);
    return true;
  } else {
    console.log('[ERROR] Server failed to start within timeout');
    if (activeServerProcess && !activeServerProcess.killed) {
      activeServerProcess.kill('SIGINT');
    }
    return false;
  }
}

// Open browser
function openBrowser() {
  const url = demoUrl;
  console.log('[2/3] Opening browser...');
  
  const command = process.platform === 'win32' ? 'start' :
                  process.platform === 'darwin' ? 'open' : 'xdg-open';
  
  spawn(command, [url], { stdio: 'ignore', shell: true });
  console.log(`[OK] Browser opened at ${url}\n`);
}

// Cleanup handler - guarantees child process termination
function cleanup(signal) {
  console.log(`\n${signal} received. Shutting down server...`);
  if (activeServerProcess && !activeServerProcess.killed) {
    try {
      activeServerProcess.kill('SIGINT');
    } catch {
      // Process already terminated
    }
  }
  process.exit(0);
}

// Main
async function main() {
  // Reuse a healthy OneShot instance, otherwise start one on a verified-free port
  console.log('[1/3] Checking for a running OneShot instance...');
  if (await checkServer()) {
    console.log(`[OK] Server already running (reusing existing instance at ${demoUrl})\n`);
  } else {
    if (!explicitDemoUrl) {
      try {
        demoUrl = `http://127.0.0.1:${await findAvailablePort(8787)}`;
      } catch (error) {
        console.error(`[ERROR] ${error.message}`);
        process.exit(1);
      }
    }
    if (!await startServer()) {
      process.exit(1);
    }
  }
  
  openBrowser();
  
  // Show info
  console.log('[3/3] Demo ready!');
  console.log();
  console.log(`  Server: ${demoUrl}`);
  console.log(`  Status: Running`);
  console.log();
  console.log('Press Ctrl+C to stop the server');
  console.log();
  
  // Keep process alive and register cleanup hooks
  process.on('SIGINT', () => cleanup('SIGINT'));
  process.on('SIGTERM', () => cleanup('SIGTERM'));
}

main().catch(err => {
  console.error('Error:', err.message);
  if (activeServerProcess && !activeServerProcess.killed) {
    activeServerProcess.kill('SIGINT');
  }
  process.exit(1);
});
