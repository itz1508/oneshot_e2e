import React, { useState } from "react";
import { readJsonResponse, resolveApiUrl } from "../lib/api";
import type { ResearchRun, ResearchRunStatus, ReadinessReport } from "../types";
import { ReadinessCard } from "./ReadinessCard";
import { DrawerShell, AlertBanner, StatusBadge } from "./common/index";

interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

interface ResearcherDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertCitation?: (text: string) => void;
}

const STATUS_LABELS: Record<ResearchRunStatus, string> = {
  pending: "Pending",
  running: "Running",
  review_needed: "Gate 1 Review",
  ready: "Ready for Planning",
  cancelled: "Cancelled",
};

const STATUS_TONES: Record<ResearchRunStatus, string> = {
  pending: "bg-blue-500/10 text-[#79a8ea] border-blue-500/20",
  running: "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20",
  review_needed: "bg-[#e5a84b]/15 text-[#e5a84b] border-[#e5a84b]/30 animate-pulse",
  ready: "bg-[#62c48d]/10 text-[#62c48d] border-[#62c48d]/20",
  cancelled: "bg-white/5 text-[#8e8e93] border-white/10",
};

const formatClockTime = (isoString: string): string => {
  try {
    return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return isoString;
  }
};

export const ResearcherDrawer: React.FC<ResearcherDrawerProps> = ({
  isOpen,
  onClose,
  onInsertCitation,
}) => {
  const [activeTab, setActiveTab] = useState<"search" | "controller">("search");

  // Search tab state
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Governed Controller tab state
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [intentInput, setIntentInput] = useState("");
  const [isLaunchingRun, setIsLaunchingRun] = useState(false);
  const [updatingRunId, setUpdatingRunId] = useState<string | null>(null);
  const [directiveText, setDirectiveText] = useState("");
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const [checkedNotice, setCheckedNotice] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  // --- Search Tab Logic ---
  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setSearchError(null);

    try {
      const res = await fetch(resolveApiUrl("/api/research/query"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await readJsonResponse<{ query: string; results: SearchResult[] }>(res, "Research search request");
      if (
        data.query !== query.trim() ||
        !Array.isArray(data.results) ||
        data.results.some((result) => !result.title || !result.url || !result.content)
      ) {
        throw new Error("Research search response failed its result contract");
      }
      setResults(data.results);
    } catch (error) {
      setResults([]);
      setSearchError(
        error instanceof Error
          ? error.message
          : "Research search is currently unavailable. Check the server connection and try again."
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  // --- Governed Controller Logic ---
  const showNotice = (msg: string) => {
    setFeedbackNotice(msg);
    setTimeout(() => setFeedbackNotice(null), 3500);
  };

  const handleStartRun = async (intentToRun?: string) => {
    const rawIntent = (intentToRun ?? intentInput).trim();
    if (!rawIntent) return;

    setIsLaunchingRun(true);
    const tempId = `res-${Date.now().toString(36)}`;
    const now = new Date().toISOString();

    const placeholderRun: ResearchRun = {
      id: tempId,
      title: rawIntent,
      status: "running",
      tasks: [
        { id: "step-reconcile", title: "Reconcile workspace and architectural baselines", status: "in_progress", dependencies: [] },
        { id: "step-evidence", title: "Gather authoritative external & codebase evidence", status: "pending", dependencies: ["step-reconcile"] },
        { id: "step-draft", title: "Synthesize draft bundle & gap analysis", status: "pending", dependencies: ["step-evidence"] },
        { id: "step-baseline", title: "Validate invariants & baseline receipts", status: "pending", dependencies: ["step-draft"] },
        { id: "step-review", title: "Assemble bundle for Gate 1 human review", status: "pending", dependencies: ["step-baseline"] },
      ],
      createdAt: now,
      checkedAt: now,
    };

    setRuns((prev) => [placeholderRun, ...prev]);
    setExpandedRunId(tempId);
    setIntentInput("");
    showNotice(`Research run ${tempId} initiated — executing against backend pipeline.`);

    try {
      const res = await fetch(resolveApiUrl("/api/research/run"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: rawIntent,
          search: { enabled: true, source: "tavily" },
        }),
      });

      const data = await readJsonResponse<{
        runId: string;
        phase: string;
        stopped: boolean;
        handoffReady: boolean;
        phases?: string[];
        bundle?: {
          runId: string;
          intent: string;
          sources?: SearchResult[];
          gaps?: string[];
          alternatives?: Array<{ option: string; basis: string }>;
          decisionOwner?: string;
          createdAt?: string;
        };
        issues?: string[];
      }>(res, "Governed research run");

      const sourcesCount = data.bundle?.sources?.length ?? 0;
      const gapsCount = data.bundle?.gaps?.length ?? 0;
      const issues = data.issues ?? [];
      const passed: string[] = [];
      const failed: string[] = [];
      const recommendations: string[] = [];

      if (data.bundle?.decisionOwner === "Design_Planning") {
        passed.push("Decision ownership preserved for Design_Planning stage");
      } else {
        failed.push("Decision owner invalid or bypassed");
      }

      if (data.handoffReady) {
        passed.push("Handoff readiness confirmed (phase reached READY_FOR_PLANNING)");
      } else {
        failed.push("Research stopped before achieving handoff readiness");
      }

      if (sourcesCount > 0) {
        passed.push(`Authoritative sources compiled (${sourcesCount} source${sourcesCount > 1 ? "s" : ""})`);
      } else {
        failed.push("No external sources retrieved (search disabled or unconfigured)");
      }

      if (gapsCount > 0) {
        passed.push(`Baseline gap analysis extracted (${gapsCount} gap${gapsCount > 1 ? "s" : ""})`);
      }

      issues.forEach((issue) => {
        if (!failed.includes(issue)) {
          failed.push(issue);
        }
      });

      if (data.bundle?.alternatives && data.bundle.alternatives.length > 0) {
        data.bundle.alternatives.forEach((alt) => {
          recommendations.push(`Evaluate alternative: ${alt.option} (${alt.basis})`);
        });
      } else {
        recommendations.push("Confirm Gate 1 approval to unlock Design Planning pipeline handoff");
      }

      const readiness: ReadinessReport = {
        score: passed.length,
        total: passed.length + failed.length,
        passed,
        failed,
        recommendations,
      };

      const resolvedId = data.runId || tempId;
      setRuns((prev) =>
        prev.map((r) =>
          r.id === tempId
            ? {
                ...r,
                id: resolvedId,
                status: "review_needed",
                readiness,
                tasks: r.tasks.map((t) => ({ ...t, status: "completed" as const })),
                checkedAt: new Date().toISOString(),
                finishedAt: new Date().toISOString(),
              }
            : r
        )
      );
      setExpandedRunId(resolvedId);
      showNotice(`Run ${resolvedId} reached Gate 1 review. Human confirmation required.`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setRuns((prev) =>
        prev.map((r) =>
          r.id === tempId
            ? {
                ...r,
                status: "cancelled",
                tasks: r.tasks.map((t) => ({
                  ...t,
                  status: t.status === "in_progress" ? ("pending" as const) : t.status,
                })),
                readiness: {
                  score: 0,
                  total: 2,
                  passed: [],
                  failed: [errorMsg],
                  recommendations: ["Ensure backend server is running and retry research execution."],
                },
                checkedAt: new Date().toISOString(),
                finishedAt: new Date().toISOString(),
              }
            : r
        )
      );
      showNotice(`Run ${tempId} failed: ${errorMsg}`);
    } finally {
      setIsLaunchingRun(false);
    }
  };

  const handleCheckRun = (run: ResearchRun) => {
    const updatedTime = new Date().toISOString();
    setRuns((prev) =>
      prev.map((r) => (r.id === run.id ? { ...r, checkedAt: updatedTime } : r))
    );
    const notice = `Status verified as of ${formatClockTime(updatedTime)}.`;
    setCheckedNotice(notice);
    setTimeout(() => setCheckedNotice(null), 3000);
  };

  const handleToggleUpdate = (runId: string) => {
    setUpdatingRunId((current) => (current === runId ? null : runId));
    setDirectiveText("");
  };

  const handleSubmitDirective = (runId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!directiveText.trim()) return;

    setRuns((prev) =>
      prev.map((r) =>
        r.id === runId
          ? {
              ...r,
              directive: directiveText.trim(),
              checkedAt: new Date().toISOString(),
            }
          : r
      )
    );
    showNotice(`Directive applied to ${runId} without pipeline disruption.`);
    setDirectiveText("");
    setUpdatingRunId(null);
  };

  const handleCancelRun = (runId: string) => {
    setRuns((prev) =>
      prev.map((r) =>
        r.id === runId
          ? {
              ...r,
              status: "cancelled",
              finishedAt: new Date().toISOString(),
            }
          : r
      )
    );
    showNotice(`Run ${runId} cancelled — stopped cleanly before planning handoff.`);
    setUpdatingRunId(null);
  };

  const handleAcceptRun = (runId: string) => {
    setRuns((prev) =>
      prev.map((r) =>
        r.id === runId
          ? {
              ...r,
              status: "ready",
              checkedAt: new Date().toISOString(),
            }
          : r
      )
    );
    showNotice(`Gate 1 Accepted: ${runId} bundle approved for Design Planning.`);
  };

  const handleRejectRun = (runId: string) => {
    setRuns((prev) =>
      prev.map((r) =>
        r.id === runId
          ? {
              ...r,
              status: "cancelled",
              finishedAt: new Date().toISOString(),
            }
          : r
      )
    );
    showNotice(`Gate 1 Rejected: ${runId} halted. Nothing handed off.`);
  };

  return (
    <DrawerShell
      id="researcherDrawer"
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Standalone researcher drawer"
      headerContent={
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#62c48d]">🔍</span>
          <span className="font-semibold text-xs text-[#ececec]">Researcher Console</span>
        </div>
      }
      closeButton={
        <button
          id="closeResearcherDrawerBtn"
          type="button"
          onClick={onClose}
          aria-label="Close researcher drawer"
          className="w-7 h-7 rounded-lg bg-transparent hover:bg-white/10 text-[#8e8e93] hover:text-white grid place-items-center text-sm transition-colors cursor-pointer"
        >
          ×
        </button>
      }
      subHeader={
        <div className="px-4 py-2 border-b border-white/10 bg-[#16181d] flex items-center gap-2">
          <button
            id="researcherTabSearchBtn"
            type="button"
            onClick={() => setActiveTab("search")}
            aria-selected={activeTab === "search"}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "search"
                ? "bg-[#3f6ba8] text-white"
                : "text-[#8e8e93] hover:text-[#ececec] hover:bg-white/5"
            }`}
          >
            Live Search
          </button>
          <button
            id="researcherTabControllerBtn"
            type="button"
            onClick={() => setActiveTab("controller")}
            aria-selected={activeTab === "controller"}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "controller"
                ? "bg-[#3f6ba8] text-white"
                : "text-[#8e8e93] hover:text-[#ececec] hover:bg-white/5"
            }`}
          >
            <span>Governed Runs</span>
            {runs.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-white/15 text-[10px] font-mono-code">
                {runs.length}
              </span>
            )}
          </button>
        </div>
      }
    >
      {/* --- TAB 1: Search --- */}
        {activeTab === "search" && (
          <div className="space-y-4">
            {/* Search Input Box */}
            <div className="space-y-2">
              <label htmlFor="tavilySearchInput" className="block text-[11px] font-semibold text-[#dedede]">
                Web &amp; Knowledge Search
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="tavilySearchInput"
                  type="text"
                  name="research-query"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search Tavily or OneShot codebase..."
                  className="min-w-0 flex-1 h-8 px-2.5 rounded-md border border-white/15 bg-[#181b21] text-white text-xs outline-none focus:border-[#79a8ea] focus-visible:ring-2 focus-visible:ring-[#79a8ea]/50 font-mono-code"
                />
                <button
                  id="tavilySearchBtn"
                  type="button"
                  onClick={handleSearch}
                  disabled={isSearching || !query.trim()}
                  className="h-8 px-3 rounded-md bg-[#3f6ba8] hover:bg-[#4d7fc4] disabled:opacity-40 text-white text-xs font-medium cursor-pointer transition-colors"
                >
                  {isSearching ? "Searching…" : "Search"}
                </button>
              </div>
            </div>

            {/* Results List */}
            <div className="space-y-3 pt-2 border-t border-white/10" aria-live="polite">
              {searchError && (
                <div
                  className="rounded-lg border border-[#e5a84b]/30 bg-[#e5a84b]/10 p-3 text-[11px] text-[#e5a84b]"
                  role="alert"
                >
                  {searchError}
                  <button type="button" onClick={handleSearch} className="mt-2 block underline hover:text-white cursor-pointer">
                    Retry search
                  </button>
                </div>
              )}
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#6e6e73]">
                Research Sources ({results.length})
              </div>

              {results.length === 0 && !isSearching && !searchError && (
                <div className="text-[11px] text-[#6e6e73] italic py-2">
                  Enter a research query above to perform live web sources and inspect the returned citations.
                </div>
              )}

              {results.map((r, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg border border-white/10 bg-[#16181d] space-y-2 hover:border-white/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-xs text-[#79a8ea] hover:underline"
                      >
                        {r.title}
                      </a>
                      <div className="text-[9px] text-[#6e6e73] font-mono-code truncate mt-0.5">
                        {r.url}
                      </div>
                    </div>
                    {r.score && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono-code bg-[#62c48d]/10 text-[#62c48d] border border-[#62c48d]/20 shrink-0">
                        {Math.round(r.score * 100)}%
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-[#b0b0b5] leading-relaxed m-0">
                    {r.content}
                  </p>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => onInsertCitation?.(`[Citation: ${r.title}](${r.url})`)}
                      className="insert-cite-btn px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] font-medium text-[#dedede] hover:text-white border border-white/10 transition-colors cursor-pointer"
                    >
                      Insert Citation
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- TAB 2: Governed Runs Controller --- */}
        {activeTab === "controller" && (
          <div className="space-y-4">
            {/* Run Dispatch Form */}
            <div className="p-3 rounded-lg border border-white/10 bg-[#16181d] space-y-2">
              <label htmlFor="researchIntentInput" className="block text-[11px] font-semibold text-[#dedede]">
                Start Governed Research Run
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="researchIntentInput"
                  type="text"
                  value={intentInput}
                  onChange={(e) => setIntentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleStartRun();
                    }
                  }}
                  placeholder="Intent (e.g. Refresh token rotation security invariants)..."
                  className="min-w-0 flex-1 h-8 px-2.5 rounded-md border border-white/15 bg-[#181b21] text-white text-xs outline-none focus:border-[#79a8ea] font-mono-code"
                />
                <button
                  id="startResearchRunBtn"
                  type="button"
                  onClick={() => handleStartRun()}
                  disabled={isLaunchingRun || !intentInput.trim()}
                  className="h-8 px-3 rounded-md bg-[#3f6ba8] hover:bg-[#4d7fc4] disabled:opacity-40 text-white text-xs font-medium cursor-pointer transition-colors shrink-0"
                >
                  {isLaunchingRun ? "Launching…" : "Start Run"}
                </button>
              </div>
              <p className="text-[10px] text-[#8e8e93]">
                Runs the authoritative backend skill. Stops strictly at Gate 1 (READY_FOR_PLANNING) before planning handoff.
              </p>
            </div>

            {/* Flash Feedback Notice */}
            {feedbackNotice && (
              <div
                className="p-2.5 rounded-md border border-[#79a8ea]/30 bg-[#79a8ea]/10 text-xs text-[#79a8ea]"
                role="status"
                aria-live="polite"
              >
                {feedbackNotice}
              </div>
            )}

            {/* Runs Registry */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold uppercase tracking-wider text-[#8e8e93]">
                  Research Run Registry ({runs.length})
                </span>
                {checkedNotice && (
                  <span className="text-[10px] text-[#62c48d] font-mono-code" aria-live="polite">
                    {checkedNotice}
                  </span>
                )}
              </div>

              {runs.length === 0 ? (
                <div className="p-6 rounded-lg border border-dashed border-white/10 text-center space-y-2">
                  <div className="text-2xl">🔬</div>
                  <div className="text-xs font-medium text-[#ececec]">No research runs yet</div>
                  <p className="text-[11px] text-[#6e6e73] max-w-xs mx-auto">
                    Launch a governed research run to stream pipeline execution and review findings before planning handoff.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleStartRun("OneShot architecture invariants")}
                    className="mt-2 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-xs text-white cursor-pointer transition-colors"
                  >
                    Quick Try: Architecture Invariants
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {runs.map((run) => {
                    const isExpanded = expandedRunId === run.id;
                    const isUpdating = updatingRunId === run.id;
                    const isLive = run.status === "pending" || run.status === "running";
                    const isGate1 = run.status === "review_needed";

                    return (
                      <div
                        key={run.id}
                        className="rounded-lg border border-white/10 bg-[#16181d] overflow-hidden transition-colors"
                      >
                        {/* Run Card Header */}
                        <button
                          type="button"
                          onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                          aria-expanded={isExpanded}
                          className="w-full p-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] cursor-pointer"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-mono-code border ${STATUS_TONES[run.status]}`}
                              >
                                {STATUS_LABELS[run.status]}
                              </span>
                              <span className="text-xs font-semibold text-[#ececec] truncate">
                                {run.title}
                              </span>
                            </div>
                            <div className="text-[10px] text-[#6e6e73] font-mono-code">
                              {run.id} · started {formatClockTime(run.createdAt)} · checked {formatClockTime(run.checkedAt)}
                            </div>
                          </div>
                          <span className="text-[#8e8e93] text-xs">
                            {isExpanded ? "▲" : "▼"}
                          </span>
                        </button>

                        {/* Collapsible Details */}
                        {isExpanded && (
                          <div className="p-3 border-t border-white/10 space-y-3 bg-[#141416]/50">
                            {/* Directive Display */}
                            {run.directive && (
                              <div className="p-2 rounded bg-white/5 border border-white/10 text-xs text-[#b0b0b8]">
                                <span className="font-semibold text-white">Active Directive:</span> “{run.directive}”
                              </div>
                            )}

                            {/* Task Breakdown */}
                            <div className="space-y-1.5">
                              <span className="text-[10px] font-medium uppercase tracking-wider text-[#8e8e93]">
                                Task Workflow
                              </span>
                              <div className="space-y-1">
                                {run.tasks.map((task) => (
                                  <div
                                    key={task.id}
                                    className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-white/[0.02]"
                                  >
                                    <span className="text-xs">
                                      {task.status === "completed"
                                        ? "✅"
                                        : task.status === "in_progress"
                                        ? "⏳"
                                        : "⚪"}
                                    </span>
                                    <span
                                      className={`min-w-0 flex-1 ${
                                        task.status === "completed"
                                          ? "text-[#b0b0b8] line-through opacity-70"
                                          : task.status === "in_progress"
                                          ? "text-white font-medium"
                                          : "text-[#6e6e73]"
                                      }`}
                                    >
                                      {task.title}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Human Review Gate 1 Banner */}
                            {isGate1 && (
                              <div
                                className="p-3 rounded-lg border border-[#e5a84b]/40 bg-[#e5a84b]/10 space-y-2"
                                role="region"
                                aria-label="Human Review Gate 1"
                              >
                                <div className="flex items-center gap-2 text-[#e5a84b] font-semibold text-xs">
                                  <span>🛡️</span>
                                  <span>Gate 1: Pre-Planning Handoff Confirmation</span>
                                </div>
                                <p className="text-[11px] text-[#dedede] leading-relaxed">
                                  Research pipeline completed. Inspect the readiness assessment below before proceeding.
                                  Nothing transitions to Design Planning until confirmed.
                                </p>
                                <div className="flex items-center gap-2 pt-1">
                                  <button
                                    id={`researchAcceptBtn-${run.id}`}
                                    type="button"
                                    onClick={() => handleAcceptRun(run.id)}
                                    className="px-3 py-1 rounded bg-[#62c48d] hover:bg-[#52a677] text-black text-xs font-semibold cursor-pointer transition-colors"
                                  >
                                    Accept &amp; Approve Handoff
                                  </button>
                                  <button
                                    id={`researchRejectBtn-${run.id}`}
                                    type="button"
                                    onClick={() => handleRejectRun(run.id)}
                                    className="px-3 py-1 rounded bg-transparent hover:bg-white/10 text-[#f87171] border border-[#f87171]/30 text-xs font-medium cursor-pointer transition-colors"
                                  >
                                    Reject &amp; Halt
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Readiness Assessment Card */}
                            {run.readiness && (
                              <ReadinessCard readiness={run.readiness} />
                            )}

                            {/* 4-Action Controls */}
                            <div className="pt-2 border-t border-white/5 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  id={`researchCheckBtn-${run.id}`}
                                  type="button"
                                  onClick={() => handleCheckRun(run)}
                                  className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-xs text-[#ececec] border border-white/10 cursor-pointer transition-colors"
                                >
                                  🔄 Check Status
                                </button>
                                <button
                                  id={`researchUpdateBtn-${run.id}`}
                                  type="button"
                                  onClick={() => handleToggleUpdate(run.id)}
                                  className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-xs text-[#ececec] border border-white/10 cursor-pointer transition-colors"
                                >
                                  ✏️ Mid-Run Directive
                                </button>
                                {isLive && (
                                  <button
                                    id={`researchCancelBtn-${run.id}`}
                                    type="button"
                                    onClick={() => handleCancelRun(run.id)}
                                    className="px-2.5 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-[#f87171] border border-red-500/20 text-xs cursor-pointer transition-colors"
                                  >
                                    🛑 Cancel Run
                                  </button>
                                )}
                              </div>

                              {/* Mid-run Directive Input Form */}
                              {isUpdating && (
                                <form
                                  onSubmit={(e) => handleSubmitDirective(run.id, e)}
                                  className="flex items-center gap-2 pt-1"
                                >
                                  <input
                                    type="text"
                                    value={directiveText}
                                    onChange={(e) => setDirectiveText(e.target.value)}
                                    placeholder="Steering directive (e.g. prioritize cookie tokens)..."
                                    className="min-w-0 flex-1 h-7 px-2 rounded border border-white/15 bg-[#181b21] text-xs text-white font-mono-code outline-none focus:border-[#79a8ea]"
                                  />
                                  <button
                                    type="submit"
                                    className="h-7 px-2.5 rounded bg-[#3f6ba8] hover:bg-[#4d7fc4] text-xs text-white font-medium cursor-pointer"
                                  >
                                    Apply
                                  </button>
                                </form>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
    </DrawerShell>
  );
};

