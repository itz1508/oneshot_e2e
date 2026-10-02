#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(moduleDir, '..')
const rootDemoDir = path.join(repoRoot, 'public', 'demo')
const archivalDemoDir = path.join(rootDemoDir, 'archival')
const frontendDemoDir = path.join(repoRoot, 'frontend', 'web', 'public', 'demo')
const distDemoDir = path.join(repoRoot, 'frontend', 'web', 'dist', 'demo')

/**
 * The committed, served payload. public/demo is the ONLY canonical tree:
 * frontend/web/public/demo and frontend/web/dist/demo are derived by
 * scripts/sync-demo-assets.mjs and are byte-compared against this one.
 * Order follows the storyboard timeline.
 */
const expectedFiles = [
  'architecture-diagram.svg',
  'oneshot-demo.webm',
  'oneshot-demo.mp4',
  'oneshot-demo.gif',
  'oneshot-demo.vtt',
  'oneshot-architecture-desktop.vtt',
  'oneshot-architecture-desktop-poster.webp',
  'oneshot-architecture-desktop.av1.mp4',
  'oneshot-architecture-desktop.vp9.webm',
  'oneshot-architecture-desktop.h264.mp4',
  'screen-0-install-test.png',
  'screen-1-loading.png',
  'screen-1b-loading-pulse.png',
  'screen-1c-sidebar-collapsed.png',
  'screen-2-typing.png',
  'screen-2b-drawer-empty.png',
  'screen-2c-tasks-empty.png',
  'screen-3-submitted.png',
  'screen-3-streaming.png',
  'screen-4-interactive.png',
  'screen-4b-activity.png',
  'screen-4c-pipeline.png',
  'screen-4d-late.png',
  'screen-4e-near-complete.png',
  'screen-5-task-state.png',
  'screen-6-tools.png',
  'screen-7-gates.png',
  'screen-8-backends.png',
  'screen-9-final.png',
]

/**
 * Archival-only artifacts: the 4K H.264 masters and the portrait cut. They are
 * regenerable with `pnpm run capture:architecture-video`, they are gitignored,
 * and they must never appear in a served tree -- a 4K master is an 82MB file
 * (GitHub warns at 50MB and rejects at 100MB) that nothing embeds, and the
 * drawer's fallback <source> pointing at one used to hand the widest audience a
 * 65MB download.
 */
const archivalOnlyFiles = [
  'oneshot-architecture.mp4',
  'oneshot-architecture.vtt',
  'oneshot-architecture-poster.webp',
  'oneshot-architecture.av1.mp4',
  'oneshot-architecture.vp9.webm',
  'oneshot-architecture-desktop.mp4',
]

/**
 * Ceiling for any single committed asset. The whole point of the 1080p ladder
 * is that no browser is asked to fetch archival bytes; this assertion fails the
 * build if a 4K master is ever written into a served tree again.
 */
const MAX_SERVED_BYTES = 25 * 1024 * 1024

/** Assets from prior capture runs that should no longer exist. */
const obsoleteFiles = [
  'screen-1-initial.png',
  'screen-1-loading-theirs.png',
  'screen-5-task-state-theirs.png',
  'oneshot-demo-rebuild.webm',
]

const rawVideoPattern = /^page@.*\.webm$/

const sha256 = async (filePath) => {
  const hash = crypto.createHash('sha256')
  hash.update(await fs.readFile(filePath))
  return hash.digest('hex')
}

const exists = async (target) => fs.access(target).then(() => true).catch(() => false)

const distExists = await exists(distDemoDir)
const frontendExists = await exists(frontendDemoDir)
const archivalExists = await exists(archivalDemoDir)
// The canonical tree is mandatory. The derived trees are verified only when they
// exist, so `pnpm run verify:demo` passes on a fresh clone before the first
// build has synced anything, but fails the moment a synced copy drifts.
const checkedDirs = [
  rootDemoDir,
  ...(frontendExists ? [frontendDemoDir] : []),
  ...(distExists ? [distDemoDir] : []),
]

