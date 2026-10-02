/**
 * Vercel deploy contract - both Root Directory layouts must build the same
 * static export, and a misconfigured project must fail loudly.
 *
 * Regression guard: Vercel reads `vercel.json` from the project's Root
 * Directory. With the repo root configured, `frontend/web/vercel.json` is never
 * read, so the deploy fell back to the root `package.json` build script - which
 * compiles the whole backend with tsc - and surfaced only as a bare
 * "Exited with status 1". These tests pin the repo-root config and the preflight
 * guard that turns that failure into an actionable message.
 *
 * The guard is spawned as a real process (never reimplemented) so the assertions
 * cover the shipped failure messages.
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  MIN_NODE,
  REQUIRED_PATHS,
  missingPaths,
  satisfiesMinimumNode,
} from '../check-vercel-env.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const GUARD = path.join(REPO_ROOT, 'scripts', 'check-vercel-env.mjs')

const readJson = (relativePath) =>
  JSON.parse(readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'))

/** Runs the guard from `cwd` and captures its status and output. */
const runGuard = (cwd) => {
  try {
    const stdout = execFileSync(process.execPath, [GUARD], { cwd, encoding: 'utf8' })
    return { status: 0, stdout, stderr: '' }
  } catch (error) {
    return { status: error.status, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }
  }
}

describe('Vercel root layout', () => {
  it('pins a frontend-only build that never compiles the backend', () => {
    const config = readJson('vercel.json')

    assert.equal(config.installCommand, 'pnpm install --frozen-lockfile')
    assert.doesNotMatch(
      config.buildCommand,
      /build:backend/,
      'the frontend deploy must not run the backend build script',
    )
    assert.doesNotMatch(
      config.buildCommand,
      /tsc -p tsconfig\.json/,
      'the frontend deploy must not compile the backend with tsc',
    )
    assert.match(
      config.buildCommand,
      /check-vercel-env\.mjs/,
      'the deploy must fail fast through the preflight guard',
    )
    assert.equal(config.outputDirectory, 'frontend/web/dist')
  })

  it('disables framework detection so the static export is served as-is', () => {
    assert.equal(readJson('vercel.json').framework, null)
  })

  it('keeps both Root Directory layouts pointing at the same export', () => {
    const root = readJson('vercel.json')
    const web = readJson('frontend/web/vercel.json')

    assert.equal(web.outputDirectory, 'dist')
    assert.equal(
      root.outputDirectory,
      `frontend/web/${web.outputDirectory}`,
      'the repo-root output must be the frontend/web output seen from one level up',
    )
    assert.match(
      web.installCommand,
      /cd \.\.\/\.\. && pnpm install --frozen-lockfile/,
      'the frontend/web layout must reach the single root lockfile',
    )
  })
})

describe('Vercel preflight guard', () => {
  it('accepts the repository root layout', () => {
    const result = runGuard(REPO_ROOT)

    assert.equal(result.status, 0, `guard failed at the repo root: ${result.stderr}`)
    assert.match(result.stdout, /Layout OK/)
  })

  it('fails loudly when the Root Directory is frontend/web', () => {
    // This is the exact misconfiguration: Vercel builds from frontend/web, so
    // neither the root lockfile nor the root scripts are reachable.
    const result = runGuard(path.join(REPO_ROOT, 'frontend', 'web'))

    assert.notEqual(result.status, 0, 'the guard must fail outside the repo root')
    assert.match(result.stderr, /Missing scripts\/sync-demo-assets\.mjs/)
    assert.match(result.stderr, /Missing pnpm-lock\.yaml/)
    assert.match(result.stderr, /Root Directory/)
  })

  it('rejects any Node version below the repository pin', () => {
    assert.equal(satisfiesMinimumNode('22.11.0'), false)
    assert.equal(satisfiesMinimumNode('24.20.9'), false)
    assert.equal(satisfiesMinimumNode('24.21.0'), true)
    assert.equal(satisfiesMinimumNode('25.0.0'), true)
    assert.equal(MIN_NODE, '24.21.0')
  })

  it('lists every layout file the repo-root build depends on', () => {
    assert.deepEqual(missingPaths(REPO_ROOT), [])
    assert.deepEqual(
      REQUIRED_PATHS.map(([relativePath]) => relativePath),
      ['scripts/sync-demo-assets.mjs', 'frontend/web/package.json', 'pnpm-lock.yaml'],
    )
  })
})
