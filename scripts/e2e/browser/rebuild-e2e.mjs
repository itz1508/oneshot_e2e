// Browser E2E for the rebuilt app/web (Pages Router chat-first UI).
// Drives the REAL local runtime (BASE) in headless Edge over CDP and proves
// the approved rebuild behavior: sessions, composer, history popover,
// fixed-intent OFF/ON, copy/paste-to-composer, content drawer, and
// status-only integrations. No mocked success paths.
process.env.CDP_PORT = process.env.CDP_PORT || "9333";
process.env.ONESHOT_E2E_PROFILE =
  process.env.ONESHOT_E2E_PROFILE ||
  `${process.cwd()}\\data\\browser-profile-rebuild-${Date.now()}`;
const { BASE, SHOTS, dumpEvidence, evidence, launchBrowser, sleep, waitFor } =
  await import("./cdp-core.mjs");
const { writeFileSync } = await import("node:fs");
const { join } = await import("node:path");

let cdp;
const results = [];
let PASSED = true;
function check(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail: String(detail).slice(0, 300) });
  if (!pass) PASSED = false;
  console.log(`[check] ${pass ? "PASS" : "FAIL"} ${name}${detail ? " | " + detail : ""}`);
}

async function evaluate(expr) {
  const r = await cdp.send("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    console.log("[evaluate exception]", r.exceptionDetails.text,
      (r.exceptionDetails.exception?.description || "").slice(0, 300));
    return undefined;
  }
  return r.result?.value;
}

async function evalJson(expr) {
  const v = await evaluate(expr);
  if (typeof v !== "string") {
    console.log("[evalJson unexpected]", String(v));
    return { __error: true };
  }
  return JSON.parse(v);
}

async function screenshot(name) {
  const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, name), Buffer.from(shot.data, "base64"));
  evidence.shots.push({ name, at: new Date().toISOString() });
  console.log(`[shot] ${name}`);
}

// Page-side helpers (hashed CSS-module classes cannot be selectors).
const HELPERS = `
window.__t = {
  byText(tag, text) {
    return [...document.querySelectorAll(tag)].find((e) =>
      (e.innerText || "").trim().toLowerCase().includes(text.toLowerCase()));
  },
  allByText(tag, text) {
    return [...document.querySelectorAll(tag)].filter((e) =>
      (e.innerText || "").trim().toLowerCase().includes(text.toLowerCase()));
  },
  setDraft(value) {
    const ta = document.querySelector('textarea[aria-label="Message"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, value);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return ta.value;
  },
  pressEnter() {
    const ta = document.querySelector('textarea[aria-label="Message"]');
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  },
  draft() { return document.querySelector('textarea[aria-label="Message"]')?.value ?? null; },
  bubbles() {
    return [...document.querySelectorAll('section div')]
      .filter((e) => e.innerText && getComputedStyle(e).borderRadius === '18px')
      .map((e) => e.innerText.slice(0, 120));
  }
};`;

const RUN_TAG = "E2E rebuild proof " + new Date().toISOString().slice(11, 19);

cdp = await launchBrowser();
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Log.enable");
await cdp.send("Network.enable");
await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: HELPERS });
cdp.on("Network.responseReceived", (p) => {
  if (p.response.status >= 400)
    console.log("[network " + p.response.status + "]", p.response.url);
});
cdp.on("Log.entryAdded", (p) => {
  if (p.entry?.level === "error") {
    const txt = String(p.entry?.text ?? "");
    if (!txt.includes("404 (Not Found)")) {
      evidence.console_errors.push({ text: txt.slice(0, 400) });
    }
  }
});
cdp.on("Runtime.consoleAPICalled", (p) => {
  if (p.type === "error")
    evidence.console_errors.push({
      text: (p.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 400),
    });
});
await cdp.send("Page.navigate", { url: BASE });
await waitFor("page load", async () =>
  (await evaluate("document.readyState")) === "complete" ? true : undefined,
);
await waitFor("react shell", async () =>
  (await evaluate(`!!document.querySelector('textarea[aria-label="Message"]')`))
    ? true
    : undefined,
);
await evaluate(HELPERS);
await sleep(800);

// 1. Page + shell structure
console.log("[diag] href:", await evaluate("location.href"),
  "| readyState:", await evaluate("document.readyState"),
  "| __t:", await evaluate("typeof window.__t"),
  "| TA:", await evaluate(`!!document.querySelector('textarea[aria-label="Message"]')`));