for (const demoDir of checkedDirs) {
  for (const filename of expectedFiles) {
    await fs.access(path.join(demoDir, filename))
  }
  for (const filename of obsoleteFiles) {
    await assert.rejects(fs.access(path.join(demoDir, filename)), `obsolete asset remains: ${filename}`)
  }
  // Archival bytes must never be reachable from a served path. This is the
  // regression guard against re-committing a 4K master or re-serving the
  // portrait cut.
  for (const filename of archivalOnlyFiles) {
    await assert.rejects(fs.access(path.join(demoDir, filename)), `archival-only asset served from ${demoDir}: ${filename}`)
  }
  const servedEntries = await fs.readdir(demoDir)
  const generatedVideos = servedEntries.filter((filename) => rawVideoPattern.test(filename))
  assert.deepEqual(generatedVideos, [], `raw recordings remain in ${demoDir}`)
  // archival/ legitimately lives inside the canonical tree; the derived trees
  // must never receive it, or the Pages bundle ships 150MB of masters again.
  if (demoDir !== rootDemoDir) {
    assert.ok(!servedEntries.includes('archival'), `archival tree leaked into the derived tree ${demoDir}`)
  }
}

/**
 * Every committed asset stays under one byte budget. The 4K masters are 65-82MB
 * apiece, so a single oversized file here means archival bytes leaked into the
 * commit surface -- exactly the regression this layout exists to prevent.
 */
const servedSizes = await Promise.all(
  expectedFiles.map(async (filename) => (await fs.stat(path.join(rootDemoDir, filename))).size),
)
const oversizedFiles = expectedFiles.filter((_, index) => servedSizes[index] > MAX_SERVED_BYTES)
assert.deepEqual(
  oversizedFiles,
  [],
  `served assets exceed the ${MAX_SERVED_BYTES / (1024 * 1024)}MB budget: ${oversizedFiles.join(', ')}`,
)
const totalServedBytes = servedSizes.reduce((total, size) => total + size, 0)

for (const filename of expectedFiles) {
  const rootPath = path.join(rootDemoDir, filename)
  const rootBytes = await fs.readFile(rootPath)
  const rootHash = await sha256(rootPath)

  for (const otherDir of checkedDirs.slice(1)) {
    const otherPath = path.join(otherDir, filename)
    const otherBytes = await fs.readFile(otherPath)
    assert.equal(otherBytes.compare(rootBytes), 0, `demo asset bytes differ: ${filename} in ${otherDir}`)
    assert.equal(await sha256(otherPath), rootHash, `demo asset hashes differ: ${filename} in ${otherDir}`)
  }
}

/**
 * The served ladder, cut from the same storyboard: three 1080p renditions of the
 * landscape desktop cut, so the drawer never asks a browser for archival bytes.
 * AV1 and H.264 carry embedded mov_text captions; the VP9 WebM does not support
 * a text stream in that container, so it relies on the sibling .vtt <track>.
 */
const architectureRenditions = [
  { label: 'desktop-av1', filename: 'oneshot-architecture-desktop.av1.mp4', width: 1920, height: 1080, full: true },
  { label: 'desktop-vp9', filename: 'oneshot-architecture-desktop.vp9.webm', width: 1920, height: 1080, full: false },
  { label: 'desktop-h264', filename: 'oneshot-architecture-desktop.h264.mp4', width: 1920, height: 1080, full: true },
]

/**
 * The archival masters, verified only when public/demo/archival is present. A
 * fresh clone has none (it is gitignored), which is the intended state; a
 * capture machine that just rendered them gets the 4K geometry checked too.
 */
const archivalRenditions = [
  { label: 'mobile-master', filename: 'oneshot-architecture.mp4', width: 2160, height: 3840, full: true },
  { label: 'desktop-master', filename: 'oneshot-architecture-desktop.mp4', width: 3840, height: 2160, full: true },
]

