import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Resolve repo root from frontend/web/tests/ (go up 3 levels)
const root = fileURLToPath(new URL("../../..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");

const agent = read("packages/agent-runtime/src/agents/deep-agent-todo-list.ts");
const preview = read("frontend/web/src/patterns/deep-agent-todo-list/preview.tsx");
const todoList = read("frontend/web/src/patterns/deep-agent-todo-list/TodoList.tsx");
const todoProgress = read("frontend/web/src/patterns/deep-agent-todo-list/todoProgress.ts");
const types = read("frontend/web/src/patterns/deep-agent-todo-list/types.ts");
const fixtures = read("frontend/web/src/patterns/deep-agent-todo-list/researcherFixtures.ts");
const css = read("frontend/web/src/patterns/deep-agent-todo-list/researcher-product.css");
const embedHtml = read("frontend/web/public/embed/researcher-workflow-demo.html");
const embedJs = read("frontend/web/public/embed/researcher-workflow-demo.js");

const visibleUi = [preview, fixtures, embedHtml, embedJs].join("\n");
const sourceUrls = [
  "https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html",
  "https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html",
  "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-live",
];

function fixtureScenarioBody() {
  return fixtures.split("export const FIXTURE_SCENARIOS: FixtureScenario[] = [", 2)[1].split("\n];", 1)[0];
}

describe("official todo architecture preserved", () => {
  it("keeps the Deep Agent todo middleware and live stream architecture", () => {
    assert.match(agent, /createDeepAgent/);
    assert.match(agent, /todoListMiddleware/);
    assert.match(preview, /useStream<typeof deepAgentTodoListAgent>/);
    assert.match(preview, /stream\.submit/);
    assert.match(preview, /threadId/);
    assert.match(preview, /onThreadId: setThreadId/);
    assert.match(preview, /getTodosFromStreamValues\(stream\.values\)/);
  });

  it("keeps the official todo contract and Agent Progress behavior", () => {
    assert.match(types, /content: string;/);
    assert.match(types, /status: TodoStatus;/);
    assert.doesNotMatch(types, /title: string;/);
    assert.match(todoProgress, /values\?\.todos \?\? \[\]/);
    assert.match(todoList, /role=\"progressbar\"/);
    assert.match(todoList, /Agent is creating a plan…/);
    assert.match(todoProgress, /firstInProgressIndex/);
    assert.match(css, /agent-progress-row--completed/);
  });
});

describe("public educational fixture grounding", () => {
  it("defines exactly two fixtures", () => {
    const ids = [...fixtureScenarioBody().matchAll(/\bid: \"(straight-success|section-change-reloop)\"/g)].map((match) => match[1]);
    assert.deepEqual(ids, ["straight-success", "section-change-reloop"]);
  });

  it("defines all displayed sources with titles publishers and HTTPS URLs", () => {
    for (const url of sourceUrls) assert.match(fixtures, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(fixtures, /title: "Understanding Success Criterion 2\.4\.7: Focus Visible"/);
    assert.match(fixtures, /title: "Understanding Success Criterion 4\.1\.3: Status Messages"/);
    assert.match(fixtures, /title: "ARIA: aria-live attribute"/);
    assert.match(fixtures, /publisher: "W3C Web Accessibility Initiative \(WAI\)"/);
    assert.match(fixtures, /publisher: "MDN Web Docs"/);
    assert.doesNotMatch(visibleUi, /file:\/\//);
  });

  it("contains concrete claim-to-source mappings", () => {
    assert.match(fixtures, /keyboard-operable controls need a visible focus indicator/);
    assert.match(fixtures, /status messages that do not move focus need programmatic roles\/properties/);
    assert.match(fixtures, /aria-live=polite generally notifies users without interrupting/);
    assert.match(fixtures, /aria-live=assertive immediately notifies the user/);
    assert.match(fixtures, /Focus indicator claim maps to W3C Focus Visible/);
    assert.match(fixtures, /status-without-focus claim maps to W3C Status Messages/);
    assert.match(fixtures, /polite\/assertive distinction maps to MDN aria-live/);
  });

  it("shows substantive before and after correction for the Facts and Sources re-loop", () => {
    assert.match(fixtures, /Before correction: the draft says dynamic status updates should use assertive live announcements/);
    assert.match(fixtures, /After correction: use programmatically determinable status messages/);
    assert.match(fixtures, /separate routine polite updates from imperative assertive updates/);
    assert.match(preview, /Returning only to the affected Facts and Sources section|affected finding and section/);
    assert.match(embedJs, /Returning only to the affected Facts and Sources section/);
  });
});

describe("visible UI lifecycle and copy", () => {
  it("hides review during planning and avoids premature conclusions", () => {
    assert.match(preview, /\(fixtureStatus === \"review\" \|\| fixtureStatus === \"success\"\) && \(/);
    const startFixture = preview.match(/const startFixture = \(\) => \{[\s\S]*?window\.setTimeout/)?.[0] ?? "";
    assert.doesNotMatch(startFixture, /validated|locked|Ready for planning|current/);
    assert.match(preview, /Agent is creating a plan…/);
  });

  it("uses correct static chat roles", () => {
    assert.match(embedJs, /role: "user"/);
    assert.match(embedJs, /role: "agent"/);
    assert.match(embedJs, /item\.role === "user" \? "human" : "ai"/);
    assert.match(embedHtml, /class="ai-message"/);
  });

  it("uses relevant accessibility presets and styled controls", () => {
    assert.match(preview, /Research keyboard focus visibility/);
    assert.match(preview, /Compare polite and assertive live-region guidance/);
    assert.match(embedHtml, /class="fixture-option"/);
    assert.match(embedHtml, /class="send-button"/);
    assert.match(embedHtml, /Ask about focus indicators or live-region status messages/);
  });

  it("does not expose prohibited visible copy or unexplained internal jargon", () => {
    const prohibitedTerms = ["file://", "source IDs", "S1-S3", "two purchased paths", "beach", "birthday", "ResearchBundle", "READY_FOR_PLANNING", "current, validated", "locked ResearchBundle", "Agentic_Workflow", "diagram_production_plan"];
    for (const term of prohibitedTerms) assert.equal(visibleUi.includes(term), false, `visible UI contains ${term}`);
  });
});

describe("fixture controls and success safety", () => {
  it("keeps Start Cancel one Continue and narrow section Change controls", () => {
    assert.match(preview, />Start<\/button>/);
    assert.match(preview, />Cancel<\/button>/);
    assert.equal((preview.match(/>Continue<\/button>/g) ?? []).length, 1);
    assert.match(preview, /section-action/);
    assert.match(preview, /\? "Change" : "Edit"/);
    assert.equal((embedHtml.match(/data-continue/g) ?? []).length, 1);
  });

  it("keeps Cancel non-successful and blocks premature success", () => {
    const cancel = preview.match(/const cancelFixture = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
    assert.doesNotMatch(cancel, /setFixtureStatus\("success"\)/);
    assert.match(preview, /fixtureStatus !== "review" \|\| needsTargetedChange/);
    assert.match(preview, /Continue blocked: apply the targeted section change before continuing/);
  });
});


// ---------------------------------------------------------------------------
// Preview-isolation tests (9 new) — added by researcher-preview-simple-correction.
// These tests exercise the corrected preview.tsx against the LangChain
// Deep Agent contract: one useStream boundary, TodoListMiddleware produces
// stream.values.todos, Researcher Preview is a fixture-only overlay whose
// controls MUST NOT touch the live stream.
// ---------------------------------------------------------------------------

describe("preview trigger and researcherPreviewEnabled state", () => {
  it("adds a local researcherPreviewEnabled state initialised to false", () => {
    // Local useState hook holding the preview overlay's visibility.
    assert.match(preview, /useState\(false\);?[\s\S]*?researcherPreviewEnabled/);
    assert.match(preview, /const \[researcherPreviewEnabled, setResearcherPreviewEnabled\] = useState\(false\)/);
  });

  it("renders an explicit Researcher Preview trigger with an Open control", () => {
    // Distinct trigger button — accessible name "Open Researcher Preview".
    assert.match(preview, /aria-label="Open Researcher Preview"/);
    assert.match(preview, /data-testid="open-researcher-preview"/);
    assert.match(preview, />\s*Open Researcher Preview\s*</);
    // The trigger flips researcherPreviewEnabled → true.
    assert.match(preview, /setResearcherPreviewEnabled\(true\)/);
  });

  it("renders an explicit Close Researcher Preview control", () => {
    assert.match(preview, /aria-label="Close Researcher Preview"/);
    assert.match(preview, /data-testid="close-researcher-preview"/);
    assert.match(preview, />\s*Close Researcher Preview\s*</);
    assert.match(preview, /setResearcherPreviewEnabled\(false\)/);
  });
});

describe("preview isolation from the useStream chat boundary", () => {
  it("only handleSubmit — the normal-chat submit — calls stream.submit", () => {
    // stream.submit must appear exactly once, and inside handleSubmit only.
    const submitOccurrences = (preview.match(/stream\.submit\(/g) ?? []).length;
    assert.equal(submitOccurrences, 1, "stream.submit must appear exactly once");
    const handleSubmit = preview.match(/const handleSubmit = \([^)]*\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
    assert.match(handleSubmit, /stream\.submit\(/);

    // None of the preview-side handlers may call stream.submit or stream.stop.
    const previewHandlers = [
      preview.match(/const openResearcherPreview = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "",
      preview.match(/const closeResearcherPreview = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "",
      preview.match(/const resetFixture = \([^)]*\) => \{[\s\S]*?\n  \};/)?.[0] ?? "",
      preview.match(/const startFixture = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "",
      preview.match(/const cancelFixture = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "",
      preview.match(/const continueFixture = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "",
      preview.match(/const requestSectionChange = \([^)]*\) => \{[\s\S]*?\n  \};/)?.[0] ?? "",
    ];
    for (const body of previewHandlers) {
      assert.doesNotMatch(body, /stream\.submit/, "preview handler must not call stream.submit");
      assert.doesNotMatch(body, /stream\.stop/, "preview handler must not call stream.stop");
      assert.doesNotMatch(body, /stream\.abort/, "preview handler must not call stream.abort");
      assert.doesNotMatch(body, /stream\.reset/, "preview handler must not call stream.reset");
    }
  });

  it("preview open and close handlers issue zero network requests", () => {
    const openBody = preview.match(/const openResearcherPreview = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
    const closeBody = preview.match(/const closeResearcherPreview = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
    for (const body of [openBody, closeBody]) {
      assert.ok(body.length > 0, "preview open/close bodies must exist");
      assert.doesNotMatch(body, /fetch\(/, "preview trigger must not call fetch");
      assert.doesNotMatch(body, /XMLHttpRequest/, "preview trigger must not construct XMLHttpRequest");
      assert.doesNotMatch(body, /new WebSocket/, "preview trigger must not open a WebSocket");
      assert.doesNotMatch(body, /EventSource/, "preview trigger must not open an EventSource");
      assert.doesNotMatch(body, /navigator\.sendBeacon/, "preview trigger must not send a beacon");
    }
  });

  it("preview Start Cancel Continue Change and Edit advance fixture state only, with no network calls", () => {
    const fixtureHandlers = [
      preview.match(/const startFixture = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "",
      preview.match(/const cancelFixture = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "",
      preview.match(/const continueFixture = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "",
      preview.match(/const requestSectionChange = \([^)]*\) => \{[\s\S]*?\n  \};/)?.[0] ?? "",
    ];
    for (const body of fixtureHandlers) {
      assert.ok(body.length > 0, "fixture handler must exist");
      // No network path
      assert.doesNotMatch(body, /fetch\(/);
      assert.doesNotMatch(body, /XMLHttpRequest/);
      assert.doesNotMatch(body, /new WebSocket/);
      assert.doesNotMatch(body, /EventSource/);
      // No live-chat mutator
      assert.doesNotMatch(body, /stream\.submit/);
      assert.doesNotMatch(body, /stream\.stop/);
      assert.doesNotMatch(body, /stream\.abort/);
      // Fixture state via useState setters only
      assert.match(body, /setFixture(Status|Todos|Log)|setRevisionApplied|setOpenSectionId/);
    }
  });
});

describe("live and fixture todos never merge", () => {
  it("keeps live and fixture progress in structurally separate DOM subtrees", () => {
    // Two data-source markers, one per region.
    assert.match(preview, /data-source="live"/);
    assert.match(preview, /data-source="fixture"/);
    // Each region is a distinct element.
    assert.match(preview, /className="progress-region progress-region--live"[\s\S]*?data-source="live"/);
    assert.match(preview, /className="progress-region progress-region--fixture"[\s\S]*?data-source="fixture"/);
  });

  it("reads live todos from stream.values only, and fixture todos from local state only", () => {
    // Live region reads stream.values.todos through getTodosFromStreamValues.
    const liveTodosDecl = preview.match(/const liveTodos = getTodosFromStreamValues\(stream\.values\);/);
    assert.ok(liveTodosDecl, "liveTodos must come from getTodosFromStreamValues(stream.values)");

    // Fixture-side <AgentProgress> is fed only from local fixtureTodos.
    const fixtureRegion = preview.match(/data-source="fixture"[\s\S]*?<\/div>/)?.[0] ?? "";
    assert.ok(fixtureRegion.length > 0, "fixture region must exist");
    assert.match(fixtureRegion, /todos=\{fixtureTodos\}/);
    assert.doesNotMatch(fixtureRegion, /liveTodos/);
    assert.doesNotMatch(fixtureRegion, /stream\.values/);

    // Live-side <AgentProgress> is fed only from liveTodos.
    const liveRegion = preview.match(/data-source="live"[\s\S]*?<AgentProgress todos=\{liveTodos\}[\s\S]*?<\/div>/)?.[0] ?? "";
    assert.ok(liveRegion.length > 0, "live region must render AgentProgress with liveTodos");
    assert.doesNotMatch(liveRegion, /fixtureTodos/);
  });

  it("never writes fixture todos into stream.values through the setter", () => {
    // No assignment to stream.values or stream.values.todos anywhere.
    assert.doesNotMatch(preview, /stream\.values\s*=/);
    assert.doesNotMatch(preview, /stream\.values\.todos\s*=/);
    // No merge of live + fixture arrays.
    assert.doesNotMatch(preview, /\[\.\.\.\s*liveTodos\s*,\s*\.\.\.\s*fixtureTodos\s*\]/);
    assert.doesNotMatch(preview, /\[\.\.\.\s*fixtureTodos\s*,\s*\.\.\.\s*liveTodos\s*\]/);
    assert.doesNotMatch(preview, /liveTodos\.concat\(fixtureTodos\)/);
    assert.doesNotMatch(preview, /fixtureTodos\.concat\(liveTodos\)/);
  });
});

describe("deterministic-simulation labelling and accessibility", () => {
  it("renders 'Researcher Preview' and 'Deterministic simulation' labels whenever preview is enabled", () => {
    // Label component lives inside the fixture region, gated on researcherPreviewEnabled.
    assert.match(preview, /function DeterministicPreviewLabel/);
    assert.match(preview, /Researcher Preview<\/p>/);
    assert.match(preview, /Deterministic simulation<\/p>/);
    // Label is rendered inside the fixture region (which is only rendered when preview is enabled).
    const fixtureRegion = preview.match(/researcherPreviewEnabled && \([\s\S]*?data-source="fixture"[\s\S]*?<\/div>\s*\)/)?.[0] ?? "";
    assert.ok(fixtureRegion.length > 0, "fixture region must be gated on researcherPreviewEnabled");
    assert.match(fixtureRegion, /<DeterministicPreviewLabel \/>/);
    // Label announces politely to assistive tech.
    assert.match(preview, /className="deterministic-preview-label"[\s\S]*?aria-live="polite"/);
  });

  it("preserves accessibility behavior: trigger and controls carry accessible names", () => {
    // Open/close trigger accessible names.
    assert.match(preview, /aria-label="Open Researcher Preview"/);
    assert.match(preview, /aria-label="Close Researcher Preview"/);
    // Live and fixture regions carry accessible-name aria-label attributes.
    assert.match(preview, /aria-label="Live Agent Progress"/);
    assert.match(preview, /aria-label="Researcher Preview Progress"/);
    // Fixture controls region keeps its accessibility label.
    assert.match(preview, /aria-label="Deterministic simulation controls"/);
    // Progress renders through the retained TodoList component which owns
    // role=progressbar and the aria-live announcer (see TodoList.tsx).
    assert.match(todoList, /role="progressbar"/);
    assert.match(todoList, /aria-live="polite"/);
  });
});
