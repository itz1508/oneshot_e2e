#!/usr/bin/env node

// Fail-fast preflight for the Vercel build.
//
// Vercel reports a bare "Exited with status 1" whenever a build step dies, which
// is all the deploy log shows. This guard checks the two things that break a
// oneshot_e2e deploy *before* `next build` runs and prints the fix, so a failure
// names itself instead of costing another opaque redeploy.
//
// It is dependency-free on purpose (node:fs + node:path + node:url only) so it
// runs on a cold build container where nothing is installed yet.

import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Vercel resolves this through `engines.node` in package.json (it ignores
// .nvmrc/.node-version), intersecting every declared range with 24.x.
export const MIN_NODE = '24.21.0'

const MIN_NODE_PARTS = MIN_NODE.split('.').map(Number)

/**
 * True when a `process.versions.node` style string satisfies MIN_NODE.
 *
 * @param {string} version - Dot-separated version, e.g. "24.21.0".
 * @returns {boolean} Whether the version is at or above the repository minimum.
 */
export const satisfiesMinimumNode = (version) => {
  const parts = String(version)
    .split('.')
    .map((part) => Number.parseInt(part, 10))

  for (let index = 0; index < MIN_NODE_PARTS.length; index += 1) {
    const actual = Number.isFinite(parts[index]) ? parts[index] : 0
    if (actual !== MIN_NODE_PARTS[index]) {
      return actual > MIN_NODE_PARTS[index]
    }
  }

  return true
}

// Paths the repo-root build command needs, each with the reason a missing one
// means the project is configured against the wrong Root Directory.
export const REQUIRED_PATHS = [
  ['scripts/sync-demo-assets.mjs', 'the frontend build syncs demo assets from the repo root'],
  ['frontend/web/package.json', 'the frontend workspace must be part of the checkout'],
  ['pnpm-lock.yaml', 'installs must be reproducible through the single root lockfile'],
]

/**
 * Repo-relative paths required by the build that are absent under `root`.
 *
 * @param {string} root - Directory the build would run from.
 * @returns {string[]} Missing repo-relative paths, in REQUIRED_PATHS order.
 */
export const missingPaths = (root) =>
  REQUIRED_PATHS.filter(([relativePath]) => !existsSync(path.join(root, relativePath))).map(
    ([relativePath]) => relativePath,
  )

const fail = (message) => {
  console.error(`[OneShot Vercel] ${message}`)
  process.exitCode = 1
}

const run = () => {
  if (satisfiesMinimumNode(process.versions.node)) {
    console.log(`[OneShot Vercel] Node ${process.versions.node} satisfies >=${MIN_NODE}.`)
  } else {
    fail(
      `Node ${process.versions.node} is below the required >=${MIN_NODE}. ` +
        'Set Settings -> Build and Deployment -> Node.js Version to 24.x ' +
        '(Vercel reads engines.node from package.json, not .nvmrc).',
    )
  }

  for (const relativePath of missingPaths(process.cwd())) {
    const [matched, why] = REQUIRED_PATHS.find(([entry]) => entry === relativePath)
    fail(`Missing ${matched} from ${process.cwd()} - ${why}.`)
  }

  if (process.exitCode) {
    fail(
      'Point the Vercel project Root Directory at the repository root so the root ' +
        'vercel.json is read, or at frontend/web so frontend/web/vercel.json is read.',
    )
    process.exit(process.exitCode)
  }

  console.log('[OneShot Vercel] Layout OK: repo root with scripts, frontend/web and pnpm-lock.yaml.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run()
}
