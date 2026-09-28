#!/usr/bin/env node

/**
 * OneShot Python environment bootstrap (uv authority).
 *
 * Canonical lifecycle:
 *   pyproject.toml (declares) -> uv.lock (pins) -> uv sync --frozen (.venv)
 *
 * Usage:
 *   node scripts/setup-python.mjs            # sync env
 *   node scripts/setup-python.mjs --check    # fail if uv/.venv/uv.lock out of sync
 *   node scripts/setup-python.mjs --export-requirements  # regenerate requirements.txt from uv.lock
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..');
const pythonDir = path.join(repoRoot, 'backend', 'python');

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
const exportRequirements = args.has('--export-requirements');

function run(cmd, cmdArgs, options = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd: pythonDir,
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  return result.status ?? 1;
}

function spawnCapture(cmd, cmdArgs) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd: pythonDir,
    encoding: 'utf8',
    shell: false,
  });
  return { status: result.status ?? 1, stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? '') };
}

const uvVersion = spawnCapture('uv', ['--version']);
if (uvVersion.status !== 0) {
  console.error('[setup-python] ERROR: `uv` not found on PATH. Install uv >= 0.5 (https://docs.astral.sh/uv/getting-started/installation/).');
  process.exit(1);
}
console.log(`[setup-python] ${uvVersion.stdout.trim()} :: ${pythonDir}`);

if (checkOnly) {
  let failed = false;
  const lock = run('uv', ['lock', '--check']);
  if (lock !== 0) {
    console.error('[setup-python] FAIL: uv.lock is out of sync with pyproject.toml. Run `node scripts/setup-python.mjs` to regenerate.');
    failed = true;
  }
  const venvPython =
    process.platform === 'win32'
      ? path.join(pythonDir, '.venv', 'Scripts', 'python.exe')
      : path.join(pythonDir, '.venv', 'bin', 'python');
  if (!existsSync(venvPython)) {
    console.error(`[setup-python] FAIL: missing venv interpreter at ${venvPython}. Run \`node scripts/setup-python.mjs\`.`);
    failed = true;
  } else {
    const imports = spawnCapture(venvPython, ['-c', 'import fastapi, pydantic, uvicorn; print("deps-ok")']);
    if (imports.status !== 0 || !imports.stdout.includes('deps-ok')) {
      console.error('[setup-python] FAIL: venv exists but fastapi/pydantic/uvicorn import failed. Run `node scripts/setup-python.mjs`.');
      console.error(imports.stderr.trim());
      failed = true;
    } else {
      console.log('[setup-python] venv imports OK (fastapi/pydantic/uvicorn).');
    }
  }
  process.exit(failed ? 1 : 0);
}

const syncStatus = run('uv', ['sync', '--frozen']);
if (syncStatus !== 0) {
  console.error('[setup-python] ERROR: `uv sync --frozen` failed.');
  process.exit(syncStatus);
}

if (exportRequirements) {
  const exported = run('uv', ['export', '--frozen', '--no-hashes', '--no-header', '--output-file', 'requirements.txt']);
  if (exported !== 0) {
    console.error('[setup-python] ERROR: `uv export` failed; requirements.txt left untouched.');
    process.exit(exported);
  }
  const { readFileSync, writeFileSync } = await import('node:fs');
  const header = [
    '# Generated fallback only — do not hand-edit.',
    '# Authority: backend/python/pyproject.toml declares, backend/python/uv.lock pins.',
    '# Regenerate: node scripts/setup-python.mjs --export-requirements',
    '# Preferred setup: cd backend/python && uv sync --frozen',
    '',
  ].join('\n');
  const body = readFileSync(path.join(pythonDir, 'requirements.txt'), 'utf8');
  writeFileSync(path.join(pythonDir, 'requirements.txt'), `${header}${body}`);
  console.log('[setup-python] requirements.txt regenerated from uv.lock (generated fallback only).');
}

console.log('[setup-python] OK: backend/python/.venv synchronized from uv.lock.');
