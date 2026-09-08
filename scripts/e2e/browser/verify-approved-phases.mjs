import { cdp, evaluate, screenshot, startSession } from "./cdp-session.mjs";
import { dumpEvidence, evidence, sleep, waitFor } from "./cdp-core.mjs";
const TOKEN = process.env.ONESHOT_API_TOKEN || "";
const checks = [];
const check = (n, p, d = "") => { checks.push({ n, p: !!p, d }); console.log(`[check] ${p ? "✓" : "✗"} ${n}${d ? ` | ${d}` : ""}`); };
const ev = async (expr) => await evaluate(expr);
const api = async (path) => await evaluate(`fetch('${path}', { headers: { Authorization: 'Bearer ${TOKEN}' } }).then(async r => r.ok ? r.json() : { __error: r.status })`);
const post = async (path, body) => await evaluate(`fetch('${path}', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ${TOKEN}' }, body: ${JSON.stringify(JSON.stringify(body))} }).then(async r => r.ok ? r.json() : { __error: r.status })`);
const state = async () => JSON.parse(await ev(`JSON.stringify({ runId: localStorage.getItem('oneshot.currentRunId'), readyLabel: document.getElementById('ready-label')?.textContent||'', hasResearchCard: !!document.getElementById('research-summary-card'), hasBuildCard: !!document.getElementById('build-review-card'), composerPlaceholder: document.querySelector('#message')?.placeholder||'', composerMode: document.querySelector('#message')?.dataset.mode||'', chatMessages: [...document.querySelectorAll('[data-testid^="chat-message-"]')].map(m => ({ tid: m.dataset.testid, text: m.innerText.slice(0,80) })) })`));

