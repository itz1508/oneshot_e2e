#!/usr/bin/env node
/**
 * Preflight: refuse to serve a frontend bundle that is older than its source.
 *
 * `pnpm start` serves frontend/web/dist, not frontend/web/src. A stale bundle
 * fails silently: the app boots, looks healthy, and simply lacks every UI
 * change made since the last build. That is indistinguishable from a backend
 * defect, so it is checked here instead of being discovered at runtime.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(root, 'frontend', 'web', 'src');
const DIST = join(root, 'frontend', 'web', 'dist');
const APP = join(root, 'frontend', 'web', 'app');

const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.json']);

/** Newest mtime under a directory tree, or 0 when absent. */
function newestMtime(dir) {
  if (!existsSync(dir)) return 0;
  let newest = 0;
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (EXTS.has(entry.name.slice(entry.name.lastIndexOf('.')) || entry.name)) {
        newest = Math.max(newest, statSync(full).mtimeMs);
      }
    }
  };
  walk(dir);
  return newest;
}

if (process.argv.includes('--check')) {
  console.log(JSON.stringify({ src: newestMtime(SRC), dist: newestMtime(DIST) }));
  process.exit(0);
}

const srcTime = Math.max(newestMtime(SRC), newestMtime(APP));
const distTime = newestMtime(DIST);

if (!distTime) {
  console.error('[OneShot] FATAL: frontend/web/dist is missing or empty.');
  console.error('  Run: pnpm run build:ui');
  process.exit(1);
}

if (srcTime > distTime) {
  const newestSrc = Math.max(newestMtime(SRC), newestMtime(APP));
  console.error('[OneShot] FATAL: the frontend bundle is stale.');
  console.error(`  dist built  : ${new Date(distTime).toISOString()}`);
  console.error(`  src modified: ${new Date(newestSrc).toISOString()}`);
  console.error('  Serving dist would hide every UI change made since that build.');
  console.error('  Fix: pnpm run build:ui   (or pnpm run build for backend + ui)');
  console.error(`  Scope: ${relative(root, SRC)} , ${relative(root, APP)}`);
  process.exit(1);
}

console.log('[OneShot] Frontend bundle is up to date.');
