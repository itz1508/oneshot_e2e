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

console.log("🎬 Starting 60s High-Motion OneShot Demo Recording via Microsoft Edge...");

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: {
    dir: outputDir,
    size: { width: 1440, height: 900 },
  },
});

const page = await context.newPage();

async function smoothMoveTo(locator, steps = 15) {
  try {
    const box = await locator.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
      await page.waitForTimeout(100);
    }
  } catch {}
}

const startTime = Date.now();

// [0s - 5s] 1. Initial Scene: Navigate and show loaded workspace
try {
  console.log("🌐 [0s] Navigating to http://127.0.0.1:8787/ ...");
  await page.goto("http://127.0.0.1:8787/", { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outputDir, "screen-1-initial.png") });

  // Move mouse across header
  await page.mouse.move(250, 30, { steps: 15 });
  await page.waitForTimeout(400);
  await page.mouse.move(720, 30, { steps: 20 });
  await page.waitForTimeout(400);
  await page.mouse.move(1200, 30, { steps: 20 });
  await page.waitForTimeout(600);
} catch (e) {
  console.log("Step 1 note:", e.message);
}

// [5s - 18s] 2. Start Prompt: Focus chat input, type character-by-character
try {
  console.log("💬 [5s] Focusing chat composer and typing user prompt character-by-character...");
  const textarea = page.locator("textarea").first();
  await smoothMoveTo(textarea, 20);
  await textarea.click({ force: true });
  await page.waitForTimeout(400);

  const prompt1 = "validate fixtures and verify canonical stage gates";
  await textarea.pressSequentially(prompt1, { delay: 65 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outputDir, "screen-2-typing.png") });
} catch (e) {
  console.log("Step 2 note:", e.message);
}

// [18s - 30s] 3. Enter Prompt: Submit and watch loading indicator & streaming response
try {
  console.log("⚡ [18s] Submitting prompt, live loading & streaming response...");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);

  // Follow the streamed response with mouse & scroll
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: path.join(outputDir, "screen-3-streaming.png") });
} catch (e) {
  console.log("Step 3 note:", e.message);
}

// [30s - 44s] 4. E2E Task Load on Screen: Inspect Right Task Rail at the same time
try {
  console.log("📋 [30s] Interacting with Task Rail on the right...");
  
  // Validation tab
  const validationTab = page.locator("button:has-text('Validation'), button:has-text('validation')").first();
  if (await validationTab.count()) {
    await smoothMoveTo(validationTab, 15);
    await validationTab.click({ force: true });
    console.log("   Clicked Validation tab in Task Rail");
    await page.waitForTimeout(3000);
  }

  // Active Task tab
  const activeTab = page.locator("button:has-text('Active'), button:has-text('active')").first();
  if (await activeTab.count()) {
    await smoothMoveTo(activeTab, 15);
    await activeTab.click({ force: true });
    console.log("   Clicked Active Task tab in Task Rail");
    await page.waitForTimeout(3000);
  }

  // Progress tab
  const progressTab = page.locator("button:has-text('Progress'), button:has-text('progress')").first();
  if (await progressTab.count()) {
    await smoothMoveTo(progressTab, 15);
    await progressTab.click({ force: true });
    console.log("   Clicked Progress tab in Task Rail");
    await page.waitForTimeout(3000);
  }

  // All tab
  const allTab = page.locator("button:has-text('All'), button:has-text('all')").first();
  if (await allTab.count()) {
    await smoothMoveTo(allTab, 15);
    await allTab.click({ force: true });
    console.log("   Clicked All tab in Task Rail");
    await page.waitForTimeout(2500);
  }
} catch (e) {
  console.log("Step 4 note:", e.message);
}

// [44s - 52s] 5. Provider & Integrations Drawer
try {
  console.log("⚙️ [44s] Opening Integration & Provider settings drawer...");
  const integrationBtn = page.locator("#toggleIntegrationBtn").first();
  if (await integrationBtn.count()) {
    await smoothMoveTo(integrationBtn, 15);
    await integrationBtn.click({ force: true });
    await page.waitForTimeout(2000);

    // Hover through providers
    await page.mouse.move(720, 450, { steps: 20 });
    await page.waitForTimeout(1500);

    // Close modal via Escape
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);
  }
} catch (e) {
  console.log("Step 5 note:", e.message);
}

// [52s - 60s] 6. Second Interaction: Human Gate Status & Panoramic Review
try {
  console.log("🚀 [52s] Triggering Human Gate status via Quick Tools...");
  const textarea = page.locator("textarea").first();
  if (await textarea.count()) {
    await smoothMoveTo(textarea, 15);
    await textarea.click({ force: true });
    await textarea.pressSequentially("inspect workflow human gates: Gate 1 and Gate 2", { delay: 40 });
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");
  }

  console.log("⚡ [55s] Observing gate review cards and active proofs...");
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 80);
    await page.waitForTimeout(900);
  }

  // Toggle Context Drawer
  const drawerBtn = page.locator("#toggleDrawerBtn").first();
  if (await drawerBtn.count()) {
    await smoothMoveTo(drawerBtn, 12);
    await drawerBtn.click({ force: true });
    await page.waitForTimeout(1500);
  }

  await page.screenshot({ path: path.join(outputDir, "screen-4-interactive.png") });
} catch (e) {
  console.log("Step 6 note:", e.message);
}

// Ensure total duration reaches at least 60.5s of continuous video
const elapsed = (Date.now() - startTime) / 1000;
console.log(`⏱ Current elapsed time: ${elapsed.toFixed(1)}s`);
if (elapsed < 60) {
  const remainMs = Math.round((60.5 - elapsed) * 1000);
  console.log(`⏳ Pacing video to reach exactly 60s (${remainMs}ms remaining)...`);
  // Perform gentle mouse movement while completing the time
  const steps = Math.floor(remainMs / 1000);
  for (let s = 0; s < steps; s++) {
    const x = 500 + Math.sin(s) * 200;
    const y = 400 + Math.cos(s) * 150;
    await page.mouse.move(x, y, { steps: 10 });
    await page.waitForTimeout(1000);
  }
}

await page.close();
const video = page.video();
let finalVideoPath = null;
if (video) {
  finalVideoPath = await video.path();
  console.log("🎥 Raw video recorded to:", finalVideoPath);
}
await context.close();
await browser.close();

const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`✅ Recording completed! Total video duration: ${totalSec}s`);

// Copy to named destination
if (finalVideoPath) {
  const targetVideo = path.join(outputDir, "oneshot-demo.webm");
  const webTargetVideo = path.join(webPublicDir, "oneshot-demo.webm");
  const artifactTargetVideo = path.join(artifactDir, "oneshot-demo.webm");

  await fs.copyFile(finalVideoPath, targetVideo);
  await fs.copyFile(finalVideoPath, webTargetVideo);
  await fs.copyFile(finalVideoPath, artifactTargetVideo);

  // Copy screenshots as well
  const screens = ["screen-1-initial.png", "screen-2-typing.png", "screen-3-streaming.png", "screen-4-interactive.png"];
  for (const s of screens) {
    await fs.copyFile(path.join(outputDir, s), path.join(webPublicDir, s)).catch(() => {});
    await fs.copyFile(path.join(outputDir, s), path.join(artifactDir, s)).catch(() => {});
  }

  console.log("📁 Video & screenshots successfully published to public/demo, frontend/web/public/demo, and artifacts!");
}
