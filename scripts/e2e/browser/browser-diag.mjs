// Diagnostic: inspect the live browser's fetch records, console errors, and DOM state.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..", "..");
const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const t = targets.find((x) => x.type === "page");
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((ok, err) => { ws.addEventListener("open", ok, { once: true }); ws.addEventListener("error", err, { once: true }); });
let id = 1; const pending = new Map();
ws.addEventListener("message", (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { const { ok } = pending.get(msg.id); pending.delete(msg.id); ok(msg.result); } });
const send = (method, params = {}) => new Promise((ok) => { const i = id++; pending.set(i, { ok }); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable");
const evalR = await send("Runtime.evaluate", {
  expression: `JSON.stringify({
    title:document.title,
    readyLabel:document.getElementById('ready-label')?.textContent||'',
    generateDisabled:document.getElementById('generate')?.disabled,
    chatHtml:(document.getElementById('chat')?.innerHTML||'').slice(0,500),
    convId:localStorage.getItem('oneshot.currentConversationId')||'',
    runId:localStorage.getItem('oneshot.currentRunId')||'',
    requests:(window.__abRequests||[]).slice(-8),
    events:(window.__abEvents||[]).length
  })`,
  returnByValue: true,
});
console.log("DIAG=" + (evalR.result?.value || JSON.stringify(evalR)));
process.exit(0);