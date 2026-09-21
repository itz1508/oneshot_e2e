import type { Todo } from "./types";

export type FixtureScenarioId = "straight-success" | "section-change-reloop";
export type FixtureStatus = "idle" | "running" | "review" | "reloop" | "success" | "canceled";
export type FixtureSectionId = "facts-sources" | "checked" | "draft-output";

export interface FixtureSource {
  id: "FOCUS" | "STATUS" | "ARIA";
  title: string;
  publisher: string;
  url: string;
  claims: string[];
}

export interface FixtureSection {
  id: FixtureSectionId;
  title: string;
  summary: string;
  checked: string;
  sourceIds: FixtureSource["id"][];
  editable: boolean;
  simulationNote: string;
}

export interface FixtureScenario {
  id: FixtureScenarioId;
  title: string;
  researchQuestion: string;
  simulationScope: string;
  startPrompt: string;
  reviewSummary: string;
  todosAtReview: Todo[];
  sections: FixtureSection[];
  targetedChange?: {
    sectionId: FixtureSectionId;
    request: string;
    beforeIssue: string;
    affectedFinding: string;
    revisedSummary: string;
    revisedChecked: string;
    revisedTodos: Todo[];
  };
}

export const FIXTURE_SOURCES: FixtureSource[] = [
  {
    id: "FOCUS",
    title: "Understanding Success Criterion 2.4.7: Focus Visible",
    publisher: "W3C Web Accessibility Initiative (WAI)",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html",
    claims: [
      "Any keyboard-operable user interface must have a mode where the keyboard focus indicator is visible.",
      "The criterion helps people know which element has keyboard focus, and without a focus indicator sighted keyboard users cannot operate the page.",
    ],
  },
  {
    id: "STATUS",
    title: "Understanding Success Criterion 4.1.3: Status Messages",
    publisher: "W3C Web Accessibility Initiative (WAI)",
    url: "https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html",
    claims: [
      "Status messages can be programmatically determined through role or properties so assistive technologies can present them without receiving focus.",
      "The intent is to make users aware of important content changes that are not given focus without unnecessarily interrupting their work.",
      "A status message gives information about success, results, waiting state, process progress, or errors, and is not a change of context.",
    ],
  },
  {
    id: "ARIA",
    title: "ARIA: aria-live attribute",
    publisher: "MDN Web Docs",
    url: "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-live",
    claims: [
      "The aria-live attribute indicates that an element will be updated and describes what updates assistive technologies can expect from the live region.",
      "aria-live=polite generally notifies users without interrupting the current task; aria-live=assertive immediately notifies the user and may clear the speech queue.",
      "MDN warns not to use assertive unless the interruption is imperative because interruption may disorient users or cause them not to complete their current task.",
    ],
  },
];

