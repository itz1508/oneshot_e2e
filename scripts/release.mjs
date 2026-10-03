#!/usr/bin/env node

// Release packaging for the OneShot source distribution.
//
// `git archive` ships the tracked tree at a tag, but three gaps made the
// result unverifiable: no preflight refused a dirty or unpushed tree, no
// consumer could recompute the archive hash and the manifest from the
// extracted tree, and nothing documented the environment needed to install
// from the archive. This script closes those gaps with four subcommands:
//
//   preflight  refuse dirty trees, missing tags, unpushed commits, or a
//              stale manifest (real git/python invocations, real exit codes)
//   build      write the .tar.gz + .zip, SHA256SUMS, and RELEASE.md
//   verify     recompute the archive hash and re-check the extracted
//              manifest against the extracted tree
//   publish    create the GitHub release with gh
//
// Dependency-free by design (node: builtins only) so it runs on the CI
// release job and on a consumer machine with nothing installed but git,
// node, and tar. Manifest verification reuses app/scripts/verify_manifest.py
// from the extracted tree itself, never a reimplementation here.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const RELEASE_DIR_NAME = 'release'
export const RELEASE_NOTES_NAME = 'RELEASE.md'
export const CHECKSUMS_NAME = 'SHA256SUMS'

const VERSION_FILES = [
  'package.json',
  'frontend/web/package.json',
  'backend/package.json',
  'packages/agent-runtime/package.json',
  'app/integration/gemini/package.json',
  'app/integration/openai/package.json',
  'app/integration/strands/package.json',
  'app/integration/tavily/package.json',
]

const readJson = (relativePath) => JSON.parse(readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'))

export const productVersion = () => readJson('package.json').version

export const archiveStem = (version) => `oneshot-e2e-${version}-src`

export const archiveNames = (version) => [`${archiveStem(version)}.tar.gz`, `${archiveStem(version)}.zip`]

export const tagFor = (version) => `v${version}`

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: REPO_ROOT, encoding: 'utf8', ...options })
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

const fail = (message) => {
  console.error(`[OneShot release] ${message}`)
  process.exitCode = 1
  return 1
}

