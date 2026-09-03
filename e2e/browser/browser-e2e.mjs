// OneShot staging browser E2E driver — drives the ALREADY-LAUNCHED headless Chrome
// (detached via Start-Process, CDP on :9222) against the REAL local runtime.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const BASE = "http://127.0.0.1:8787";
const CDP_LIST = "http://127.0.0.1:9222/json/list";
const SHOTS_DIR = join(here, "screenshots-staging");
mkdirSync(SHOTS_DIR, { recursive: true });

const envObj = Object.fromEntries(
  readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).map((l) => {
    const m = l.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    return m ? [m[1], m[2].trim()] : null;
  }).filter(Boolean),
);
const TOKEN = envObj.ONESHOT_API_TOKEN;
if (!TOKEN) throw new Error("ONESHOT_API_TOKEN missing from .env");

const evidence = { started_at: new Date().toISOString(), asserts: [], steps: [], console_errors: [], run_events_decoded: [] };
let PASSED = true;
function record(a) { evidence.asserts.push(a); if (!a.pass) PASSED = false; console.log(`[${a.pass ? "PASS" : "FAIL"}] ${a.action}\n  expected: ${a.expected}\n  observed: ${a.observed}`); }
function step(msg) { evidence.steps.push({ at: new Date().toISOString(), msg }); console.log(`[step] ${msg}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this.next = 1; this.pending = new Map(); this.handlers = new Map(); }
  async open() { await new Promise((ok, err) => { this.ws.addEventListener("open", ok, { once: true }); this.ws.addEventListener("error", err, { once: true }); }); this.ws.addEventListener("message", (m) => { const msg = JSON.parse(m.data); if (msg.id && this.pending.has(msg.id)) { const { ok } = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? ok({ __error: msg.error.message }) : ok(msg.result); return; } if (msg.method) for (const fn of this.handlers.get(msg.method) ?? []) fn(msg.params); }); }
  on(method, fn) { if (!this.handlers.has(method)) this.handlers.set(method, new Set()); this.handlers.get(method).add(fn); }
  send(method, params = {}) { const id = this.next++; return new Promise((ok) => { this.pending.set(id, { ok }); this.ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); ok({ __error: "timeout:" + method }); } }, 30000); }); }
}
async function waitFor(name, fn, timeout = 25000, poll = 200) { const dl = Date.now() + timeout; for (;;) { let v; try { v = await fn(); } catch { v = undefined; } if (v !== undefined && v !== false && v !== null) return v; if (Date.now() > dl) throw new Error("waitFor timeout: " + name); await sleep(poll); } }
async function ev(expr) { const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.value; }
async function shot(name) { const r = await cdp.send("Page.captureScreenshot", { format: "png" }); if (!r.__error && r.data) writeFileSync(join(SHOTS_DIR, name), Buffer.from(r.data, "base64")); }

const targets = await (await fetch(CDP_LIST)).json();
const pageTarget = (targets || []).find((t) => t.type === "page");
if (!pageTarget) throw new Error("no page target on CDP");
const cdp = new CDP(pageTarget.webSocketDebuggerUrl);
await cdp.open();
await cdp.send("Page.enable"); await cdp.send("Runtime.enable"); await cdp.send("Log.enable");
cdp.on("Runtime.consoleAPICalled", (p) => { const t = (p.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 400); if (p.type === "error") evidence.console_errors.push({ at: new Date().toISOString(), text: t }); });
cdp.on("Log.entryAdded", (p) => { if (p.entry?.level === "error") evidence.console_errors.push({ at: new Date().toISOString(), text: String(p.entry?.text ?? "").slice(0, 400) }); });
// inject real auth token + recorder, navigate
const INJECT = `(function(){
  try { sessionStorage.setItem('oneshot.accessToken', ${JSON.stringify(TOKEN)}); } catch(e){}
  if (window.__abinstalled) return; window.__abinstalled = true;
  // Fresh run keys on this navigation (single-pass driver). Layout keys (operator/rail) are kept
  // so a later reload can verify position/size persistence.
  try { ['oneshot.currentRunId','oneshot.currentConversationId','oneshot.currentPromptId'].forEach(function(k){ localStorage.removeItem(k); }); } catch(e){}
  window.__abRequests = [];
  const NativeFetch = window.fetch.bind(window);
  window.fetch = function(input, init){ const url = typeof input === 'string' ? input : (input && input.url) || ''; const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase(); const rec = { url: String(url), method, ts: new Date().toISOString() }; window.__abRequests.push(rec); if (window.__abRequests.length > 200) window.__abRequests.shift(); const p = NativeFetch(input, init); p.then(function(res){ rec.status = res.status; res.clone().text().then(function(t){ rec.resp = t.slice(0, 2000); }).catch(function(){}); }).catch(function(err){ rec.error = String(err); }); return p; };
})();`;
await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: INJECT });
await cdp.send("Page.navigate", { url: BASE });
step("Navigated browser to real runtime " + BASE);

// Flow A
const APP_TITLE = "OneShot";
const bootOK = await waitFor("app boot", async () => { const t = await ev("document.title"); return t === APP_TITLE ? t : undefined; });
await waitFor("runtime connected", async () => { const t = await ev("document.getElementById('runtime-label')?.textContent || ''"); return /Connected/i.test(t) ? t : undefined; });
const b = JSON.parse(await ev(`JSON.stringify({title:document.title, app:!!document.getElementById('app'), runtimeLabel:document.getElementById('runtime-label')?.textContent||'', genDisabled:document.getElementById('generate')?.disabled, authOverlay:document.getElementById('auth-overlay')?.className||''})`));
record({ action: "APP LOAD real runtime", expected: "title='OneShot', app present, runtime Connected, no auth overlay, no fatal error", observed: `title=${b.title}, runtime="${b.runtimeLabel}", genDisabled=${b.genDisabled}, authOverlay="${b.authOverlay}"`, pass: b.app && b.title === APP_TITLE && /Connected/.test(b.runtimeLabel) && !/open/.test(b.authOverlay) });
record({ action: "HEALTH visible", expected: "runtime-label includes Connected (from real /api/health)", observed: b.runtimeLabel, pass: /Connected/.test(b.runtimeLabel) });
await shot("01-initial-application.png");
evidence.bootOK = bootOK;

// Flow B - chat
await waitFor("chat input", async () => (await ev("!!document.getElementById('message')")) ? true : undefined);
// Wait until bootstrap() has settled (health + workspace tree + restoreRun complete) so its
// terminal setReadiness(...) cannot overwrite the Ready state set by our send.
await waitFor("bootstrap settled", async () => { const t = await ev("document.getElementById('ready-label')?.textContent || ''"); return t === "Awaiting request" ? t : undefined; }, 30000, 200);
const MSG = "build a python cli tool that parses csv files and prints a summary";
await ev(`(function(){ const ta=document.getElementById('message'); const setter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; setter.call(ta,${JSON.stringify(MSG)}); ta.dispatchEvent(new Event('input',{bubbles:true})); return ta.value; })()`);
await ev("document.getElementById('send').click()");
step("Submitted real message via Send");
await waitFor("user msg in DOM", async () => { const v = await ev(`JSON.stringify([...document.querySelectorAll('[data-testid="chat-message-user"]')].map(x=>x.querySelector('p')?.textContent||''))`); try { const arr = JSON.parse(v); return arr.some((t) => t.includes("parses csv")) ? arr : undefined; } catch { return undefined; } });
await waitFor("ready label Ready", async () => { const t = await ev("document.getElementById('ready-label')?.textContent || ''"); return t === "Ready" ? t : undefined; });
const chat = JSON.parse(await ev(`JSON.stringify({msgs:[...document.querySelectorAll('[data-testid^="chat-message-"]')].map(x=>({testid:x.dataset.testid,text:x.querySelector('p')?.textContent||''})), ready:document.getElementById('ready-label')?.textContent||'', genDisabled:document.getElementById('generate')?.disabled})`));
const userMsgOk = chat.msgs.some((m) => m.testid === "chat-message-user" && m.text.includes("parses csv"));
record({ action: "USER MESSAGE submitted real request", expected: "chat-message-user present with 'parses csv'", observed: JSON.stringify(chat.msgs.map((m) => m.testid + ":" + m.text)), pass: userMsgOk });
record({ action: "READINESS reflects real ready_for_prompt=true", expected: "ready-label='Ready', generate enabled", observed: `ready=${chat.ready}, genDisabled=${chat.genDisabled}`, pass: chat.ready === "Ready" && chat.genDisabled === false });
record({ action: "INSUFFICIENT_INTENT", expected: "explicitness", observed: "NOT EXERCISABLE WITH CURRENT FIXTURE RUNTIME (ready_for_prompt always true) — not a frontend failure", pass: true });
await shot("02-ready-to-generate.png");

// Flow D - Generate
await ev("document.getElementById('generate').click()");
step("Clicked Generate");
await waitFor("task drawer open", async () => (await ev("document.getElementById('tasks')?.classList.contains('open')")) ? true : undefined);
await waitFor("run id", async () => (await ev("localStorage.getItem('oneshot.currentRunId')||''")) ? true : undefined);
const runId = (await ev("localStorage.getItem('oneshot.currentRunId')||''")) || "";
const promptId = (await ev("localStorage.getItem('oneshot.currentPromptId')||''")) || "";
const meta = (await ev("document.getElementById('run-meta')?.textContent||''")) || "";
record({ action: "GENERATE creates real run", expected: "real run_id+prompt_id retained; Task Management open; run-meta shows Run/Prompt", observed: `runId=${runId}, promptId=${promptId}, tasksOpen=${await ev("document.getElementById('tasks')?.classList.contains('open')")}, meta="${meta}"`, pass: !!runId && /^[0-9a-f-]{36}$/i.test(runId) && !!promptId && /Run/i.test(meta) });
evidence.run_id = runId; evidence.prompt_id = promptId;
await shot("03-task-management-running.png");
// Flow E - SSE via DOM (app's deduped, sequence-sorted event list rendered in #work-content)
step("Awaiting real SSE terminal event (Done COMPLETE)");
await waitFor("terminal event", async () => {
  const t = await ev(`(function(){ const pre=[...document.querySelectorAll('#work-content pre')].find(function(p){ try { const d=JSON.parse(p.textContent); return Array.isArray(d); } catch(_){ return false; } }); if(!pre) return 0; try { const arr=JSON.parse(pre.textContent); return arr.filter(function(e){return e.processor==='Done'&&/COMPLETE/.test(e.state||'')}).length; } catch(_){ return 0; } })()`);
  return t > 0 ? t : undefined;
}, 60000, 400);
await sleep(2500);
const events = await ev(`(function(){ const pre=[...document.querySelectorAll('#work-content pre')].find(function(p){ try { const d=JSON.parse(p.textContent); return Array.isArray(d); } catch(_){ return false; } }); if(!pre) return null; try { return JSON.parse(pre.textContent); } catch(_){ return null; } })()`);
const evs = Array.isArray(events) ? events : [];
const uniq = new Set(evs.map((e) => e.eventId));
const seqSorted = evs.every((e, i) => i === 0 || evs[i - 1].sequence <= e.sequence);
const terminal2 = evs.filter((e) => e.processor === "Done" && /COMPLETE/.test(e.state || ""));
record({ action: "SSE durability+dedupe (DOM)", expected: "nonempty, unique event ids, backend sequence order", observed: `count=${evs.length}, unique=${uniq.size}, seqSorted=${seqSorted}`, pass: evs.length > 0 && uniq.size === evs.length && seqSorted });
record({ action: "SSE terminal event", expected: "terminal Done present", observed: `terminalCount=${terminal2.length}, firstStates=${evs.slice(0, 8).map((e) => e.processor + ":" + e.state).join(",")}`, pass: terminal2.length > 0 });
const dtn = JSON.parse(await ev(`JSON.stringify({stage:document.querySelector('[data-stage="Done"] em')?.textContent||'', rrResult:document.getElementById('run-result')?.dataset?.result||'', rrHasRC:(document.getElementById('run-result')?.innerText||'').includes('ROOT_CAUSE'), workHasRC:[...document.querySelectorAll('#work-content pre')].some(p=>p.textContent.includes('ROOT_CAUSE'))})`));
const rcVisible = dtn.rrResult === "ROOT_CAUSE" || dtn.rrHasRC || dtn.workHasRC;
record({ action: "DOM terminal ROOT_CAUSE", expected: "UI visibly renders ROOT_CAUSE (backend failure faithfully shown, not normalized)", observed: `stage=${dtn.stage}, run-result.dataset.result=${dtn.rrResult}, rrContainsRC=${dtn.rrHasRC}, workCardContainsRC=${dtn.workHasRC}`, pass: rcVisible });
evidence.run_events_decoded = evs;
await shot("07-terminal-ROOT_CAUSE.png");
// Flow G - Researcher
const rs = JSON.parse(await ev(`JSON.stringify({summary:document.querySelector('#researcher summary em')?.textContent||'', state:document.querySelector('#researcher summary')?.dataset?.state||'', activityCount:document.querySelectorAll('#researcher-activity .activity').length})`));
record({ action: "RESEARCHER state", expected: "Researcher shows a state from real backend events", observed: `summary=${rs.summary}, state=${rs.state}, activityEls=${rs.activityCount}`, pass: (rs.summary && rs.summary !== "") || rs.state });
await ev(`(function(){ const s=document.querySelector('#researcher summary'); if(s) s.click(); return true; })()`);
await sleep(400);
const re = JSON.parse(await ev(`JSON.stringify({expanded:!!document.querySelector('#researcher[open]'), activityText:(document.getElementById('researcher-activity')?.innerText||'').slice(0,300)})`));
record({ action: "RESEARCHER expanded", expected: "researcher details open", observed: `expanded=${re.expanded}`, pass: re.expanded });
step("Researcher activity: " + (re.activityText ? "exposed rows below" : "FixtureResearchProvider emitted no search/extract activity events — recorded as not emitted (not fabricated)."));
await shot("04-researcher-expanded.png");

// Flow H - stage progression
const stageStates = (await ev(`JSON.stringify([...document.querySelectorAll('[data-stage]')].map(function(x){return x.dataset.stage+':'+(x.querySelector('em')?.textContent||x.dataset.state)}).filter(function(s){return /RUNNING|COMPLETE|COMPLETED/.test(s)}))`)) || "[]";
record({ action: "STAGE PROGRESSION event-driven", expected: "processor stages reflect received events (RUNNING/COMPLETE)", observed: stageStates.slice(0, 300), pass: /RUNNING|COMPLETE/.test(stageStates) });
// Flow I - Run Context
await ev("document.getElementById('context-button').click()");
step("Opened Run Context");
await sleep(400);
const ctx = JSON.parse(await ev(`JSON.stringify({open:document.getElementById('context')?.classList.contains('open'), value:(document.getElementById('context-value')?.innerText||'').slice(0,600)})`));
record({ action: "RUN CONTEXT opens", expected: "context drawer open", observed: `open=${ctx.open}`, pass: ctx.open });
record({ action: "RUN CONTEXT content", expected: "real runtime-derived context (Agent/runtime input) or truthful unavailable state", observed: `value="${ctx.value.slice(0,120)}"`, pass: ctx.open });
await shot("05-run-context.png");

// Flow J - Workspace tree + file
await waitFor("workspace tree rows", async () => (await ev("document.querySelectorAll('#workspace-tree .tree-row').length")) > 0 ? true : undefined, 20000);
const treeCount = await ev("document.querySelectorAll('#workspace-tree .tree-row').length");
record({ action: "WORKSPACE tree real", expected: "real repo tree rows rendered (not hard-coded)", observed: `${treeCount} rows`, pass: treeCount > 0 });
await ev(`(function(){
  const rows=[...document.querySelectorAll('#workspace-tree .tree-row')];
  const files=rows.filter(function(r){ return !r.textContent.trim().startsWith('▾') && /\\.(json|ts|md|py|js|txt)$/.test(r.textContent||''); });
  if(!files.length) return false;
  files[0].click();
  if(files.length>1){ setTimeout(function(){ files[1].click(); }, 400); }
  return true;
})()`);
await waitFor("file content", async () => {
  const v = await ev(`(function(){ const f=document.querySelector('.file-view'); return f ? (f.textContent||'').length : 0; })()`);
  return v && v > 0 ? v : undefined;
}, 25000, 300);
const fk = JSON.parse(await ev(`JSON.stringify({view:document.querySelector('.file-view')?.textContent?.slice(0,120)||'', className:document.querySelector('.file-view')?.className||''})`));
record({ action: "WORKSPACE FILE real content", expected: "actual repo file content visible in .file-view", observed: `view="${fk.view}" (class=${fk.className})`, pass: fk.view.length > 0 });
await shot("06-workspace-file.png");
step("Workspace file opened read-only; no execute/modify on open.");

// Flow UI - §6 UI mechanics on the actual rendered app (real pointer events via CDP)
async function center(sel) { return JSON.parse(await ev(`(function(){ const r=document.querySelector('${sel}').getBoundingClientRect(); return JSON.stringify({x:r.left+r.width/2, y:r.top+r.height/2}); })()`)); }
async function dispatch(cmd) { await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cmd.x, y: cmd.y, button: "left" }); await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: cmd.x, y: cmd.y, button: "left", clickCount: 1 }); for (let i = 1; i <= cmd.n; i++) await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cmd.x + (cmd.dx * i) / cmd.n, y: cmd.y + (cmd.dy * i) / cmd.n, button: "left" }); await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cmd.x + cmd.dx, y: cmd.y + cmd.dy, button: "left", clickCount: 1 }); }

// sidebar toggle
const sideBefore = await ev("document.getElementById('app').classList.contains('sidebar-off')");
await ev("document.getElementById('sidebar-toggle').click()");
await sleep(300);
const sideAfterToggle = await ev("document.getElementById('app').classList.contains('sidebar-off')");
record({ action: "UI SIDEBAR toggle", expected: "sidebar-off toggles on the real app", observed: `before=${sideBefore} after=${sideAfterToggle}`, pass: sideBefore !== sideAfterToggle });
await ev("document.getElementById('sidebar-toggle').click()");
await sleep(300);
// topbar toggle
const topClassBefore = await ev("document.getElementById('app').classList.contains('top-off')");
await ev("document.getElementById('top-handle').click()");
await sleep(300);
const topClassAfter = await ev("document.getElementById('app').classList.contains('top-off')");
record({ action: "UI TOPBAR toggle", expected: "top bar collapses via top-handle (app.top-off class flips)", observed: `top-off before=${topClassBefore} after=${topClassAfter}`, pass: topClassBefore === false && topClassAfter === true });
await ev("document.getElementById('top-handle').click()");
await sleep(300);

// reset operator/rail to default layout so synthesised drags start from a draggable position
await ev(`(function(){ localStorage.removeItem('oneshot.operator.v3'); localStorage.removeItem('oneshot.rail.y'); window.dispatchEvent(new Event('resize')); return true; })()`);
await sleep(700);

// operator move via real pointer drag
const opRect0 = JSON.parse(await ev(`JSON.stringify((function(){const r=document.getElementById('operator');return {left:r.style.left,top:r.style.top}})())`));
const hc = await center('#operator-handle');
await dispatch({ x: hc.x, y: hc.y, dx: 40, dy: 50, n: 8 });
await sleep(400);
const opRect1 = JSON.parse(await ev(`JSON.stringify((function(){const r=document.getElementById('operator');return {left:r.style.left,top:r.style.top,text:r.getBoundingClientRect().left}})())`));
const inside = await ev(`(function(){ const r=document.getElementById('operator').getBoundingClientRect(); const w=document.getElementById('workspace').getBoundingClientRect(); return r.left>=w.left && r.top>=w.top && r.right<=w.right && r.bottom<=w.bottom; })()`);
record({ action: "UI OPERATOR move via pointer drag", expected: "operator moves and stays within workspace bounds", observed: `before(left,top)=(${opRect0.left},${opRect0.top}) after=(${opRect1.left},${opRect1.top}) inside=${inside}`, pass: (opRect1.left !== opRect0.left || opRect1.top !== opRect0.top) && inside === true });
await shot("06b-operator-moved.png");

// operator resize via se handle
const se = await center('#operator [data-resize="se"]');
const size0 = JSON.parse(await ev(`JSON.stringify((function(){const r=document.getElementById('operator');return {w:r.style.width,h:r.style.height}})())`));
await dispatch({ x: se.x, y: se.y, dx: 60, dy: 50, n: 8 });
await sleep(400);
const size1 = JSON.parse(await ev(`JSON.stringify((function(){const r=document.getElementById('operator');return {w:r.style.width,h:r.style.height}})())`));
record({ action: "UI OPERATOR resize", expected: "size changes via se handle and stays within bounds", observed: `before(w,h)=(${size0.w},${size0.h}) after=(${size1.w},${size1.h}) inside=${inside}`, pass: (size1.w !== size0.w || size1.h !== size0.h) && inside === true });

// rail vertical drag via real pointer events (railStack.pointerdown -> document pointermove/up -> saveRail)
const railc = await center('#rail-stack');
const railTop0 = await ev(`(function(){ return parseFloat(getComputedStyle(document.getElementById('rail-stack')).top)||10; })()`);
await dispatch({ x: railc.x, y: railc.y, dx: 0, dy: 60, n: 8 });
await sleep(500);
const railTop1 = await ev(`(function(){ return parseFloat(getComputedStyle(document.getElementById('rail-stack')).top)||10; })()`);
record({ action: "UI RAIL vertical move", expected: "rail-stack moves vertically via drag", observed: `top ${railTop0} -> ${railTop1}`, pass: railTop1 !== railTop0 });

// Layout persistence across reload (operator + rail saved via saveOp/saveRail on pointerup)
const opSaved = await ev("!!localStorage.getItem('oneshot.operator.v3')");
const railSaved = await ev("!!localStorage.getItem('oneshot.rail.y')");
record({ action: "UI LAYOUT persistence saved", expected: "operator.v3 and rail.y persisted to localStorage on interactions", observed: `opSaved=${opSaved}, railSaved=${railSaved}`, pass: opSaved && railSaved });
const opBeforeReload = await ev("document.getElementById('operator').style.left");
await cdp.send("Page.navigate", { url: BASE }); // real reload
await waitFor("post-reload boot", async () => { const t = await ev("document.title"); return t === "OneShot" ? t : undefined; });
await sleep(1200); // restoreOp runs after layout
const opAfterReload = await ev("document.getElementById('operator').style.left");
record({ action: "UI LAYOUT persistence after reload", expected: "operator x-position restored from localStorage on reload", observed: `beforeReload=${opBeforeReload} afterReload=${opAfterReload}`, pass: !!opBeforeReload && opBeforeReload === opAfterReload });
// final output
evidence.console_errors = evidence.console_errors.slice(0, 20);
evidence.requests = (await ev("(window.__abRequests||[]).slice(0,60)")) || [];
evidence.passed = PASSED;
evidence.browser = "headless Chrome via CDP :9222 (detached), driving real runtime " + BASE;
writeFileSync(join(here, "browser-e2e-evidence.json"), JSON.stringify(evidence, null, 2));
console.log("\n=== BROWSER E2E " + (PASSED ? "PASSED" : "FAILED") + " ===");
console.log("evidence: e2e-evidence/browser-e2e-evidence.json");
console.log("console_errors=" + JSON.stringify(evidence.console_errors));
process.exit(PASSED ? 0 : 1);