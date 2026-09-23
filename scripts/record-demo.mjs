import { chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(repoRoot, "public", "demo");
await fs.mkdir(outputDir, { recursive: true });

console.log("🎬 Starting OneShot demo recording via Microsoft Edge...");

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: {
    dir: outputDir,
    size: { width: 1280, height: 720 },
  },
});

const page = await context.newPage();

try {
  console.log("🌐 Navigating to http://127.0.0.1:8787/ ...");
  await page.goto("http://127.0.0.1:8787/", { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(2000);

  // Take initial snapshot
  await page.screenshot({ path: path.join(outputDir, "screen-1-initial.png") });
  console.log("📸 Captured initial screen");

  // Find chat input
  const inputSelector = "textarea, input[type='text'], [contenteditable='true']";
  const input = page.locator(inputSelector).first();
  if (await input.count()) {
    console.log("💬 Typing user prompt...");
    await input.click();
    await page.waitForTimeout(500);
    await input.fill("validate fixtures and check workflow gates");
    await page.waitForTimeout(1000);

    // Take snapshot of input
    await page.screenshot({ path: path.join(outputDir, "screen-2-typing.png") });

    // Press Enter to submit
    await page.keyboard.press("Enter");
    console.log("⚡ Sent prompt, waiting for live response streaming...");
    await page.waitForTimeout(4000);

    // Take snapshot of streaming/response
    await page.screenshot({ path: path.join(outputDir, "screen-3-streaming.png") });
  }

  // Look for Task Rail / Review Card interaction
  const buttons = page.locator("button");
  const buttonCount = await buttons.count();
  console.log(`Found ${buttonCount} interactive buttons`);

  for (let i = 0; i < buttonCount; i++) {
    const text = (await buttons.nth(i).innerText().catch(() => "")) || "";
    if (text.toLowerCase().includes("provider") || text.toLowerCase().includes("integration") || text.toLowerCase().includes("gate") || text.toLowerCase().includes("task")) {
      console.log(`Clicking button: "${text.trim()}"`);
      await buttons.nth(i).click().catch(() => {});
      await page.waitForTimeout(1500);
      break;
    }
  }

  // Capture final interactive state
  await page.screenshot({ path: path.join(outputDir, "screen-4-interactive.png") });
  await page.waitForTimeout(2000);

} catch (err) {
  console.error("Recording step error:", err);
} finally {
  await page.close();
  const video = page.video();
  if (video) {
    const videoPath = await video.path();
    console.log("🎥 Video recorded successfully to:", videoPath);
  }
  await context.close();
  await browser.close();
  console.log("✅ Recording completed!");
}
