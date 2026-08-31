const STAGES = [
  { id: "Researcher", name: "Researcher", detail: "requirements & evidence" },
  { id: "Planner", name: "Planner", detail: "read-only audit" },
  { id: "Refactor", name: "Refactor", detail: "identity-preserving plan" },
  { id: "GapAnalysis", name: "Gap Analysis", detail: "zero-gap gate" },
  { id: "Evaluation", name: "Evaluation", detail: "evidence matrix" },
  { id: "SchemaValidation", name: "Schema Validation", detail: "contract proof" },
  { id: "FixtureValidation", name: "Fixture Validation", detail: "assertion proof" },
  { id: "GoalValidation", name: "Goal Validation", detail: "outcome proof" },
  { id: "TripleValidation", name: "Triple Validation", detail: "convergence" },
  { id: "Confirmed", name: "Confirmed", detail: "immutable package" },
  { id: "CreateHash", name: "Create Hash", detail: "SHA-256" },
  { id: "Hash", name: "Hash", detail: "independent verification" },
  { id: "Done", name: "Done", detail: "terminal result" },
];

let currentRunId = null;
let currentConversationId = null;
let latestSnapshot = null;
let activeEventScope = "ALL";
let receivedEvents = [];
let activeEventSource = null;
let toastTimer = null;

const byId = (id) => document.getElementById(id);
const stageList = byId("stageList");
const runBadge = byId("runBadge");
const resultBadge = byId("resultBadge");
const taskSummary = byId("taskSummary");
const terminalOutput = byId("terminalOutput");
const eventCount = byId("eventCount");
const chatMessages = byId("chatMessages");
const chatInput = byId("chatInput");
const btnSendChat = byId("btnSendChat");
const btnRunChat = byId("btnRunChat");
const artifactViewer = byId("artifactViewer");
const artifactRunId = byId("artifactRunId");
const sandboxTerminal = byId("sandboxTerminal");
const graphViewer = byId("graphViewer");

function showToast(message) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function setBusy(button, busy, busyText) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent.trim();
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || data.root_cause?.actual || `${response.status} ${response.statusText}`);
    error.payload = data;
    throw error;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Views and repository explorer
// ---------------------------------------------------------------------------

function selectView(viewName) {
  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === viewName);
  });
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  byId(`view-${viewName}`)?.classList.add("active");

  if (viewName === "artifacts" && currentRunId) loadArtifact("confirmed");
  if (viewName === "graphs") loadGraph("/api/graphs/authority", byId("btnGraphAuthority"));
}

document.querySelectorAll(".view-tab").forEach((tab) => {
  tab.addEventListener("click", () => selectView(tab.dataset.view));
});

document.querySelectorAll("[data-folder]").forEach((row) => {
  row.addEventListener("click", () => {
    const folder = row.dataset.folder;
    const children = document.querySelector(`[data-children="${folder}"]`);
    const open = row.getAttribute("aria-expanded") === "true";
    row.setAttribute("aria-expanded", String(!open));
    row.classList.toggle("expanded", !open);
    children?.classList.toggle("collapsed", open);
  });
});

document.querySelectorAll("[data-path]").forEach((row) => {
  row.addEventListener("click", () => {
    document.querySelectorAll(".tree-row.selected").forEach((item) => item.classList.remove("selected"));
    row.classList.add("selected");
    byId("selectedPath").textContent = `D:\\oneshot_e2e\\${row.dataset.path.replaceAll("/", "\\")}`;
  });
});

// ---------------------------------------------------------------------------
// Backend health — capabilities are not provider/runtime proof
// ---------------------------------------------------------------------------

