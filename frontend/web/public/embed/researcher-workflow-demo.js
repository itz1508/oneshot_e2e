const sources = {
  FOCUS: {
    title: "Understanding Success Criterion 2.4.7: Focus Visible",
    publisher: "W3C Web Accessibility Initiative (WAI)",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html",
  },
  STATUS: {
    title: "Understanding Success Criterion 4.1.3: Status Messages",
    publisher: "W3C Web Accessibility Initiative (WAI)",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html",
  },
  ARIA: {
    title: "ARIA: aria-live attribute",
    publisher: "MDN Web Docs",
    url: "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-live",
  },
};

const fixtures = {
  "straight-success": {
    title: "Fixture 1: sourced accessibility findings",
    prompt: "Research keyboard focus visibility and asynchronous status-message behavior using public accessibility sources.",
    review: "Ready for planning: the simulated research summary contains cited focus-visible and status-message findings.",
    todos: [
      ["Ask a concrete accessibility research question", "completed"],
      ["Check W3C Focus Visible guidance", "completed"],
      ["Check W3C Status Messages guidance", "completed"],
      ["Check MDN aria-live guidance", "completed"],
      ["Review cited findings before planning", "in_progress"],
      ["Mark the simulation ready for planning", "pending"],
    ],
    sections: [
      ["facts-sources", "Facts and Sources", "Finding: keyboard-operable controls need a visible focus indicator, status messages that do not move focus need programmatic roles/properties, and aria-live can announce dynamic updates with different urgency levels.", "Checked W3C Focus Visible, W3C Status Messages, and MDN aria-live.", ["FOCUS", "STATUS", "ARIA"], "Simulation playback only: cited facts are real; collection is scripted."],
      ["checked", "What Was Checked", "The simulated researcher checked whether focus indicators, progress text, and live-region urgency each had direct public-source support before drafting output.", "Focus maps to W3C Focus Visible; status-without-focus maps to W3C Status Messages; polite/assertive maps to MDN aria-live.", ["FOCUS", "STATUS", "ARIA"], "This is a simulated checklist, not a live web run."],
      ["draft-output", "Simulated Output", "Draft answer: keep keyboard focus visibly indicated, expose non-focus-moving progress/status text programmatically, and reserve assertive live announcements for imperative interruptions.", "The draft avoids claiming every dynamic update needs assertive announcement.", ["FOCUS", "STATUS", "ARIA"], "Simulation playback only."],
    ],
  },
  "section-change-reloop": {
    title: "Fixture 2: sourced correction loop",
    prompt: "Review and narrow a draft claim about aria-live urgency using W3C and MDN sources.",
    review: "Review needed: the initial draft over-broadly treats all status updates as assertive announcements.",
    todos: [
      ["Draft an accessibility status-message summary", "completed"],
      ["Identify the over-broad live-region claim", "completed"],
      ["Request a targeted Facts and Sources correction", "in_progress"],
      ["Revise polite versus assertive guidance", "pending"],
      ["Mark the simulation ready for planning", "pending"],
    ],
    sections: [
      ["facts-sources", "Facts and Sources", "Before correction: the draft says dynamic status updates should use assertive live announcements so users hear them immediately. This is too broad because MDN distinguishes polite and assertive urgency and warns against unnecessary assertive interruptions.", "Checked W3C Status Messages and MDN aria-live.", ["STATUS", "ARIA"], "Scripted issue for targeted correction; source facts are real."],
      ["checked", "Why Change Is Needed", "The evidence requires narrowing: status messages should be presentable without moving focus, and assertive live regions are for urgent updates, not all routine progress or success messages.", "W3C says avoid unnecessary interruption; MDN distinguishes polite and assertive behavior.", ["STATUS", "ARIA"], "Before/after correction is simulated; source distinction is real."],
      ["draft-output", "Simulated Output", "Before correction: use assertive live announcements for dynamic status updates. This wording is intentionally shown as the issue to be fixed.", "Held until the correction separates routine polite updates from imperative assertive updates.", ["STATUS", "ARIA"], "Deliberately imperfect simulated draft."],
    ],
    change: {
      sectionId: "facts-sources",
      request: "Narrow the live-region guidance: separate routine polite updates from imperative assertive updates and cite why.",
      revisedSummary: "After correction: use programmatically determinable status messages for updates that do not move focus; use polite live regions for routine updates and reserve assertive live regions for imperative, time-sensitive interruptions.",
      revisedChecked: "MDN states polite generally does not interrupt the current task, while assertive immediately notifies and may clear the speech queue; W3C states status messages should inform users without unnecessary interruption.",
      revisedTodos: [
        ["Draft an accessibility status-message summary", "completed"],
        ["Identify the over-broad live-region claim", "completed"],
        ["Request a targeted Facts and Sources correction", "completed"],
        ["Revise polite versus assertive guidance", "completed"],
        ["Review cited correction before planning", "in_progress"],
        ["Mark the simulation ready for planning", "pending"],
      ],
    },
  },
};

