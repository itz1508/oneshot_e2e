#!/usr/bin/env node

// Copies the canonical demo payload (public/demo) into the derived Next.js
// surfaces: frontend/web/public/demo (dev server + static export input) and,
// when a static export already exists, frontend/web/dist/demo (preview output).
// Rationale: committing the same video ladder twice (repo root public/ +
// frontend public/) doubles clone size and GitHub page weight. The root stays
// canonical; every other copy is derived build output and is gitignored. Sync is
// mtime+size aware so no-op rebuilds stay incremental.

import { statSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = path.join(root, 'public', 'demo')
const frontendPublicDir = path.join(root, 'frontend', 'web', 'public', 'demo')
const distRoot = path.join(root, 'frontend', 'web', 'dist')
const distDemoDir = path.join(distRoot, 'demo')

// The archival tree (4K H.264 masters, the unpublished portrait cut) is neither
// served nor committed. Copying it into a Next.js public dir would ship it in
// the Pages bundle and undo the point of keeping it archival, so it is skipped
// even though it lives beside the served payload in the canonical tree.
const EXCLUDED_DIRS = new Set(['archival'])

// Files that live in a derived tree by right, not by sync. The frontend copy is
// gitignored as a directory but keeps its own .gitignore committed as the
// placeholder, so pruning must never sweep it away.
const PRESERVED = new Set(['.gitignore'])

const exists = async (target) => fs.access(target).then(() => true).catch(() => false)

const sameFile = (sourceStat, targetStat) =>
  sourceStat.size === targetStat.size &&
  Math.abs(sourceStat.mtimeMs - targetStat.mtimeMs) < 1

const newerSource = async (source, target) => {
  let sourceStat
  try {
    sourceStat = statSync(source)
  } catch {
    return false
  }
  let targetStat
  try {
    targetStat = statSync(target)
  } catch {
    return true
  }
  return !sameFile(sourceStat, targetStat)
}

const syncInto = async (entries, targetDir) => {
  await fs.mkdir(targetDir, { recursive: true })
  let copied = 0
  let skipped = 0
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry)) continue
    const source = path.join(sourceDir, entry)
    const target = path.join(targetDir, entry)
    const stat = await fs.stat(source)
    if (!stat.isFile()) continue
    if (await newerSource(source, target)) {
      await fs.copyFile(source, target)
      copied += 1
    } else {
      skipped += 1
    }
  }
  // A derived tree must not outlive its inputs. Anything the canonical tree no
  // longer serves gets retired -- renamed assets, renditions demoted to archival,
  // or a previously copied archival/ directory -- otherwise a stale 65MB master
  // keeps shipping in the Pages bundle long after it stopped being an input.
  const canonical = new Set(entries.filter((entry) => !EXCLUDED_DIRS.has(entry)))
  const strays = (await fs.readdir(targetDir)).filter((name) => !canonical.has(name) && !PRESERVED.has(name))
  let removed = 0
  for (const name of strays) {
    await fs.rm(path.join(targetDir, name), { recursive: true, force: true })
    removed += 1
  }
  return { targetDir, copied, skipped, removed }
}

export const syncDemoAssets = async () => {
  const entries = await fs.readdir(sourceDir)
  // The public tree is always materialised: the dev server reads it and the
  // static export copies it. The dist tree is only refreshed when a previous
  // build created it, so sync never conjures a half-populated export.
  const targets = [frontendPublicDir, ...((await exists(distRoot)) ? [distDemoDir] : [])]
  const results = await Promise.all(targets.map((target) => syncInto(entries, target)))
  return {
    copied: results.reduce((total, result) => total + result.copied, 0),
    skipped: results.reduce((total, result) => total + result.skipped, 0),
    removed: results.reduce((total, result) => total + result.removed, 0),
    targets: results.map((result) => result.targetDir),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  syncDemoAssets()
    .then(({ copied, skipped, removed, targets }) => {
      console.log(`Demo assets synced: ${copied} copied, ${skipped} up to date, ${removed} retired across ${targets.length} derived tree(s).`)
    })
    .catch((error) => {
      console.error(`Demo asset sync failed: ${error.message}`)
      process.exitCode = 1
    })
}
