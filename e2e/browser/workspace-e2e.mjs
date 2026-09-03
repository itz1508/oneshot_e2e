// Scoped workspace E2E: verify the app now renders the real repo tree from the runtime.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const TOKEN = Object.fromEntries(readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).map((l) => { const m = l.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/); return m ? [m[1], m[2].trim()] : null; }).filter(Boolean)).ONESHOT_API_TOKEN;

const list = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = list.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok, e) => { ws.onopen = ok; ws.onerror = e; });
let id = 1; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = id++; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const inject = `(function(){
  try { sessionStorage.setItem('oneshot.accessToken', ${JSON.stringify(TOKEN)}); } catch(e){}
  if (window.__wsreset) return; window.__wsreset = true;
  try { if(!sessionStorage.getItem('__wsOnce')){ sessionStorage.setItem('__wsOnce','1'); ['oneshot.currentRunId','oneshot.currentConversationId','oneshot.currentPromptId'].forEach(function(k){localStorage.removeItem(k);}); } } catch(e){}
})();`;
await send("Page.addScriptToEvaluateOnNewDocument", { source: inject });
await send("Page.navigate", { url: "http://127.0.0.1:8787" });

async function waitFor(n, fn, t = 20000) { const dl = Date.now() + t; for (;;) { let v; try { v = await fn(); } catch { v = undefined; } if (v !== undefined && v !== false && v !== null) return v; if (Date.now() > dl) throw new Error("timeout " + n); await sleep(200); } }

await waitFor("rows", async () => (await ev("document.querySelectorAll('#workspace-tree .tree-row').length")) > 5);
const rows = await ev(`JSON.stringify([].slice.call(document.querySelectorAll('#workspace-tree .tree-row')).map(function(b){return b.textContent.trim();}))`);
console.log("TREE_ROWS=" + rows);
const opened = await ev(`(function(){ var b=[].slice.call(document.querySelectorAll('#workspace-tree .tree-row')).find(function(x){return x.textContent.indexOf('package.json')!==-1;}); if(b){b.click();return true;} return false; })()`);
console.log("OPENED_PKG=" + opened);
await waitFor("file", async () => { const t = await ev("document.querySelector('.file-view')?.textContent || ''"); return t.includes('"name"') ? t : undefined; }, 12000);
const fv = await ev("document.querySelector('.file-view')?.textContent || ''");
console.log("FILE_VIEW_HEAD=" + JSON.stringify(fv.slice(0, 60)));
console.log("WS_E2E=" + (!!opened && fv.includes('"name"') ? "PASS" : "FAIL"));
process.exit((!!opened && fv.includes('"name"')) ? 0 : 1);