async function loadHealth() {
  const chip = byId("healthChip");
  const text = byId("healthText");
  chip.className = "health-state checking";
  text.textContent = "Checking backend";

  try {
    const health = await jsonRequest("/api/health");
    chip.className = "health-state online";
    text.textContent = health.workflow === "oneshot-canonical-workflow" ? "Canonical backend online" : "Backend online";

    const cloudRunOrigin = location.hostname.endsWith(".run.app");
    byId("statusRuntime").textContent = cloudRunOrigin ? "Cloud Run" : "Local backend";
    byId("runtimeProof").textContent = cloudRunOrigin ? "ORIGIN PROOF" : "LOCAL ORIGIN";
  } catch (error) {
    chip.className = "health-state offline";
    text.textContent = "Backend unavailable";
  }
}

byId("btnRefreshHealth").addEventListener("click", loadHealth);

// ---------------------------------------------------------------------------
// Stages and real event rendering
// ---------------------------------------------------------------------------

function initStages() {
  stageList.replaceChildren();
  for (const stage of STAGES) {
    const row = document.createElement("div");
    row.className = "stage-item";
    row.dataset.stage = stage.id;

    const node = document.createElement("span");
    node.className = "stage-node";

    const copy = document.createElement("div");
    copy.className = "stage-copy";
    const name = document.createElement("div");
    name.className = "stage-name";
    name.textContent = stage.name;
    const meta = document.createElement("div");
    meta.className = "stage-meta";
    meta.textContent = stage.detail;
    copy.append(name, meta);

    const status = document.createElement("span");
    status.className = "stage-status";
    status.textContent = "PENDING";
    row.append(node, copy, status);
    stageList.appendChild(row);
  }
  updateTaskSummary();
}

function normalizeResult(value) {
  return String(value || "PENDING").toUpperCase().replaceAll("_", "-");
}

function statusClass(value) {
  const status = normalizeResult(value).toLowerCase();
  if (["root-cause", "not-valid", "failed", "error"].includes(status)) return "error";
  if (["complete", "passed", "valid"].includes(status)) return "complete";
  if (status === "running") return "running";
  return "";
}

function updateTaskSummary() {
  const complete = stageList.querySelectorAll(".stage-item.complete").length;
  const running = stageList.querySelectorAll(".stage-item.running").length;
  taskSummary.textContent = running ? `${complete} complete · ${running} running` : `${complete} / ${STAGES.length} complete`;
}

function resetRunUI(runId) {
  currentRunId = runId;
  latestSnapshot = null;
  receivedEvents = [];
  renderEvents();
  initStages();
  runBadge.textContent = `run: ${runId}`;
  artifactRunId.textContent = `run: ${runId}`;
  resultBadge.textContent = "RUNNING";
  resultBadge.className = "run-state running";
  byId("statusRun").replaceChildren();
  const led = document.createElement("span");
  led.className = "status-led running";
  byId("statusRun").append(led, `run: ${runId}`);
  byId("statusHash").textContent = "hash: pending";
  byId("statusHash").classList.remove("ready");
  byId("statusHash").title = "No hash available";
  byId("statusAdk").textContent = "NOT OBSERVED";
  byId("statusAdk").className = "";
  activeEventSource?.close();
  activeEventSource = null;
}

function handleEvent(event) {
  if (!event || !event.processor) return;
  const key = event.event_id || `${event.sequence}:${event.processor}:${event.state}`;
  if (!receivedEvents.some((item) => item._key === key)) {
    receivedEvents.push({ ...event, _key: key });
    renderEvents();
  }

  if (event.scope === "ADK" || String(event.processor).startsWith("ADK:")) {
    byId("statusAdk").textContent = "OBSERVED";
    byId("statusAdk").className = "observed";
    const researcher = stageList.querySelector('[data-stage="Researcher"]');
    if (researcher && !researcher.classList.contains("complete")) {
      researcher.querySelector(".stage-meta").textContent = `${String(event.processor).replace("ADK:", "ADK / ")} · ${normalizeResult(event.result || event.state)}`;
    }
    return;
  }

  const row = stageList.querySelector(`[data-stage="${CSS.escape(event.processor)}"]`);
  if (!row) return;
  const value = event.result || event.state;
  row.classList.remove("running", "complete", "error");
  const nextClass = statusClass(value);
  if (nextClass) row.classList.add(nextClass);
  row.querySelector(".stage-status").textContent = normalizeResult(value);
  if (event.message || event.artifact_id) {
    row.querySelector(".stage-meta").textContent = event.message || `artifact · ${event.artifact_id}`;
  }
  updateTaskSummary();
}