export const FIXTURE_SCENARIOS: FixtureScenario[] = [
  {
    id: "straight-success",
    title: "Fixture 1: sourced accessibility findings",
    researchQuestion: "What should a small web app show for keyboard focus and asynchronous status updates?",
    simulationScope: "Deterministic simulation playback. The cited accessibility facts are real and publicly verifiable; the workflow run is simulated.",
    startPrompt: "Research keyboard focus visibility and asynchronous status-message behavior using public accessibility sources.",
    reviewSummary: "Ready for planning: the simulated research bundle contains cited focus-visible and status-message findings.",
    todosAtReview: [
      { content: "Ask a concrete accessibility research question", status: "completed" },
      { content: "Check W3C Focus Visible guidance", status: "completed" },
      { content: "Check W3C Status Messages guidance", status: "completed" },
      { content: "Check MDN aria-live guidance", status: "completed" },
      { content: "Review cited findings before planning", status: "in_progress" },
      { content: "Mark the simulation ready for planning", status: "pending" },
    ],
    sections: [
      {
        id: "facts-sources",
        title: "Facts and Sources",
        summary: "Finding: keyboard-operable controls need a visible focus indicator, status messages that do not move focus need programmatic roles/properties, and aria-live can announce dynamic updates with different urgency levels.",
        checked: "Checked W3C Focus Visible for visible focus indicators, W3C Status Messages for status updates without focus changes, and MDN aria-live for polite/assertive live-region behavior.",
        sourceIds: ["FOCUS", "STATUS", "ARIA"],
        editable: true,
        simulationNote: "Simulation playback only: the facts are real and cited; the collection step is scripted.",
      },
      {
        id: "checked",
        title: "What Was Checked",
        summary: "The simulated researcher checked whether focus indicators, progress text, and live-region urgency each had direct support in a public source before drafting output.",
        checked: "Focus indicator claim maps to W3C Focus Visible; status-without-focus claim maps to W3C Status Messages; polite/assertive distinction maps to MDN aria-live.",
        sourceIds: ["FOCUS", "STATUS", "ARIA"],
        editable: true,
        simulationNote: "This section records the simulated verification checklist; it does not claim a live web run occurred inside the app.",
      },
      {
        id: "draft-output",
        title: "Simulated Output",
        summary: "Draft answer: keep keyboard focus visibly indicated, expose non-focus-moving progress/status text programmatically, and reserve assertive live announcements for imperative interruptions.",
        checked: "The draft avoids claiming that every dynamic update needs assertive announcement; source evidence supports more selective live-region urgency.",
        sourceIds: ["FOCUS", "STATUS", "ARIA"],
        editable: true,
        simulationNote: "This is a simulated planning-ready research summary built from the cited public facts.",
      },
    ],
  },
  {
    id: "section-change-reloop",
    title: "Fixture 2: sourced correction loop",
    researchQuestion: "How should a draft distinguish polite and assertive live-region announcements?",
    simulationScope: "Deterministic simulation playback. The cited accessibility facts are real and publicly verifiable; the correction loop is simulated.",
    startPrompt: "Review and narrow a draft claim about aria-live urgency using W3C and MDN sources.",
    reviewSummary: "Review needed: the initial draft over-broadly treats all status updates as assertive announcements.",
    todosAtReview: [
      { content: "Draft an accessibility status-message summary", status: "completed" },
      { content: "Identify the over-broad live-region claim", status: "completed" },
      { content: "Request a targeted Facts and Sources correction", status: "in_progress" },
      { content: "Revise polite versus assertive guidance", status: "pending" },
      { content: "Mark the simulation ready for planning", status: "pending" },
    ],
    sections: [
      {
        id: "facts-sources",
        title: "Facts and Sources",
        summary: "Before correction: the draft says dynamic status updates should use assertive live announcements so users hear them immediately. This is too broad because MDN distinguishes polite and assertive urgency and warns against unnecessary assertive interruptions.",
        checked: "Checked W3C Status Messages for non-interrupting status intent and MDN aria-live for polite/assertive behavior.",
        sourceIds: ["STATUS", "ARIA"],
        editable: true,
        simulationNote: "Simulation playback only: this is a scripted draft issue used to teach targeted source-based correction.",
      },
      {
        id: "checked",
        title: "Why Change Is Needed",
        summary: "The source evidence requires narrowing: status messages should be presentable without moving focus, and assertive live regions are for urgent updates, not all routine progress or success messages.",
        checked: "W3C says the intent is awareness without unnecessary interruption; MDN says polite generally avoids interrupting and assertive may clear the speech queue.",
        sourceIds: ["STATUS", "ARIA"],
        editable: true,
        simulationNote: "The before/after correction is simulated; the cited source distinction is real.",
      },
      {
        id: "draft-output",
        title: "Simulated Output",
        summary: "Before correction: use assertive live announcements for dynamic status updates. This wording is intentionally shown as the issue to be fixed.",
        checked: "The section is held at review until the Facts and Sources correction separates routine polite updates from imperative assertive updates.",
        sourceIds: ["STATUS", "ARIA"],
        editable: true,
        simulationNote: "This initial output is deliberately imperfect to demonstrate a section-level re-loop.",
      },
    ],
    targetedChange: {
      sectionId: "facts-sources",
      request: "Narrow the live-region guidance: separate routine polite updates from imperative assertive updates and cite why.",
      beforeIssue: "The draft overstates that all dynamic status updates should be assertive.",
      affectedFinding: "Only Facts and Sources is revisited because the correction is about live-region urgency evidence; focus-visible findings are unaffected.",
      revisedSummary: "After correction: use programmatically determinable status messages for updates that do not move focus; use polite live regions for routine updates and reserve assertive live regions for imperative, time-sensitive interruptions.",
      revisedChecked: "MDN states polite generally does not interrupt the current task, while assertive immediately notifies and may clear the speech queue; W3C states status messages should inform users without unnecessary interruption.",
      revisedTodos: [
        { content: "Draft an accessibility status-message summary", status: "completed" },
        { content: "Identify the over-broad live-region claim", status: "completed" },
        { content: "Request a targeted Facts and Sources correction", status: "completed" },
        { content: "Revise polite versus assertive guidance", status: "completed" },
        { content: "Review cited correction before planning", status: "in_progress" },
        { content: "Mark the simulation ready for planning", status: "pending" },
      ],
    },
  },
];

export function getFixtureScenario(id: FixtureScenarioId): FixtureScenario {
  const scenario = FIXTURE_SCENARIOS.find((candidate) => candidate.id === id);
  if (!scenario) {
    throw new Error(`Unknown fixture scenario: ${id}`);
  }
  return scenario;
}

export function successTodos(todos: Todo[]): Todo[] {
  return todos.map((todo) => ({ ...todo, status: "completed" }));
}
