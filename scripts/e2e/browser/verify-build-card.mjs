import { cdp, evaluate, screenshot, startSession } from "./cdp-session.mjs";
import { sleep, waitFor } from "./cdp-core.mjs";
const TOKEN = process.env.ONESHOT_API_TOKEN || "";
const RUN_ID = "0c5f9403-8e47-4146-b950-2c18d8322628";
const ev = async (expr) => await evaluate(expr);
try {
  await startSession();
  await ev(`sessionStorage.setItem('oneshot.accessToken', ${JSON.stringify(TOKEN)}); localStorage.setItem('oneshot.currentRunId', ${JSON.stringify(RUN_ID)});`);
  await cdp.send("Page.navigate", { url: "http://127.0.0.1:8787/" });
  await waitFor("page load", async () => (await ev("document.readyState")) === "complete" ? true : undefined, { timeout: 20_000 });
  await waitFor("build card", async () => (await ev("!!document.getElementById('build-review-card')")) ? true : undefined, { timeout: 30_000 });
  console.log("BUILD CARD VISIBLE");
  await screenshot("build-card.png");
  await ev('document.querySelector(\'#build-review-card [data-gate-action="approve"]\').click();');
  console.log("APPROVE CLICKED");
  await waitFor("Passed", async () => (await ev("document.getElementById('ready-label')?.textContent")) === "Passed" ? true : undefined, { timeout: 120_000 });
  console.log("DONE Passed");
  await screenshot("done.png");
  const mut = await ev(`fetch('/api/runs/${RUN_ID}/artifacts/file-mutations', { headers: { Authorization: 'Bearer ${TOKEN}' } }).then(r => r.json())`);
  console.log("MUTATIONS:", JSON.stringify(mut, null, 2));
  await ev("document.querySelector('.job-flip-toggle')?.click();");
  await waitFor("history select", async () => (await ev("document.querySelectorAll('#history-job-select option').length")) > 1 ? true : undefined, { timeout: 15_000 });
  await ev(`const sel = document.getElementById('history-job-select'); sel.value = ${JSON.stringify(RUN_ID)}; sel.dispatchEvent(new Event('change'));`);
  await waitFor("history detail", async () => (await ev("(document.getElementById('history-job-detail')?.innerHTML || '').includes('mutation-table')")) ? true : undefined, { timeout: 15_000 });
  console.log("JOB HISTORY MUTATIONS VISIBLE");
  await screenshot("job-history.png");
} catch (e) { console.error(e); }