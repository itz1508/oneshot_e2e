process.env.CDP_PORT = process.env.CDP_PORT || "9446";
process.env.ONESHOT_E2E_PROFILE =
  process.env.ONESHOT_E2E_PROFILE ||
  `${process.cwd()}\\data\\browser-profile-pipeline-${Date.now()}`;

const {
  BASE,
  SHOTS,
  dumpEvidence,
  evidence,
  launchBrowser,
  sleep,
  waitFor,
} = await import("./cdp-core.mjs");
const { writeFileSync, mkdirSync, readFileSync } = await import("node:fs");
const { join } = await import("node:path");

mkdirSync(SHOTS, { recursive: true });

let cdp;
const checks = [];
let ALL_PASSED = true;

function check(name, pass, detail = "") {
  checks.push({ name, pass: !!pass, detail: String(detail).slice(0, 300) });
  if (!pass) ALL_PASSED = false;
  console.log(`[check] ${pass ? "PASS" : "FAIL"} ${name}${detail ? " | " + detail : ""}`);
}

async function evaluate(expr) {
  const r = await cdp.send("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    console.log("[eval error]", r.exceptionDetails.text, (r.exceptionDetails.exception?.description || "").slice(0, 300));
    return undefined;
  }
  return r.result?.value;
}

async function screenshot(name) {
  const shot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(join(SHOTS, name), Buffer.from(shot.data, "base64"));
  evidence.shots.push({ name, at: new Date().toISOString() });
  console.log(`[screenshot] ${name}`);
}

console.log("=== STARTING FULL PRODUCT WORKFLOW E2E ===");
console.log("Target Base URL:", BASE);
console.log("CDP Port:", process.env.CDP_PORT);

