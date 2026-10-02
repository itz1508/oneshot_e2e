#!/usr/bin/env node

import { chromium } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const execFileAsync = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = path.join(root, 'public', 'demo')
// The demo payload has exactly one canonical tree -- public/demo -- and the
// capture script is the only thing that writes it. Two rules keep GitHub lean:
//   1. frontend/web/public/demo is derived build output produced by
//      scripts/sync-demo-assets.mjs at build/dev time and gitignored. The
//      capture script never writes there, so nothing is committed twice.
//   2. renditions with `publish: false`, plus every 4K H.264 master, land in
//      public/demo/archival (also gitignored). Browsers are served a 1080p
//      AV1/VP9/H.264 ladder instead of archival bytes.
const archivalDir = path.join(outputDir, 'archival')
const TOTAL_SECONDS = 180
const SCENE_SECONDS = 15

// Playwright's video recorder captures at CSS resolution and embeds that frame
// in `recordVideo.size` WITHOUT scaling. Recording at the 4K output size over a
// 1080x1920 page therefore produced a correctly-sized file whose top-left
// quadrant held the render and whose remaining three quarters were flat gray
// padding. Every rendition records at its own layout box and upscales in the
// ffmpeg mux step instead.
//
// Both renditions are produced from the same HTML because it has to read well
// on a phone and on a desktop monitor. The canvas diagrams are authored in a
// landscape 1920x1080 space, and drawSceneDiagram only applies its centring
// transform when H > W, so the landscape rendition is the native layout and the
// portrait one is the adapted one. The `@media (orientation:portrait)` block in
// buildHtml reflows the copy block, caption and footer for the tall frame.
export const RENDITIONS = [
  // `publish` decides whether a rendition lands in the served surface
  // (public/demo, committed) or only in the archival tree (public/demo/archival,
  // gitignored). The UI embeds the landscape cut only, so the portrait cut is
  // an on-demand social deliverable and its 4K + ladder bytes never enter the
  // commit surface -- see the byte budget in scripts/verify-demo-assets.mjs.
  { id: 'mobile', basename: 'oneshot-architecture', layoutWidth: 1080, layoutHeight: 1920, outputWidth: 2160, outputHeight: 3840, publish: false },
  { id: 'desktop', basename: 'oneshot-architecture-desktop', layoutWidth: 1920, layoutHeight: 1080, outputWidth: 3840, outputHeight: 2160, publish: true },
]

export const VIDEO_WIDTH = RENDITIONS[0].outputWidth
export const VIDEO_HEIGHT = RENDITIONS[0].outputHeight
export const LAYOUT_WIDTH = RENDITIONS[0].layoutWidth
export const LAYOUT_HEIGHT = RENDITIONS[0].layoutHeight
export const DESKTOP_VIDEO_WIDTH = RENDITIONS[1].outputWidth
export const DESKTOP_VIDEO_HEIGHT = RENDITIONS[1].outputHeight
export const DESKTOP_LAYOUT_WIDTH = RENDITIONS[1].layoutWidth
export const DESKTOP_LAYOUT_HEIGHT = RENDITIONS[1].layoutHeight

// Served vs archival. public/demo is the single committed, single served tree;
// public/demo/archival holds the 4K H.264 masters (and the unpublished portrait
// cut end to end). The archival tree is regenerable via
// `pnpm run capture:architecture-video`, which keeps ~150MB of masters out of
// every clone while the browser ladder stays committed.
const servedDir = (rendition) => (rendition.publish ? outputDir : archivalDir)
const masterPath = (rendition) => path.join(archivalDir, `${rendition.basename}.mp4`)
const captionsPath = (rendition) => path.join(servedDir(rendition), `${rendition.basename}.vtt`)

export const SCENE_SCREENSHOTS = {
  challenge: 'screen-1-loading.png',
  vision: 'screen-2-typing.png',
  topology: 'screen-8-backends.png',
  providers: 'screen-6-tools.png',
  contracts: 'screen-2c-tasks-empty.png',
  workflow: 'screen-4c-pipeline.png',
  security: 'screen-8-backends.png',
  artifacts: 'screen-4-interactive.png',
  e2e: 'screen-3-streaming.png',
  harness: 'screen-7-gates.png',
  delivery: 'screen-4e-near-complete.png',
  closing: 'screen-9-final.png',
}

