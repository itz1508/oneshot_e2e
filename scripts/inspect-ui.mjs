import { chromium } from "@playwright/test";

const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const browser = await chromium.launch({ executablePath: edgePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await page.goto("http://127.0.0.1:8787/", { waitUntil: "domcontentloaded", timeout: 15000 });
await page.waitForTimeout(3000);

const inputs = await page.evaluate(() => {
  const results = [];
  document.querySelectorAll("textarea, input[type=text], [contenteditable='true'], [contenteditable='']").forEach(el => {
    results.push({
      tag: el.tagName,
      id: el.id,
      className: el.className.substring(0, 80),
      placeholder: el.getAttribute("placeholder"),
      name: el.name,
      rect: el.getBoundingClientRect()
    });
  });
  return results;
});

console.log("=== INPUTS ===");
console.log(JSON.stringify(inputs, null, 2));

const buttons = await page.evaluate(() => {
  const results = [];
  document.querySelectorAll("button").forEach(el => {
    results.push({
      id: el.id,
      text: el.innerText.substring(0, 40),
      className: el.className.substring(0, 60),
      rect: { x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y) }
    });
  });
  return results.slice(0, 25);
});

console.log("=== BUTTONS (first 25) ===");
console.log(JSON.stringify(buttons, null, 2));

const panels = await page.evaluate(() => {
  const results = [];
  ["[class*='chat']","[class*='message']","[class*='task']","[class*='rail']","[class*='stream']","[class*='composer']"].forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      const r = el.getBoundingClientRect();
      results.push({
        sel,
        id: el.id,
        className: el.className.substring(0, 80),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
      });
    });
  });
  return results.slice(0, 30);
});

console.log("=== PANELS ===");
console.log(JSON.stringify(panels, null, 2));

await browser.close();