function eventLineText(event) {
  const time = event.created_at ? new Date(event.created_at).toLocaleTimeString([], { hour12: false }) : "--:--:--";
  const detail = event.message || event.artifact_id || event.result || "";
  return `${time}  ${String(event.sequence || "-").padStart(3, "0")}  ${(event.scope || "WORKFLOW").padEnd(9)}  ${String(event.processor).padEnd(22)}  ${normalizeResult(event.result || event.state).padEnd(11)}  ${detail}`.trimEnd();
}

function renderEvents() {
  const visible = receivedEvents.filter((event) => activeEventScope === "ALL" || event.scope === activeEventScope);
  terminalOutput.replaceChildren();
  eventCount.textContent = `${visible.length} event${visible.length === 1 ? "" : "s"}`;

  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "terminal-empty";
    empty.textContent = receivedEvents.length ? `No ${activeEventScope.toLowerCase()} events received.` : "No events yet — send a request or run the benchmark.";
    terminalOutput.appendChild(empty);
    return;
  }

  for (const event of visible) {
    const line = document.createElement("div");
    line.className = `event-line ${statusClass(event.result || event.state)}`;
    line.title = eventLineText(event);
    const time = document.createElement("span");
    time.className = "event-time";
    time.textContent = event.created_at ? new Date(event.created_at).toLocaleTimeString([], { hour12: false }) : "--:--:--";
    const sequence = document.createElement("span");
    sequence.className = "event-seq";
    sequence.textContent = `#${event.sequence || "-"}`;
    const scope = document.createElement("span");
    scope.className = "event-scope";
    scope.textContent = event.scope || "WORKFLOW";
    const processor = document.createElement("span");
    processor.className = "event-processor";
    processor.textContent = event.processor;
    const detail = document.createElement("span");
    detail.className = "event-detail";
    const state = normalizeResult(event.result || event.state);
    detail.innerHTML = `<span class="event-state"></span>`;
    detail.querySelector(".event-state").textContent = state;
    detail.append(document.createTextNode(`  ${event.message || event.artifact_id || ""}`));
    line.append(time, sequence, scope, processor, detail);
    terminalOutput.appendChild(line);
  }
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

document.querySelectorAll(".event-filter").forEach((button) => {
  button.addEventListener("click", () => {
    activeEventScope = button.dataset.scope;
    document.querySelectorAll(".event-filter").forEach((item) => item.classList.toggle("active", item === button));
    renderEvents();
  });
});

byId("btnClearEvents").addEventListener("click", () => {
  receivedEvents = [];
  renderEvents();
  showToast("Event display cleared. Backend history is unchanged.");
});

byId("btnCopyEvents").addEventListener("click", async () => {
  const visible = receivedEvents.filter((event) => activeEventScope === "ALL" || event.scope === activeEventScope);
  if (!visible.length) return showToast("No visible events to copy.");
  try {
    await navigator.clipboard.writeText(visible.map(eventLineText).join("\n"));
    showToast("Visible events copied.");
  } catch {
    showToast("Clipboard permission was unavailable.");
  }
});

