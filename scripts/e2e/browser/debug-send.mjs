import { evaluate, screenshot, startSession } from "./cdp-session.mjs";
import { sleep, waitFor } from "./cdp-core.mjs";
const ev = async (expr) => await evaluate(expr);
const setText = async (text) => await ev(`const input = document.querySelector('#message'); input.value = ${JSON.stringify(text)}; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();`);

try {
  await startSession();
  await ev(`localStorage.clear(); sessionStorage.removeItem('oneshot.currentRunId'); sessionStorage.removeItem('oneshot.currentConversationId'); location.reload();`);
  await waitFor("page load", async () => (await ev("document.readyState")) === "complete" ? true : undefined, { timeout: 20_000 });
  await waitFor("chat input", async () => (await ev("!!document.querySelector('#message')")) ? true : undefined, { timeout: 20_000 });
  await setText('Run a deterministic proof that creates files in the sandbox');
  await ev("document.querySelector('#send').click();");
  await waitFor("ready", async () => (await ev("document.getElementById('ready-label')?.textContent")) === "Ready" ? true : undefined, { timeout: 30_000 });
  await ev("document.getElementById('generate').click();");
  await waitFor("research card", async () => (await ev("!!document.getElementById('research-summary-card')")) ? true : undefined, { timeout: 60_000 });
  await sleep(500);
  const before = await ev(`JSON.stringify({ sendDisabled: document.querySelector('#send').disabled, sendOnclick: typeof document.querySelector('#send').onclick, inputTag: document.querySelector('#message')?.tagName, inputDisabled: document.querySelector('#message')?.disabled, inputReadOnly: document.querySelector('#message')?.readOnly, inputValue: document.querySelector('#message')?.value, runId: localStorage.getItem('oneshot.currentRunId'), convId: localStorage.getItem('oneshot.currentConversationId') })`);
  console.log("BEFORE NORMAL:", before);
  await setText('DEBUG normal chat note');
  const mid = await ev(`JSON.stringify({ inputValue: document.querySelector('#message')?.value })`);
  console.log("AFTER SET VALUE:", mid);
  await ev("document.querySelector('#send').click();");
  await sleep(500);
  const after = await ev(`JSON.stringify({ sendDisabled: document.querySelector('#send').disabled, inputValue: document.querySelector('#message')?.value, chat: [...document.querySelectorAll('[data-testid^="chat-message-"]')].map(m=>m.innerText) })`);
  console.log("AFTER CLICK:", after);
  await sleep(2000);
  const later = await ev(`JSON.stringify({ chat: [...document.querySelectorAll('[data-testid^="chat-message-"]')].map(m=>m.innerText) })`);
  console.log("2s LATER:", later);
  await screenshot("debug.png");
} catch (e) { console.error(e); }