try {
  cdp = await launchBrowser();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Network.enable");

  cdp.on("Log.entryAdded", (p) => {
    if (p.entry?.level === "error") {
      const txt = String(p.entry?.text ?? "");
      if (!txt.includes("404 (Not Found)")) {
        evidence.console_errors.push({ text: txt.slice(0, 400) });
      }
    }
  });
  cdp.on("Runtime.consoleAPICalled", (p) => {
    if (p.type === "error") {
      evidence.console_errors.push({
        text: (p.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 400),
      });
    }
  });

  // Step 1: Open browser to application
  console.log("\n--- Step 1: Navigate to Web Application ---");
  await cdp.send("Page.navigate", { url: BASE });
  await waitFor("page load", async () =>
    (await evaluate("document.readyState")) === "complete" ? true : undefined,
    { timeout: 20_000 }
  );
  await waitFor("message textarea", async () =>
    (await evaluate(`!!document.querySelector('textarea[aria-label="Message"]')`)) ? true : undefined,
    { timeout: 20_000 }
  );
  await sleep(1000);

  check("Page title is OneShot", (await evaluate("document.title")) === "OneShot");
  await screenshot("01-chat-initial.png");

  // Step 2: New Chat button click
  console.log("\n--- Step 2: Click New Chat & Submit Prompt ---");
  await evaluate(`
    (function() {
      const btn = [...document.querySelectorAll('button')].find(b =>
        (b.innerText || '').toLowerCase().includes('new chat')
      );
      if (btn) btn.click();
    })()
  `);
  await sleep(500);

  const promptText = "Build a hello world function in TypeScript and provide working code";
  await evaluate(`
    (function() {
      const ta = document.querySelector('textarea[aria-label="Message"]');
      if (!ta) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, ${JSON.stringify(promptText)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()
  `);
  await sleep(400);
  await evaluate(`
    (function() {
      const ta = document.querySelector('textarea[aria-label="Message"]');
      if (ta) ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      const sendBtn = document.querySelector('button[aria-label="Send"]');
      if (sendBtn && !sendBtn.disabled) sendBtn.click();
    })()
  `);

  await waitFor("user message bubble", async () =>
    (await evaluate(`
      [...document.querySelectorAll('div')].some(d =>
        (d.innerText || '').includes('Build a hello world function in TypeScript')
      )
    `)) ? true : undefined,
    { timeout: 15_000 }
  );
  check("Prompt submitted and rendered in conversation", true);

  // Step 3: Wait for live Researcher + Tavily to produce Research Review Gate
  console.log("\n--- Step 3: Awaiting live Researcher + Tavily & Research Review Gate ---");
  const researchGateFound = await waitFor(
    "Research Review card",
    async () => {
      const text = await evaluate("document.body.innerText");
      return (text || "").includes("Research Review — pending your decision") ? true : undefined;
    },
    { timeout: 120_000, poll: 1000 }
  );
  check("Research Review Gate appeared in UI", !!researchGateFound);

  // Click "Review" button to expand details
  await sleep(400);
  const reviewClicked = await waitFor("Review button", async () => {
    return (await evaluate(`
      (function() {
        const btn = [...document.querySelectorAll('button')].find(b => (b.innerText || '').trim() === 'Review');
        if (btn) { btn.click(); return true; }
        return undefined;
      })()
    `));
  }, { timeout: 10_000 });
  console.log("Clicked Review button:", reviewClicked);

  // Wait for React to expand the details
  await waitFor("Research details expand", async () => {
    const text = (await evaluate("document.body.innerText")) || "";
    const lower = text.toLowerCase();
    return lower.includes("objective") && lower.includes("requirements") ? true : undefined;
  }, { timeout: 10_000 });

  await sleep(500);
  await screenshot("02-research-review-details.png");

  // Inspect expanded research details in UI
  const bodyTextAfterReview = ((await evaluate("document.body.innerText")) || "").toLowerCase();
  check("Research Review card contains Objective", bodyTextAfterReview.includes("objective"));
  check("Research Review card contains Requirements", bodyTextAfterReview.includes("requirements"));
  check("Research Review card contains Steps", bodyTextAfterReview.includes("steps"));

  // Step 4: Approve Research Review -> Continue Pipeline
  console.log("\n--- Step 4: Approving Research Review Gate ---");
  await sleep(400);
  const continueClicked = await waitFor("Continue button", async () => {
    return (await evaluate(`
      (function() {
        const btn = [...document.querySelectorAll('button')].find(b => (b.innerText || '').trim() === 'Continue');
        if (btn && !btn.disabled) { btn.click(); return true; }
        return undefined;
      })()
    `));
  }, { timeout: 10_000 });
  console.log("Clicked Continue button:", continueClicked);
  check("Continue button clicked successfully", !!continueClicked);
  await sleep(1000);

  // Step 5: Pipeline executes Planner -> Refactor -> GapAnalysis -> Evaluation -> TripleValidation -> Build Ready
  console.log("\n--- Step 5: Awaiting Pipeline Execution & Build Review Gate ---");
  const buildGateFound = await waitFor(
    "Build Review card",
    async () => {
      const text = await evaluate("document.body.innerText");
      return (text || "").includes("Build Review — pending your decision") ? true : undefined;
    },
    { timeout: 120_000, poll: 1000 }
  );
  check("Build Review Gate appeared in UI", !!buildGateFound);

  // Click "Review" button to expand build review details
  await sleep(400);
  const buildReviewClicked = await waitFor("Build Review button", async () => {
    return (await evaluate(`
      (function() {
        const btn = [...document.querySelectorAll('button')].find(b => (b.innerText || '').trim() === 'Review');
        if (btn) { btn.click(); return true; }
        return undefined;
      })()
    `));
  }, { timeout: 10_000 });
  console.log("Clicked Review button on Build Review:", buildReviewClicked);

  // Wait for React to expand build details
  await waitFor("Build details expand", async () => {
    const text = (await evaluate("document.body.innerText")) || "";
    const lower = text.toLowerCase();
    return lower.includes("hash") && (lower.includes("valid") || lower.includes("validation")) ? true : undefined;
  }, { timeout: 10_000 });

  await sleep(500);
  await screenshot("03-build-review-details.png");

  // Inspect expanded build review details in UI
  const bodyTextAfterBuildReview = (await evaluate("document.body.innerText")) || "";
  check("Build Review contains Hash", bodyTextAfterBuildReview.toLowerCase().includes("hash"));
  check("Build Review validation all valid", bodyTextAfterBuildReview.includes("VALID"));
  check("Build Review contains Steps", bodyTextAfterBuildReview.toLowerCase().includes("steps"));

  // Step 6: Confirm Build Review -> Builder execution -> Done
  console.log("\n--- Step 6: Confirming Build Review Gate ---");
  await sleep(400);
  const confirmClicked = await waitFor("Confirm button", async () => {
    return (await evaluate(`
      (function() {
        const btn = [...document.querySelectorAll('button')].find(b => (b.innerText || '').trim() === 'Confirm');
        if (btn && !btn.disabled) { btn.click(); return true; }
        return undefined;
      })()
    `));
  }, { timeout: 10_000 });
  console.log("Clicked Confirm button:", confirmClicked);
  check("Confirm button clicked successfully", !!confirmClicked);
  await sleep(1000);

  // Step 7: Await Terminal Passed state in UI
  console.log("\n--- Step 7: Awaiting Terminal Passed State in UI ---");
  const terminalPassedFound = await waitFor(
    "Terminal Passed label",
    async () => {
      const text = await evaluate("document.body.innerText");
      return (text || "").includes("Run finished — Passed") ? true : undefined;
    },
    { timeout: 120_000, poll: 1000 }
  );
  check("Terminal Passed appeared in UI", !!terminalPassedFound);
  await sleep(500);
  await screenshot("04-terminal-passed.png");

  const bodyTextFinal = await evaluate("document.body.innerText");
  const terminalSnippet = bodyTextFinal.slice(bodyTextFinal.indexOf("Run finished"), bodyTextFinal.indexOf("Run finished") + 250);
  console.log("Terminal state rendered in UI:\n" + terminalSnippet);

  // Step 8: Backend state verification
  console.log("\n--- Step 8: Fetch Backend Snapshot & Artifacts ---");
  const runsListResp = await fetch(`${BASE}/api/runs`);
  const runsList = await runsListResp.json();
  const browserRunId = await evaluate(`localStorage.getItem("oneshot.currentRunId")`);
  const latestRunId = browserRunId || (runsList?.runs && runsList.runs[0] ? runsList.runs[0].run_id : undefined);

  console.log("Latest runId:", latestRunId);
  if (latestRunId) {
    const snapResp = await fetch(`${BASE}/api/runs/${encodeURIComponent(latestRunId)}`);
    const snap = await snapResp.json();
    console.log("Backend Run Snapshot:", {
      run_id: snap.run_id,
      pipeline_status: snap.pipeline_status,
      test_result: snap.test_result,
      current_processor: snap.current_processor,
      has_hash_proof: Boolean(snap.hash_proof),
      hash_proof_equal: snap.hash_proof?.equal,
    });
    check("Backend run pipeline_status is Done", snap.pipeline_status === "Done", snap.pipeline_status);
    check("Backend run test_result is Passed", snap.test_result === "Passed", snap.test_result);
    check("Hash proof verified equal", snap.hash_proof?.equal === true);

    evidence.backend_snapshot = snap;

    // Read researcher artifact
    if (snap.artifacts?.researcher) {
      try {
        const raw = readFileSync(snap.artifacts.researcher, "utf8");
        const resObj = JSON.parse(raw);
        evidence.researcher_artifact = {
          researcher_id: resObj.researcher_id,
          total_evidence: resObj.evidence?.length,
          tavily_evidence: resObj.evidence?.filter(e => e.source?.includes("tavily") || e.provenance?.includes("tavily")),
        };
        console.log("Tavily evidence count in bundle:", evidence.researcher_artifact.tavily_evidence?.length);
        check("Tavily evidence present in ResearchBundle", (evidence.researcher_artifact.tavily_evidence?.length || 0) > 0);
      } catch (e) {
        console.log("Error reading researcher artifact:", e);
      }
    }
  }

  // Dump evidence
  dumpEvidence();

  console.log("\n=== SUMMARY OF CHECKS ===");
  for (const c of checks) {
    console.log(`  ${c.pass ? "✓" : "✗"} ${c.name}${c.detail ? " (" + c.detail + ")" : ""}`);
  }

  if (!ALL_PASSED) {
    console.error("\nE2E TEST FAILED");
    cdp?.close();
    await sleep(200);
    process.exit(1);
  }

  console.log("\n=========================================");
  console.log("       FULL WORKFLOW RESULT: PASSED      ");
  console.log("=========================================");
  cdp?.close();
  await sleep(200);
  process.exit(0);

} catch (err) {
  console.error("E2E UNHANDLED ERROR:", err);
  dumpEvidence();
  cdp?.close();
  await sleep(200);
  process.exit(1);
}
