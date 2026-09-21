"use client";
import { useMemo, useState } from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import type { deepAgentTodoListAgent } from "./types";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

import {
  FIXTURE_SCENARIOS,
  FIXTURE_SOURCES,
  getFixtureScenario,
  successTodos,
  type FixtureScenarioId,
  type FixtureSectionId,
  type FixtureStatus,
} from "./researcherFixtures";
import { AgentProgress } from "./TodoList";
import type { Todo } from "./types";
import { getTodosFromStreamValues } from "./todoProgress";
import "./researcher-product.css";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_SERVER_URL =
  process.env.NEXT_PUBLIC_AGENT_SERVER_URL ?? "http://localhost:2024";
const ASSISTANT_ID = "deep-agent-todo-list";

const PRESETS = [
  "Research keyboard focus visibility for a small web app",
  "Compare polite and assertive live-region guidance",
];

const isFixtureActive = (status: FixtureStatus) =>
  status !== "idle" && status !== "canceled";

// ---------------------------------------------------------------------------
// Inline chat components (avoids dependency on @langchain/playground-agents)
// ---------------------------------------------------------------------------

function ChatInput({
  onSubmit,
  disabled,
  onNewThread,
}: {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  onNewThread?: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="chat-input-form"
      onSubmit={(e) => {
        e.preventDefault();
        const text = value.trim();
        if (text) {
          onSubmit(text);
          setValue("");
        }
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder="Ask a research question…"
        aria-label="Chat message"
      />
      <button type="submit" disabled={disabled || !value.trim()}>
        Send
      </button>
      {onNewThread && (
        <button type="button" onClick={onNewThread} className="button-secondary">
          New thread
        </button>
      )}
    </form>
  );
}

function ChatContainer({
  children,
  input,
  embedded,
}: {
  children: React.ReactNode;
  input?: React.ReactNode;
  embedded?: boolean;
}) {
  return (
    <div
      className={`chat-container${embedded ? " chat-container--embedded" : ""}`}
    >
      <div className="chat-messages">{children}</div>
      {input}
    </div>
  );
}

function HumanBubble({ children }: { children: React.ReactNode }) {
  return <article className="chat-bubble chat-bubble--human">{children}</article>;
}

function AIBubble({ children }: { children: React.ReactNode }) {
  return <article className="chat-bubble chat-bubble--ai">{children}</article>;
}

function TypingIndicator() {
  return (
    <div className="typing-indicator" aria-live="polite">
      <span aria-hidden="true">…</span>
    </div>
  );
}

function PresetPrompts({
  prompts,
  onSelect,
}: {
  prompts: string[];
  onSelect: (text: string) => void;
}) {
  return (
    <div className="preset-prompts">
      {prompts.map((p) => (
        <button key={p} type="button" onClick={() => onSelect(p)}>
          {p}
        </button>
      ))}
    </div>
  );
}

function Markdown({ children }: { children: string }) {
  return <p style={{ whiteSpace: "pre-wrap" }}>{children}</p>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DeepAgentTodoListPreview() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [researcherPreviewEnabled, setResearcherPreviewEnabled] = useState(false);
  const [fixtureId, setFixtureId] = useState<FixtureScenarioId>("straight-success");
  const [fixtureStatus, setFixtureStatus] = useState<FixtureStatus>("idle");
  const [fixtureTodos, setFixtureTodos] = useState<Todo[]>([]);
  const [revisionApplied, setRevisionApplied] = useState(false);
  const [openSectionId, setOpenSectionId] = useState<FixtureSectionId | null>(null);
  const [fixtureLog, setFixtureLog] = useState<string[]>([
    "Choose a simulation or use the chat. Live runs still use the stream todo contract.",
  ]);

  const stream = useStream<typeof deepAgentTodoListAgent>({
    apiUrl: AGENT_SERVER_URL,
    assistantId: ASSISTANT_ID,
    threadId,
    onThreadId: setThreadId,
  });

  const scenario = useMemo(() => getFixtureScenario(fixtureId), [fixtureId]);

  // Normal chat submission — always uses the one useStream boundary.
  // This handler is the ONLY caller of stream.submit in this component.
  const handleSubmit = (text: string) => {
    setFixtureStatus("idle");
    setFixtureTodos([]);
    setRevisionApplied(false);
    setOpenSectionId(null);
    stream.submit({ messages: [{ type: "human" as const, content: text }] });
  };

  // Researcher Preview trigger — toggles researcherPreviewEnabled only.
  // Does NOT call stream.submit, stream.stop, or any live-chat mutator.
  // Preserves normal chat state (messages, threadId) across preview open/close.
  const openResearcherPreview = () => {
    setResearcherPreviewEnabled(true);
  };

  const closeResearcherPreview = () => {
    setResearcherPreviewEnabled(false);
    setFixtureStatus("idle");
    setFixtureTodos([]);
    setRevisionApplied(false);
    setOpenSectionId(null);
    setFixtureLog([
      "Choose a simulation or use the chat. Live runs still use the stream todo contract.",
    ]);
  };

  const resetFixture = (nextId: FixtureScenarioId) => {
    setFixtureId(nextId);
    setFixtureStatus("idle");
    setFixtureTodos([]);
    setRevisionApplied(false);
    setOpenSectionId(null);
    setFixtureLog(["Simulation reset. Start and Cancel are available; Ready for planning is not available."]);
  };

  const startFixture = () => {
    setFixtureStatus("running");
    setFixtureTodos([]);
    setRevisionApplied(false);
    setOpenSectionId(null);
    setFixtureLog([
      `Start: ${scenario.startPrompt}`,
      "Agent is creating a plan…",
      "Simulation playback only: cited facts will appear after the source-check stage completes.",
    ]);

    window.setTimeout(() => {
      setFixtureTodos(scenario.todosAtReview);
      setFixtureStatus("review");
      setFixtureLog((items) => [
        ...items,
        "Source-check stage complete: public accessibility sources were mapped to the displayed findings.",
        `Review hook reached: ${scenario.reviewSummary}`,
      ]);
    }, 350);
  };

  const cancelFixture = () => {
    setFixtureStatus("canceled");
    setFixtureTodos([]);
    setOpenSectionId(null);
    setFixtureLog((items) => [...items, "Cancel: simulation stopped without reaching Ready for planning."]);
  };

  const continueFixture = () => {
    const needsTargetedChange = Boolean(scenario.targetedChange && !revisionApplied);
    if (fixtureStatus !== "review" || needsTargetedChange) {
      setFixtureLog((items) => [
        ...items,
        needsTargetedChange
          ? "Continue blocked: apply the targeted section change before continuing."
          : "Continue blocked: review hook is not ready.",
      ]);
      return;
    }

    const currentTodos = fixtureTodos.length > 0 ? fixtureTodos : scenario.todosAtReview;
    setFixtureTodos(successTodos(currentTodos));
    setFixtureStatus("success");
    setFixtureLog((items) => [
      ...items,
      "Continue: cited findings accepted for this simulation; Ready for planning reached.",
    ]);
  };

  const requestSectionChange = (sectionId: FixtureSectionId) => {
    setOpenSectionId(sectionId);

    if (!scenario.targetedChange || scenario.targetedChange.sectionId !== sectionId || revisionApplied) {
      setFixtureLog((items) => [...items, `Opened section-scoped editor for ${sectionId}.`]);
      return;
    }

    setFixtureStatus("reloop");
    setFixtureLog((items) => [
      ...items,
      `Change requested for ${sectionId}: ${scenario.targetedChange?.request}`,
      `Targeted finding: ${scenario.targetedChange?.affectedFinding}`,
      "Returning only to the affected finding and section.",
    ]);

    window.setTimeout(() => {
      setFixtureTodos(scenario.targetedChange?.revisedTodos ?? scenario.todosAtReview);
      setRevisionApplied(true);
      setFixtureStatus("review");
      setFixtureLog((items) => [
        ...items,
        "Revised Facts and Sources displayed; unaffected sections were preserved.",
      ]);
    }, 350);
  };

  // Live source: stream.values?.todos (the useStream boundary).
  const liveTodos = getTodosFromStreamValues(stream.values);
  // Fixture source: local useState. NEVER merged with liveTodos, NEVER written into stream.values.
  const previewFixtureActive = researcherPreviewEnabled && isFixtureActive(fixtureStatus);
  const messages = stream.messages ?? [];
  const continueDisabled =
    fixtureStatus !== "review" || Boolean(scenario.targetedChange && !revisionApplied);

  // Continuity: keep v1 behavior where the live progress card is temporarily
  // hidden while the fixture is actively running, but ONLY within the preview
  // overlay. When preview is closed, the live card follows the stream as v1.
  const showLiveProgressCard = !previewFixtureActive;
  const liveProgressLoading = stream.isLoading && liveTodos.length === 0;
  const progressTodos = previewFixtureActive ? fixtureTodos : liveTodos;
  const progressLoading = previewFixtureActive
    ? fixtureStatus === "running" || fixtureStatus === "reloop"
    : liveProgressLoading;
  const showLiveTyping = stream.isLoading && !previewFixtureActive;

  const chatInput = (
    <ChatInput
      onSubmit={handleSubmit}
      disabled={stream.isLoading || fixtureStatus === "running" || fixtureStatus === "reloop"}
      onNewThread={messages.length > 0 ? () => setThreadId(null) : undefined}
    />
  );

  return (
    <main className="product-shell" data-preview-enabled={researcherPreviewEnabled ? "true" : "false"}>
      <section className="product-main" aria-label="Deep agent todo-list product demo">
        <section className="chat-pane" aria-label="Chat">
          <div className="product-hero">
            <p className="product-eyebrow">Accessibility research fixture</p>
            <h1>Planning assistant with sourced findings</h1>
            <p>
              Chat remains connected to the agent stream while Agent Progress renders the live
              <code> stream.values?.todos</code> state contract.
            </p>
          </div>

          <ResearcherPreviewTrigger
            enabled={researcherPreviewEnabled}
            onOpen={openResearcherPreview}
            onClose={closeResearcherPreview}
          />

          {researcherPreviewEnabled && (
            <FixtureControls
              fixtureId={fixtureId}
              fixtureStatus={fixtureStatus}
              revisionApplied={revisionApplied}
              onSelect={resetFixture}
              onStart={startFixture}
              onCancel={cancelFixture}
              onContinue={continueFixture}
              continueDisabled={continueDisabled}
            />
          )}

          <ChatContainer embedded input={chatInput}>
            {messages.length === 0 && fixtureStatus === "idle" && (
              <PresetPrompts prompts={PRESETS} onSelect={handleSubmit} />
            )}

            {researcherPreviewEnabled && fixtureStatus !== "idle" && (
              <AIBubble>
                <Markdown>{fixtureLog.join("\n\n")}</Markdown>
              </AIBubble>
            )}

            {messages.map((msg, i) => {
              if (HumanMessage.isInstance(msg)) {
                return (
                  <HumanBubble key={msg.id ?? i}>
                    <Markdown>{typeof msg.content === "string" ? msg.content : ""}</Markdown>
                  </HumanBubble>
                );
              }

              if (AIMessage.isInstance(msg) && typeof msg.content === "string" && msg.content.trim().length > 0) {
                return (
                  <AIBubble key={msg.id ?? i}>
                    <Markdown>{msg.content}</Markdown>
                  </AIBubble>
                );
              }

              return null;
            })}

            {showLiveTyping && <TypingIndicator />}
          </ChatContainer>
        </section>

        <aside className="progress-pane" aria-label="Agent progress and fixture review">
          {/* Live Agent Progress — reads stream.values?.todos through the one useStream boundary. */}
          {showLiveProgressCard && (
            <div
              className="progress-region progress-region--live"
              data-source="live"
              aria-label="Live Agent Progress"
            >
              <AgentProgress todos={liveTodos} isLoading={liveProgressLoading} />
              {fixtureStatus === "idle" && liveTodos.length === 0 && !stream.isLoading && (
                <p className="progress-idle-note">Agent Progress appears after the agent creates a plan.</p>
              )}
            </div>
          )}

          {/* Researcher Preview Progress — fixture-only, structurally separate. */}
          {researcherPreviewEnabled && (
            <div
              className="progress-region progress-region--fixture"
              data-source="fixture"
              aria-label="Researcher Preview Progress"
            >
              <DeterministicPreviewLabel />
              {previewFixtureActive ? (
                <AgentProgress todos={fixtureTodos} isLoading={progressLoading} />
              ) : (
                <p className="progress-idle-note">
                  Choose a simulation and press Start to run deterministic playback.
                </p>
              )}
            </div>
          )}

          {researcherPreviewEnabled && (fixtureStatus === "review" || fixtureStatus === "success") && (
            <FixtureReviewPanel
              scenarioId={fixtureId}
              status={fixtureStatus}
              revisionApplied={revisionApplied}
              openSectionId={openSectionId}
              onSectionChange={requestSectionChange}
            />
          )}

          {researcherPreviewEnabled && fixtureStatus === "canceled" && (
            <section className="fixture-status-card" role="status">
              <h2>Simulation canceled</h2>
              <p>Cancel stopped the simulation path. Ready for planning was not reached.</p>
            </section>
          )}
        </aside>
      </section>
    </main>
  );
}

function ResearcherPreviewTrigger({
  enabled,
  onOpen,
  onClose,
}: {
  enabled: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <section
      className="researcher-preview-trigger"
      aria-label="Researcher Preview trigger"
      data-preview-enabled={enabled ? "true" : "false"}
    >
      {enabled ? (
        <button
          type="button"
          className="button-secondary"
          onClick={onClose}
          aria-label="Close Researcher Preview"
          data-testid="close-researcher-preview"
        >
          Close Researcher Preview
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          aria-label="Open Researcher Preview"
          data-testid="open-researcher-preview"
        >
          Open Researcher Preview
        </button>
      )}
      <p className="researcher-preview-note">
        Normal chat stays available whether Researcher Preview is open or closed.
      </p>
    </section>
  );
}

function DeterministicPreviewLabel() {
  return (
    <div
      className="deterministic-preview-label"
      role="status"
      aria-live="polite"
      data-testid="deterministic-preview-label"
    >
      <p className="deterministic-preview-title">Researcher Preview</p>
      <p className="deterministic-preview-sub">Deterministic simulation</p>
    </div>
  );
}

function FixtureControls({
  fixtureId,
  fixtureStatus,
  revisionApplied,
  onSelect,
  onStart,
  onCancel,
  onContinue,
  continueDisabled,
}: {
  fixtureId: FixtureScenarioId;
  fixtureStatus: FixtureStatus;
  revisionApplied: boolean;
  onSelect: (id: FixtureScenarioId) => void;
  onStart: () => void;
  onCancel: () => void;
  onContinue: () => void;
  continueDisabled: boolean;
}) {
  return (
    <section className="fixture-controls" aria-label="Deterministic simulation controls">
      <div className="fixture-picker" aria-label="Accessibility research simulations">
        {FIXTURE_SCENARIOS.map((fixture) => (
          <label key={fixture.id} className="fixture-option">
            <input
              type="radio"
              name="fixture"
              checked={fixtureId === fixture.id}
              onChange={() => onSelect(fixture.id)}
            />
            <span>{fixture.title}</span>
          </label>
        ))}
      </div>
      <div className="fixture-actions">
        <button type="button" onClick={onStart}>Start</button>
        <button type="button" className="button-secondary" onClick={onCancel}>Cancel</button>
        {(fixtureStatus === "review" || fixtureStatus === "reloop") && (
          <button type="button" onClick={onContinue} disabled={continueDisabled}>Continue</button>
        )}
      </div>
      <p className="fixture-state" data-status={fixtureStatus}>
        Simulation state: <strong>{fixtureStatus === "success" ? "ready for planning" : fixtureStatus}</strong>
        {revisionApplied ? " · targeted revision applied" : ""}
      </p>
    </section>
  );
}

function FixtureReviewPanel({
  scenarioId,
  status,
  revisionApplied,
  openSectionId,
  onSectionChange,
}: {
  scenarioId: FixtureScenarioId;
  status: FixtureStatus;
  revisionApplied: boolean;
  openSectionId: FixtureSectionId | null;
  onSectionChange: (id: FixtureSectionId) => void;
}) {
  const scenario = getFixtureScenario(scenarioId);
  const sourceMap = new Map(FIXTURE_SOURCES.map((source) => [source.id, source]));

  return (
    <section className="fixture-review" aria-label="Research review sections">
      <div className="fixture-review-header">
        <p className="product-eyebrow">Research review</p>
        <h2>{status === "success" ? "Ready for planning" : "Sourced review"}</h2>
      </div>

      {scenario.sections.map((section) => {
        const isTarget = scenario.targetedChange?.sectionId === section.id;
        const summary = isTarget && revisionApplied
          ? scenario.targetedChange?.revisedSummary ?? section.summary
          : section.summary;
        return (
          <article key={section.id} className={`fixture-section ${isTarget && revisionApplied ? "fixture-section--revised" : ""}`}>
            <div className="fixture-section-topline">
              <h3>{section.title}</h3>
              {section.editable && (
                <button type="button" className="section-action" onClick={() => onSectionChange(section.id)}>
                  {isTarget && scenario.targetedChange && !revisionApplied ? "Change" : "Edit"}
                </button>
              )}
            </div>
            <p>{summary}</p>
            <p className="checked-line"><strong>Checked:</strong> {isTarget && revisionApplied ? scenario.targetedChange?.revisedChecked : section.checked}</p>
            <p className="simulation-note">{section.simulationNote}</p>
            {openSectionId === section.id && (
              <div className="section-editor-card">
                <strong>{section.title} scoped control</strong>
                <p>This edit path is limited to this section and does not open a whole-bundle editor.</p>
                {isTarget && scenario.targetedChange && !revisionApplied && (
                  <p><strong>Change request:</strong> {scenario.targetedChange.request}</p>
                )}
              </div>
            )}
            <div className="source-line" aria-label="Public sources">
              {section.sourceIds.map((id) => { const source = sourceMap.get(id); return source ? <a key={id} href={source.url} target="_blank" rel="noreferrer">{source.title} — {source.publisher}</a> : <span key={id}>{id}</span>; })}
            </div>
          </article>
        );
      })}
    </section>
  );
}