async function finishRun(snapshot) {
  const result = snapshot.result || "ROOT_CAUSE";
  resultBadge.textContent = normalizeResult(result);
  resultBadge.className = `run-state ${statusClass(result) || "idle"}`;
  const led = byId("statusRun").querySelector(".status-led");
  if (led) led.className = `status-led ${result === "PASSED" ? "complete" : "error"}`;

  const hash = snapshot.hash_proof?.recomputed_hash || snapshot.hash_proof?.created_hash;
  if (hash) {
    const statusHash = byId("statusHash");
    statusHash.textContent = `hash: ${hash.slice(0, 12)}…`;
    statusHash.title = hash;
    statusHash.dataset.hash = hash;
    statusHash.classList.add("ready");
  }

  // Ensure task list has 0 running tasks at completion
  if (result === "PASSED") {
    stageList.querySelectorAll(".stage-item.running").forEach((item) => {
      item.classList.remove("running");
      item.classList.add("complete");
    });
  } else {
    stageList.querySelectorAll(".stage-item.running").forEach((item) => {
      item.classList.remove("running");
    });
  }
  updateTaskSummary();

  if (result === "PASSED") {
    // Fetch canonical artifact to render real model/workflow result
    let answerText = "";
    let providerSource = "featherless:google/gemma-4-31B-it";
    try {
      const confirmed = await jsonRequest(`/api/runs/${encodeURIComponent(snapshot.run_id)}/artifacts/confirmed`);
      const core = confirmed?.core;
      if (core) {
        const summary = core.researcher?.evidence?.[0]?.statement || "";
        providerSource = core.researcher?.evidence?.[0]?.source || providerSource;
        const reqs = (core.plan?.requirements || []).map((r) => `• ${r.statement}`);
        const steps = (core.plan?.steps || []).map((s, idx) => `${idx + 1}. ${s.description}`);

        const sections = [];
        if (summary) sections.push(summary);
        if (reqs.length) sections.push(`Key Requirements / Points:\n${reqs.join("\n")}`);
        if (steps.length) sections.push(`Plan & Execution Outline:\n${steps.join("\n")}`);

        answerText = sections.join("\n\n");
      }
    } catch {
      try {
        const researcher = await jsonRequest(`/api/runs/${encodeURIComponent(snapshot.run_id)}/artifacts/researcher`);
        const summary = researcher?.evidence?.[0]?.statement || "";
        providerSource = researcher?.evidence?.[0]?.source || providerSource;
        if (summary) answerText = summary;
      } catch {}
    }

    if (!answerText) {
      answerText = `Run ${snapshot.run_id} completed with verified result PASSED.`;
    }

    const providerParts = providerSource.split(":");
    const providerName = providerParts[0] || "featherless";
    const modelName = providerParts.slice(1).join(":") || "google/gemma-4-31B-it";

    const metaBlock = [
      "─── Verification ───",
      `provider: ${providerName}`,
      `model: ${modelName}`,
      `run_id: ${snapshot.run_id}`,
      `result: PASSED`,
      hash ? `hash: ${hash}` : null,
    ].filter(Boolean).join("\n");

    appendChatMessage("oneshot", `${answerText}\n\n${metaBlock}`);
  } else {
    const reason = snapshot.root_cause?.actual || snapshot.root_cause?.issue || "The workflow returned ROOT_CAUSE.";
    const metaBlock = [
      "─── Verification ───",
      `run_id: ${snapshot.run_id}`,
      `result: ROOT_CAUSE`,
    ].join("\n");
    appendChatMessage("error", `${reason}\n\n${metaBlock}`);
  }
}

function streamRun(runId) {
  resetRunUI(runId);
  let completed = false;
  activeEventSource = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);

  activeEventSource.onmessage = async (message) => {
    try {
      const event = JSON.parse(message.data);
      handleEvent(event);
      if (event.processor === "Done" && event.state === "COMPLETE") {
        if (completed) return;
        completed = true;
        activeEventSource?.close();
        activeEventSource = null;
        try {
          const snapshot = await jsonRequest(`/api/runs/${encodeURIComponent(runId)}`);
          latestSnapshot = snapshot;
          await finishRun(snapshot);
        } catch (err) {
          appendChatMessage("error", `Failed to load final snapshot: ${err.message}`);
        }
      }
    } catch {
      /* ignore malformed event frames */
    }
  };

  activeEventSource.onerror = () => {
    if (completed) return;
    activeEventSource?.close();
    activeEventSource = null;
    resultBadge.textContent = "DISCONNECTED";
    resultBadge.className = "run-state error";
    appendChatMessage("error", "Event stream disconnected before completion.");
  };
}

// ---------------------------------------------------------------------------
// Chat and execution
// ---------------------------------------------------------------------------

