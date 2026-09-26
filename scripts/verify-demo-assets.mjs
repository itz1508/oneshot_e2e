#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(moduleDir, '..')
const rootDemoDir = path.join(repoRoot, 'public', 'demo')
const frontendDemoDir = path.join(repoRoot, 'frontend', 'web', 'public', 'demo')
const expectedFiles = [
  'architecture-diagram.svg',
  'oneshot-demo.webm',
  'screen-1-loading.png',
  'screen-2-typing.png',
  'screen-3-streaming.png',
  'screen-4-interactive.png',
  'screen-5-task-state.png',
]
const obsoleteFiles = ['screen-1-initial.png']
const rawVideoPattern = /^page@.*\.webm$/

const sha256 = async (filePath) => {
  const hash = crypto.createHash('sha256')
  hash.update(await fs.readFile(filePath))
  return hash.digest('hex')
}

for (const demoDir of [rootDemoDir, frontendDemoDir]) {
  for (const filename of expectedFiles) {
    await fs.access(path.join(demoDir, filename))
  }
  for (const filename of obsoleteFiles) {
    await assert.rejects(fs.access(path.join(demoDir, filename)), `obsolete asset remains: ${filename}`)
  }
  const generatedVideos = (await fs.readdir(demoDir)).filter((filename) => rawVideoPattern.test(filename))
  assert.deepEqual(generatedVideos, [], `raw recordings remain in ${demoDir}`)
}

for (const filename of expectedFiles) {
  const rootPath = path.join(rootDemoDir, filename)
  const frontendPath = path.join(frontendDemoDir, filename)
  const rootBytes = await fs.readFile(rootPath)
  const frontendBytes = await fs.readFile(frontendPath)
  assert.equal(frontendBytes.compare(rootBytes), 0, `demo asset bytes differ: ${filename}`)
  assert.equal(await sha256(frontendPath), await sha256(rootPath), `demo asset hashes differ: ${filename}`)
}

console.log(`Demo asset verification passed: ${expectedFiles.length} files, byte/hash equality confirmed`)
