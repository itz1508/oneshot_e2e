/**
 * Release contract - a release archive must be buildable, verifiable, and
 * cut only from a clean, tagged, in-sync tree at one product version.
 *
 * Regression guard: the 1.3.0 line shipped five manifests at 1.0.0 while the
 * product claimed 1.3.0, so a tag would have frozen inconsistent versions.
 * These tests pin single-version alignment and the preflight/build/verify
 * failure messages by importing the shipped helpers and spawning the
 * shipped script (never reimplementing either).
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  archiveNames,
  archiveStem,
  collectPreflightFailures,
  pythonVersion,
  tagFor,
  versionFiles,
} from '../release.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const RELEASE_SCRIPT = path.join(REPO_ROOT, 'scripts', 'release.mjs')

const readJson = (relativePath) => JSON.parse(readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'))

const runRelease = (args, options = {}) => {
  const result = spawnSync(process.execPath, [RELEASE_SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    ...options,
  })
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

describe('release contract', () => {
  it('names the source archives after the product version', () => {
    const version = readJson('package.json').version
    assert.equal(archiveStem(version), `oneshot-e2e-${version}-src`)
    assert.deepEqual(archiveNames(version), [
      `oneshot-e2e-${version}-src.tar.gz`,
      `oneshot-e2e-${version}-src.zip`,
    ])
    assert.equal(tagFor(version), `v${version}`)
  })

  it('keeps every versioned manifest aligned with the product version', () => {
    const productVersion = readJson('package.json').version
    const failures = []
    for (const file of versionFiles()) {
      if (file.endsWith('.toml')) continue
      const manifest = readJson(file)
      if (manifest.version !== productVersion) {
        failures.push(`${file} is ${manifest.version}, expected ${productVersion}`)
      }
    }
    const pyDeclared = pythonVersion()
    if (pyDeclared !== productVersion) {
      failures.push(`backend/python/pyproject.toml is ${pyDeclared}, expected ${productVersion}`)
    }
    assert.deepEqual(failures, [], 'version drift blocks a release; align every manifest first')
  })

  it('collects a missing-tag failure for a version that was never tagged', () => {
    const { failures, tag } = collectPreflightFailures('0.0.0-notreal')
    assert.equal(tag, 'v0.0.0-notreal')
    assert.equal(
      failures.some((failure) => failure.includes('tag v0.0.0-notreal does not exist yet')),
      true,
      `expected a missing-tag failure, got: ${JSON.stringify(failures)}`,
    )
  })

  it('reports the missing release tag instead of passing silently', () => {
    const produced = runRelease(['preflight', '--version', '0.0.0-notreal'])
    assert.notEqual(produced.status, 0)
    assert.match(produced.stderr, /tag v0\.0\.0-notreal does not exist yet/)
  })

  it('fails verify on a missing archive with the product stem in the message', () => {
    const productVersion = readJson('package.json').version
    const missing = path.join(REPO_ROOT, 'release', `${archiveStem(productVersion)}.tar.gz`)
    if (existsSync(missing)) return
    const produced = runRelease(['verify', missing])
    assert.notEqual(produced.status, 0)
    assert.match(produced.stderr, /archive not found/)
  })

  it('prints usage instead of running when the subcommand is unknown', () => {
    const produced = runRelease(['nope'])
    assert.equal(produced.status, 2)
    assert.match(produced.stdout, /Usage: node scripts\/release\.mjs/)
  })
})