export const SCENES = [
  {
    id: 'challenge',
    title: 'Beyond prompt chaining',
    kicker: '01 / MARKET PRACTICE',
    subtitle: 'Market practice leans on naive prompt chaining. OneShot E2E establishes deterministic runtime guarantees over non-deterministic LLM output through a hardened, verifiable polyglot architecture.',
    voice: 'Market practice leans on naive prompt chaining. OneShot E2E establishes deterministic runtime guarantees over non-deterministic LLM output through a hardened, verifiable polyglot architecture.',
    kind: 'contrast',
    tags: ['PROMPT CHAINS', 'BOUNDARIES', 'PROOF'],
  },
  {
    id: 'vision',
    title: 'A governed system, end to end',
    kicker: '02 / CORE VISION',
    subtitle: 'OneShot connects agent workflows with backend reasoning, contract validation, reproducible fixtures, and automated verification.',
    voice: 'OneShot connects agent workflows with backend reasoning, contract validation, reproducible fixtures, and automated verification.',
    kind: 'vision',
    tags: ['FRONTEND', 'BACKEND API', 'PYTHON RUNTIME', 'TEST HARNESS'],
  },
  {
    id: 'topology',
    title: 'Polyglot by construction',
    kicker: '03 / POLYGLOT RUNTIME',
    subtitle: 'A Next.js interface meets a TypeScript Node service and a Python 3.12 reasoning runtime, invoked as a subprocess by default or over optional HTTP RPC.',
    voice: 'A Next.js interface meets a TypeScript Node service and a Python 3.12 reasoning runtime. Python runs as a subprocess by default, with optional HTTP RPC.',
    kind: 'topology',
    tags: ['NEXT.JS', 'NODE.JS / TYPESCRIPT', 'PYTHON 3.12'],
  },
  {
    id: 'providers',
    title: 'Six integrations, one chain',
    kicker: '04 / PROVIDER INTEGRATIONS',
    subtitle: 'Six integrations: OpenAI, Gemini, Mistral, Nebius, and Ollama, plus Tavily search and Strands, behind a failover chain ordered by config.',
    voice: 'Six integrations: OpenAI, Google Gemini, Mistral, Nebius, and Ollama, plus Tavily search and the Strands SDK, behind a failover chain ordered by config.',
    kind: 'providers',
    tags: ['6 INTEGRATIONS', 'FAILOVER CHAIN'],
  },
  {
    id: 'contracts',
    title: 'One schema, two runtimes',
    kicker: '05 / CONTRACTS & SCHEMAS',
    subtitle: 'Market practice passes unvalidated payloads between gateways and reasoning engines. OneShot E2E validates every request against a single request.schema.json at each runtime boundary.',
    voice: 'Market practice passes unvalidated payloads between gateways and reasoning engines. OneShot E2E validates every request against a single request.schema.json at each runtime boundary.',
    kind: 'contrast',
    tags: ['JSON SCHEMA', 'PYDANTIC', 'BOUNDARY VALIDATION'],
  },
  {
    id: 'workflow',
    title: 'Orchestrate observable steps',
    kicker: '06 / WORKFLOW NODES',
    subtitle: 'The workflow runtime composes explicit phases, gates, and pre- and post-execution hooks, recording lifecycle events and structured failures.',
    voice: 'The workflow runtime composes explicit phases, gates, and pre- and post-execution hooks. It records lifecycle events and structured failures.',
    kind: 'workflow',
    tags: ['VALIDATE', 'EXECUTE', 'HOOKS', 'GATE', 'ARTIFACT'],
  },
  {
    id: 'security',
    title: 'Defense in depth, by configuration',
    kicker: '07 / SECURITY & GOVERNANCE',
    subtitle: 'Bearer-token guards, per-client and per-session rate limits, and configurable security headers strengthen request boundaries; secure deployment still depends on configuration.',
    voice: 'Bearer-token guards, per-client and per-session rate limits, and configurable security headers strengthen request boundaries. Secure deployment still depends on configuration.',
    kind: 'security',
    tags: ['AUTH GUARD', 'RATE LIMITER', 'SECURITY HEADERS'],
  },
  {
    id: 'artifacts',
    title: 'Confine every tool call',
    kicker: '08 / SANDBOX',
    subtitle: 'Market practice runs agent tool execution in monolithic runtimes. OneShot E2E confines work to four virtual partitions with virtual-mode enforcement and blocked path traversal.',
    voice: 'Market practice runs agent tool execution in monolithic runtimes. OneShot E2E confines work to four virtual partitions with virtual-mode enforcement and blocked path traversal.',
    kind: 'contrast',
    tags: ['4 PARTITIONS', 'PATH TRAVERSAL BLOCKED', 'VIRTUAL MODE'],
  },
  {
    id: 'e2e',
    title: 'Verify the experience in a browser',
    kicker: '09 / PLAYWRIGHT E2E',
    subtitle: 'Playwright end-to-end coverage exercises browser workflows. UX and network audits inspect real application states and request boundaries.',
    voice: 'Playwright end-to-end coverage exercises browser workflows. UX and network audits inspect real application states and request boundaries.',
    kind: 'e2e',
    tags: ['CHROMIUM', 'USER FLOWS', 'LAYOUT', 'NETWORK GUARDS'],
  },
  {
    id: 'harness',
    title: 'Gate the release, not the vibe',
    kicker: '10 / VERIFICATION HARNESS',
    subtitle: 'A seven-stage harness runs before every release, pairing backend and contract tests with Playwright audits that assert real layout geometry at four viewports.',
    voice: 'A seven-stage harness runs before every release, pairing backend and contract tests with Playwright audits that assert real layout geometry at four viewports.',
    kind: 'harness',
    tags: ['7 STAGES', 'CONTRACTS', 'LAYOUT GEOMETRY'],
  },
  {
    id: 'delivery',
    title: 'Package, verify, deliver',
    kicker: '11 / CONTAINERS & CI',
    subtitle: 'Docker Compose runs the app and can enable an optional Ollama sidecar. GitHub Actions verifies builds and deploys the static frontend to Pages from main.',
    voice: 'Docker Compose runs the app and can enable an optional Ollama sidecar. GitHub Actions verifies builds and deploys the static frontend to Pages from main.',
    kind: 'delivery',
    tags: ['DOCKER COMPOSE', 'OPTIONAL OLLAMA', 'GITHUB ACTIONS', 'PAGES'],
  },
  {
    id: 'closing',
    title: 'Build with proof, from day one',
    kicker: '12 / ONESHOT E2E',
    subtitle: 'Deterministic boundaries. Governed workflows. Verifiable outcomes. Clone OneShot, install with the frozen lockfile, then run the project launcher.',
    voice: 'OneShot E2E: deterministic boundaries, governed workflows, and verifiable outcomes. Clone the repository, install with the frozen lockfile, and run the project launcher.',
    kind: 'closing',
    tags: ['pnpm install --frozen-lockfile', 'pnpm run oneshot'],
  },
]

export function storyboardTimeline(scenes = SCENES) {
  if (scenes.length !== 12) throw new Error(`Expected 12 scenes, received ${scenes.length}`)
  return scenes.map((scene, index) => ({
    ...scene,
    startMs: index * SCENE_SECONDS * 1000,
    endMs: (index + 1) * SCENE_SECONDS * 1000,
  }))
}

export function toVttTimestamp(milliseconds) {
  const ms = Math.max(0, Math.round(milliseconds))
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  const remainder = ms % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(remainder).padStart(3, '0')}`
}

// The caption text is written for the eye, but the narrator is a general-purpose
// TTS engine with no vocabulary for this project's jargon. It reads an
// alphanumeric code by its individual glyphs -- "E2E" comes out as "E two E" --
// and spells a dotted identifier out character by character, so the spoken
// track disagreed with the on-screen caption and with the WebVTT file.
//
// These aliases are applied in SSML at synthesis time ONLY. `scene.voice` stays
// the single source of truth for the burned-in caption, the VTT cue text and
// the tests, so the three can never drift apart: the alias changes what the
// narrator pronounces, not what the viewer reads.
export const PRONUNCIATION_ALIASES = new Map([
  ['E2E', 'E to E'],
  ['Next.js', 'Next dot J S'],
  ['request.schema.json', 'request dot schema dot J S O N'],
])

const escapeXml = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Render a caption's display text as SSML the narrator reads correctly.
 * Longest alias first so a dotted identifier wins over any shorter token that
 * happens to sit inside it.
 */
export function toSpeechSsml(displayText) {
  const escaped = escapeXml(displayText)
  const spoken = [...PRONUNCIATION_ALIASES.entries()]
    .sort(([a], [b]) => b.length - a.length)
    .reduce(
      (text, [token, alias]) => text.replace(
        new RegExp(`\\b${escapeRegExp(escapeXml(token))}\\b`, 'g'),
        `<sub alias="${escapeXml(alias)}">${escapeXml(token)}</sub>`,
      ),
      escaped,
    )
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">${spoken}</speak>`
}