/**
 * Playwright's recorder embeds the CSS-resolution frame inside `recordVideo.size`
 * without scaling it. Recording at the 4K output size while the page was laid out
 * at half that produced a correctly-sized file whose top-left quadrant held the
 * render and whose remaining three quarters were flat gray letterbox padding.
 * Every other assertion passed on that file, because none of them look at
 * pixels. Corner patches alone are a poor signal, since this design is dark and
 * its corners are legitimately near-black. Letterboxing is instead detected by
 * comparing opposite edges: padding made one side flat mid-gray while the other
 * stayed dark, so a filled frame keeps left/right and top/bottom means close.
 */
const assertRendition = ({ label, filename, width, height, full = true }, baseDir = rootDemoDir) => {
  const file = path.join(baseDir, filename)
  const mediaInfo = JSON.parse(execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_type,width,height',
    '-of', 'json',
    file,
  ], { encoding: 'utf8' }))
  const videoStream = mediaInfo.streams.find((stream) => stream.codec_type === 'video')
  assert.equal(videoStream?.width, width, `${label} architecture video must be ${width} pixels wide`)
  assert.equal(videoStream?.height, height, `${label} architecture video must be ${height} pixels high`)
  assert.ok(mediaInfo.streams.some((stream) => stream.codec_type === 'audio'), `${label} architecture video must include audio`)
  if (full) assert.ok(mediaInfo.streams.some((stream) => stream.codec_type === 'subtitle'), `${label} architecture video must include embedded captions`)
  assert.ok(Math.abs(Number(mediaInfo.format.duration) - 180) <= 0.03, `${label} architecture video must be exactly 180 seconds`)

  const edgeMean = (filter) => {
    const patch = execFileSync('ffmpeg', [
      '-v', 'error', '-ss', '100', '-i', file, '-frames:v', '1',
      '-vf', filter, '-f', 'rawvideo', '-pix_fmt', 'gray', '-',
    ], { maxBuffer: 4 * 1024 * 1024 })
    const samples = Array.from(patch)
    return samples.reduce((total, value) => total + value, 0) / samples.length
  }

  const leftEdge = edgeMean(`crop=24:${height}:0:0,scale=1:${height}`)
  const rightEdge = edgeMean(`crop=24:${height}:${width - 24}:0,scale=1:${height}`)
  const topEdge = edgeMean(`crop=${width}:24:0:0,scale=${width}:1`)
  const bottomEdge = edgeMean(`crop=${width}:24:0:${height - 24},scale=${width}:1`)

  const imbalance = Math.max(Math.abs(leftEdge - rightEdge), Math.abs(topEdge - bottomEdge))
  assert.ok(
    imbalance < 40,
    `${label} frame is letterboxed, not filled: left/right edge means ${leftEdge.toFixed(1)}/${rightEdge.toFixed(1)}, top/bottom ${topEdge.toFixed(1)}/${bottomEdge.toFixed(1)}`,
  )
  return imbalance
}

const describeRendition = (rendition, baseDir) => {
  const imbalance = assertRendition(rendition, baseDir)
  return `${rendition.label} ${rendition.width}x${rendition.height} fills the frame (max edge delta ${imbalance.toFixed(2)})`
}

const renditionSummaries = architectureRenditions.map((rendition) => describeRendition(rendition, rootDemoDir))
// The archival tree is gitignored, so absence is the expected state on a fresh
// clone; it is only ffprobed when a capture run actually produced it.
const archivalSummaries = archivalExists
  ? archivalRenditions.map((rendition) => describeRendition(rendition, archivalDemoDir))
  : ['absent (gitignored; regenerate with pnpm run capture:architecture-video)']

const megabytes = (bytes) => (bytes / (1024 * 1024)).toFixed(1)
console.log(
  `Demo asset verification passed: ${expectedFiles.length} committed files in the canonical tree ` +
    `(${megabytes(totalServedBytes)}MB total, largest ${megabytes(Math.max(...servedSizes))}MB, budget ${MAX_SERVED_BYTES / (1024 * 1024)}MB) ` +
    `verified across ${checkedDirs.length} location(s); served ladder is 180 seconds with audio and captions - ${renditionSummaries.join(';')}; ` +
    `archival tree: ${archivalSummaries.join(';')}`,
)
