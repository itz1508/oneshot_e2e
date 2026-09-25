import React, { useState, useRef, useEffect, useMemo, useCallback, ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { HeaderBar } from "./HeaderBar";
import { EarlierConversation } from "./EarlierConversation";
import { MessageBubble } from "./MessageBubble";
import { EphemeralActivity } from "./EphemeralActivity";
import { Composer } from "./Composer";
import { ContextReviewDrawer } from "./ContextReviewDrawer";
import { ProviderConfigModal } from "./ProviderConfigModal";
import { ResearcherDrawer } from "./ResearcherDrawer";
import { ResearchBanner } from "./ResearchBanner";
import { PlanReviewCard } from "./PlanReviewCard";
import { Integration } from "./Integration";
import { EarlierContextItem, ProviderId } from "../types";
import { PROVIDER_DEFINITIONS } from "../lib/providers";
import { useChatSession } from "../lib/useChatSession";
import { readJsonResponse } from "../lib/api";

// Error boundary component for graceful error handling
class ErrorBoundary extends React.Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Component error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex items-center justify-center h-screen bg-[#0d0d0e] text-center"
          role="alert"
          aria-live="assertive"
        >
          <div className="max-w-md p-6 rounded-lg border border-red-500/30 bg-red-500/10">
            <h1 className="text-lg font-semibold text-red-300 mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-red-200/80 mb-4">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              aria-label="Reload application"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const AppContent: React.FC = () => {
  const session = useChatSession();
  const {
    sessions, activeSessionId, activeRunId, runStatus, isRunning,
    activitySteps, toolEvents, taskEvents, activityStartTime, providerConfigs,
    planData, isGate1Confirmed, isConfirmingGate, systemStatusText,
    handleSelectSession, handleNewSession, handleClearHistory, handleRefreshSystemStatus,
    handleSyncPlan, handleConfirmGate1, handleAbort, handleSendMessage, handleConfigSaved,
    startupError, isStarting,
  } = session;

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"context" | "task" | "backends" | "architecture">("context");
  const [selectedContext, setSelectedContext] = useState<EarlierContextItem | null>(null);
  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);
  const [modalProviderId, setModalProviderId] = useState<ProviderId>("gemini");
  const [isIntegrationOpen, setIsIntegrationOpen] = useState(false);
  const [isResearcherDrawerOpen, setIsResearcherDrawerOpen] = useState(false);
  const [composerExternalText, setComposerExternalText] = useState<string | undefined>(undefined);
  const [apiError, setApiError] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || sessions[0],
    [sessions, activeSessionId]
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)')
    const handleChange = () => {
      if (mediaQuery.matches) setIsMobileSidebarOpen(false)
    }
    handleChange()
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, []);

  useEffect(() => {
    if (!chatScrollRef.current) return;
    const currentCount = activeSession?.messages.length ?? 0;
    if (currentCount > prevMessageCountRef.current || isRunning) {
      const timer = setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      }, 0);
      prevMessageCountRef.current = currentCount;
      return () => clearTimeout(timer);
    }
  }, [activeSession?.messages.length, isRunning]);

  const handleSelectContext = useCallback(
    async (item: EarlierContextItem) => {
      try {
        setApiError(null);
        const res = await fetch("/api/session/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restoreId: item.restoreId || item.id }),
        });
        const data = await readJsonResponse<{ restored?: boolean; restoreId?: string }>(res, "Context restore request");
        if (data.restored !== true || data.restoreId !== (item.restoreId || item.id)) {
          throw new Error("Context restore response did not confirm the requested checkpoint");
        }
      } catch (err) {
        setApiError(`Failed to restore context: ${err instanceof Error ? err.message : "Unknown error"}`);
        return;
      }
      if (isDrawerOpen && drawerTab === "context" && selectedContext?.id === item.id) {
        setIsDrawerOpen(false);
        setSelectedContext(null);
      } else {
        setSelectedContext(item);
        setDrawerTab("context");
        setIsDrawerOpen(true);
      }
    },
    [isDrawerOpen, drawerTab, selectedContext?.id]
  );

  const handleToggleDrawer = useCallback(
    (targetTab?: "context" | "task" | "backends" | "architecture") => {
      if (isDrawerOpen && (!targetTab || targetTab === drawerTab)) {
        setIsDrawerOpen(false);
      } else {
        if (targetTab) setDrawerTab(targetTab);
        else if (!selectedContext && activeSession?.earlierContext?.length) {
          setSelectedContext(activeSession.earlierContext[0]);
          setDrawerTab("context");
        }
        setIsDrawerOpen(true);
      }
    },
    [isDrawerOpen, drawerTab, selectedContext, activeSession?.earlierContext]
  );

  const handleClearHistoryWithConfirmation = useCallback(() => {
    if (!window.confirm("Clear the current chat history? This action cannot be undone.")) return;
    void handleClearHistory();
  }, [handleClearHistory]);

  const onSend = useCallback(
    (text: string) => {
      setDrawerTab("task");
      setIsDrawerOpen(true);
      handleSendMessage(text, modalProviderId);
    },
    [handleSendMessage, modalProviderId]
  );

  const memoizedMessages = useMemo(
    () =>
      activeSession?.messages.map((msg, idx) => (
        <MessageBubble key={msg.id} message={msg} isLatest={idx === (activeSession?.messages.length ?? 0) - 1} />
      )) ?? [],
    [activeSession?.messages]
  );

  const dismissError = useCallback(() => setApiError(null), []);

  return (
    <ErrorBoundary>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[400] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:text-black"
      >
        Skip to conversation
      </a>
      <div
        className={`app-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}
        role="application"
        aria-label="OneShot Agent Chat"
      >
        <h1 className="sr-only">OneShot Agent Chat</h1>
        {!isSidebarCollapsed && (
          <>
            {isMobileSidebarOpen && (
              <button
                type="button"
                className="fixed inset-0 z-[35] bg-black/55 md:hidden"
                aria-label="Close navigation"
                onClick={() => setIsMobileSidebarOpen(false)}
              />
            )}
            <nav
              className={`app-sidebar-nav ${isMobileSidebarOpen ? 'mobile-open' : ''}`}
              aria-label="Session Navigation"
            >
            <Sidebar
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelectSession={handleSelectSession}
              onNewSession={handleNewSession}
              onClearHistory={handleClearHistoryWithConfirmation}
              onOpenProviderModal={(p) => {
                setModalProviderId(p);
                setIsProviderModalOpen(true);
              }}
              providerConfigs={providerConfigs}
              onCollapse={() => {
                setIsSidebarCollapsed(true)
                setIsMobileSidebarOpen(false)
              }}
            />
          </nav>
           </>
        )}

        <div className="app-content relative flex min-h-0 flex-1 flex-col bg-[#0d0d0e] overflow-hidden">
          <header className="flex-shrink-0 z-30">
            <HeaderBar
              isSidebarCollapsed={isSidebarCollapsed}
              onExpandSidebar={() => {
                setIsSidebarCollapsed(false)
                setIsMobileSidebarOpen(true)
              }}
              onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
              isDrawerOpen={isDrawerOpen}
              onToggleDrawer={() => handleToggleDrawer()}
              activeModelName={
                PROVIDER_DEFINITIONS[modalProviderId]?.models[0] || "OneShot"
              }
              onNewSession={handleNewSession}
              onClearHistory={handleClearHistoryWithConfirmation}
              onOpenIntegration={() => setIsIntegrationOpen(true)}
              onOpenArchitecture={() => handleToggleDrawer("architecture")}
            />
          </header>

          <main
            ref={chatScrollRef}
            className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-4"
            role="main"
            aria-label="Chat Messages and Activity"
            id="main-content"
            tabIndex={-1}
          >
            <div className="w-full max-w-[780px] mx-auto space-y-4">
              {isStarting && (
                <section
                  id="workspace-loading-state"
                  data-testid="workspace-loading-state"
                  className="rounded-xl border border-[#79a8ea]/30 bg-[#141b24] p-4 text-[#c7d9ee] shadow-[0_0_0_1px_rgba(121,168,234,0.04)]"
                  role="status"
                  aria-live="polite"
                  aria-busy="true"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="activity-pulse shrink-0" aria-hidden="true" />
                    <div>
                      <h2 className="text-sm font-semibold">Loading workspace state</h2>
                      <p className="mt-1 text-xs text-[#91a9c4]">
                        Waiting for the real checkpoint and system-status responses.
                      </p>
                    </div>
                  </div>
                </section>
              )}
              {startupError && (
                <div className="rounded-xl border border-[#e5a84b]/30 bg-[#e5a84b]/10 p-3 text-xs text-[#e5a84b]" role="alert">
                  <div>{startupError}</div>
                  <button type="button" onClick={() => window.location.reload()} className="mt-2 underline hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20">
                    Retry connection
                  </button>
                </div>
              )}
              <ResearchBanner
                systemStatusText={systemStatusText}
                onRefreshStatus={handleRefreshSystemStatus}
                onOpenResearcher={() => setIsResearcherDrawerOpen(true)}
              />
              <EarlierConversation
                items={activeSession?.earlierContext || []}
                onSelectContext={handleSelectContext}
                selectedContextId={
                  isDrawerOpen && drawerTab === "context" ? selectedContext?.id : null
                }
              />
              {planData && (
                <PlanReviewCard
                  planData={planData}
                  isGate1Confirmed={isGate1Confirmed}
                  isConfirmingGate={isConfirmingGate}
                  onSyncPlan={handleSyncPlan}
                  onConfirmGate1={handleConfirmGate1}
                />
              )}
              {apiError && (
                <div
                  className="p-4 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm flex items-center justify-between"
                  role="alert"
                  aria-live="assertive"
                  aria-atomic="true"
                >
                  <span>{apiError}</span>
                  <button
                    onClick={dismissError}
                    className="ml-2 text-red-400 hover:text-red-200 underline text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded px-2 py-1"
                    aria-label="Dismiss error message"
                  >
                    Dismiss
                  </button>
                </div>
              )}
              <section
                aria-label="Conversation History"
                className="space-y-4 pt-2"
              >
                {memoizedMessages}
                {!isStarting && !isRunning && (activeSession?.messages.length ?? 0) === 0 && (
                  <div className="rounded-xl border border-white/10 bg-[#141416] px-5 py-8 text-center" role="status">
                    <h2 className="text-sm font-semibold text-[#ececec]">Start a real OneShot run</h2>
                    <p className="mt-1 text-xs text-[#8e8e93]">Enter a request in the composer. Responses, tools, and task state appear only after the backend emits them.</p>
                  </div>
                )}
                {isRunning && (
                  <EphemeralActivity
                    steps={activitySteps}
                    toolEvents={toolEvents}
                    startTime={activityStartTime}
                  />
                )}
              </section>
            </div>
          </main>

          <Composer
            isSidebarCollapsed={isSidebarCollapsed}
            isRunning={isRunning}
            onSend={onSend}
            onAbort={handleAbort}
            externalText={composerExternalText}
          />

          <ContextReviewDrawer
            isOpen={isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
            activeTab={drawerTab}
            item={selectedContext}
            taskEvents={taskEvents}
            runStatus={runStatus}
            runId={activeRunId}
            activitySteps={activitySteps}
          />

          <ResearcherDrawer
            isOpen={isResearcherDrawerOpen}
            onClose={() => setIsResearcherDrawerOpen(false)}
            onInsertCitation={(citation) => {
              setComposerExternalText((prev) =>
                prev ? `${prev}\n${citation}` : citation
              );
              setIsResearcherDrawerOpen(false);
            }}
          />

          <ProviderConfigModal
            isOpen={isProviderModalOpen}
            onClose={() => setIsProviderModalOpen(false)}
            currentProvider={modalProviderId}
            providerConfigs={providerConfigs}
            onConfigSaved={handleConfigSaved}
          />
        </div>
      </div>

      {/* Integration drawer — modular auth + model provider cards */}
      <Integration
        isOpen={isIntegrationOpen}
        onClose={() => setIsIntegrationOpen(false)}
        sessionId={activeSessionId}
        currentProvider={modalProviderId}
        onProviderSwitch={(provider, model) => {
          setModalProviderId(provider);
          handleConfigSaved(provider, {
            key: "configured",
            model,
            baseUrl: "",
            temperature: "0.4",
            configured: true,
          });
        }}
      />
    </ErrorBoundary>
  );
};

export const App: React.FC = () => (
  <ErrorBoundary>
    <AppContent />
  </ErrorBoundary>
);
