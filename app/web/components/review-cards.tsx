"use client";
import { useState } from "react";
import type {
    BuildReview,
    Bundle,
    Edits,
    Mutation,
    ResearchReview,
    Run,
} from "../lib/contracts";
import { editsFromBundle, verifiedResult } from "../lib/projections";

function escapeHtml(val: unknown): string {
    return String(val ?? "");
}

export function ResearchCard({
    bundle,
    review,
    waiting,
    busy,
    onAccept,
    onAgain,
}: {
    bundle: Bundle;
    review: ResearchReview | null;
    waiting: boolean;
    busy: boolean;
    onAccept: (edits: Edits) => void;
    onAgain: () => void;
}) {
    const [editing, setEditing] = useState(true);
    const [edits, setEdits] = useState<Edits>(
        () => review?.edits || editsFromBundle(bundle),
    );
    const [newNote, setNewNote] = useState("");

    const addNote = () => {
        const trimmed = newNote.trim();
        if (!trimmed) return;
        setEdits({ ...edits, notes: [...edits.notes, trimmed] });
        setNewNote("");
    };

    const removeNote = (index: number) => {
        setEdits({
            ...edits,
            notes: edits.notes.filter((_, i) => i !== index),
        });
    };

    const objective = edits.objective;
    const requirements = edits.requirements;
    const steps = edits.steps;

    return (
        <section
            className="card"
            id="research-summary-card"
            data-testid="research-summary-card"
        >
            <header className="card-topbar">
                <div>
                    <span className="card-tagline">Human Review · 01</span>
                    <h2 className="card-title">Research Review</h2>
                </div>
                <span
                    className={`card-status-pill ${waiting ? "awaiting" : "accepted"}`}
                >
                    {waiting ? "Awaiting acceptance" : "Research baseline"}
                </span>
            </header>

            <p className="card-lead">
                Review the research baseline for this target. You may edit the
                objective, requirements, and plan steps, request Research Again,
                or accept to proceed to planning.
            </p>

            {waiting && (
                <div className="review-form-block">
                    <div className="review-field-group">
                        <label className="field-label">
                            Objective (Editable)
                        </label>
                        <textarea
                            className="field-textarea"
                            rows={2}
                            value={objective}
                            onChange={(e) =>
                                setEdits({
                                    ...edits,
                                    objective: e.target.value,
                                })
                            }
                            placeholder="Target objective…"
                        />
                    </div>

                    <div className="review-field-group">
                        <label className="field-label">
                            Requirements ({requirements.length})
                        </label>
                        {requirements.length ? (
                            <ul className="review-list-editable">
                                {requirements.map((r, i) => (
                                    <li key={r.id || `req-${i}`}>
                                        <textarea
                                            className="field-textarea"
                                            rows={2}
                                            value={r.statement}
                                            onChange={(e) =>
                                                setEdits({
                                                    ...edits,
                                                    requirements:
                                                        edits.requirements.map(
                                                            (v, n) =>
                                                                n === i
                                                                    ? {
                                                                          ...v,
                                                                          statement:
                                                                              e
                                                                                  .target
                                                                                  .value,
                                                                      }
                                                                    : v,
                                                        ),
                                                })
                                            }
                                            placeholder={`Requirement ${i + 1}`}
                                        />
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-dim">No requirements defined.</p>
                        )}
                    </div>

                    <div className="review-field-group">
                        <label className="field-label">
                            Plan Steps ({steps.length})
                        </label>
                        {steps.length ? (
                            <ul className="review-list-editable">
                                {steps.map((s, i) => (
                                    <li key={s.id || `step-${i}`}>
                                        <textarea
                                            className="field-textarea"
                                            rows={2}
                                            value={s.description}
                                            onChange={(e) =>
                                                setEdits({
                                                    ...edits,
                                                    steps: edits.steps.map(
                                                        (v, n) =>
                                                            n === i
                                                                ? {
                                                                      ...v,
                                                                      description:
                                                                          e
                                                                              .target
                                                                              .value,
                                                                  }
                                                                : v,
                                                    ),
                                                })
                                            }
                                            placeholder={`Step ${i + 1}`}
                                        />
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-dim">
                                No plan steps generated yet.
                            </p>
                        )}
                    </div>

                    <div className="review-field-group">
                        <label className="field-label">Add Review Note</label>
                        <div className="note-input-row">
                            <input
                                type="text"
                                className="note-text-input"
                                value={newNote}
                                onChange={(e) => setNewNote(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        addNote();
                                    }
                                }}
                                placeholder="Add constraint or instruction…"
                            />
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={addNote}
                            >
                                Add Note
                            </button>
                        </div>
                        {edits.notes.length > 0 && (
                            <ul className="notes-chips-list">
                                {edits.notes.map((note, idx) => (
                                    <li key={idx}>
                                        <span>{note}</span>
                                        <button
                                            type="button"
                                            className="note-chip-remove"
                                            onClick={() => removeNote(idx)}
                                            title="Remove note"
                                        >
                                            ×
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            {!waiting && (
                <div className="review-readonly-summary">
                    <div className="review-field-group">
                        <span className="field-label">Objective</span>
                        <p className="readonly-text">
                            {edits.objective || "—"}
                        </p>
                    </div>
                    <div className="review-field-group">
                        <span className="field-label">Requirements</span>
                        <ol className="requirements-list">
                            {edits.requirements.map((r) => (
                                <li key={r.id}>{r.statement}</li>
                            ))}
                        </ol>
                    </div>
                </div>
            )}

            <details className="card-collapsible">
                <summary>Findings &amp; Success Criteria</summary>
                <div className="card-collapsible-body">
                    {bundle.researcher?.evidence?.map((e, i) => (
                        <p key={i}>
                            <strong>{e.statement}</strong>
                            <small className="block text-dim">
                                {e.source}{" "}
                                {e.provenance ? `· ${e.provenance}` : ""}
                            </small>
                        </p>
                    ))}
                    {bundle.goal?.success_criteria?.map((s, i) => (
                        <p key={i}>
                            <strong>{s.statement}</strong>
                            <small className="block text-dim">
                                {s.measurement} · Expected: {s.expected_result}
                            </small>
                        </p>
                    ))}
                    {bundle.fixture?.plan_assertions &&
                        Array.isArray(bundle.fixture.plan_assertions) && (
                            <pre className="fixture-json">
                                {JSON.stringify(
                                    bundle.fixture.plan_assertions,
                                    null,
                                    2,
                                )}
                            </pre>
                        )}
                </div>
            </details>

            {waiting && (
                <footer className="card-footer-actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={onAgain}
                        data-research-again="true"
                    >
                        Research Again
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        data-accept-research="true"
                        disabled={
                            busy ||
                            !edits.objective.trim() ||
                            edits.requirements.some(
                                (r) => !r.statement.trim(),
                            ) ||
                            edits.steps.some((s) => !s.description.trim())
                        }
                        onClick={() => onAccept(edits)}
                    >
                        Accept Research →
                    </button>
                </footer>
            )}
        </section>
    );
}

export function BuildCard({
    review,
    terminal,
    busy,
    onDecision,
}: {
    review: BuildReview;
    terminal: boolean;
    busy: boolean;
    onDecision: (action: "approve" | "return") => Promise<void>;
}) {
    const [collapsed, setCollapsed] = useState(false);

    return (
        <section
            className="card"
            id="build-review-card"
            data-testid="build-review-card"
        >
            <header className="card-topbar">
                <div>
                    <span className="card-tagline">Human Review · 02</span>
                    <h2 className="card-title">
                        {review.status === "approved"
                            ? "Build Authorized"
                            : "Build Ready"}
                    </h2>
                </div>
                <span
                    className={`card-status-pill ${
                        review.status === "approved" ? "passed" : "awaiting"
                    }`}
                >
                    {review.status === "approved"
                        ? "Authorized"
                        : "Awaiting authorization"}
                </span>
            </header>

            <p className="card-lead">
                The confirmed package passed deterministic Triple Validation.
                Builder is waiting in the isolated sandbox for your explicit
                authorization.
            </p>

            <div className="validation-signals-grid">
                <div className="sig-box">
                    <span className="sig-label">Schema Validation</span>
                    <span className="sig-val">
                        {review.validation?.schema || "VALID"}
                    </span>
                </div>
                <div className="sig-box">
                    <span className="sig-label">Fixture Validation</span>
                    <span className="sig-val">
                        {review.validation?.fixture || "VALID"}
                    </span>
                </div>
                <div className="sig-box">
                    <span className="sig-label">Goal Validation</span>
                    <span className="sig-val">
                        {review.validation?.goal || "VALID"}
                    </span>
                </div>
            </div>

            <div className="hash-proof-row">
                <span>Confirmation Hash:</span>
                <code className="mono hash-code">{review.hash}</code>
            </div>

            <details className="card-collapsible" open={!collapsed}>
                <summary>
                    Confirmed Package Steps ({review.steps?.length || 0})
                </summary>
                <div className="card-collapsible-body">
                    <ul className="timeline-list">
                        {review.steps?.map((s) => (
                            <li key={s.step_id} className="timeline-item">
                                <strong>
                                    {s.responsibility || "Builder"}:
                                </strong>{" "}
                                {s.description}
                            </li>
                        ))}
                    </ul>
                </div>
            </details>

            {!terminal && review.status === "pending" && (
                <footer className="card-footer-actions">
                    {collapsed ? (
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setCollapsed(false)}
                        >
                            Review build package
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                data-gate-action="return"
                                disabled={busy}
                                onClick={async () => {
                                    await onDecision("return");
                                    setCollapsed(true);
                                }}
                            >
                                Cancel / Return
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                data-gate-action="approve"
                                disabled={busy}
                                onClick={() => void onDecision("approve")}
                            >
                                Confirm Build
                            </button>
                        </>
                    )}
                </footer>
            )}
        </section>
    );
}

export function MutationsTable({ records }: { records: Mutation[] | null }) {
    if (!records || !records.length) {
        return (
            <p className="text-dim">No workspace file mutations recorded.</p>
        );
    }

    return (
        <div className="mutation-table-wrap">
            <table className="mutation-table">
                <thead>
                    <tr>
                        <th>Path</th>
                        <th>Action</th>
                        <th>Bytes</th>
                        <th>SHA-256</th>
                    </tr>
                </thead>
                <tbody>
                    {records.map((r, i) => (
                        <tr key={`${r.path}-${i}`}>
                            <td>
                                <code className="mono">{r.path}</code>
                            </td>
                            <td>
                                <span
                                    className={`action-badge ${r.action?.toLowerCase()}`}
                                >
                                    {r.action}
                                </span>
                            </td>
                            <td>{r.bytes ?? "—"}</td>
                            <td>
                                <code className="mono">
                                    {r.sha256
                                        ? `${r.sha256.slice(0, 16)}…`
                                        : "—"}
                                </code>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function Mutations({ records }: { records: Mutation[] | null }) {
    return (
        <div className="mutations-section">
            <h3 className="detail-heading">Workspace File Mutations</h3>
            <MutationsTable records={records} />
        </div>
    );
}

export function ResultCard({
    run,
    mutations,
}: {
    run: Run;
    mutations: Mutation[] | null;
}) {
    const verified = verifiedResult(run);
    const proof = run.hash_proof;
    const hashEqual =
        proof?.equal === true &&
        !!proof.created_hash &&
        proof.created_hash === proof.recomputed_hash;

    return (
        <section className="card" id="final-result-card">
            <header className="card-topbar">
                <div>
                    <span className="card-tagline">Final Result</span>
                    <h2 className="card-title">
                        {verified
                            ? "Workflow Completed Successfully"
                            : run.test_result === "Failed"
                              ? "Workflow Execution Failed"
                              : "Execution Finished"}
                    </h2>
                </div>
                <span
                    className={`card-status-pill ${
                        verified
                            ? "passed"
                            : run.test_result === "Failed"
                              ? "failed"
                              : "awaiting"
                    }`}
                >
                    {verified
                        ? "VERIFIED"
                        : run.test_result || run.pipeline_status || "FINISHED"}
                </span>
            </header>

            <p className="card-lead">
                Job <code className="mono">{run.run_id}</code> has completed
                processing. Verified deterministic proof recorded below.
            </p>

            <div className="validation-signals-grid">
                <div className="sig-box">
                    <span className="sig-label">Outcome</span>
                    <span
                        className="sig-val"
                        style={{
                            color: verified
                                ? "var(--accent-emerald)"
                                : "var(--accent-rose)",
                        }}
                    >
                        {run.test_result || run.pipeline_status || "—"}
                    </span>
                </div>
                <div className="sig-box">
                    <span className="sig-label">
                        Hash Equality (hash == hash_sandbox)
                    </span>
                    <span
                        className="sig-val"
                        style={{
                            color: hashEqual
                                ? "var(--accent-emerald)"
                                : "var(--accent-rose)",
                        }}
                    >
                        {hashEqual ? "VERIFIED EQUAL" : "NOT EQUAL"}
                    </span>
                </div>
                <div className="sig-box">
                    <span className="sig-label">Terminal Processor</span>
                    <span className="sig-val">
                        {run.current_processor || "Done"}
                    </span>
                </div>
            </div>

            {proof?.created_hash && (
                <div className="hash-proof-row">
                    <span>Created Hash:</span>
                    <code className="mono hash-code">{proof.created_hash}</code>
                </div>
            )}

            {proof?.recomputed_hash && (
                <div className="hash-proof-row">
                    <span>Sandbox Hash:</span>
                    <code className="mono hash-code">
                        {proof.recomputed_hash}
                    </code>
                </div>
            )}

            {mutations && mutations.length > 0 && (
                <div style={{ marginTop: "14px" }}>
                    <span className="field-label">
                        File Mutations Recorded ({mutations.length})
                    </span>
                    <MutationsTable records={mutations} />
                </div>
            )}

            {run.root_cause && (
                <div className="root-cause-alert">
                    <strong>Root Cause:</strong> {run.root_cause.issue}
                </div>
            )}
        </section>
    );
}
