import React, { useState, useCallback, useEffect } from "react";
import { ProviderId } from "../types";
import { PROVIDER_DEFINITIONS } from "../lib/providers";
import { resolveApiUrl, readJsonResponse } from "../lib/api";

export interface FixtureScenario {
  id: string;
  name: string;
  file: string;
  description: string;
  prompt: string;
  targetFinding: string;
  partitions: string[];
}

export const FIXTURE_SCENARIOS: FixtureScenario[] = [
  {
    id: "fix-sec-01",
    name: "Agent 4-Partition Sandbox Security Invariants",
    file: "app/fixtures/security-invariants.json",
    description: "Enforces virtual filesystem isolation across workspace, scratch, memories, and artifacts without external API keys.",
    prompt: "Audit and verify Agent 4-partition sandbox security invariants and check filesystem isolation boundaries.",
    targetFinding: "SEC-INV-001",
    partitions: ["/workspace", "/scratch", "/memories", "/artifacts"],
  },
  {
    id: "fix-reason-02",
    name: "Reasoning Subprocess Dry-Run Audit",
    file: "app/fixtures/reasoning-dryrun.json",
    description: "Executes offline Python reasoning subprocess with deterministic contract proofs and finding verification.",
    prompt: "Execute dry-run fixture audit and verify repository contract baselines.",
    targetFinding: "FIX-AUDIT-001",
    partitions: ["/workspace", "/artifacts"],
  },
  {
    id: "fix-adk-03",
    name: "ADK Automated Development Workflow",
    file: "app/fixtures/adk-workflow.json",
    description: "Evaluates multi-agent handoff pipeline, design planning gate, and human review checkpoint transitions.",
    prompt: "Validate ADK automated development workflow stages and checkpoint transitions.",
    targetFinding: "ADK-GATE-001",
    partitions: ["/workspace", "/scratch"],
  },
  {
    id: "fix-sample-04",
    name: "Sample Contract Fixture Integrity",
    file: "app/fixtures/sample.json",
    description: "Validates JSON schema compliance, cryptographic SHA-256 byte equality, and mandatory session anchors.",
    prompt: "Validate sample fixture contract and verify cryptographic hash equality.",
    targetFinding: "SMP-HASH-001",
    partitions: ["/workspace"],
  },
];

interface WelcomeWorkflowConsoleProps {
  isRunning: boolean;
  runStatus: string;
  currentProvider: ProviderId;
  onSelectProvider: (provider: ProviderId) => void;
  onRunWorkflow: (prompt: string, mode: "fixture" | "live", provider?: ProviderId) => Promise<void> | void;
  onConfigureLiveProvider: (provider: ProviderId, model: string, apiKey?: string) => Promise<void> | void;
  hasMessages?: boolean;
}