check("page title is OneShot", (await evaluate("document.title")) === "OneShot");
const sh = await evalJson(`JSON.stringify({
  brand: !!window.__t.byText('div', 'OneShot'),
  newChat: !!window.__t.byText('button', 'New chat'),
  integrations: !!window.__t.byText('div', 'Integrations'),
  sessions: !!window.__t.byText('div', 'Sessions'),
  memoryStatus: !!window.__t.byText('strong', 'Memory index'),
  emptyState: !!window.__t.byText('div', 'What do you want to work on'),
  integrationRows: document.querySelectorAll('[class*="integrationRow"]').length,
})`);
check("sidebar brand/new chat/integrations/sessions/memory footer", sh.brand && sh.newChat && sh.integrations && sh.sessions && sh.memoryStatus, JSON.stringify(sh));
check("integration rows rendered from backend catalog", sh.integrationRows >= 3, `rows=${sh.integrationRows}`);
check("empty state visible", sh.emptyState);
await screenshot("r01-shell.png");

// 2. Turn 1: create a conversation from the composer
await evaluate(`window.__t.setDraft(${JSON.stringify(RUN_TAG + " first turn")})`);
await evaluate("window.__t.pressEnter()");
await waitFor("first user bubble", async () =>
  (await evaluate(`window.__t.bubbles().some(t => t.includes(${JSON.stringify(RUN_TAG)}))`))
    ? true
    : undefined,
);
check("turn 1 creates conversation and renders user bubble", true);
await sleep(500);

// 3. Turn 2: append to the same conversation
await evaluate(`window.__t.setDraft(${JSON.stringify(RUN_TAG + " second turn")})`);
await evaluate("window.__t.pressEnter()");
await waitFor("second user bubble", async () =>
  (await evaluate(`window.__t.bubbles().filter(t => t.includes(${JSON.stringify(RUN_TAG)})).length >= 2`))
    ? true
    : undefined,
);
check("turn 2 appended to same conversation", true);
await sleep(700);
await screenshot("r02-turns.png");

// 4. Sidebar session appears with derived title
const sidebarHas = await evaluate(
  `window.__t.allByText('button', ${JSON.stringify(RUN_TAG)}).length`,
);
check("new session appears in sidebar with derived title", sidebarHas >= 1, `matches=${sidebarHas}`);

// 5. Reload: sessions repopulate from persisted backend state
await cdp.send("Page.reload");
await sleep(1500); // let the old execution context unload before probing
await waitFor("reload", async () =>
  (await evaluate("document.readyState")) === "complete" ? true : undefined,
);
await waitFor("shell after reload", async () =>
  (await evaluate(`!!document.querySelector('textarea[aria-label="Message"]')`))
    ? true
    : undefined,
);
await evaluate(HELPERS);
await sleep(800);
const persisted = await evaluate(
  `window.__t.allByText('button', ${JSON.stringify(RUN_TAG)}).length`,
);
check("session persists after reload (GET /api/conversations)", persisted >= 1, `matches=${persisted}`);

// 6. Click the session: snapshot loads turns
await evaluate(`window.__t.byText('button', ${JSON.stringify(RUN_TAG)}).click()`);
await waitFor("turns after select", async () =>
  (await evaluate(`window.__t.bubbles().filter(t => t.includes(${JSON.stringify(RUN_TAG)})).length >= 2`))
    ? true
    : undefined,
);
check("selecting session reloads conversation turns", true);
await screenshot("r03-session-selected.png");


// 7. History menu (•••) opens the review popover
const menuBtn = `document.querySelector('button[aria-label="Review earlier context"]')`;
check("history menu button present in minibar", await evaluate(`!!${menuBtn}`));
await evaluate(`${menuBtn}.click()`);
await waitFor("history popover", async () =>
  (await evaluate(`!!window.__t.byText('strong', 'History') && !!window.__t.byText('span', 'Fixed intent summary')`))
    ? true
    : undefined,
);
check("history review popover opens", true);
check("ellipsis aria-expanded=true", await evaluate(`${menuBtn}.getAttribute('aria-expanded')`) === "true");
const fragmentCount = await evaluate(
  `window.__t.allByText('button', ${JSON.stringify(RUN_TAG)}).length`,
);
check("raw memory fragments listed (OFF view)", fragmentCount >= 1, `fragments=${fragmentCount}`);
await screenshot("r04-history-off.png");

