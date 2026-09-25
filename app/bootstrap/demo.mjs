#!/usr/bin/env node
/**
 * OneShot Demo Launcher
 * Starts server with demo data and opens browser
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const modulePath = fileURLToPath(import.meta.url);
const moduleDir = dirname(modulePath);
const repoRoot = join(moduleDir, '..');

console.log('OneShot Demo');
console.log('============\n');

const demoUrl = process.env.ONESHOT_DEMO_URL || 'http://127.0.0.1:8787';

// Check if server is already running
async function checkServer() {
  try {
    const response = await fetch(`${demoUrl}/ping`);
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/json')) return false;
    const payload = await response.json();
    return payload?.ok === true && payload?.status === 'healthy';
  } catch {
    return false;
  }
}

// Start server
async function startServer() {
  console.log('[1/3] Starting server...');
  
  const server = spawn('pnpm', ['run', 'start'], {
    stdio: 'inherit',
    shell: true,
    cwd: repoRoot
  });
  
  // Wait for server to start
  console.log('    Waiting for server to initialize...');
  await sleep(3000);
  
  // Check if server is running
  if (await checkServer()) {
    console.log('[OK] Server started\n');
    return true;
  } else {
    console.log('[ERROR] Server failed to start');
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

// Cleanup handler
function cleanup(signal) {
  console.log(`\n${signal} received. Shutting down server...`);
  process.exit(0);
}

// Main
async function main() {
  // Check if server is already running
  if (await checkServer()) {
    console.log('[1/3] Checking server...');
    console.log('[OK] Server already running\n');
  } else {
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
  
  // Keep process alive
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
