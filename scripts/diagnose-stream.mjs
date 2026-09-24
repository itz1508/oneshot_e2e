/**
 * Quick diagnostic: submit a prompt and check what renders in the DOM.
 */
import { chromium } from "@playwright/test";

// Repository-local and environment-configured browser resolution
const browser = await chromium.launch({
  headless: true,
  ...(process.env.ONESHOT_BROWSER_EXECUTABLE
    ? { executablePath: process.env.ONESHOT_BROWSER_EXECUTABLE }
    : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// Intercept fetch to see what the frontend actually sends and receives
page.on('request', req => {
  if (req.url().includes('/api/')) {
    console.log('REQ:', req.method(), req.url());
  }
});
page.on('response', async res => {
  if (res.url().includes('/api/')) {
    console.log('RES:', res.status(), res.url());
  }
});

// Capture console messages from the page
page.on('console', msg => {
  if (msg.type() === 'error') console.log('PAGE ERROR:', msg.text());
});

await page.goto("http://127.0.0.1:8787/", { waitUntil: "domcontentloaded", timeout: 15000 });
await page.waitForTimeout(3000);

console.log("=== Initial body text length:", await page.evaluate(() => document.body.innerText.length));

// Click composer and submit
const composer = page.locator("#composerInput");
await composer.click({ force: true });
await composer.fill("validate fixtures and show workflow stage status");
await page.waitForTimeout(500);

console.log("=== Typed, about to submit by pressing ENTER key...");
await page.keyboard.press("Enter");

// Poll for 20s to detect any DOM change
let detected = false;
const baseline = await page.evaluate(() => document.body.innerText.length);
console.log("=== Submitted. Baseline:", baseline);

for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(1000);
  const current = await page.evaluate(() => document.body.innerText.length);
  const delta = current - baseline;
  console.log(`[${i+1}s] body text length: ${current} (delta: ${delta > 0 ? '+' : ''}${delta})`);
  
  // Also check for any visible text in the main area
  const mainText = await page.evaluate(() => {
    const main = document.querySelector('main, [role="main"], .main, #main');
    return main ? main.innerText.substring(0, 200) : 'no main found';
  });
  if (i % 5 === 4) console.log(`  Main text sample: "${mainText.substring(0, 100)}"`);
  
  if (delta > 100) {
    detected = true;
    console.log("✅ DOM CHANGED! Content detected.");
    const content = await page.evaluate(() => {
      const main = document.querySelector('main');
      return main ? main.innerText : document.body.innerText;
    });
    console.log("--- Visible Text ---");
    console.log(content.slice(-800));
    break;
  }
}

if (!detected) {
  console.log("⚠ No DOM change detected after 20s");
  // Check what's actually in the chat area
  const chatContent = await page.evaluate(() => {
    const areas = ['main', '[class*="chat"]', '[class*="message"]', '[class*="conversation"]'];
    for (const sel of areas) {
      const el = document.querySelector(sel);
      if (el && el.innerText.length > 50) return `${sel}: ${el.innerText.substring(0, 300)}`;
    }
    return 'Nothing found in chat areas';
  });
  console.log("Chat area content:", chatContent);
  
  // Screenshot for debugging
  await page.screenshot({ path: "debug-screenshot.png" });
  console.log("Screenshot saved to debug-screenshot.png");
}

await browser.close();
