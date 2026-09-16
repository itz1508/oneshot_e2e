"use client";
import { useState } from "react";
import {
    ChevronRight,
    Search,
    CheckCircle2,
    Clock,
    AlertCircle,
    XCircle,
    FileText,
    ExternalLink,
    Send,
    RotateCcw,
    Sparkles,
} from "lucide-react";
import type { ResearchDrawerProjection } from "../lib/contracts";

interface ResearchDrawerProps {
    drawer: ResearchDrawerProjection | null;
    open: boolean;
    onClose: () => void;
    onAgree: () => Promise<void>;
    onRequestCorrection: (feedback: string) => Promise<void>;
    busy?: boolean;
}

function statusBadge(status: ResearchDrawerProjection["status"]) {
    switch (status) {
        case "Ready":
            return {
                label: "Ready",
                color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                icon: CheckCircle2,
            };
        case "Needs Review":
            return {
                label: "Needs Review",
                color: "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse",
                icon: AlertCircle,
            };
        case "Researching":
        case "Drafting":
        case "Validating":
            return {
                label: status,
                color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
                icon: Clock,
            };
        case "Reconciling":
            return {
                label: "Reconciling",
                color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
                icon: RotateCcw,
            };
        default:
            return {
                label: "Off",
                color: "bg-neutral-800 text-neutral-400 border-neutral-700",
                icon: Clock,
            };
    }
}