const pythonCandidates = () => (process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'])

const findPython = () => {
  for (const candidate of pythonCandidates()) {
    const probed = run(candidate, ['--version'])
    if (probed.status === 0) return candidate
  }
  return null
}

const manifestStatus = () => {
  const python = findPython()
  if (!python) return { ok: false, reason: 'no python interpreter found on PATH' }
  const probed = run(python, ['app/scripts/verify_manifest.py'], { timeout: 120000 })
  const output = `${probed.stdout}\n${probed.stderr}`
  if (probed.status === 0 && /Result: MATCH/.test(output)) return { ok: true, reason: 'manifest MATCH' }
  return { ok: false, reason: `verify_manifest.py did not report MATCH:\n${output.trim()}` }
}

/**
 * Collects every preflight failure without stopping at the first, so one
 * run reports the whole repair list.
 *
 * @param {string} version - Product version, e.g. '1.3.0'.
 * @returns {{failures: string[], tag: string}} Failure messages (empty when clean).
 */
export const collectPreflightFailures = (version) => {
  const failures = []
  const tag = tagFor(version)

  const tree = run('git', ['status', '--porcelain'])
  if (tree.status !== 0) {
    failures.push(`git status failed: ${(tree.stderr || tree.stdout).trim()}`)
  } else if (tree.stdout.trim() !== '') {
    failures.push(`working tree is dirty:\n${tree.stdout.trim()}\ncommit or stash before cutting a release`)
  }

  const tagProbe = run('git', ['rev-parse', '--verify', `refs/tags/${tag}`])
  if (tagProbe.status !== 0) {
    failures.push(`tag ${tag} does not exist yet; create it with: git tag -a ${tag} -m "Release ${version}"`)
  }

  const branchProbe = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
  const branch = branchProbe.stdout.trim()
  // CI checks out the tag ref directly, which leaves a detached HEAD reported
  // as 'HEAD'. That is acceptable only when HEAD is exactly the tagged commit;
  // anywhere else, a release must still be cut from main.
  const detached = branch === 'HEAD'
  if (branchProbe.status !== 0 || branch === '') {
    failures.push('could not determine the current branch')
  } else if (detached) {
    if (tagProbe.status === 0) {
      const headProbe = run('git', ['rev-parse', 'HEAD'])
      const taggedProbe = run('git', ['rev-list', '-n', '1', tag])
      if (headProbe.status !== 0 || taggedProbe.status !== 0) {
        failures.push('could not compare detached HEAD against the release tag')
      } else if (headProbe.stdout.trim() !== taggedProbe.stdout.trim()) {
        failures.push(`detached HEAD is ${headProbe.stdout.trim().slice(0, 7)}, not the commit tagged ${tag}`)
      }
    }
  } else if (branch !== 'main') {
    failures.push(`releases cut from main, current branch is ${branch}`)
  }

  if (branch === 'main') {
    const upstream = run('git', ['rev-parse', '@{u}'])
    if (upstream.status !== 0) {
      failures.push('branch main has no upstream; push it before cutting a release')
    } else {
      const aheadBehind = run('git', ['rev-list', '--left-right', '--count', 'HEAD...@{u}'])
      if (aheadBehind.status !== 0) {
        failures.push(`could not compare HEAD against upstream: ${(aheadBehind.stderr || '').trim()}`)
      } else {
        const [aheadRaw, behindRaw] = aheadBehind.stdout.trim().split(/\s+/)
        const ahead = Number(aheadRaw)
        const behind = Number(behindRaw)
        if (behind > 0) failures.push(`main is ${behind} commit(s) behind its upstream; pull first`)
        if (ahead > 0) failures.push(`main is ${ahead} commit(s) ahead of its upstream; push first`)
      }
    }
  }

  if (failures.length === 0) {
    const manifest = manifestStatus()
    if (!manifest.ok) failures.push(`manifest is stale: ${manifest.reason}`)
  }

  return { failures, tag }
}

export const preflight = (version) => {
  const { failures, tag } = collectPreflightFailures(version)
  if (failures.length > 0) {
    for (const failure of failures) console.error(`[OneShot release] ${failure}`)
    process.exitCode = 1
    return 1
  }
  console.log(`[OneShot release] Preflight OK: clean tree, tag ${tag}, upstream in sync, manifest MATCH.`)
  return 0
}

const sha256File = (filePath) => {
  const hash = createHash('sha256')
  hash.update(readFileSync(filePath))
  return hash.digest('hex')
}

const releaseNotes = ({ version, tag, commit }) =>
  [
    `# OneShot E2E ${version}`,
    '',
    `Source release \`${archiveStem(version)}.tar.gz\` / \`${archiveStem(version)}.zip\`.`,
    '',
    `- Tag: \`${tag}\` (commit \`${commit}\`)`,
    '- Contents: the tracked tree at the tag commit, nothing generated.',
    '- Integrity: SHA256SUMS covers both archives; app/manifest.json hashes every source file inside.',
    '- Manifest: `app/manifest.json` lists every source file with SHA-256 hashes.',
    '',
    '## Requirements',
    '',
    '- Node.js >= 24.21.0',
    '- pnpm >= 11.27.1',
    '- Python >= 3.12',
    '',
    '## Install from the archive',
    '',
    '```sh',
    `tar -xzf ${archiveStem(version)}.tar.gz`,
    `cd ${archiveStem(version)}`,
    'pnpm install --frozen-lockfile',
    'pnpm run verify',
    '```',
    '',
    '## Verify the download',
    '',
    '```sh',
    `sha256sum -c SHA256SUMS  # or: node scripts/release.mjs verify ${archiveStem(version)}.tar.gz`,
    '```',
    '',
  ].join('\n')

const archiveFromGit = (version, tag, archivePath, format) => {
  const prefix = `${archiveStem(version)}/`
  const gitFormat = format === 'tar.gz' ? 'tar.gz' : 'zip'
  return run('git', ['archive', `--format=${gitFormat}`, `--prefix=${prefix}`, `--output=${archivePath}`, tag], {
    timeout: 300000,
  })
}

/**
 * Builds the release artifacts into release/.
 *
 * @param {string} version - Product version, e.g. '1.3.0'.
 * @returns {number} Process exit code convention (0 = success).
 */
export const build = (version) => {
  const tag = tagFor(version)
  const tagProbe = run('git', ['rev-parse', '--verify', `refs/tags/${tag}`])
  if (tagProbe.status !== 0) {
    return fail(`tag ${tag} does not exist yet; create it with: git tag -a ${tag} -m "Release ${version}"`)
  }

  const outDir = path.join(REPO_ROOT, RELEASE_DIR_NAME)
  mkdirSync(outDir, { recursive: true })
  const names = archiveNames(version)
  const paths = names.map((name) => path.join(outDir, name))

  const tarResult = archiveFromGit(version, tag, paths[0], 'tar.gz')
  if (tarResult.status !== 0) {
    return fail(`git archive (tar.gz) failed: ${(tarResult.stderr || tarResult.stdout).trim()}`)
  }
  const zipResult = archiveFromGit(version, tag, paths[1], 'zip')
  if (zipResult.status !== 0) {
    return fail(`git archive (zip) failed: ${(zipResult.stderr || zipResult.stdout).trim()}`)
  }

  const commit = run('git', ['rev-list', '-n', '1', tag]).stdout.trim()
  writeFileSync(path.join(outDir, RELEASE_NOTES_NAME), releaseNotes({ version, tag, commit }), 'utf8')
  const checksums = paths.map((archivePath) => `${sha256File(archivePath)}  ${path.basename(archivePath)}`).join('\n').concat('\n')
  writeFileSync(path.join(outDir, CHECKSUMS_NAME), checksums, 'utf8')

  console.log(`[OneShot release] Built ${names.join(', ')} + ${RELEASE_NOTES_NAME} + ${CHECKSUMS_NAME} in ${RELEASE_DIR_NAME}/.`)
  return 0
}

/**
 * Verifies a release archive: hash presence, extraction, and the extracted
 * manifest re-checked against the extracted tree.
 *
 * @param {string} archivePath - Path to the .tar.gz or .zip to verify.
 * @returns {number} Process exit code convention (0 = success).
 */
export const verify = (archivePath) => {
  const resolved = path.resolve(archivePath)
  if (!existsSync(resolved)) {
    return fail(`archive not found: ${archivePath}`)
  }
  const fileName = path.basename(resolved)
  const stem = archiveStem(productVersion())
  if (!fileName.startsWith(stem)) {
    return fail(`archive ${fileName} does not match this checkout (expected prefix ${stem})`)
  }

  const sumsPath = path.join(REPO_ROOT, RELEASE_DIR_NAME, CHECKSUMS_NAME)
  const digest = sha256File(resolved)
  if (existsSync(sumsPath)) {
    const entry = readFileSync(sumsPath, 'utf8').split('\n').find((line) => line.endsWith(`  ${fileName}`))
    if (!entry) {
      return fail(`${fileName} is not listed in ${RELEASE_DIR_NAME}/${CHECKSUMS_NAME}`)
    }
    if (!entry.startsWith(digest)) {
      return fail(`hash mismatch for ${fileName}: archive sha256 ${digest} != recorded ${entry.split(' ')[0]}`)
    }
    console.log(`[OneShot release] SHA-256 OK: ${fileName} matches ${RELEASE_DIR_NAME}/${CHECKSUMS_NAME}.`)
  } else {
    console.log(`[OneShot release] SHA-256 of ${fileName}: ${digest} (no ${CHECKSUMS_NAME} to compare against).`)
  }

  const python = findPython()
  if (!python) {
    return fail('no python interpreter found on PATH to verify the extracted tree')
  }

  const tmpDir = path.join(REPO_ROOT, RELEASE_DIR_NAME, '.verify-tmp')
  rmSync(tmpDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })
  const extractedRoot = path.join(tmpDir, stem)
  // GNU tar (the default tar on Linux runners) cannot read zip archives, so zip
  // extraction goes through python's zipfile module - the interpreter the
  // manifest re-check immediately below requires anyway.
  const extracted = fileName.endsWith('.zip')
    ? run(python, ['-m', 'zipfile', '-e', resolved, tmpDir], { timeout: 300000 })
    : run('tar', ['-xzf', resolved, '-C', tmpDir], { timeout: 300000 })
  if (extracted.status !== 0) {
    return fail(`could not extract ${fileName}: ${(extracted.stderr || extracted.stdout).trim()}`)
  }

  const extractedManifest = path.join(extractedRoot, 'app', 'manifest.json')
  if (!existsSync(extractedManifest)) {
    return fail(`extracted tree has no app/manifest.json under ${stem}/`)
  }
  const verifier = path.join(extractedRoot, 'app', 'scripts', 'verify_manifest.py')
  const checked = run(python, [verifier, extractedManifest, '--root', extractedRoot], { timeout: 180000 })
  const output = `${checked.stdout}\n${checked.stderr}`
  if (checked.status !== 0 || !/Result: MATCH/.test(output)) {
    return fail(`extracted manifest does not match the extracted tree:\n${output.trim()}`)
  }
  console.log(`[OneShot release] Manifest OK: extracted ${stem}/ verifies MATCH against its own manifest.`)
  return 0
}