export function buildVtt(timeline, spokenDurationsMs) {
  const cues = timeline.map((scene, index) => {
    const spokenDuration = spokenDurationsMs[index]
    if (!Number.isFinite(spokenDuration) || spokenDuration <= 0 || spokenDuration > SCENE_SECONDS * 1000) {
      throw new Error(`Narration for scene ${index + 1} must fit within its 15-second window`)
    }
    return `${index + 1}\n${toVttTimestamp(scene.startMs)} --> ${toVttTimestamp(scene.startMs + spokenDuration)}\n${scene.voice}`
  })
  return `WEBVTT\n\n${cues.join('\n\n')}\n`
}

export function buildHtml(scenes, verificationLines, screenshots = {}) {
  const safeData = JSON.stringify({ scenes, verificationLines, screenshots }).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inside OneShot E2E</title>
<style>
  :root{color-scheme:dark;font-family:"Bahnschrift","Segoe UI Variable Display","Segoe UI",sans-serif;background:#070a12;color:#f5f7ff}
  *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#070a12}
  body{position:relative}.stage{position:absolute;inset:0;background:radial-gradient(ellipse at 76% 50%,#13223a 0%,#0a1020 35%,#070a12 76%)}
  canvas{position:absolute;inset:0;width:100%;height:100%}
  .grain{position:absolute;inset:0;opacity:.14;pointer-events:none;background-image:linear-gradient(rgba(7,10,18,.02) 50%,rgba(0,0,0,.12) 50%);background-size:100% 4px}
  .top{position:absolute;left:6.25%;right:6.25%;top:5.2%;display:flex;align-items:center;justify-content:space-between}
  .brand{display:flex;align-items:center;gap:14px;font:700 15px/1 "Cascadia Code",Consolas,monospace;letter-spacing:.12em;color:#dce9ff}
  .mark{width:34px;height:34px;border:1px solid #55e8f5;border-radius:9px;display:grid;place-items:center;color:#55e8f5;box-shadow:0 0 28px #17d9e644;font:700 19px/1 "Cascadia Code",monospace}
  .top-meta{font:600 12px/1 "Cascadia Code",Consolas,monospace;letter-spacing:.08em;color:#8596b7}
  .copy{position:absolute;left:6.25%;top:22%;width:42%;z-index:2}
  .kicker{font:700 13px/1 "Cascadia Code",Consolas,monospace;letter-spacing:.14em;color:#54e7f2}
  h1{font-size:58px;line-height:1.04;font-weight:650;letter-spacing:0;margin:22px 0 20px;max-width:820px;text-wrap:balance;text-shadow:0 4px 42px #0008}
  .subtitle{font-size:21px;line-height:1.5;color:#b3c1d9;max-width:690px;margin:0}
  .tags{display:flex;flex-wrap:wrap;gap:9px;margin-top:30px;max-width:720px}
  .tag{padding:9px 12px;border:1px solid #293d59;background:#0c1626c9;color:#b7d9ed;border-radius:4px;font:600 11px/1 "Cascadia Code",Consolas,monospace;letter-spacing:.035em}
  .caption{position:absolute;left:15%;right:15%;bottom:9.1%;text-align:center;color:#fff;font-size:20px;font-weight:550;line-height:1.38;text-shadow:0 2px 12px #000,0 0 3px #000;padding:0 20px;opacity:0;transition:opacity .2s;z-index:5}
  .shot{position:absolute;right:6.25%;top:27%;width:39%;border-radius:14px;overflow:hidden;border:1px solid rgba(96,165,250,.35);box-shadow:0 24px 60px rgba(0,0,0,.5);background:#0b1220;z-index:2}
  .shot img{display:block;width:100%;max-width:100%;height:auto;margin:0 auto;object-fit:contain}
  .shot figcaption{position:absolute;left:12px;bottom:10px;font:700 13px/1 "Cascadia Code",Consolas,monospace;letter-spacing:.12em;color:#e2e8f0;background:rgba(2,6,23,.74);border:1px solid rgba(148,163,184,.4);padding:7px 12px;border-radius:999px}
  .caption.on{opacity:1}.footer{position:absolute;left:6.25%;right:6.25%;bottom:4.4%;display:flex;align-items:center;gap:16px;color:#8596b7;font:600 11px/1 "Cascadia Code",Consolas,monospace;z-index:3}
  .progress{display:flex;gap:5px;flex:1}.progress i{height:3px;flex:1;background:#263248}.progress i.on{background:#55e8f5;box-shadow:0 0 12px #55e8f5aa}.clock{min-width:98px;text-align:right}
  .title-card{position:absolute;inset:0;display:none;align-items:center;justify-content:center;text-align:center;background:linear-gradient(115deg,#080b14f7,#080b14f2 48%,#10142bf7);z-index:4}
  .title-card.on{display:flex}.title-card div{max-width:1280px;padding:55px}.title-card small{font:700 15px/1 "Cascadia Code",monospace;letter-spacing:.22em;color:#55e8f5}.title-card h2{font-size:70px;line-height:1.05;letter-spacing:0;margin:28px 0 0;font-weight:700}.title-card b{color:#a38aff}
  @media (orientation:portrait){
    .top{left:7%;right:7%;top:3.2%}.brand{font-size:14px}.top-meta{font-size:10px}
    .copy{left:7%;top:9%;width:86%}.kicker{font-size:12px}h1{font-size:54px;line-height:1.04;margin:18px 0 16px;max-width:none}
    .subtitle{font-size:21px;line-height:1.4;max-width:none}.tags{gap:7px;margin-top:18px}.tag{font-size:10px;padding:8px 9px}
    .caption{left:7%;right:7%;bottom:8.1%;font-size:18px;line-height:1.35;padding:0 10px}
    .footer{left:7%;right:7%;bottom:3.2%;gap:10px;font-size:9px}.clock{min-width:88px}
    /* In portrait the live capture becomes the hero of the lower half rather than
       a card laid over the diagram: the diagram art occupies y:[665,1395] of the
       1920 frame, so a card floated at 44% cut straight through it. The diagram
       is suppressed for shot scenes (see drawSceneDiagram) so nothing is clipped.
       The frame shrink-wraps its image -- both constraints are expressed on the
       img so a portrait capture and a landscape capture both hug the border
       instead of leaving a letterboxed gap inside a fixed-height box. */
    .shot{left:7%;right:7%;width:auto;top:41%;height:auto}
    .shot img{display:block;width:100%;max-width:100%;height:auto;max-height:37vh;margin:0 auto;object-fit:contain}
    .title-card{background:linear-gradient(180deg,#070a12fa,#070a12f2 50%,#070a12fa)}.title-card div{max-width:none;padding:0 9%}.title-card small{font-size:12px}.title-card h2{font-size:46px;line-height:1.1;margin-top:20px}
  }
</style></head><body><div class="stage"><canvas id="art"></canvas></div><div class="grain"></div>
<figure class="shot" id="shot" hidden><img id="shot-img" alt="Live OneShot console capture"/><figcaption id="shot-cap">LIVE CAPTURE</figcaption></figure>
<div class="top"><div class="brand"><span class="mark">O</span> ONESHOT <span style="color:#536581">/</span> E2E</div><div class="top-meta">ARCHITECTURE WALKTHROUGH&nbsp; · &nbsp;4K</div></div>
<main class="copy"><div id="kicker" class="kicker"></div><h1 id="title"></h1><p id="subtitle" class="subtitle"></p><div id="tags" class="tags"></div></main>
<div id="caption" class="caption"></div><div class="footer"><span>INSIDE ONESHOT</span><div id="progress" class="progress"></div><span id="clock" class="clock">00:00 / 03:00</span></div>
<div id="title-card" class="title-card"><div><small>GOVERNED AGENTIC SYSTEMS</small><h2>Inside OneShot E2E:<br><b>Automated Agentic Orchestration<br>&amp; Verification</b></h2></div></div>
<script>
const DATA=${safeData};
const canvas=document.getElementById('art'),ctx=canvas.getContext('2d');
const title=document.getElementById('title'),kicker=document.getElementById('kicker'),subtitle=document.getElementById('subtitle'),tags=document.getElementById('tags'),caption=document.getElementById('caption'),clock=document.getElementById('clock'),progress=document.getElementById('progress'),titleCard=document.getElementById('title-card');
const W=innerWidth,H=innerHeight,scenes=DATA.scenes,verify=DATA.verificationLines;
window.__shots = DATA.screenshots || {};
let active=0,startAt=Date.now(),sceneStart=startAt,sceneElapsed=0,voiceMs=[],raf=0;
progress.innerHTML=scenes.map((_,i)=>'<i data-i="'+i+'"></i>').join('');
function resize(){const d=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(innerWidth*d);canvas.height=Math.round(innerHeight*d);ctx.setTransform(d,0,0,d,0,0)}
window.addEventListener('resize',resize);resize();
window.setVoiceDurations=(durations)=>{voiceMs=durations};
function hex(x,y,r,color,alpha=1){ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=1.4;ctx.beginPath();for(let i=0;i<6;i++){let a=Math.PI/3*i-Math.PI/6;let px=x+r*Math.cos(a),py=y+r*Math.sin(a);i?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.closePath();ctx.stroke();ctx.restore()}
function glowLine(x1,y1,x2,y2,color,t,phase=0){const p=(t*.28+phase)%1;ctx.save();ctx.strokeStyle=color;ctx.globalAlpha=.22;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();const x=x1+(x2-x1)*p,y=y1+(y2-y1)*p;ctx.globalAlpha=.95;ctx.shadowColor=color;ctx.shadowBlur=18;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();ctx.restore()}
function panel(x,y,w,h,label,accent='#55e8f5'){ctx.save();ctx.fillStyle='#0b1322e8';ctx.strokeStyle='#24344c';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x,y,w,h,9);ctx.fill();ctx.stroke();ctx.fillStyle=accent;ctx.font='600 12px Cascadia Code,Consolas,monospace';ctx.fillText(label.toUpperCase(),x+18,y+25);ctx.restore()}
function node(x,y,label,accent='#55e8f5',w=168,h=70){ctx.save();ctx.shadowColor=accent;ctx.shadowBlur=16;ctx.fillStyle='#0b1525';ctx.strokeStyle=accent;ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(x-w/2,y-h/2,w,h,8);ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle='#e5f2ff';ctx.font='600 15px Cascadia Code,Consolas,monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,x,y);ctx.restore()}
function isoBlock(x,y,label,color,delay,index){const phase=Math.max(0,Math.min(1,(sceneElapsed-delay)*1.15)),ease=1-Math.pow(1-phase,3),cx=x+(1-ease)*(index%2?260:-260),cy=y-(1-ease)*100,w=184,h=82,d=32;ctx.save();ctx.shadowColor=color;ctx.shadowBlur=25*ease;ctx.lineWidth=2;ctx.strokeStyle=color;ctx.fillStyle='#17263beF';ctx.beginPath();ctx.moveTo(cx,cy-d);ctx.lineTo(cx+w/2,cy-d/2);ctx.lineTo(cx,cy);ctx.lineTo(cx-w/2,cy-d/2);ctx.closePath();ctx.fill();ctx.stroke();ctx.shadowBlur=10*ease;ctx.fillStyle='#101a2c';ctx.beginPath();ctx.moveTo(cx-w/2,cy-d/2);ctx.lineTo(cx,cy);ctx.lineTo(cx,cy+h);ctx.lineTo(cx-w/2,cy+h-d/2);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#0c1728';ctx.beginPath();ctx.moveTo(cx+w/2,cy-d/2);ctx.lineTo(cx,cy);ctx.lineTo(cx,cy+h);ctx.lineTo(cx+w/2,cy+h-d/2);ctx.closePath();ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle='#e5f2ff';ctx.font='600 13px Cascadia Code,Consolas,monospace';ctx.textAlign='center';ctx.fillText(label,cx,cy+h/2-8);ctx.restore()}
function pulseDot(x,y,t,color='#55e8f5'){ctx.save();const r=4+2*Math.sin(t*2+x);ctx.globalAlpha=.7+.3*Math.sin(t*2+y);ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=16;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.restore()}
function drawBackground(t){ctx.clearRect(0,0,W,H);const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#080c16');g.addColorStop(.52,'#0b1424');g.addColorStop(1,'#090b17');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.save();ctx.strokeStyle='#78a7d20c';ctx.lineWidth=1;for(let x=0;x<W;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}for(let y=0;y<H;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}ctx.restore();const radius=Math.min(W,H)*.62,cx=W*.69,cy=H*.5;const rg=ctx.createRadialGradient(cx,cy,10,cx,cy,radius);rg.addColorStop(0,'#25c9df19');rg.addColorStop(.5,'#6454d90d');rg.addColorStop(1,'#0000');ctx.fillStyle=rg;ctx.fillRect(0,0,W,H);for(let i=0;i<52;i++){const x=(i*197+Math.sin(t*.18+i)*38)%W,y=(i*131+Math.cos(t*.13+i)*22)%H;pulseDot(x,y,t,'#5be5f344')}}
function drawCircuit(t){ctx.save();ctx.globalAlpha=.4;for(let i=0;i<8;i++){const y=200+i*87,x0=930+(i%3)*80,x1=1790-(i%4)*35;ctx.strokeStyle=i%2?'#9578ff':'#55e8f5';ctx.beginPath();ctx.moveTo(x0,y);ctx.bezierCurveTo(x0+160,y+Math.sin(t+i)*24,x1-130,y-20,x1,y+((i%3)-1)*25);ctx.stroke();pulseDot(x0+((t*70+i*83)%(x1-x0)),y+Math.sin(t+i)*10,t,i%2?'#a38aff':'#55e8f5')}ctx.restore()}
function drawDiagram(scene,t){const x=890,cy=525;
  if(scene.kind==='challenge'){drawCircuit(t);for(let i=0;i<7;i++){const a=i*Math.PI*2/7+t*.12,px=1390+Math.cos(a)*270,py=520+Math.sin(a)*225;glowLine(1390,520,px,py,'#55e8f5',t,i*.13);hex(px,py,36,'#55e8f5',.9)}node(1390,520,'PROMPT','#a38aff',186,78);}
  if(scene.kind==='vision'){const labels=['FRONTEND','BACKEND API','PYTHON REASONING','AUTOMATED TESTS'];const colors=['#55e8f5','#a38aff','#55e8f5','#a38aff'];const pos=[[1130,310],[1640,370],[1130,650],[1640,710]];pos.forEach((p,i)=>{glowLine(1390,505,p[0],p[1],colors[i],t,i*.2);isoBlock(p[0],p[1],labels[i],colors[i],i*.45,i)});node(1390,490,'ONESHOT','#fff',190,82)}
  if(scene.kind==='topology'){const pos=[[1050,450],[1380,450],[1710,450]];['NEXT.JS UI','NODE / TS API','PYTHON RUNTIME'].forEach((l,i)=>node(pos[i][0],pos[i][1],l,i===1?'#a38aff':'#55e8f5',230,86));glowLine(1165,450,1265,450,'#55e8f5',t);glowLine(1495,450,1595,450,'#a38aff',t,.3);panel(1225,585,310,92,'JSON over stdin / HTTP','#9db5d8');node(1380,760,'REASONING ENGINE','#a38aff',248,72)}
  if(scene.kind==='providers'){node(1390,690,'ORCHESTRATION','#fff',240,80);const pos=[[1080,250],[1390,250],[1700,250],[1080,480],[1390,480],[1700,480]];['OPENAI','GEMINI','MISTRAL','NEBIUS','OLLAMA','TAVILY'].forEach((l,i)=>{glowLine(1390,650,pos[i][0],pos[i][1],i%2?'#a38aff':'#55e8f5',t,i*.12);node(pos[i][0],pos[i][1],l,i%2?'#a38aff':'#55e8f5',196,66)});node(1390,880,'STRANDS SDK','#a38aff',230,64)}
  if(scene.kind==='contrast'){drawCircuit(t);const bx=[[1000,505],[1690,505]];bx.forEach((b,i)=>{hex(b[0],b[1],132,i?'#55e8f5':'#ff5f78',i?.5:.28);hex(b[0],b[1],104,i?'#55e8f5':'#ff5f78',i?.85:.4)});node(1000,505,'MARKET','#ff5f78',168,74);node(1690,505,'ONESHOT','#55e8f5',168,74);ctx.textAlign='center';ctx.font='600 19px Cascadia Code,monospace';ctx.fillStyle='#ff5f78';ctx.fillText('PROMPT',1000,640);ctx.fillStyle='#55e8f5';ctx.fillText('VALIDATED',1690,640);glowLine(1084,505,1606,505,'#55e8f5',t,0)}
  if(scene.kind==='workflow'){const pts=[[1030,340],[1270,340],[1510,340],[1750,340],[1270,650],[1630,650]];const labels=['INPUT','VALIDATE','EXECUTE','HOOKS','GATE','ARTIFACT'];[[0,1],[1,2],[2,3],[2,4],[4,5],[3,5]].forEach(([a,b],i)=>glowLine(pts[a][0],pts[a][1],pts[b][0],pts[b][1],i%2?'#a38aff':'#55e8f5',t,i*.1));pts.forEach((p,i)=>node(p[0],p[1],labels[i],i%2?'#a38aff':'#55e8f5',165,72))}
  if(scene.kind==='security'){const labs=['AUTH GUARD','RATE LIMIT','HEADERS'];const pos=[[1080,390],[1390,600],[1690,390]];labs.forEach((l,i)=>{const [px,py]=pos[i];hex(px,py,104,i===1?'#a38aff':'#55e8f5',.85);hex(px,py,78,i===1?'#a38aff':'#55e8f5',.45);node(px,py,l,i===1?'#a38aff':'#55e8f5',180,70)});for(let i=0;i<16;i++){const py=280+i*31;ctx.fillStyle=i%3===0?'#ff5f78':'#55e8f5';ctx.globalAlpha=.45;ctx.fillRect(925+((i*71)%730),py,8,2)}ctx.globalAlpha=1}
  if(scene.kind==='artifacts'){const y=500,steps=[['FIXTURE',980],['DRY RUN',1190],['OUTPUT',1400],['VERIFY',1640]];ctx.strokeStyle='#31435d';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(steps[0][1],y);ctx.lineTo(steps[3][1],y);ctx.stroke();steps.forEach(([l,x],i)=>{pulseDot(x,y,t,i%2?'#a38aff':'#55e8f5');node(x,y,l,i%2?'#a38aff':'#55e8f5',170,70);panel(x-78,605,156,95,i===0?'FIXTURES':i===1?'INPUT':i===2?'RUN ID':'HASH',i%2?'#a38aff':'#55e8f5')})}
  if(scene.kind==='e2e'){for(let i=0;i<3;i++){const x=1000+i*295,y=350+(i%2)*72;panel(x,y,250,330,'CHROMIUM / '+(i+1),i===1?'#a38aff':'#55e8f5');ctx.strokeStyle='#3e5878';ctx.strokeRect(x+18,y+50,214,170);ctx.fillStyle='#14253a';ctx.fillRect(x+19,y+51,212,168);ctx.fillStyle='#75e7f0';ctx.fillRect(x+35,y+72,95,7);ctx.fillRect(x+35,y+98,160,5);ctx.fillRect(x+35,y+120,145,5);ctx.fillStyle=i===1?'#9b83ff':'#55e8f5';ctx.beginPath();ctx.arc(x+203,y+285,10+3*Math.sin(t*4+i),0,Math.PI*2);ctx.fill()}glowLine(1000,760,1650,760,'#55e8f5',t,.1)}
  if(scene.kind==='harness'){panel(920,235,900,590,'LIVE VERIFICATION OUTPUT','#55e8f5');ctx.save();ctx.beginPath();ctx.rect(940,275,860,510);ctx.clip();ctx.font='14px Cascadia Code,Consolas,monospace';verify.slice(-19).forEach((line,i)=>{ctx.fillStyle=/fail|error|failed/i.test(line)?'#ff788e':/^\\s*\\[|pass|ok/i.test(line)?'#73e8bd':'#c5d1e4';ctx.fillText(line.slice(0,103),950,305+i*25)});ctx.restore();node(1630,875,'OUTPUT CAPTURED','#73e8bd',220,54)}
  if(scene.kind==='delivery'){panel(950,265,360,440,'docker compose','#55e8f5');node(1130,400,'APP CONTAINER','#55e8f5',235,75);node(1130,570,'OPTIONAL OLLAMA','#a38aff',235,75);glowLine(1130,445,1130,525,'#a38aff',t,.2);panel(1450,265,370,440,'GITHUB ACTIONS','#a38aff');['VERIFY','BUILD WEB','DEPLOY PAGES'].forEach((l,i)=>{node(1635,365+i*155,l,i===2?'#73e8bd':'#a38aff',225,70);if(i<2)glowLine(1635,405+i*155,1635,480+i*155,'#73e8bd',t,i*.15)})}
  if(scene.kind==='closing'){drawCircuit(t);node(1390,425,'ONESHOT E2E','#fff',280,100);panel(1110,600,560,150,'pnpm run oneshot','#55e8f5');ctx.fillStyle='#a38aff';ctx.font='700 16px Cascadia Code,monospace';ctx.fillText('DETERMINISTIC  ·  GOVERNED  ·  VERIFIABLE',1140,805)}
}
const shot=document.getElementById("shot");const shotImg=document.getElementById("shot-img");const shotCap=document.getElementById("shot-cap");let shotKey="";
function setScene(index,at){active=index;sceneStart=at;const s=scenes[index];kicker.textContent=s.kicker;title.textContent=s.title;subtitle.textContent=s.subtitle;tags.innerHTML=s.tags.map((x,i)=>'<span class="tag" style="border-color:'+(i%2?'#574c8b':'#285a66')+'">'+x+'</span>').join('');document.querySelectorAll('.progress i').forEach((el,i)=>el.classList.toggle('on',i<=index));caption.textContent=s.voice;const shotSrc=(window.__shots&&window.__shots[s.id])||"";if(shot && shotImg && shotSrc){if(shotKey!==s.id){shotKey=s.id;shotImg.setAttribute("src",shotSrc);}shot.hidden=false;shot.removeAttribute("hidden");shotCap.textContent="LIVE CAPTURE - "+s.kicker.split(" / ")[1];const ken=1.02+0.035*Math.min(1,Math.max(0,sceneElapsed/15));shotImg.style.transform="scale("+ken.toFixed(3)+")";}else{shot.hidden=true;shotKey="";}
caption.classList.toggle('on',Boolean(voiceMs[index]));}
window.setScene=setScene;
// Portrait adaptation. The diagram art is authored in a 1920x1080 landscape space
// whose real content bounds are x:[920,1825] y:[200,902] (centre 1372,551). The
// portrait transform must anchor on that CONTENT CENTRE, not on the top-left of
// the native space: anchoring at y=250 slid the art down to y:[925,1612] and left
// a ~550px empty band under the copy block. Anchoring on the centre and scaling to
// 1.04 fills x:[70,1011] y:[665,1395] of the 1080x1920 frame, keeping the diagram
// clear of the copy (ends ~y=380) and the caption band (starts ~y=1700).
function drawSceneDiagram(scene,t){
  // The live capture is the point of the shot, so the animated diagram stands
  // down for any scene that carries a screenshot. Leaving it running would
  // render panel art and node labels straight through the capture image.
  if(shot && !shot.hidden) return;
  if(H>W){ctx.save();ctx.translate(W/2,1030);ctx.scale(1.04,1.04);ctx.translate(-1372,-551);drawDiagram(scene,t);ctx.restore()}else drawDiagram(scene,t)
}
function draw(){const now=Date.now();if(shot&&!shot.hidden&&shotImg&&shotImg.style){const ken=1.02+0.035*Math.min(1,Math.max(0,sceneElapsed/15));shotImg.style.transform="scale("+ken.toFixed(3)+")";}const t=(now-startAt)/1000;sceneElapsed=(now-sceneStart)/1000;drawBackground(t);drawSceneDiagram(scenes[active],t);const sec=Math.min(180,Math.max(0,Math.floor(t)));clock.textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')+' / 03:00';titleCard.classList.toggle('on',active===0&&sceneElapsed<3.6);if(voiceMs[active]&&sceneElapsed*1000>voiceMs[active]+400)caption.classList.remove('on');else if(voiceMs[active])caption.classList.add('on');raf=requestAnimationFrame(draw)}
setScene(0,startAt);window.beginTimeline=(durations)=>{voiceMs=durations;startAt=Date.now();sceneStart=startAt;setScene(0,startAt);cancelAnimationFrame(raf);draw()};window.beginTimeline(voiceMs);
</script></body></html>`
}

async function run(command, args, options = {}) {
  try {
    return await execFileAsync(command, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...options })
  } catch (error) {
    const failure = new Error(`${command} ${args[0] ?? ''} failed: ${error.stderr || error.message}`)
    failure.stdout = error.stdout
    failure.stderr = error.stderr
    throw failure
  }
}

async function ffprobeDuration(filePath) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath])
  const value = Number.parseFloat(stdout.trim())
  if (!Number.isFinite(value)) throw new Error(`Could not read media duration: ${filePath}`)
  return value
}

function quotePowerShell(value) {
  return `'${value.replaceAll("'", "''")}'`
}

async function synthesizeVoice(timeline, tempDir) {
  const cuesPath = path.join(tempDir, 'voice-cues.json')
  const scriptPath = path.join(tempDir, 'synthesize.ps1')
  const clips = timeline.map((_, index) => path.join(tempDir, `voice-${String(index + 1).padStart(2, '0')}.wav`))
  await fs.writeFile(cuesPath, JSON.stringify(timeline.map(({ voice }) => ({ ssml: toSpeechSsml(voice) }))), 'utf8')
  const lines = [
    'Add-Type -AssemblyName System.Speech',
    `$cues = Get-Content -Raw -LiteralPath ${quotePowerShell(cuesPath)} | ConvertFrom-Json`,
    '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    '$synth.Rate = 1',
    '$voices = $synth.GetInstalledVoices() | Where-Object { $_.Enabled }',
    'if (-not $voices) { throw "No enabled Windows speech voices are installed." }',
    'foreach ($cue in $cues) {',
    '  $index = [array]::IndexOf($cues, $cue)',
    `  $target = @(${clips.map(quotePowerShell).join(', ')})[$index]`,
    '  $synth.SetOutputToWaveFile($target)',
    // SpeakSsml, not Speak: the cue carries <sub alias> overrides so jargon is
    // pronounced correctly while the caption text itself is left untouched.
    '  $synth.SpeakSsml($cue.ssml)',
    '}',
    '$synth.Dispose()',
  ]
  await fs.writeFile(scriptPath, lines.join('\r\n'), 'utf8')
  await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath])
  const durations = []
  for (const clip of clips) durations.push(Math.round((await ffprobeDuration(clip)) * 1000))
  return { clips, durations }
}

async function createNarrationMix(clips, durations, tempDir) {
  const output = path.join(tempDir, 'narration.wav')
  const inputs = clips.flatMap((clip) => ['-i', clip])
  const filters = clips.map((_, index) => `[${index}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${index * SCENE_SECONDS * 1000}|${index * SCENE_SECONDS * 1000}[v${index}]`)
  const streams = clips.map((_, index) => `[v${index}]`).join('')
  const filter = `${filters.join(';')};${streams}amix=inputs=${clips.length}:duration=longest:normalize=0,apad,atrim=duration=${TOTAL_SECONDS}[out]`
  await run('ffmpeg', ['-y', ...inputs, '-filter_complex', filter, '-map', '[out]', '-t', String(TOTAL_SECONDS), '-ar', '48000', output])
  return { output, durations }
}

async function createAmbientBed(tempDir) {
  const output = path.join(tempDir, 'ambient.wav')
  const filter = '[0:a]lowpass=f=95,volume=0.12[a0];[1:a]tremolo=f=0.12:d=0.72,lowpass=f=360,volume=0.08[a1];[2:a]tremolo=f=0.1:d=0.6,lowpass=f=1400,volume=0.035[a2];[3:a]highpass=f=1800,lowpass=f=7600,volume=0.025[a3];[a0][a1][a2][a3]amix=inputs=4:duration=longest:normalize=0,afade=t=in:d=2,afade=t=out:st=174:d=6,volume=0.55[out]'
  await run('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', `sine=frequency=55:sample_rate=48000:duration=${TOTAL_SECONDS}`,
    '-f', 'lavfi', '-i', `sine=frequency=110:sample_rate=48000:duration=${TOTAL_SECONDS}`,
    '-f', 'lavfi', '-i', `sine=frequency=220:sample_rate=48000:duration=${TOTAL_SECONDS}`,
    '-f', 'lavfi', '-i', `anoisesrc=color=pink:amplitude=0.08:sample_rate=48000:duration=${TOTAL_SECONDS}`,
    '-filter_complex', filter, '-map', '[out]', '-t', String(TOTAL_SECONDS), '-ar', '48000', output,
  ])
  return output
}

async function collectVerificationOutput() {
  const { stdout = '', stderr = '' } = await run('python', ['app/scripts/verify_all.py'], { cwd: root }).catch((error) => ({ stdout: error.stdout || '', stderr: error.stderr || error.message }))
  const lines = `${stdout}\n${stderr}`.split(/\r?\n/).filter(Boolean)
  return lines.slice(-20).map((line) => line.slice(0, 108))
}

async function render() {
  if (process.platform !== 'win32') throw new Error('Voice synthesis requires Windows PowerShell and System.Speech on this capture host.')
  for (const command of ['ffmpeg', 'ffprobe', 'powershell.exe']) {
    await run(command, command === 'ffmpeg' || command === 'ffprobe' ? ['-version'] : ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'])
  }

  const timeline = storyboardTimeline()
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'oneshot-architecture-'))
  let browser
  const openContexts = []
  try {
    console.log('Synthesizing narration and measuring cue durations...')
    const { clips, durations } = await synthesizeVoice(timeline, tempDir)
    timeline.forEach((scene, index) => {
      if (durations[index] > SCENE_SECONDS * 1000) throw new Error(`Scene ${index + 1} narration is ${durations[index]}ms; maximum is 15000ms.`)
      scene.spokenMs = durations[index]
    })
    // Captions are per-rendition only in name, not content: the cue timings come
    // from the same measured narration, so both renditions share one file body.
    const temporaryVtt = path.join(tempDir, 'oneshot-architecture.vtt')
    await fs.writeFile(temporaryVtt, buildVtt(timeline, durations), 'utf8')
    const narration = await createNarrationMix(clips, durations, tempDir)
    const ambient = await createAmbientBed(tempDir)
    const verificationLines = await collectVerificationOutput()
    const screenshotUris = {}
    for (const [sceneId, filename] of Object.entries(SCENE_SCREENSHOTS)) {
      const bytes = await fs.readFile(path.join(outputDir, filename))
      screenshotUris[sceneId] = 'data:image/png;base64,' + bytes.toString('base64')
    }
    await fs.mkdir(outputDir, { recursive: true })
    await fs.mkdir(archivalDir, { recursive: true })

    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
    for (const rendition of RENDITIONS) {
      console.log(`Recording ${rendition.id} rendition (${rendition.layoutWidth}x${rendition.layoutHeight} -> ${rendition.outputWidth}x${rendition.outputHeight})...`)
      const context = await browser.newContext({
        viewport: { width: rendition.layoutWidth, height: rendition.layoutHeight },
        deviceScaleFactor: 2,
        recordVideo: { dir: tempDir, size: { width: rendition.layoutWidth, height: rendition.layoutHeight } },
      })
      openContexts.push(context)
      const page = await context.newPage()
      await page.setContent(buildHtml(timeline, verificationLines, screenshotUris), { waitUntil: 'load' })
      await page.evaluate((measuredDurations) => {
        window.setVoiceDurations(measuredDurations)
        window.__voiceDurations = measuredDurations
      }, durations)
      await page.waitForTimeout(100)
      const video = page.video()
      const startedAt = Date.now()
      await page.evaluate(() => window.beginTimeline(window.__voiceDurations))
      for (let index = 0; index < timeline.length; index++) {
        await page.evaluate(({ index, at }) => window.setScene(index, at), { index, at: startedAt + index * SCENE_SECONDS * 1000 })
        const deadline = startedAt + (index + 1) * SCENE_SECONDS * 1000
        await page.waitForTimeout(Math.max(0, deadline - Date.now()))
        console.log(`  ${rendition.id} scene ${String(index + 1).padStart(2, '0')} / 12`)
      }
      await page.close()
      const rawVideo = await video.path()
      await context.close()
      openContexts.pop()

      const temporaryMp4 = path.join(tempDir, `${rendition.basename}.mp4`)
      const posterAt = Math.min(8, Math.floor((timeline[1]?.spokenMs ?? 4000) / 1000))
      await run('ffmpeg', [
        '-y', '-i', rawVideo, '-i', narration.output, '-i', ambient, '-i', temporaryVtt,
        '-filter_complex', '[1:a][2:a]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.92,aresample=48000,aformat=channel_layouts=stereo[aout]',
        '-map', '0:v:0', '-map', '[aout]', '-map', '3:s:0',
        '-vf', `fps=30,scale=${rendition.outputWidth}:${rendition.outputHeight}:flags=lanczos,tpad=stop_mode=clone:stop_duration=2`, '-t', String(TOTAL_SECONDS),
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '256k', '-c:s', 'mov_text', '-movflags', '+faststart', temporaryMp4,
      ])
      const duration = await ffprobeDuration(temporaryMp4)
      if (Math.abs(duration - TOTAL_SECONDS) > 0.03) throw new Error(`${rendition.id} duration is ${duration}s, expected exactly 180s.`)
      const streams = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-of', 'json', temporaryMp4])
      const metadata = JSON.parse(streams.stdout)
      if (!metadata.streams.some((stream) => stream.codec_type === 'video' && stream.width === rendition.outputWidth && stream.height === rendition.outputHeight)) {
        throw new Error(`Rendered ${rendition.id} video is not ${rendition.outputWidth}x${rendition.outputHeight}.`)
      }
      if (!metadata.streams.some((stream) => stream.codec_type === 'audio') || !metadata.streams.some((stream) => stream.codec_type === 'subtitle')) {
        throw new Error(`Rendered ${rendition.id} MP4 is missing its audio or subtitle stream.`)
      }
      const targetVideo = masterPath(rendition)
      const targetCaptions = captionsPath(rendition)
      const posterName = `${rendition.basename}-poster.webp`
      const targetPoster = path.join(servedDir(rendition), posterName)
      await run('ffmpeg', [
        '-y', '-ss', String(posterAt), '-i', temporaryMp4,
        '-frames:v', '1', '-vf', 'scale=640:-1', '-c:v', 'libwebp', '-quality', '82', targetPoster,
      ])
      // The 4K H.264 master is the archival deliverable. The embedded web
      // renditions are cut to a 1080p box: a 4K AV1 pass is single-threaded on
      // this host and would take longer than the whole capture, while 1080p is
      // still larger than any browser's effective render surface and lands at a
      // fraction of the bytes. The scale is driven off the rendition's own
      // orientation -- 1080:-2 would letterbox a landscape source to 1080x608.
      // SVT-AV1 4.1 also aborts 4K with "insufficient resources" unless the
      // level of parallelism is pinned, so lp is set explicitly rather than
      // left to the encoder's core-count heuristic.
      const webScale = rendition.outputWidth >= rendition.outputHeight ? '-2:1080' : '1080:-2'
      const webVariants = [
        {
          suffix: '.av1.mp4',
          args: ['-c:v', 'libsvtav1', '-crf', '34', '-preset', '6', '-svtav1-params', 'lp=4', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-c:s', 'mov_text'],
        },
        {
          suffix: '.vp9.webm',
          args: ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p', '-c:a', 'libopus', '-b:a', '160k'],
        },
        {
          // The universal fallback. Safari before 17 decodes neither AV1 nor VP9
          // inside a .webm, and pointing that last <source> at the 4K master
          // made every such browser pull 65MB for a 1080p drawer. Cutting the
          // fallback to the same 1080p box costs ~a third of the AV1 bytes and
          // keeps the widest possible audience off the archival file.
          suffix: '.h264.mp4',
          args: ['-c:v', 'libx264', '-crf', '30', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-c:s', 'mov_text'],
        },
      ]
      const publishedVariants = []
      for (const variant of webVariants) {
        const temporaryVariant = path.join(tempDir, `${rendition.basename}${variant.suffix}`)
        const variantArgs = variant.suffix.endsWith('.webm')
          ? ['-y', '-i', temporaryMp4, '-vf', `scale=${webScale}:flags=lanczos`, ...variant.args, temporaryVariant]
          : ['-y', '-i', temporaryMp4, '-i', temporaryVtt, '-map', '0:v:0', '-map', '0:a:0', '-map', '1:s:0', '-vf', `scale=${webScale}:flags=lanczos`, ...variant.args, '-movflags', '+faststart', temporaryVariant]
        try {
          await run('ffmpeg', variantArgs)
        } catch (error) {
          console.warn(`  ${rendition.id} ${variant.suffix} rendition unavailable: ${error.message.split('\n')[0]}`)
          continue
        }
        const variantTarget = path.join(servedDir(rendition), `${rendition.basename}${variant.suffix}`)
        await fs.copyFile(temporaryVariant, variantTarget)
        publishedVariants.push(variant.suffix)
      }
      await fs.copyFile(temporaryMp4, targetVideo)
      await fs.copyFile(temporaryVtt, targetCaptions)
      console.log(`${rendition.publish ? 'Published' : 'Archived'} ${path.relative(root, targetVideo)} (${rendition.outputWidth}x${rendition.outputHeight}, ${duration.toFixed(3)}s) + ${posterName}${publishedVariants.length ? ` + ${publishedVariants.join(', ')}` : ''}`)
    }
  } finally {
    for (const context of openContexts) await context.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  render().catch((error) => {
    console.error(`Architecture video capture failed: ${error.message}`)
    process.exitCode = 1
  })
}