export function ResearchDrawer({
    drawer,
    open,
    onClose,
    onAgree,
    onRequestCorrection,
    busy = false,
}: ResearchDrawerProps) {
    const [feedback, setFeedback] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [actionError, setActionError] = useState("");

    if (!open || !drawer) return null;

    const badge = statusBadge(drawer.status);
    const IconComponent = badge.icon;
    const canAgree = drawer.review.allowed_actions.includes("agree");
    const canCorrect = drawer.review.allowed_actions.includes("request_correction");

    const handleAgree = async () => {
        setActionError("");
        setSubmitting(true);
        try {
            await onAgree();
        } catch (e: any) {
            setActionError(e.message || "Failed to approve research review");
        } finally {
            setSubmitting(false);
        }
    };

    const handleCorrection = async () => {
        if (!feedback.trim()) return;
        setActionError("");
        setSubmitting(true);
        try {
            await onRequestCorrection(feedback.trim());
            setFeedback("");
        } catch (e: any) {
            setActionError(e.message || "Failed to submit correction");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <aside
            className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-[var(--line-subtle)] bg-[var(--bg-surface)] shadow-2xl transition-all duration-300 sm:w-[440px]"
            id="research-drawer"
            role="dialog"
            aria-label="Research Drawer"
            aria-modal="true"
        >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--line-subtle)] px-4 py-3">
                <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-[var(--accent-cyan)]" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                        Research Drawer
                    </span>
                    <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.color}`}
                    >
                        <IconComponent className="h-3 w-3" />
                        {badge.label}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-[var(--text-muted)]">
                        Rev {drawer.research_revision}
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
                        aria-label="Close research drawer"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {actionError && (
                <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 text-[11px] text-red-400">
                    {actionError}
                </div>
            )}

            {/* Content Body */}
            <div className="flex-1 space-y-4 overflow-y-auto p-4 text-[12px]">
                {/* Current Understanding / Goal */}
                <div className="rounded-lg border border-[var(--line-subtle)] bg-[var(--bg-subtle)] p-3">
                    <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                        Objective
                    </div>
                    <div className="font-medium text-[var(--text-primary)]">
                        {drawer.summary.goal || drawer.summary.current_understanding || "Analyzing prompt..."}
                    </div>
                </div>

                {/* Key Requirements */}
                {drawer.summary.key_requirements.length > 0 && (
                    <div className="space-y-2">
                        <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                            Requirements ({drawer.summary.key_requirements.length})
                        </div>
                        <ul className="space-y-1.5 pl-1">
                            {drawer.summary.key_requirements.map((req, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-[var(--text-secondary)]">
                                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--accent-cyan)] shrink-0" />
                                    <span>{req}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Facts & Grounding Evidence */}
                {drawer.research.facts.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                            <span>Evidence & Facts</span>
                            <span className="font-mono text-[10px]">{drawer.research.facts.length} captured</span>
                        </div>
                        <div className="space-y-1.5">
                            {drawer.research.facts.slice(0, 5).map((f) => (
                                <div
                                    key={f.id}
                                    className="rounded border border-[var(--line-subtle)] bg-[var(--bg-surface-alt)] p-2"
                                >
                                    <p className="text-[var(--text-secondary)] leading-snug">{f.statement}</p>
                                    <div className="mt-1 flex items-center gap-1 font-mono text-[10px] text-[var(--text-dim)]">
                                        <FileText className="h-3 w-3" />
                                        <span>{f.provenance}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Build Readiness & Gate Checklist */}
                <div className="rounded-lg border border-[var(--line-subtle)] bg-[var(--bg-surface-alt)] p-3">
                    <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                        Build Gate Readiness
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                            <span className="text-[var(--text-muted)]">Validation: </span>
                            <span
                                className={`font-medium ${
                                    drawer.build_readiness.validation_status === "PASSED"
                                        ? "text-emerald-400"
                                        : "text-amber-400"
                                }`}
                            >
                                {drawer.build_readiness.validation_status}
                            </span>
                        </div>
                        <div>
                            <span className="text-[var(--text-muted)]">Lock: </span>
                            <span className="font-mono text-[var(--text-secondary)]">
                                {drawer.build_readiness.lock_status}
                            </span>
                        </div>
                    </div>

                    {drawer.build_readiness.open_blockers.length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-[var(--line-subtle)] pt-2 text-[11px] text-amber-400">
                            {drawer.build_readiness.open_blockers.map((b, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                    <AlertCircle className="h-3 w-3 shrink-0" />
                                    <span>{b}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Active Correction Cycle Status */}
                {drawer.review.active_correction && (
                    <div className="rounded-lg border border-purple-500/20 bg-purple-500/10 p-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-purple-400">
                            <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                            <span>Correction Cycle Active</span>
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                            "{drawer.review.active_correction.feedback}"
                        </p>
                    </div>
                )}
            </div>

            {/* Actions & Feedback Footer */}
            <div className="border-t border-[var(--line-subtle)] bg-[var(--bg-surface-alt)] p-4">
                {drawer.status === "Needs Review" && (
                    <div className="space-y-3">
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={handleAgree}
                                disabled={submitting || busy || !canAgree}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white shadow hover:bg-emerald-500 disabled:opacity-50"
                            >
                                <CheckCircle2 className="h-4 w-4" />
                                <span>Agree & Proceed</span>
                            </button>
                        </div>

                        {canCorrect && (
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="correction-input"
                                    className="text-[11px] text-[var(--text-muted)]"
                                >
                                    Or request revision-bound corrections:
                                </label>
                                <div className="flex gap-1.5">
                                    <input
                                        id="correction-input"
                                        type="text"
                                        value={feedback}
                                        onChange={(e) => setFeedback(e.target.value)}
                                        placeholder="Specific correction feedback..."
                                        disabled={submitting || busy}
                                        className="flex-1 rounded border border-[var(--line-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-dim)] focus:border-[var(--accent-cyan)] focus:outline-none"
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                void handleCorrection();
                                            }
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleCorrection}
                                        disabled={submitting || busy || !feedback.trim()}
                                        className="rounded border border-[var(--line-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-50"
                                    >
                                        <Send className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {drawer.status === "Ready" && (
                    <div className="flex items-center gap-2 rounded bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>Research approved · Ready for Planner</span>
                    </div>
                )}

                {drawer.status !== "Needs Review" && drawer.status !== "Ready" && (
                    <p className="text-center text-[11px] text-[var(--text-muted)]">
                        Projection updates in real time as Main Agent collects intent and conducts research.
                    </p>
                )}
            </div>
        </aside>
    );
}
