/**
 * Source file policy — launcher scripts must be covered by the manifest.
 *
 * Regression guard: the manifest hashes every file the policy classifies as
 * source. Windows and shell launchers decide which port the server binds and
 * whether a stale instance is reported as ready, so an edit to them has to
 * change the manifest. Before `.ps1`/`.sh`/`.bat` were added to
 * SOURCE_EXTENSIONS, scripts/start-web.ps1 was silently unhashed and the
 * port-occupancy fix shipped without manifest coverage.
 *
 * These tests shell out to the real policy module so the assertions reflect
 * the shipped implementation rather than a reimplementation of it.
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// Classify a batch of repo-relative paths in one Python invocation. Spawning
// python per path costs ~200ms each on Windows, which dominates the suite.
const classify = (paths) => {
  const script = [
    'import json',
    'import sys',
    '',
    "sys.path.insert(0, 'app/scripts')",
    'import source_file_policy as policy',
    '',
    'print(json.dumps({p: policy.is_source_file(p) for p in json.loads(sys.argv[1])}))',
  ].join('\n')

  const stdout = execFileSync('python', ['-c', script, JSON.stringify(paths)], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  return JSON.parse(stdout)
}

const isSource = (paths) => {
  const results = classify(Array.isArray(paths) ? paths : [paths])
  return Array.isArray(paths) ? results : results[paths]
}

/** Paths the policy wrongly treats as source, i.e. it would hash them. */
const wronglyIncluded = (paths) =>
  Object.entries(isSource(paths))
    .filter(([, included]) => included)
    .map(([file]) => file)

describe('Source file policy — launcher coverage', () => {
  it('classifies the Windows and shell launchers as source', () => {
    const launchers = [
      'scripts/start-web.ps1',
      'scripts/install.ps1',
      'scripts/launch.sh',
      'scripts/launch.bat',
      'scripts/install.sh',
      'app/bootstrap/setup.sh',
      'app/bootstrap/setup.bat',
    ]
    const uncovered = launchers.filter((file) => isSource(file) !== true)

    assert.deepEqual(uncovered, [], `launchers missing from manifest coverage: ${uncovered.join(', ')}`)
  })

  it('still excludes launcher scripts inside generated trees', () => {
    // A .ps1 under node_modules or .venv is install tooling from a dependency,
    // not repo source. Including it would make the manifest machine-local.
    const generated = [
      'node_modules/some-pkg/scripts/install.ps1',
      'node_modules/some-pkg/launch.sh',
      '.venv/Scripts/activate.ps1',
      'dist/launch.ps1',
      'frontend/web/.next/launch.sh',
    ]

    assert.deepEqual(
      wronglyIncluded(generated),
      [],
      'generated-tree scripts wrongly treated as source',
    )
  })

  it('keeps the manifest from hashing itself', () => {
    // The manifest records its own hash, which is impossible to satisfy.
    assert.equal(isSource('app/manifest.json'), false)
  })

  it('rejects excluded log and temp artifacts', () => {
    // Launcher runs write logs next to the scripts; those must not enter the
    // manifest or every local run would dirty the tree.
    assert.deepEqual(
      wronglyIncluded(['scripts/server.log', 'scripts/debug.log', 'server-err.log', 'notes.tmp']),
      [],
      'excluded artifacts wrongly treated as source',
    )
  })
})