function appendChatMessage(role, text) {
  byId("emptyChat")?.remove();
  const wrapper = document.createElement("article");
  wrapper.className = `chat-message ${role}`;
  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = role === "user" ? "You" : role === "help" ? "OneShot · needs input" : role === "error" ? "OneShot · root cause" : "OneShot";
  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = text;
  wrapper.append(meta, body);
  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text || btnSendChat.disabled) return;
  appendChatMessage("user", text);
  chatInput.value = "";
  setBusy(btnSendChat, true, "Sending…");

  try {
    let data;
    if (!currentConversationId) {
      data = await jsonRequest("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      currentConversationId = data.conversation_id;
    } else {
      data = await jsonRequest(`/api/conversations/${encodeURIComponent(currentConversationId)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
    }

    const intent = data.intent;
    if (intent?.ready_for_prompt) {
      btnRunChat.disabled = false;
      setBusy(btnRunChat, true, "Starting…");
      try {
        const runData = await jsonRequest(
          `/api/conversations/${encodeURIComponent(currentConversationId)}/run`,
          { method: "POST" },
        );
        appendChatMessage(
          "system",
          `Intent resolved (revision ${intent.revision}). Running canonical workflow: ${runData.run_id}`,
        );
        streamRun(runData.run_id);
      } finally {
        setBusy(btnRunChat, false);
      }
    } else {
      btnRunChat.disabled = true;
      const missing = (intent?.missing_required_information || []).join(", ");
      const question =
        intent?.missing_required_information?.[0] === "goal"
          ? "What specifically would you like OneShot to build, analyze, explain, or fix?"
          : "What outcome or result should OneShot produce?";
      appendChatMessage(
        "help",
        `${question}${missing ? ` (needed: ${missing})` : ""}`,
      );
    }
  } catch (error) {
    appendChatMessage("error", error.message);
  } finally {
    setBusy(btnSendChat, false);
    chatInput.focus();
  }
}

btnSendChat.addEventListener("click", sendChatMessage);
chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendChatMessage();
  }
});

byId("btnNewChat").addEventListener("click", () => {
  currentConversationId = null;
  btnRunChat.disabled = true;
  chatMessages.innerHTML = '<div class="empty-chat" id="emptyChat"><div class="empty-symbol">›_</div><strong>New intent session.</strong><p>Describe a concrete goal and the result OneShot should produce.</p></div>';
  chatInput.focus();
});

btnRunChat.addEventListener("click", async () => {
  if (!currentConversationId || btnRunChat.disabled) return;
  setBusy(btnRunChat, true, "Starting…");
  try {
    const data = await jsonRequest(`/api/conversations/${encodeURIComponent(currentConversationId)}/run`, { method: "POST" });
    appendChatMessage("system", `Run accepted: ${data.run_id}`);
    streamRun(data.run_id);
  } catch (error) {
    const help = error.payload?.help_request;
    appendChatMessage(help ? "help" : "error", help?.question || error.message);
  } finally {
    setBusy(btnRunChat, false);
  }
});

byId("btnRunSample").addEventListener("click", async () => {
  const button = byId("btnRunSample");
  setBusy(button, true, "Starting…");
  try {
    const data = await jsonRequest("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "Build a two-step local product plan with an implementation dependency and deterministic proof.",
        requested_outcome: "The researched plan preserves evidence, dependency order, job-specific validation, and reaches DONE.",
        context: "OneShot deterministic benchmark requested from the IDE.",
      }),
    });
    appendChatMessage("system", `Deterministic benchmark accepted: ${data.run_id}`);
    streamRun(data.run_id);
  } catch (error) {
    appendChatMessage("error", error.message);
  } finally {
    setBusy(button, false);
  }
});

byId("statusHash").addEventListener("click", async () => {
  const hash = byId("statusHash").dataset.hash;
  if (!hash) return showToast("No verified hash is available yet.");
  try { await navigator.clipboard.writeText(hash); showToast("Full hash copied."); }
  catch { showToast("Clipboard permission was unavailable."); }
});

// ---------------------------------------------------------------------------
// Artifacts, sandbox, and projections
// ---------------------------------------------------------------------------

document.querySelectorAll(".artifact-button").forEach((button) => {
  button.addEventListener("click", () => loadArtifact(button.dataset.artifact));
});

async function loadArtifact(name) {
  document.querySelectorAll(".artifact-button").forEach((button) => button.classList.toggle("active", button.dataset.artifact === name));
  if (!currentRunId) {
    artifactViewer.textContent = "No run selected. Complete a workflow run first.";
    return;
  }
  artifactViewer.textContent = `Loading ${name}.json…`;
  try {
    const data = await jsonRequest(`/api/runs/${encodeURIComponent(currentRunId)}/artifacts/${encodeURIComponent(name)}`);
    artifactViewer.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    artifactViewer.textContent = `Artifact unavailable: ${error.message}`;
  }
}

byId("btnExecuteSandbox").addEventListener("click", async () => {
  if (!currentRunId) {
    sandboxTerminal.textContent = "No confirmed run is selected.";
    return;
  }
  const button = byId("btnExecuteSandbox");
  const badge = byId("sandboxStatusBadge");
  setBusy(button, true, "Executing…");
  badge.textContent = "RUNNING";
  badge.className = "run-state running";
  sandboxTerminal.textContent = `Submitting ${currentRunId} to the external sandbox boundary…`;

  try {
    const result = await jsonRequest(`/api/runs/${encodeURIComponent(currentRunId)}/sandbox/execute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ execution_authorization: {
        timeout_seconds: Number(byId("sbxTimeout").value) || 10,
        max_total_bytes_written: Number(byId("sbxMaxBytes").value) || 10485760,
        network_policy: byId("sbxNetPolicy").value,
      } }),
    });
    badge.textContent = normalizeResult(result.result);
    badge.className = `run-state ${statusClass(result.result)}`;
    sandboxTerminal.textContent = JSON.stringify(result, null, 2);

    if (result.evidence) {
      byId("evidenceGrid").hidden = false;
      byId("statExitCode").textContent = result.evidence.exit_codes?.join(", ") ?? "—";
      byId("statDuration").textContent = `${result.evidence.resource_usage?.duration_ms ?? 0}ms`;
      byId("statFiles").textContent = String(result.evidence.file_changes?.length ?? 0);
      byId("statHashMatch").textContent = result.result === "PASSED" ? "MATCH" : "MISMATCH";
    }
  } catch (error) {
    badge.textContent = "ROOT CAUSE";
    badge.className = "run-state error";
    sandboxTerminal.textContent = `Sandbox execution failed: ${error.message}`;
  } finally {
    setBusy(button, false);
  }
});

async function loadGraph(url, activeButton) {
  document.querySelectorAll(".graph-actions .secondary-button").forEach((button) => button.classList.toggle("active", button === activeButton));
  graphViewer.textContent = `Loading ${url}…`;
  try {
    const data = await jsonRequest(url);
    graphViewer.textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    graphViewer.textContent = `Graph unavailable: ${error.message}`;
  }
}

byId("btnGraphAuthority").addEventListener("click", () => {
  const url = currentRunId ? `/api/runs/${encodeURIComponent(currentRunId)}/authority-graph` : "/api/graphs/authority";
  loadGraph(url, byId("btnGraphAuthority"));
});
byId("btnGraphAdk").addEventListener("click", () => {
  const url = currentRunId ? `/api/runs/${encodeURIComponent(currentRunId)}/adk-graph` : "/api/graphs/adk";
  loadGraph(url, byId("btnGraphAdk"));
});
byId("btnGraphSandbox").addEventListener("click", () => {
  const url = currentRunId ? `/api/runs/${encodeURIComponent(currentRunId)}/sandbox-graph` : "/api/graphs/sandbox";
  loadGraph(url, byId("btnGraphSandbox"));
});

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

initStages();
renderEvents();
loadHealth();
