/**
 * record-demo.mjs — REAL content demo recording
 *
 * Strategy: Load an existing completed chat session from sidebar history
 * (which has real streamed content already saved), then show it on screen.
 * Then open a new chat, type a prompt, submit it, and wait for real streaming.
 *
 * Confirmed from live inspection:
 *   #sidebarNewChatBtn  → "New chat" button
 *   Sidebar history buttons (no IDs) at y≈385,415,445 with real titles
 *   #composerInput → textarea
 *   #toggleDrawerBtn → Context Drawer
 *   #toggleIntegrationBtn → Integrations
 *
 * Flow (60s):
 *   0–4s   : Load UI, pan header
 *   4–10s  : Click existing "Research validation flow" chat from sidebar
 *  10–22s  : Show real existing conversation content (scroll through it)
 *  22–34s  : Click "New chat", type prompt character by character
 *  34–36s  : Submit, watch loading
 *  36–55s  : Watch real SSE response render in new chat
 *  55–60s  : Sweep to show Context Drawer + tool pills
 */
import { chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(repoRoot, "public", "demo");
const webPublicDir = path.join(repoRoot, "frontend", "web", "public", "demo");
const artifactDir = "C:\\Users\\itz15\\.gemini\\antigravity-ide\\brain\\57950c0e-0421-412a-958c-f5b02486dbbe\\demo";

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(webPublicDir, { recursive: true });
await fs.mkdir(artifactDir, { recursive: true });

console.log("🎬 Recording OneShot demo — real chat history + live streaming...");

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
  args: ["--disable-gpu"],
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: {
    dir: outputDir,
    size: { width: 1440, height: 900 },
  },
});

const page = await context.newPage();

async function moveTo(x, y, steps = 20) {
  await page.mouse.move(x, y, { steps });
  await page.waitForTimeout(80);
}

async function smoothScroll(dy, steps = 5) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(110);
  }
}

const startTime = Date.now();
const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(1);

// ── [0s–4s] Load UI ─────────────────────────────────────────────────────────
console.log(`[${elapsed()}s] 🌐 Loading UI...`);
await page.goto("http://127.0.0.1:8787/", { waitUntil: "domcontentloaded", timeout: 20000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(outputDir, "screen-1-initial.png") });
console.log(`[${elapsed()}s] ✅ UI loaded`);

// Pan across the UI to establish the scene
await moveTo(80, 15, 15);
await moveTo(400, 15, 25);
await moveTo(800, 15, 20);
await page.waitForTimeout(300);

// ── [4s–10s] Click existing chat "Research validation flow" from sidebar ─────
console.log(`[${elapsed()}s] 📂 Clicking existing chat from sidebar history...`);

// The sidebar shows previous chats. Find one with real content.
const existingChat = page.locator("button:has-text('Research validation flow')").first();
if (await existingChat.count() > 0) {
  const box = await existingChat.boundingBox();
  if (box) {
    await moveTo(box.x + box.width * 0.4, box.y + box.height / 2, 20);
    await page.waitForTimeout(400);
    await existingChat.click({ force: true });
    console.log(`[${elapsed()}s] ✅ Clicked "Research validation flow" chat`);
    await page.waitForTimeout(2500);  // wait for content to load
  }
} else {
  // Try any sidebar chat button
  const anyChat = page.locator(".sidebar-shell button").nth(4);
  await anyChat.click({ force: true }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log(`[${elapsed()}s] ✅ Clicked sidebar chat fallback`);
}

await page.screenshot({ path: path.join(outputDir, "screen-2-typing.png") });

// ── [10s–22s] Scroll through real existing conversation content ────────────
console.log(`[${elapsed()}s] 📜 Scrolling through real conversation content...`);

// Move mouse to the main content area and scroll through it
await moveTo(750, 400, 20);
await page.waitForTimeout(500);

// Slow scroll down to read through the content
for (let i = 0; i < 7; i++) {
  await smoothScroll(130, 4);
  await moveTo(720 + Math.sin(i * 0.5) * 50, 350 + i * 15, 8);
  await page.waitForTimeout(900);
}

await page.screenshot({ path: path.join(outputDir, "screen-3-streaming.png") });
console.log(`[${elapsed()}s] ✅ Scrolled through existing content`);

// Scroll back to top
await smoothScroll(-700, 8);
await page.waitForTimeout(800);

// ── [22s–34s] Click "New Chat" and type prompt ────────────────────────────
console.log(`[${elapsed()}s] ➕ Opening new chat and typing prompt...`);

// Click "New chat" button (confirmed ID: sidebarNewChatBtn or newChatBtn)
const newChatBtn = page.locator("#newChatBtn, #sidebarNewChatBtn").first();
if (await newChatBtn.count() > 0) {
  const box = await newChatBtn.boundingBox();
  if (box) await moveTo(box.x + box.width / 2, box.y + box.height / 2, 15);
  await newChatBtn.click({ force: true });
  console.log(`[${elapsed()}s] ✅ New chat opened`);
  await page.waitForTimeout(1200);
}

// Now type in the composer
const composer = page.locator("#composerInput");
await composer.click({ force: true });
await page.waitForTimeout(300);

const compBox = await composer.boundingBox();
if (compBox) await moveTo(compBox.x + compBox.width * 0.3, compBox.y + compBox.height / 2, 10);

// Shorter prompt for faster response
const PROMPT = "show workflow gate status and active stage details";
await composer.pressSequentially(PROMPT, { delay: 65 });
await page.waitForTimeout(600);

// ── [34s–56s] Submit and wait for REAL streaming ──────────────────────────
console.log(`[${elapsed()}s] ⚡ Submitting prompt...`);
await page.keyboard.press("Enter");
await page.waitForTimeout(500);

// Track /api/agent/stream request
let streamRequestMade = false;
page.on('request', req => {
  if (req.url().includes('/api/agent/stream')) {
    streamRequestMade = true;
    console.log(`[${elapsed()}s] 🔗 /api/agent/stream called!`);
  }
});

await moveTo(750, 500, 20);

// Poll for DOM change
const baselineLen = await page.evaluate(() => document.body.innerText.length);
console.log(`[${elapsed()}s] Baseline: ${baselineLen} chars`);

let responseFound = false;
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(1000);
  const currentLen = await page.evaluate(() => document.body.innerText.length);
  const delta = currentLen - baselineLen;
  console.log(`[${elapsed()}s] [${i+1}s] body: ${currentLen} (Δ${delta > 0 ? '+' : ''}${delta})`);
  
  if (delta > 80) {
    responseFound = true;
    console.log(`[${elapsed()}s] ✅ Response rendered! +${delta} chars`);
    await page.screenshot({ path: path.join(outputDir, "screen-3-streaming.png") });
    break;
  }
  
  // Keep mouse moving while waiting
  await moveTo(750 + Math.sin(i * 0.7) * 80, 400 + Math.cos(i * 0.9) * 60, 8);
}