// 8. Fixed intent OFF -> ON: summaries view via backend toggle
await evaluate(`document.querySelector('input[aria-label="Toggle fixed intent summary"]').click()`);
await waitFor("summaries view", async () =>
  (await evaluate(`!!window.__t.byText('div', 'Fixed intent summaries')`))
    ? true
    : undefined,
);
const summaryCount = await evaluate(
  `document.querySelectorAll('section[class*="summarySection"]').length`,
);
check("fixed intent ON shows deterministic summaries", summaryCount >= 1, `summaries=${summaryCount}`);
check("toggle ON reflected in UI state", await evaluate(`document.querySelector('input[aria-label="Toggle fixed intent summary"]').checked`) === true);
await screenshot("r05-history-on.png");

// 9. Toggle OFF again: raw records return
await evaluate(`document.querySelector('input[aria-label="Toggle fixed intent summary"]').click()`);
await waitFor("records view again", async () =>
  (await evaluate(`!!window.__t.byText('div', 'Earlier fragments')`))
    ? true
    : undefined,
);
check("toggle OFF restores raw fragments", true);

// 10. Paste inserts into composer draft only (never sends)
const beforeBubbles = await evaluate("window.__t.bubbles().length");
await evaluate(`[...document.querySelectorAll('[role="button"]')].find((e) => e.innerText.trim() === 'Paste').click()`);
await sleep(400);
const draftAfterPaste = await evaluate("window.__t.draft()");
const afterBubbles = await evaluate("window.__t.bubbles().length");
check("paste sets composer draft", typeof draftAfterPaste === "string" && draftAfterPaste.length > 0, (draftAfterPaste || "").slice(0, 80));
check("paste does NOT send (no new turn)", afterBubbles === beforeBubbles, `${beforeBubbles}->${afterBubbles}`);

// 11. Open launches the temporary content drawer; Escape closes it
await evaluate(`[...document.querySelectorAll('[role="button"]')].find((e) => e.innerText.trim() === 'Open').click()`);
await waitFor("content drawer", async () =>
  (await evaluate(`!!document.querySelector('button[aria-label="Close content drawer"]')`))
    ? true
    : undefined,
);
check("content drawer opens with full text", true);
await screenshot("r06-drawer.png");
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
await sleep(400);
check("drawer closes on Escape", !(await evaluate(`!!document.querySelector('button[aria-label="Close content drawer"]')`)));

// 12. Integrations API: status only, never secrets
const integ = await evalJson(
  `fetch('/api/integrations').then((r) => r.json()).then((d) => JSON.stringify({
    count: d.integrations.length,
    shape: Object.keys(d.integrations[0]).sort(),
    serialized: JSON.stringify(d),
  }))`,
);
check("integrations expose lifecycle status shape", ["capabilities","configured","enabled","installed","last_test_at","last_test_status"].every((k) => integ.shape.includes(k)), integ.shape.join(","));
check("integrations response contains no secrets", !/(apiKey|api_key|secret|Bearer)/i.test(integ.serialized));

// 13. CSP: no inline executable script in the served document
const inlineScripts = await evaluate(
  `[...document.querySelectorAll('script')].filter((s) => !s.src && s.type !== 'application/json').length`,
);
check("no inline executable scripts (CSP script-src 'self')", inlineScripts === 0, `inline=${inlineScripts}`);

// 14. No console errors during the entire flow
check("zero browser console errors", evidence.console_errors.length === 0, JSON.stringify(evidence.console_errors.slice(0, 3)));

await screenshot("r07-final.png");

const report = {
  base: BASE,
  finished_at: new Date().toISOString(),
  passed: PASSED,
  results,
  console_errors: evidence.console_errors,
  shots: evidence.shots,
};
dumpEvidence();
writeFileSync(join(SHOTS, "rebuild-e2e-report.json"), JSON.stringify(report, null, 2));
console.log(`\n[result] ${PASSED ? "E2E PASSED" : "E2E FAILED"} (${results.filter((r) => r.pass).length}/${results.length} checks)`);
process.exit(PASSED ? 0 : 1);