let scenarioId = "straight-success";
let status = "idle";
let todos = [];
let revisionApplied = false;
let openSection = null;
let messages = [{ role: "agent", text: "Choose a simulation and press Start, or embed this file as a deterministic simulation preview." }];

const $ = (selector) => document.querySelector(selector);
const progress = $("[data-progress]");
const review = $("[data-review]");
const idle = $("[data-idle-note]");
const state = $("[data-state]");
const chat = $("[data-chat-log]");
const cont = $("[data-continue]");

function metric(items) {
  const completed = items.filter((todo) => todo[1] === "completed").length;
  return { completed, total: items.length, percentage: items.length ? Math.round((completed / items.length) * 100) : 0, firstActive: items.findIndex((todo) => todo[1] === "in_progress") };
}
function sourceLinks(ids) {
  return ids.map((id) => `<a href="${sources[id].url}" target="_blank" rel="noreferrer">${sources[id].title} — ${sources[id].publisher}</a>`).join("");
}
function renderProgress() {
  idle.hidden = todos.length > 0 || status === "running" || status === "reloop";
  if ((status === "running" || status === "reloop") && todos.length === 0) {
    progress.innerHTML = `<aside class="agent-progress-card" aria-label="Agent Progress" data-state="planning"><div class="agent-progress-loading" role="status" aria-live="polite"><span class="agent-progress-spinner" aria-hidden="true">↻</span><span>Agent is creating a plan…</span></div></aside>`;
    return;
  }
  if (!todos.length) { progress.innerHTML = ""; return; }
  const m = metric(todos);
  progress.innerHTML = `<aside class="agent-progress-card" aria-label="Agent Progress" data-state="ready"><div class="agent-progress-header"><div><p class="agent-progress-eyebrow">Live plan</p><h2>Agent Progress</h2></div><div class="agent-progress-count"><strong>${m.completed}/${m.total}</strong><span>tasks</span></div></div><div class="agent-progress-bar-block"><div class="agent-progress-bar-label"><span>Progress</span><span>${m.percentage}%</span></div><div class="agent-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${m.percentage}"><div class="agent-progress-fill" style="width:${m.percentage}%"></div></div></div><ul class="agent-progress-list">${todos.map((todo, index) => `<li class="agent-progress-row agent-progress-row--${todo[1]} ${index === m.firstActive ? "agent-progress-row--active" : ""}" data-status="${todo[1]}" data-first-in-progress="${index === m.firstActive}"><span class="agent-progress-icon">${todo[1] === "completed" ? "✓" : todo[1] === "in_progress" ? "◉" : "○"}</span><span class="agent-progress-content">${todo[0]}</span></li>`).join("")}</ul></aside>`;
}
function renderReview() {
  if (!(status === "review" || status === "success")) { review.innerHTML = status === "canceled" ? `<section class="fixture-status-card"><h2>Simulation canceled</h2><p>Cancel stopped the simulation path. Ready for planning was not reached.</p></section>` : ""; return; }
  const fixture = fixtures[scenarioId];
  review.innerHTML = `<section class="fixture-review"><div class="fixture-review-header"><p class="product-eyebrow">Research review</p><h2>${status === "success" ? "Ready for planning" : "Sourced review"}</h2></div>${fixture.sections.map((section) => { const isTarget = fixture.change?.sectionId === section[0]; const summary = isTarget && revisionApplied ? fixture.change.revisedSummary : section[2]; const checked = isTarget && revisionApplied ? fixture.change.revisedChecked : section[3]; return `<article class="fixture-section ${isTarget && revisionApplied ? "fixture-section--revised" : ""}"><div class="fixture-section-topline"><h3>${section[1]}</h3><button class="section-action" data-section="${section[0]}">${isTarget && !revisionApplied ? "Change" : "Edit"}</button></div><p>${summary}</p><p class="checked-line"><strong>Checked:</strong> ${checked}</p><p class="simulation-note">${section[5]}</p>${openSection === section[0] ? `<div class="section-editor-card"><strong>${section[1]} scoped control</strong><p>This edit path is limited to this section and does not open a whole-bundle editor.</p>${isTarget && !revisionApplied ? `<p><strong>Change request:</strong> ${fixture.change.request}</p>` : ""}</div>` : ""}<div class="source-line" aria-label="Public sources">${sourceLinks(section[4])}</div></article>`; }).join("")}</section>`;
}
function render() {
  state.textContent = status === "success" ? "ready for planning" : status;
  cont.hidden = !(status === "review" || status === "reloop");
  cont.disabled = status !== "review" || Boolean(fixtures[scenarioId].change && !revisionApplied);
  chat.innerHTML = messages.map((item) => `<article class="${item.role === "user" ? "human" : "ai"}-message">${item.text}</article>`).join("");
  renderProgress(); renderReview();
}
function start() {
  const fixture = fixtures[scenarioId];
  status = "running"; todos = []; revisionApplied = false; openSection = null;
  messages = [{ role: "user", text: fixture.prompt }, { role: "agent", text: "Agent is creating a plan… Simulation playback only; cited findings appear after source checking." }];
  render();
  setTimeout(() => { todos = fixture.todos; status = "review"; messages.push({ role: "agent", text: fixture.review }); render(); }, 300);
}
function cancel() { status = "canceled"; todos = []; openSection = null; messages.push({ role: "agent", text: "Cancel: simulation stopped without reaching Ready for planning." }); render(); }
function continueRun() {
  if (status !== "review" || (fixtures[scenarioId].change && !revisionApplied)) { messages.push({ role: "agent", text: "Continue paused until sourced section changes are done." }); render(); return; }
  todos = todos.map((todo) => [todo[0], "completed"]); status = "success"; messages.push({ role: "agent", text: "Continue: cited findings accepted for this simulation; Ready for planning reached." }); render();
}
function sectionChange(id) {
  openSection = id;
  const fixture = fixtures[scenarioId];
  if (!fixture.change || fixture.change.sectionId !== id || revisionApplied) { messages.push({ role: "agent", text: `Opened section-scoped editor for ${id}.` }); render(); return; }
  status = "reloop"; messages.push({ role: "user", text: fixture.change.request }, { role: "agent", text: "Returning only to the affected Facts and Sources section." }); render();
  setTimeout(() => { todos = fixture.change.revisedTodos; revisionApplied = true; status = "review"; messages.push({ role: "agent", text: "Revised sourced finding displayed; Continue is now available." }); render(); }, 300);
}
document.querySelectorAll('input[name="fixture"]').forEach((input) => input.addEventListener("change", (event) => { scenarioId = event.target.value; status = "idle"; todos = []; revisionApplied = false; openSection = null; messages = [{ role: "agent", text: "Simulation reset. Start and Cancel are available; Ready for planning is not available." }]; render(); }));
$("[data-start]").addEventListener("click", start);
$("[data-cancel]").addEventListener("click", cancel);
cont.addEventListener("click", continueRun);
review.addEventListener("click", (event) => { const button = event.target.closest("[data-section]"); if (button) sectionChange(button.dataset.section); });
$("[data-chat-form]").addEventListener("submit", (event) => { event.preventDefault(); const input = event.currentTarget.querySelector('input'); messages.push({ role: "user", text: input.value || "Ask about focus indicators or live-region status messages." }, { role: "agent", text: "Static preview captured the message locally. Use the React app for live stream submission." }); input.value = ""; render(); });
render();