if (!responseFound) {
  console.log(`[${elapsed()}s] ⚠ Response not in DOM — but video shows the attempt`);
  await page.screenshot({ path: path.join(outputDir, "screen-3-streaming.png") });
}

// Give a bit more time for full response
await page.waitForTimeout(1500);

// Scroll through whatever is in the chat area  
await smoothScroll(-400, 5);
await page.waitForTimeout(500);
for (let i = 0; i < 4; i++) {
  await smoothScroll(120, 3);
  await page.waitForTimeout(700);
}

// ── [56s–60s] Final: Context Drawer + tool pills ──────────────────────────
console.log(`[${elapsed()}s] 🛠 Showing tool pills and Context Drawer...`);

// Hover over tool pill buttons in the composer area (Tavily Research, Human Gate, etc.)
await moveTo(540, 738, 20);
await page.waitForTimeout(600);
await moveTo(680, 738, 15);
await page.waitForTimeout(600);
await moveTo(985, 738, 15);
await page.waitForTimeout(600);

// Open Context Drawer
const drawerBtn = page.locator("#toggleDrawerBtn");
if (await drawerBtn.count() > 0) {
  const box = await drawerBtn.boundingBox();
  if (box) await moveTo(box.x + box.width / 2, box.y + box.height / 2, 15);
  await drawerBtn.click({ force: true });
  console.log(`[${elapsed()}s] 📂 Context Drawer opened`);
  await page.waitForTimeout(1500);
  await moveTo(1100, 350, 20);
  await page.waitForTimeout(800);
}

await page.screenshot({ path: path.join(outputDir, "screen-4-interactive.png") });

// ── Pad to 60s ────────────────────────────────────────────────────────────────
const el = (Date.now() - startTime) / 1000;
if (el < 60) {
  const remainMs = (61 - el) * 1000;
  console.log(`[${el.toFixed(1)}s] ⏳ Padding ${Math.round(remainMs / 1000)}s...`);
  const ticks = Math.ceil(remainMs / 900);
  for (let t = 0; t < ticks; t++) {
    const a = (t / ticks) * Math.PI * 2;
    await moveTo(720 + Math.cos(a) * 220, 450 + Math.sin(a) * 100, 10);
    await page.waitForTimeout(900);
  }
}

// ── Save video ────────────────────────────────────────────────────────────────
console.log(`[${elapsed()}s] 💾 Saving...`);
await page.close();
const video = page.video();
let finalVideoPath = null;
if (video) {
  finalVideoPath = await video.path();
  console.log("🎥 Raw video:", finalVideoPath);
}
await context.close();
await browser.close();

const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`✅ Done! ${totalSec}s total`);

if (finalVideoPath) {
  const targets = [
    path.join(outputDir, "oneshot-demo.webm"),
    path.join(webPublicDir, "oneshot-demo.webm"),
    path.join(artifactDir, "oneshot-demo.webm"),
  ];
  for (const t of targets) {
    await fs.copyFile(finalVideoPath, t).catch(e => console.log("copy warn:", e.message));
  }
  const screens = ["screen-1-initial.png", "screen-2-typing.png", "screen-3-streaming.png", "screen-4-interactive.png"];
  for (const s of screens) {
    await fs.copyFile(path.join(outputDir, s), path.join(webPublicDir, s)).catch(() => {});
    await fs.copyFile(path.join(outputDir, s), path.join(artifactDir, s)).catch(() => {});
  }
  console.log("📁 Published!");
}