/**
 * Creates the GitHub release for the tag with gh.
 *
 * @param {string} version - Product version, e.g. '1.3.0'.
 * @returns {number} Process exit code convention (0 = success).
 */
export const publish = (version) => {
  const tag = tagFor(version)
  const notesPath = path.join(REPO_ROOT, RELEASE_DIR_NAME, RELEASE_NOTES_NAME)
  if (!existsSync(notesPath)) {
    fail(`run build first: ${RELEASE_DIR_NAME}/${RELEASE_NOTES_NAME} is missing`)
    return 1
  }
  const assets = archiveNames(version).map((name) => path.join(REPO_ROOT, RELEASE_DIR_NAME, name))
  for (const asset of assets) {
    if (!existsSync(asset)) {
      fail(`run build first: ${path.basename(asset)} is missing`)
      return 1
    }
  }
  const created = run(
    'gh',
    ['release', 'create', tag, ...assets, '--title', `OneShot E2E ${version}`, '--notes-file', notesPath],
    {
      timeout: 300000,
    },
  )
  if (created.status !== 0) {
    fail(`gh release create failed: ${(created.stderr || created.stdout).trim()}`)
    return 1
  }
  console.log(`[OneShot release] Published ${tag}: ${(created.stdout || '').trim()}`)
  return 0
}

export const versionFiles = () => [...VERSION_FILES, 'backend/python/pyproject.toml']

/** Reads the declared Python package version from pyproject.toml. */
export const pythonVersion = () => {
  const pyproject = readFileSync(path.join(REPO_ROOT, 'backend/python/pyproject.toml'), 'utf8')
  return pyproject.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? null
}

const usage = () => {
  console.log('Usage: node scripts/release.mjs <preflight|build|verify <archive>|publish> [--version <x.y.z>]')
  process.exitCode = 2
}

const main = () => {
  const [command, ...rest] = process.argv.slice(2)
  let version = productVersion()
  let operand = null
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--version') {
      version = rest[index + 1]
      index += 1
    } else if (!operand) {
      operand = rest[index]
    } else {
      usage()
      return
    }
  }

  if (command === 'preflight') process.exitCode = preflight(version)
  else if (command === 'build') process.exitCode = build(version)
  else if (command === 'verify') {
    if (!operand) usage()
    else process.exitCode = verify(operand)
  } else if (command === 'publish') process.exitCode = publish(version)
  else usage()
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main()
}