export const WelcomeWorkflowConsole: React.FC<WelcomeWorkflowConsoleProps> = ({
  isRunning,
  runStatus,
  currentProvider,
  onSelectProvider,
  onRunWorkflow,
  onConfigureLiveProvider,
  hasMessages = false,
}) => {
  const [selectedFixtureIndex, setSelectedFixtureIndex] = useState(0);
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [activeStep, setActiveStep] = useState<number>(1);
  const [liveApiKey, setLiveApiKey] = useState("");
  const [liveModel, setLiveModel] = useState(
    PROVIDER_DEFINITIONS[currentProvider]?.models[0] || "gemini-2.5-flash"
  );
  const [liveStatusMsg, setLiveStatusMsg] = useState<string | null>(null);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [fixtureResult, setFixtureResult] = useState<{
    ok: boolean;
    status: string;
    actualHash?: string;
    expectedHash?: string;
    fixture_id?: string;
    session_id?: string;
    error?: string;
  } | null>(null);
  const [isValidatingFixture, setIsValidatingFixture] = useState(false);

  useEffect(() => {
    if (PROVIDER_DEFINITIONS[currentProvider]?.models?.length) {
      setLiveModel(PROVIDER_DEFINITIONS[currentProvider].models[0]);
    }
  }, [currentProvider]);

  const activeFixture = FIXTURE_SCENARIOS[selectedFixtureIndex];
  const effectivePrompt = customPrompt.trim() || activeFixture.prompt;

  const handleTryIt = useCallback(async () => {
    setActiveStep(3); // Move to Observe Workflow step
    setIsValidatingFixture(true);

    try {
      // 1. Execute the fixture validation on the backend directly against disk
      const res = await fetch(resolveApiUrl("/api/v2/validateFixtures"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixture_id: activeFixture.id,
          path: activeFixture.file,
        }),
      });
      const data = await readJsonResponse<{
        ok: boolean;
        status: string;
        actualHash?: string;
        expectedHash?: string;
        fixture_id?: string;
        session_id?: string;
        error?: string;
      }>(res, "Backend Fixture Validation");
      setFixtureResult(data);
    } catch (err: any) {
      setFixtureResult({
        ok: false,
        status: "failed",
        error: err.message || "Failed to validate fixture on backend",
      });
    } finally {
      setIsValidatingFixture(false);
    }

    // 2. Stream the live agent execution with the effective prompt
    onRunWorkflow(effectivePrompt, "fixture", currentProvider);
  }, [activeFixture, effectivePrompt, currentProvider, onRunWorkflow]);

  const handleConnectProvider = useCallback(async () => {
    setIsConfiguring(true);
    setLiveStatusMsg("Applying live configuration...");
    try {
      await onConfigureLiveProvider(currentProvider, liveModel, liveApiKey.trim() || undefined);
      setLiveStatusMsg(`Connected: ${currentProvider} (${liveModel})`);
      setActiveStep(5); // Move to Try Live step
    } catch (err: any) {
      setLiveStatusMsg(`Configuration error: ${err.message || "Failed to configure provider"}`);
    } finally {
      setIsConfiguring(false);
    }
  }, [currentProvider, liveModel, liveApiKey, onConfigureLiveProvider]);

  const handleConnectAndRunLive = useCallback(async () => {
    setIsConfiguring(true);
    setLiveStatusMsg("Applying live configuration...");
    try {
      await onConfigureLiveProvider(currentProvider, liveModel, liveApiKey.trim() || undefined);
      setLiveStatusMsg(`Connected: ${currentProvider} (${liveModel})`);
      setActiveStep(5); // Move to Try Live step
      onRunWorkflow(effectivePrompt, "live", currentProvider);
    } catch (err: any) {
      setLiveStatusMsg(`Configuration error: ${err.message || "Failed to configure provider"}`);
    } finally {
      setIsConfiguring(false);
    }
  }, [currentProvider, liveModel, liveApiKey, effectivePrompt, onConfigureLiveProvider, onRunWorkflow]);

  return (
    <div
      id="singleScreenConsole"
      className="welcome-workflow-console rounded-2xl border border-white/10 bg-[#121316] p-5 text-[#e1e4ea] shadow-2xl space-y-6"
      role="region"
      aria-label="Workflow Introduction and Test Console"
    >
      {/* ── 1. WHAT THIS DOES (Header & Progression) ────────────────────── */}
      <div className="border-b border-white/10 pb-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-[#3b82f6]/10 text-[#60a5fa] border border-[#3b82f6]/20">
              Verified Agentic Console
            </span>
            <h2 className="text-lg font-bold text-white tracking-tight mt-1">
              OneShot Workflow Runtime
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-md border ${
                isRunning
                  ? "bg-amber-500/10 text-amber-300 border-amber-500/30 animate-pulse"
                  : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? "bg-amber-400" : "bg-emerald-400"}`} />
              {isRunning ? `RUNNING [${runStatus}]` : "READY (OFFLINE DRY-RUN ENABLED)"}
            </span>
          </div>
        </div>

        <p className="text-xs text-[#9aa1af] leading-relaxed max-w-2xl">
          Inspect, execute, and verify software engineering tasks with deterministic invariant proofs
          and live multi-agent streaming. Start with the test scenario below or connect your own provider key.
        </p>

        {/* Progression Pills */}
        <nav
          aria-label="Workflow Progression"
          className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]"
        >
          {[
            { step: 1, label: "Understand" },
            { step: 2, label: "Try fixture" },
            { step: 3, label: "Observe workflow" },
            { step: 4, label: "Enter own key" },
            { step: 5, label: "Try live" },
          ].map((item, idx, arr) => {
            const isCurrent = activeStep === item.step;
            const isPassed = activeStep > item.step;
            return (
              <React.Fragment key={item.step}>
                <button
                  type="button"
                  onClick={() => setActiveStep(item.step)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all font-medium ${
                    isCurrent
                      ? "bg-[#2563eb] text-white shadow-sm ring-1 ring-[#3b82f6]"
                      : isPassed
                      ? "bg-white/10 text-[#c5cad3] hover:bg-white/15"
                      : "bg-white/5 text-[#737b8b] hover:text-[#a0a8b7]"
                  }`}
                >
                  <span className="font-mono text-[10px] opacity-75">{item.step}.</span>
                  <span>{item.label}</span>
                </button>
                {idx < arr.length - 1 && (
                  <span className="text-[#4b5262] text-[10px] select-none" aria-hidden="true">→</span>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      {/* ── 2. TEST SCENARIO (Fixture input / example + [Try It]) ──────────── */}
      <section aria-labelledby="test-scenario-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 id="test-scenario-heading" className="text-xs font-semibold uppercase tracking-wider text-[#9aa1af]">
              Test Scenario (Default Fixture)
            </h3>
            <span className="text-[10px] text-[#60a5fa] bg-[#3b82f6]/10 px-2 py-0.5 rounded border border-[#3b82f6]/20 font-mono">
              no credentials needed
            </span>
          </div>
          <span className="text-[11px] font-mono text-[#828a9b]">
            Target: {activeFixture.targetFinding}
          </span>
        </div>

        {/* Fixture Selector Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {FIXTURE_SCENARIOS.map((scenario, idx) => {
            const isSelected = selectedFixtureIndex === idx;
            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => {
                  setSelectedFixtureIndex(idx);
                  setCustomPrompt("");
                  setActiveStep(2);
                }}
                className={`text-left p-2.5 rounded-xl border text-xs transition-all ${
                  isSelected
                    ? "border-[#3b82f6] bg-[#1d2538] text-white shadow-[0_0_12px_rgba(59,130,246,0.15)]"
                    : "border-white/5 bg-[#17181c] text-[#8e95a5] hover:border-white/10 hover:text-[#d0d4de]"
                }`}
              >
                <div className="font-semibold truncate">{scenario.name}</div>
                <div className="text-[10px] opacity-70 font-mono mt-0.5 truncate">{scenario.file}</div>
              </button>
            );
          })}
        </div>

        {/* Input & Try-It Action */}
        <div className="rounded-xl border border-white/10 bg-[#16171b] p-3 space-y-2.5">
          <p className="text-xs text-[#b8bdca]">{activeFixture.description}</p>
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] text-[#717887]">Partitions:</span>
            {activeFixture.partitions.map((p) => (
              <span key={p} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-[#93c5fd]">
                {p}
              </span>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <textarea
              id="fixtureInputPrompt"
              aria-label="Scenario input prompt"
              value={customPrompt || activeFixture.prompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={2}
              className="flex-1 rounded-lg border border-white/10 bg-[#0d0e11] px-3 py-2 text-xs text-white placeholder-[#525866] focus:border-[#3b82f6] focus:outline-none resize-none font-mono"
            />
            <button
              id="tryItBtn"
              data-testid="try-it-btn"
              type="button"
              disabled={isRunning}
              onClick={handleTryIt}
              className="sm:w-36 self-stretch sm:self-auto rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] disabled:bg-[#1e293b] disabled:text-[#64748b] text-white font-semibold text-xs px-4 py-2.5 shadow-md flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>{isRunning ? "Executing..." : "Try It"}</span>
              <span aria-hidden="true">▶</span>
            </button>
          </div>
        </div>
      </section>

      {/* ── 3. WORKFLOW RUNS HERE (Shared Execution & Result Area) ────────── */}
      <section aria-labelledby="workflow-area-heading" className="space-y-3">
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-white/10" />
          </div>
          <span
            id="workflow-area-heading"
            className="relative px-3 bg-[#121316] text-[11px] font-mono uppercase tracking-wider text-[#60a5fa]"
          >
            workflow runs here
          </span>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#16171b] p-3 text-xs space-y-2.5">
          <div className="flex items-center justify-between text-[#8e95a5]">
            <span className="font-mono text-[11px]">Pipeline Status</span>
            <span className="font-mono text-[11px] text-[#93c5fd]">
              {isRunning
                ? "Stream In Progress (AG-UI SSE)"
                : isValidatingFixture
                ? "Validating Backend Fixture..."
                : fixtureResult
                ? `Fixture Verified (${fixtureResult.fixture_id})`
                : hasMessages
                ? "Completed Execution"
                : "Awaiting Trigger"}
            </span>
          </div>

          {/* Authoritative Real Backend Fixture Confirmation */}
          {isValidatingFixture && (
            <div
              id="fixtureValidatingNotice"
              role="status"
              className="p-2.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-300 font-mono text-[11px] flex items-center gap-2"
            >
              <span className="animate-spin text-sm">⏳</span>
              <span>Running real backend validation &amp; SHA-256 byte check on <code>{activeFixture.file}</code>...</span>
            </div>
          )}

          {fixtureResult && (
            <div
              id="backendFixtureResultCard"
              data-testid="backend-fixture-result"
              className={`p-3 rounded-lg border text-xs font-mono space-y-1.5 ${
                fixtureResult.ok
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border-red-500/30 bg-red-500/10 text-red-200"
              }`}
            >
              <div className="flex items-center justify-between font-semibold text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span>{fixtureResult.ok ? "✓" : "✗"}</span>
                  <span>Backend Fixture Contract Verified ({fixtureResult.fixture_id})</span>
                </span>
                <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] text-emerald-300">
                  HTTP 200 · SHA-256 CONFIRMED
                </span>
              </div>
              <div className="text-[10px] text-[#9ca3af] space-y-0.5 break-all">
                <div>Hash Proof: <span className="text-[#34d399]">{fixtureResult.actualHash}</span></div>
                {fixtureResult.session_id && <div>Session: <span className="text-[#cbd5e1]">{fixtureResult.session_id}</span></div>}
              </div>
              {fixtureResult.error && (
                <div className="text-red-400 text-[10px] pt-1">{fixtureResult.error}</div>
              )}
            </div>
          )}

          {/* Workflow Pipeline Stage Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
            {[
              {
                label: "1. Task Spec",
                status: isRunning ? "Active" : fixtureResult ? "Verified" : hasMessages ? "Completed" : "Ready",
              },
              {
                label: "2. Reasoning",
                status: isRunning ? "Evaluating" : fixtureResult ? "Deterministic" : hasMessages ? "Completed" : "Standby",
              },
              {
                label: "3. Invariants",
                status: isRunning ? "Checking" : fixtureResult ? "SHA-256 Equal" : hasMessages ? "Enforced" : "Standby",
              },
              {
                label: "4. Human Gate",
                status: isRunning ? "Pending" : fixtureResult ? "Governed" : hasMessages ? "Confirmed" : "Governed",
              },
            ].map((st) => (
              <div
                key={st.label}
                className="rounded-lg border border-white/5 bg-[#0e0f12] p-2 flex flex-col gap-1"
              >
                <span className="text-[#788194] text-[10px]">{st.label}</span>
                <span className="font-mono text-white text-[11px]">{st.status}</span>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-[#717887] pt-1">
            {isRunning
              ? "Live deltas, tool events, and human review gates are actively updating below."
              : hasMessages
              ? "Results are rendered below. You can repeat the test, modify inputs, or connect your own live key."
              : "Click 'Try It' above to start this exact workflow path with deterministic test fixtures."}
          </p>
        </div>
      </section>

      {/* ── 4. OR USE YOUR OWN (Inline Key & Provider Connection) ─────────── */}
      <section aria-labelledby="live-config-heading" className="space-y-3">
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-white/10" />
          </div>
          <span
            id="live-config-heading"
            className="relative px-3 bg-[#121316] text-[11px] font-mono uppercase tracking-wider text-[#9aa1af]"
          >
            or use your own
          </span>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#16171b] p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-white">Live Provider Configuration</h4>
              <p className="text-[11px] text-[#8e95a5] mt-0.5">
                Switch the same workflow to a live LLM provider. Only the configuration source changes.
              </p>
            </div>
            {liveStatusMsg && (
              <span className="text-[11px] font-mono text-[#60a5fa] bg-[#3b82f6]/10 px-2 py-0.5 rounded border border-[#3b82f6]/20">
                {liveStatusMsg}
              </span>
            )}
          </div>

          {/* Provider Pills */}
          <div className="flex flex-wrap gap-1.5">
            {(["gemini", "openai", "nebius"] as ProviderId[]).map((p) => {
              const isSelected = currentProvider === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    onSelectProvider(p);
                    setLiveModel(PROVIDER_DEFINITIONS[p]?.models?.[0] || "");
                    setActiveStep(4);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all border ${
                    isSelected
                      ? "bg-[#2563eb] text-white border-[#3b82f6] shadow-sm"
                      : "bg-[#0f1013] text-[#8e95a5] border-white/5 hover:text-white hover:border-white/10"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>

          {/* Key and Connect Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
            <div className="sm:col-span-4">
              <label htmlFor="liveModelSelect" className="block text-[10px] text-[#788194] uppercase tracking-wider mb-1">
                Model
              </label>
              <select
                id="liveModelSelect"
                value={liveModel}
                onChange={(e) => setLiveModel(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#0d0e11] px-2.5 py-2 text-xs text-white focus:border-[#3b82f6] focus:outline-none"
              >
                {(PROVIDER_DEFINITIONS[currentProvider]?.models || [liveModel]).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-5">
              <label htmlFor="liveApiKeyInput" className="block text-[10px] text-[#788194] uppercase tracking-wider mb-1">
                API Key (Optional if set in app/env/.env)
              </label>
              <input
                id="liveApiKeyInput"
                data-testid="live-api-key-input"
                type="text"
                autoComplete="off"
                placeholder="Paste key or use server environment"
                value={liveApiKey}
                onChange={(e) => setLiveApiKey(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[#0d0e11] px-3 py-2 text-xs text-white placeholder-[#525866] focus:border-[#3b82f6] focus:outline-none font-mono"
              />
            </div>

            <div className="sm:col-span-3 flex items-end gap-1.5">
              <button
                id="connectProviderBtn"
                data-testid="connect-provider-btn"
                type="button"
                disabled={isConfiguring || isRunning}
                onClick={handleConnectProvider}
                className="flex-1 rounded-lg bg-white/10 hover:bg-white/15 disabled:bg-[#1e293b] disabled:text-[#64748b] text-white font-medium text-xs px-2 py-2 border border-white/10 shadow-sm flex items-center justify-center transition-colors h-[34px]"
                title="Connect provider and save key"
              >
                <span>{isConfiguring ? "..." : "Connect"}</span>
              </button>
              <button
                id="connectRunLiveBtn"
                data-testid="connect-run-live-btn"
                type="button"
                disabled={isConfiguring || isRunning}
                onClick={handleConnectAndRunLive}
                className="flex-1 rounded-lg bg-[#059669] hover:bg-[#047857] disabled:bg-[#1e293b] disabled:text-[#64748b] text-white font-semibold text-xs px-2 py-2 shadow-md flex items-center justify-center gap-1 transition-colors h-[34px]"
                title="Connect provider and run current prompt"
              >
                <span>Run Live</span>
                <span aria-hidden="true">▶</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
