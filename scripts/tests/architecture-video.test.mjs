import test from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { buildHtml, buildVtt, SCENES, SCENE_SCREENSHOTS, storyboardTimeline, toVttTimestamp, toSpeechSsml, PRONUNCIATION_ALIASES, LAYOUT_HEIGHT, LAYOUT_WIDTH, RENDITIONS, VIDEO_HEIGHT, VIDEO_WIDTH } from '../capture-architecture-video.mjs'
import { readFileSync as read } from 'node:fs'

const captureDemoSource = read(new URL('../capture-demo.mjs', import.meta.url), 'utf8')

const captureSource = readFileSync(new URL('../capture-architecture-video.mjs', import.meta.url), 'utf8')

test('the capture ships a three-rung 1080p web ladder', () => {
  // Browsers get 1080p AV1, VP9 and an H.264 fallback. The 4K H.264 master is the
  // archival deliverable and never a served asset.
  assert.match(captureSource, /'\.av1\.mp4'/, 'an AV1 web rendition must be produced')
  assert.match(captureSource, /'\.vp9\.webm'/, 'a VP9 web rendition must be produced')
  assert.match(captureSource, /'\.h264\.mp4'/, 'an H.264 fallback rendition must be produced')
  assert.match(captureSource, /libsvtav1/, 'AV1 must use the libsvtav1 encoder')
  assert.match(captureSource, /libvpx-vp9/, 'VP9 must use the libvpx-vp9 encoder')
  // SVT-AV1 4.1 aborts 4K with "insufficient resources" at its default
  // parallelism, so the level of parallelism is pinned explicitly.
  assert.match(captureSource, /-svtav1-params', 'lp=/, 'SVT-AV1 parallelism must be pinned')
  // Every variant is down-scaled to a 1080p box, on whichever axis the
  // rendition's own orientation makes the short edge.
  assert.match(captureSource, /const webScale = rendition\.outputWidth >= rendition\.outputHeight \? '-2:1080' : '1080:-2'/)
  // Both encoder branches (webm and mp4) scale through the same expression, so
  // every rung is cut to 1080p whatever container it lands in. The count is per
  // branch, not per rung.
  const scales = captureSource.match(/scale=\$\{webScale\}/g) || []
  assert.equal(scales.length, 2, 'both the webm and mp4 encoder branches must apply the 1080p scale')
  const rungs = captureSource.match(/suffix: '\.[a-z0-9]+\.(mp4|webm)'/g) || []
  assert.equal(rungs.length, 3, 'the ladder must carry exactly three web rungs (AV1, VP9, H.264)')
  assert.match(captureSource, /libx264', '-preset', 'medium'/, 'the 4K master keeps a reproducible x264 encode')
})

test('the capture writes the canonical tree only and routes archival by publish', () => {
  // public/demo is the single committed source. frontend/web/public/demo is
  // derived build output owned by scripts/sync-demo-assets.mjs; writing it from
  // here is exactly what put a duplicate ~210MB video ladder in every clone and
  // made GitHub serve the same bytes twice.
  assert.doesNotMatch(captureSource, /frontendOutputDir|frontendDistDir/, 'no derived frontend path may exist here')
  assert.doesNotMatch(captureSource, /path\.join\(\s*root,\s*'frontend'/, 'the capture must not address the frontend tree')
  // Two write roots only: the served canonical tree and its archival subtree.
  assert.match(captureSource, /const archivalDir = path\.join\(outputDir, 'archival'\)/)
  assert.match(captureSource, /const servedDir = \(rendition\) => \(rendition\.publish \? outputDir : archivalDir\)/)
  assert.match(captureSource, /const masterPath = \(rendition\) => path\.join\(archivalDir/, 'every 4K master must land in archival')
  // Only the landscape cut is embedded by the UI, so only it is published; the
  // portrait cut stays archival instead of committing 37MB nothing requests.
  assert.deepEqual(RENDITIONS.filter((rendition) => rendition.publish).map((rendition) => rendition.id), ['desktop'])
})

test('a live capture never renders underneath the diagram art', () => {
  // The diagram panels and node labels are drawn on a full-bleed canvas. If it
  // kept painting while a screenshot was on screen, the art showed straight
  // through the capture image.
  assert.match(
    captureSource,
    /function drawSceneDiagram\(scene,t\)\{\s*\n\s*\/\/ The live capture is the point of the shot[\s\S]*?if\(shot && !shot\.hidden\) return;/,
    'the diagram must stand down whenever a capture is visible'
  )
  // The portrait capture frame shrink-wraps its image and sits between the copy
  // block and the caption band, instead of being a card floated at 44% across
  // the diagram or a fixed-height box that letterboxed the capture.
  assert.match(captureSource, /\.shot\{left:7%;right:7%;width:auto;top:41%;height:auto\}/)
  assert.match(captureSource, /\.shot img\{display:block;width:100%;max-width:100%;height:auto;max-height:37vh/)
  assert.doesNotMatch(captureSource, /\.shot\{left:7%;right:7%;width:auto;top:44%;max-height:30%\}/, 'the clipping portrait frame must be gone')
  assert.doesNotMatch(captureSource, /\.shot img\{width:100%;height:100%;object-fit:contain/, 'the letterboxed fixed-height frame must be gone')
})

test('jargon is spoken through a pronunciation alias, never as spelled glyphs', () => {
  // The narrator is a generic TTS engine: handed the raw caption it reads "E2E"
  // as "E two E" and spells a dotted filename out character by character, so the
  // audio contradicted the burned-in caption and the VTT cue. Each alias must
  // therefore appear in the SSML handed to SpeakSsml...
  assert.match(toSpeechSsml('OneShot E2E validates every request.'), /<sub alias="E to E">E2E<\/sub>/)
  assert.match(toSpeechSsml('A Next.js interface meets a service.'), /<sub alias="Next dot J S">Next\.js<\/sub>/)
  assert.match(
    toSpeechSsml('against a single request.schema.json at each boundary.'),
    /<sub alias="request dot schema dot J S O N">request\.schema\.json<\/sub>/,
  )
  // ...while the text a viewer reads is untouched. The alias changes what is
  // spoken, never what the caption or the VTT file says.
  assert.equal(SCENES.filter((scene) => scene.voice.includes('E2E')).length, 4)
  for (const scene of SCENES) {
    // Every E2E the narrator sees must sit inside a <sub> alias, so the engine
    // is told how to read it. A bare, unwrapped E2E is the glyph-spelling bug.
    const bare = toSpeechSsml(scene.voice).replace(/<sub alias="[^"]*">E2E<\/sub>/g, '')
    assert.ok(!bare.includes('E2E'), `scene ${scene.id} still hands a bare E2E to the narrator`)
  }
  // Every scene that displays the code still displays it spelled the way a
  // reader expects, and speaks it through the alias instead.
  for (const scene of SCENES.filter((entry) => entry.voice.includes('E2E'))) {
    assert.match(toSpeechSsml(scene.voice), /<sub alias="E to E">E2E<\/sub>/)
    assert.ok(!scene.voice.includes('E to E'), 'the caption itself must keep the E2E code, not the spoken form')
  }
  // Longest alias wins, so a dotted identifier is never half-substituted by a
  // shorter token nested inside it.
  const nested = toSpeechSsml('a single request.schema.json file')
  assert.equal((nested.match(/<sub /g) || []).length, 1)
  assert.ok(!nested.includes('request.schema.json.') || nested.includes('J S O N'))
  // A token with no alias is passed through verbatim, and the document is a
  // well-formed SSML envelope the engine will accept.
  assert.match(toSpeechSsml('Bearer-token guards.'), /^<speak version="1\.0" xmlns="http:\/\/www\.w3\.org\/2001\/10\/synthesis" xml:lang="en-US">Bearer-token guards\.<\/speak>$/)
  assert.ok(PRONUNCIATION_ALIASES.size > 0)
})

test('the narrator is driven with SSML, not a raw Speak call', () => {
  // Speak() discards markup and falls back to glyph-by-glyph reading, which is
  // the regression this whole alias table exists to prevent.
  assert.match(captureSource, /SpeakSsml\(\$cue\.ssml\)/)
  assert.doesNotMatch(captureSource, /\$synth\.Speak\(\$cue\./)
  assert.match(captureSource, /ssml: toSpeechSsml\(voice\)/, 'the cue file must carry SSML, not the display string')
})

test('the walkthrough demo shares the same pronunciation layer', () => {
  // capture-demo.mjs drives its own TTS (generateSynchronizedVoiceover), so it
  // does not inherit the architecture video's fix by proximity. It is a committed
  // asset in verify-demo-assets.mjs's expectedFiles, so a raw Speak() here is the
  // same latent bug: jargon reaches the narrator as bare glyphs.
  assert.match(captureDemoSource, /SpeakSsml\(/, 'the demo narrator must be driven with SSML')
  assert.doesNotMatch(captureDemoSource, /\$synth\.Speak\(/, 'a raw Speak() would spell jargon out letter by letter')
  // One shared table, so a term is aliased once and both videos agree on how it
  // is pronounced rather than drifting apart.
  assert.match(captureDemoSource, /import\('\.\/capture-architecture-video\.mjs'\)/)
  assert.match(captureDemoSource, /const toSpokenText = \(displayText\)/, 'the demo must route captions through the shared alias layer')
  // The caption a viewer reads is never rewritten.
  assert.match(captureDemoSource, /const displayText = \(c\.voice \|\| c\.text/)
})

test('no caption hands unaliased jargon to the narrator', () => {
  // The alias table is a maintenance surface: it only helps for terms someone
  // remembered to add. A generic TTS engine reads any mixed alphanumeric code
  // glyph by glyph -- "E2E" becomes "E two E" -- and any dotted identifier
  // character by character. Rather than trust a human to remember, this asserts
  // that every such token actually present in a caption is wrapped in an alias,
  // so new jargon cannot ship mispronounced.
  //
  // Matched deliberately:
  //   - a letter/digit mix inside one word (E2E, LLM, SDK, RPC, UX)
  //   - a dotted identifier (Next.js, request.schema.json)
  // A plain capitalized word or a spaced phrase ("Docker Compose") is left
  // alone: those are ordinary English to the engine and duration is not evidence
  // that they are mispronounced.
  const risky = /\b(?=[A-Za-z0-9.]*[A-Za-z])(?=[A-Za-z0-9.]*\d)[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)+\b|\b[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*\b|\b(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z]+[A-Z0-9]*[0-9][A-Za-z0-9]*\b/g
  const uncovered = []
  for (const scene of SCENES) {
    const spoken = toSpeechSsml(scene.voice).replace(/<sub alias="[^"]*">[^<]*<\/sub>/g, ' ')
    for (const token of new Set(scene.voice.match(risky) || [])) {
      if (spoken.includes(token)) uncovered.push(`${scene.id}: ${token}`)
    }
  }
  assert.deepEqual(uncovered, [], `add these to PRONUNCIATION_ALIASES or the narrator will spell them out: ${uncovered.join(', ')}`)

  // The detector must actually be capable of failing, or it guards nothing.
  assert.ok('E2E'.match(risky), 'the guard must flag an alphanumeric code')
  assert.ok('Next.js'.match(risky), 'the guard must flag a dotted identifier')
  assert.equal('Docker Compose'.match(risky), null, 'ordinary spaced words are not jargon')
  assert.equal('deterministic'.match(risky), null, 'plain lowercase words are not jargon')
})

test('architecture walkthrough has twelve exact 15-second scenes', () => {
  const timeline = storyboardTimeline()
  assert.equal(SCENES.length, 12)
  assert.equal(timeline[0].startMs, 0)
  assert.equal(timeline.at(-1).endMs, 180_000)
  timeline.forEach((scene, index) => {
    assert.equal(scene.startMs, index * 15_000)
    assert.equal(scene.endMs - scene.startMs, 15_000)
    assert.ok(scene.voice.length > 0)
  })
})

test('architecture video is portrait 4K', () => {
  assert.equal(VIDEO_WIDTH, 2160)
  assert.equal(VIDEO_HEIGHT, 3840)
})

test('recorder captures at the CSS layout size, never the 4K output size', () => {
  for (const rendition of RENDITIONS) {
    assert.notEqual(rendition.layoutWidth, rendition.outputWidth, `${rendition.id} must record at the layout size`)
    assert.notEqual(rendition.layoutHeight, rendition.outputHeight, `${rendition.id} must record at the layout size`)
    assert.equal(rendition.layoutWidth / rendition.layoutHeight, rendition.outputWidth / rendition.outputHeight, `${rendition.id} layout and output must share an aspect ratio so the upscale cannot distort`)
  }
  assert.equal(LAYOUT_WIDTH, 1080)
  assert.equal(LAYOUT_HEIGHT, 1920)
  assert.equal(VIDEO_WIDTH, 2160)
  assert.equal(VIDEO_HEIGHT, 3840)
})



test('walkthrough ships both renditions', () => {
  assert.equal(RENDITIONS.length, 2)
  const [mobile, desktop] = RENDITIONS
  assert.equal(mobile.id, 'mobile')
  assert.ok(mobile.layoutHeight > mobile.layoutWidth, 'mobile rendition must be portrait')
  assert.equal(desktop.id, 'desktop')
  assert.ok(desktop.layoutWidth > desktop.layoutHeight, 'desktop rendition must be landscape')
  assert.notEqual(mobile.basename, desktop.basename)
})

test('walkthrough claims stay qualified', () => {
  const narration = SCENES.map((scene) => scene.voice).join(' ').toLowerCase()
  assert.match(narration, /subprocess by default/)
  assert.match(narration, /optional http rpc/)
  assert.match(narration, /depends on configuration/)
  assert.doesNotMatch(narration, /completely secure|100% reproducible|absolute data integrity/)
})

test('WebVTT cues end at each measured narration duration', () => {
  const timeline = storyboardTimeline()
  const durations = SCENES.map(() => 4_250)
  const vtt = buildVtt(timeline, durations)
  assert.equal((vtt.match(/ --> /g) || []).length, 12)
  assert.ok(vtt.includes('00:00:00.000 --> 00:00:04.250'))
  assert.ok(vtt.includes('00:02:45.000 --> 00:02:49.250'))
  assert.ok(!vtt.includes('00:02:45.000 --> 00:03:00.000'))
  SCENES.forEach((scene) => assert.ok(vtt.includes(scene.voice)))
  assert.equal(toVttTimestamp(180_000), '00:03:00.000')
})

test('WebVTT generation rejects absent, zero, or overlong narration clips', () => {
  const timeline = storyboardTimeline()
  assert.throws(() => buildVtt(timeline, Array(12).fill(0)), /must fit within its 15-second window/)
  assert.throws(() => buildVtt(timeline, Array(11).fill(1000)), /must fit within its 15-second window/)
  assert.throws(() => buildVtt(timeline, [...Array(11).fill(1000), 15_001]), /must fit within its 15-second window/)
})

test('scene document composites a live capture frame without breaking layout', async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 2 })
  try {
    const shots = Object.fromEntries(SCENES.map((scene) => [scene.id, `data:image/png;base64,${scene.id}`]))
    await page.setContent(buildHtml(storyboardTimeline(), [], shots))
    await page.waitForTimeout(100)
    await page.evaluate(() => window.beginTimeline(Array(12).fill(4250)))
    await page.evaluate(() => window.setScene(8, Date.now()))
    const shot = await page.evaluate(() => ({
      present: !document.querySelector('#shot').hidden,
      caption: document.querySelector('#shot-cap').textContent,
      aboveCanvas: Number(getComputedStyle(document.querySelector('#shot')).zIndex) > 0,
      belowCaption: Number(getComputedStyle(document.querySelector('#shot')).zIndex) < Number(getComputedStyle(document.querySelector('#caption')).zIndex),
    }))
    assert.equal(shot.present, true)
    assert.match(shot.caption, /LIVE CAPTURE/)
    assert.equal(shot.aboveCanvas, true)
    assert.equal(shot.belowCaption, true)
  } finally {
    await browser.close()
  }
})

test('generated scene document initializes its browser animation controls', async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  try {
    await page.setContent(buildHtml(storyboardTimeline(), []))
    const controls = await page.evaluate(() => [typeof window.setVoiceDurations, typeof window.setScene, typeof window.beginTimeline])
    assert.deepEqual(controls, ['function', 'function', 'function'])
    const viewportLayout = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      shot: Boolean(document.querySelector('#shot')),
    }))
    assert.ok(viewportLayout.width > 0)
    assert.ok(viewportLayout.height > 0)
    assert.ok(viewportLayout.shot, 'scene document must include a live capture frame')
  } finally {
    await browser.close()
  }
})