try {
  await startSession();
  await ev(`sessionStorage.setItem('oneshot.accessToken', ${JSON.stringify(TOKEN)}); localStorage.clear(); sessionStorage.removeItem('oneshot.currentRunId'); sessionStorage.removeItem('oneshot.currentConversationId');`);
  await cdp.send("Page.reload");
  await waitFor("page load", async () => (await ev("document.readyState")) === "complete" ? true : undefined, { timeout: 20_000 });
  await waitFor("chat input", async () => (await ev("!!document.querySelector('#message')")) ? true : undefined, { timeout: 20_000 });
  await screenshot("01-initial.png");

  await ev(`const input = document.querySelector('#message'); input.value = 'Run a deterministic proof that creates files in the sandbox'; input.dispatchEvent(new Event('input'));`);
  await sleep(100); await ev("document.querySelector('#send').click();");
  await waitFor("ready", async () => (await ev("document.getElementById('ready-label')?.textContent")) === "Ready" ? true : undefined, { timeout: 30_000 });
  await screenshot("02-prompt-ready.png");

  await ev("document.getElementById('generate').click();");
  await waitFor("research card", async () => (await ev("!!document.getElementById('research-summary-card')")) ? true : undefined, { timeout: 60_000 });
  let s = await state();
  check("Research Summary card", s.hasResearchCard, `badge=${s.readyLabel}`);
  const runId = await ev("localStorage.getItem('oneshot.currentRunId')"); check("Run ID assigned", !!runId, runId);
  const convId = await ev("localStorage.getItem('oneshot.currentConversationId')"); check("Conversation ID assigned", !!convId, convId);
  await screenshot("03-research-review.png");

  // Active-run normal chat proof via the same HTTP contract the composer uses.
  const normalResp = await post(`/api/conversations/${encodeURIComponent(convId)}/messages`, { message: "NORMAL_CHAT_TEST", run_id: runId, intent_kind: "normal" });
  check("Normal chat POST accepted", normalResp && !normalResp.__error, normalResp.__error || "OK");
  await sleep(500);
  await cdp.send("Page.reload");
  await waitFor("page load after reload", async () => (await ev("document.readyState")) === "complete" ? true : undefined, { timeout: 20_000 });
  await waitFor("research card after reload", async () => (await ev("!!document.getElementById('research-summary-card')")) ? true : undefined, { timeout: 60_000 });
  await waitFor("chat includes normal", async () => { const msgs = await ev("[...document.querySelectorAll('[data-testid^=\\\"chat-message-\\\"]')].map(m=>m.innerText)"); return Array.isArray(msgs) && msgs.some(t=>t.includes('NORMAL_CHAT_TEST')) ? true : undefined; }, { timeout: 15_000 });
  s = await state();
  check("Normal chat appears after reload", s.chatMessages.some(m => m.text.includes("NORMAL_CHAT_TEST")));
  check("Research card stays active after normal chat", s.hasResearchCard && (await ev("localStorage.getItem('oneshot.currentRunId')")) === runId);
  await screenshot("04-normal-chat.png");

  await ev("document.querySelector('#research-summary-card [data-research-again]').click();");
  await waitFor("send ready", async () => (await ev("!document.querySelector('#send').disabled")) ? true : undefined, { timeout: 5_000 });
  s = await state();
  check("Composer RA mode", s.composerPlaceholder === "Instruction for Research Again…" && s.composerMode === "research-again", s.composerPlaceholder);
  await screenshot("05-research-again-mode.png");

  await ev(`const input = document.querySelector('#message'); input.value = 'Emphasize sandbox file mutation evidence'; input.dispatchEvent(new Event('input'));`);
  await sleep(100); await ev("document.querySelector('#send').click();");
  // Wait for the Research Again revision to actually complete server-side.
  await waitFor(
    "researcher rerun completed",
    async () => {
      const snap = await api(`/api/runs/${encodeURIComponent(runId)}`);
      const completed = Array.isArray(snap.events)
        ? snap.events.filter((e) => e.processor === "Researcher" && e.execution_status === "Completed").length
        : 0;
      return completed >= 2 ? snap : undefined;
    },
    { timeout: 60_000 },
  );
  const raSnap = await api(`/api/runs/${encodeURIComponent(runId)}`);
  check("Same run_id after RA", raSnap.run_id === runId, raSnap.run_id);
  check("Research bundle revision preserved", !!raSnap.artifacts?.["research_bundle.v0"] && !!raSnap.artifacts?.["research_bundle"]);
  await waitFor("research card after rerun", async () => (await ev("!!document.getElementById('research-summary-card')")) ? true : undefined, { timeout: 10_000 });
  await screenshot("07-research-review-rerun.png");

  await ev("document.querySelector('#research-summary-card [data-accept-research]').click();");
  // Pipeline runs to BuildReady; the live UI only refreshes on a reconnect.
  // Poll the snapshot until the processor reaches BuildReady, then reload so the build-review card renders.
  await waitFor(
    "build ready",
    async () => {
      const snap = await api(`/api/runs/${encodeURIComponent(runId)}`);
      return snap.current_processor === "BuildReady" ? snap : undefined;
    },
    { timeout: 60_000 },
  );
  await cdp.send("Page.reload");
  await waitFor("page load after hash", async () => (await ev("document.readyState")) === "complete" ? true : undefined, { timeout: 20_000 });
  await waitFor("build card after reload", async () => (await ev("!!document.getElementById('build-review-card')")) ? true : undefined, { timeout: 60_000 });
  s = await state(); check("Build Ready card", s.hasBuildCard, s.readyLabel);
  await screenshot("08-build-review.png");

  await ev('document.querySelector(\'#build-review-card [data-gate-action="approve"]\').click();');
  // The UI does not live-update for the terminal transition; poll the backend and reload.
  await waitFor("run done", async () => {
    const snap = await api(`/api/runs/${encodeURIComponent(runId)}`);
    return snap.pipeline_status === "Done" && snap.test_result === "Passed" ? snap : undefined;
  }, { timeout: 120_000 });
  await cdp.send("Page.reload");
  await waitFor("page load after done", async () => (await ev("document.readyState")) === "complete" ? true : undefined, { timeout: 20_000 });
  await waitFor("terminal passed label", async () => (await ev("document.getElementById('ready-label')?.textContent")) === "Passed" ? true : undefined, { timeout: 30_000 });
  s = await state(); check("Terminal Passed", s.readyLabel === "Passed"); check("Run_id stable", (await ev("localStorage.getItem('oneshot.currentRunId')")) === runId, runId);
  await screenshot("09-done.png");

  const snap = await api(`/api/runs/${encodeURIComponent(runId)}`);
  check("Snapshot Passed", snap.test_result === "Passed", snap.test_result);
  check("Hash equal", !!snap.hash_proof?.equal, JSON.stringify(snap.hash_proof));
  const mut = await api(`/api/runs/${encodeURIComponent(runId)}/artifacts/file-mutations`);
  check("Mutations artifact", !!mut && !mut.__error);
  const recs = mut?.records || []; check("Mutation records", recs.length > 0, `records=${recs.length}`);
  const created = recs.filter(r => r.action === "created").map(r => r.path);
  check("Created files", created.length >= 2, created.join(", "));

  await ev("document.querySelector('.job-flip-toggle')?.click();");
  await waitFor("history select", async () => (await ev("document.querySelectorAll('#history-job-select option').length")) > 1 ? true : undefined, { timeout: 15_000 });
  await ev(`const sel = document.getElementById('history-job-select'); sel.value = ${JSON.stringify(runId)}; sel.dispatchEvent(new Event('change'));`);
  await waitFor("history detail", async () => (await ev("(document.getElementById('history-job-detail')?.innerHTML || '').includes('mutation-table')")) ? true : undefined, { timeout: 15_000 });
  check("Job History table", true);
  await screenshot("10-job-history.png");

  const finalSnap = await api(`/api/runs/${encodeURIComponent(runId)}`);
  const evts = finalSnap?.events || [];
  const done = n => evts.filter(e => e.processor === n && e.execution_status === "Completed").length;
  // Regression: Research Again (researcher v0 -> v1) must not re-trigger the Refactor/Gap/Evaluation loop.
  check("Researcher count after RA", done("Researcher") === 2, done("Researcher"));
  check("One Planner", done("Planner") === 1, done("Planner"));
  check("One Refactor", done("Refactor") === 1, done("Refactor"));
  check("One GapAnalysis", done("GapAnalysis") === 1, done("GapAnalysis"));
  check("One Evaluation", done("Evaluation") === 1, done("Evaluation"));
  check("One Builder", done("Builder") === 1, done("Builder"));
  check("One Done", done("Done") === 1, done("Done"));

  evidence.checks = checks; dumpEvidence();
  const failed = checks.filter(c => !c.p);
  if (failed.length) { console.log("\nFAILED:"); failed.forEach(c => console.log(`  ✗ ${c.n}: ${c.d}`)); process.exit(1); }
  console.log("\nAll browser checks passed.");
  process.exit(0);
} catch (err) { console.error(err); dumpEvidence(); process.exit(1); }