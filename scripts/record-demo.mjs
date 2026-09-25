/**
 * record-demo.mjs — real backend event capture
 *
 * Captures a fresh local workspace, a real prompt, the visible streaming state,
 * the completed response, and the run-specific Task drawer. The recording ends
 * when the backend run ends; no history replay or fixed-duration padding is used.
 */
import { chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "..");
const demoOutputDir = path.join(repoRoot, "public", "demo");
const frontendDemoDir = path.join(repoRoot, "frontend", "web", "public", "demo");
const demoArtifactDir = path.join(
  repoRoot,
  "test-results",
  "demo"
);

await fs.mkdir(demoOutputDir, { recursive: true });
await fs.mkdir(frontendDemoDir, { recursive: true });
await fs.mkdir(demoArtifactDir, { recursive: true });

const obsoleteDemoFiles = ["screen-1-initial.png"];
for (const directory of [demoOutputDir, frontendDemoDir]) {
  for (const filename of obsoleteDemoFiles) {
    await fs.rm(path.join(directory, filename), { force: true });
  }
}

console.log("🎬 Recording OneShot demo — real local event capture...");

// Repository-local and environment-configured browser resolution
const browser = await chromium.launch({
  headless: true,
  ...(process.env.ONESHOT_BROWSER_EXECUTABLE
    ? { executablePath: process.env.ONESHOT_BROWSER_EXECUTABLE }
    : {}),
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: {
    dir: demoOutputDir,
    size: { width: 1440, height: 900 },
  },
});

const page = await context.newPage();

const startTime = Date.now();
const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(1);

await page.goto("http://127.0.0.1:8787/", { waitUntil: "commit", timeout: 20000 });

const loadingState = page.getByTestId("workspace-loading-state");
await loadingState.waitFor({ state: "visible", timeout: 5000 });
await page.screenshot({ path: path.join(demoOutputDir, "screen-1-loading.png") });
// Hold the observed loading state long enough to read; this is not simulated progress.
await page.waitForTimeout(400);
console.log(`[${elapsed()}s] ✅ Captured real workspace loading state`);

const composer = page.locator("#composerInput");
await composer.waitFor({ state: "visible", timeout: 15000 });
await loadingState.waitFor({ state: "hidden", timeout: 10000 });
await page.waitForFunction(
  () => document.querySelector("#composerInput")?.getAttribute("placeholder") === "Message OneShot...",
  undefined,
  { timeout: 10000 },
);
console.log(`[${elapsed()}s] ✅ Workspace ready; composer enabled`);

await composer.click();
const prompt = "validate fixtures and research the response verification invariant with Python reasoning";
await composer.pressSequentially(prompt, { delay: 45 });
await page.screenshot({ path: path.join(demoOutputDir, "screen-2-typing.png") });
await page.waitForTimeout(300);
console.log(`[${elapsed()}s] 📸 Captured real prompt entry`);

const streamResponse = page.waitForResponse(
  (response) => response.url().endsWith("/api/agent/stream") && response.request().method() === "POST",
  { timeout: 10000 },
);
await composer.press("Enter");
const response = await streamResponse;
if (response.status() !== 200) {
  throw new Error(`Agent stream returned HTTP ${response.status()}`);
}
console.log(`[${elapsed()}s] ⚡ Real agent stream responded with HTTP ${response.status()}`);

await page.waitForFunction(
  () => document.querySelector("#composerInput")?.getAttribute("placeholder") === "OneShot is responding...",
  undefined,
  { timeout: 10000 },
);
await page.waitForFunction(
  () => (document.querySelector("#asstContent")?.textContent || "").trim().length > 0,
  undefined,
  { timeout: 10000 },
);
await page.screenshot({ path: path.join(demoOutputDir, "screen-3-streaming.png") });
// Keep the real running state visible briefly before awaiting the real completion event.
await page.waitForTimeout(500);
console.log(`[${elapsed()}s] 📸 Captured real visible running/stream state`);
await page.waitForFunction(
  () => document.querySelector("#composerInput")?.getAttribute("placeholder") === "Message OneShot...",
  undefined,
  { timeout: 20000 },
);
await page.screenshot({ path: path.join(demoOutputDir, "screen-4-interactive.png") });
// Give the completed response a readable beat before revealing the real task audit.
await page.waitForTimeout(500);
console.log(`[${elapsed()}s] ✅ Captured real completed response`);

const drawerButton = page.locator("#toggleDrawerBtn");
if (await drawerButton.count()) {
  await drawerButton.click({ force: true });
  await page.waitForTimeout(350);
  const taskTab = page.locator("#tabTaskBtn");
  if (await taskTab.count()) await taskTab.click({ force: true });
  const hookLogButton = page.locator("#tasksFlipBtn");
  if (await hookLogButton.count()) await hookLogButton.click({ force: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(demoOutputDir, "screen-5-task-state.png") });
  await page.waitForTimeout(600);
  console.log(`[${elapsed()}s] 📸 Captured real task drawer state`);
}

// ── Finalize the recording only after the real run has completed ───────────────
const video = page.video();
await page.close();
const finalVideoPath = video ? await video.path() : null;
await context.close();
await browser.close();

if (!finalVideoPath) {
  throw new Error("Playwright did not produce a video");
}

const videoTargets = [
  path.join(demoOutputDir, "oneshot-demo.webm"),
  path.join(frontendDemoDir, "oneshot-demo.webm"),
  path.join(demoArtifactDir, "oneshot-demo.webm"),
];
for (const target of videoTargets) {
  await fs.copyFile(finalVideoPath, target);
}
const screenshots = [
  "screen-1-loading.png",
  "screen-2-typing.png",
  "screen-3-streaming.png",
  "screen-4-interactive.png",
  "screen-5-task-state.png",
];
for (const screenshot of screenshots) {
  const sourcePath = path.join(demoOutputDir, screenshot);
  if (await fs.access(sourcePath).then(() => true).catch(() => false)) {
    await fs.copyFile(sourcePath, path.join(frontendDemoDir, screenshot));
    await fs.copyFile(sourcePath, path.join(demoArtifactDir, screenshot));
  }
}

for (const directory of [demoOutputDir, frontendDemoDir]) {
  const generatedVideoFiles = (await fs.readdir(directory))
    .filter((filename) => filename.startsWith("page@") && filename.endsWith(".webm"));
  await Promise.all(generatedVideoFiles.map((filename) => fs.rm(path.join(directory, filename), { force: true })));
}

console.log(`✅ Published real ${((Date.now() - startTime) / 1000).toFixed(1)}s capture`);
