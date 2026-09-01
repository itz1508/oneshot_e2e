/**
 * LogsPanel — execution journal viewer.
 *
 * The journal itself is IMMUTABLE (append-only). Users can add
 * annotations (labels, notes) that are stored locally — these are
 * overlays, not modifications to the audit record.
 *
 * Supports:
 *   - Filtering by event_type, plan_id, task_id
 *   - Inspecting individual entries (expand metadata)
 *   - Adding/editing annotations (local storage)
 */

import {useCallback, useEffect, useState} from 'react'
import {logsApi, annotationsApi, type JournalEntry, type LogAnnotation} from '../api'
import styles from './LogsPanel.module.css'

const EVENT_TYPE_COLORS: Record<string, string> = {
    build_started: '#3b82f6',
    build_completed: '#22c55e',
    build_failed: '#ef4444',
    build_cancelled: '#9ca3af',
    task_started: '#60a5fa',
    task_completed: '#4ade80',
    task_failed: '#f87171',
    task_skipped: '#a78bfa',
    plan_submitted: '#f59e0b',
    plan_completed: '#22c55e',
    plan_failed: '#ef4444',
    queue_admitted: '#3b82f6',
    queue_transitioned: '#8b5cf6',
}

export function LogsPanel() {
    const [entries, setEntries] = useState<JournalEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [expanded, setExpanded] = useState<string | null>(null)
    const [annotations, setAnnotations] = useState<Record<string, LogAnnotation>>({})

    // Filters
    const [eventTypeFilter, setEventTypeFilter] = useState('')
    const [planIdFilter, setPlanIdFilter] = useState('')
    const [taskIdFilter, setTaskIdFilter] = useState('')
    const [limit, setLimit] = useState(100)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await logsApi.list({
                event_type: eventTypeFilter || undefined,
                plan_id: planIdFilter || undefined,
                task_id: taskIdFilter || undefined,
                limit,
            })
            setEntries(res.entries)
            setAnnotations(annotationsApi.getAll())
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load logs')
        } finally {
            setLoading(false)
        }
    }, [eventTypeFilter, planIdFilter, taskIdFilter, limit])

    useEffect(() => { load() }, [load])

    const toggleExpand = (entryId: string) => {
        setExpanded(prev => prev === entryId ? null : entryId)
    }

    const handleAnnotate = (entryId: string) => {
        const existing = annotations[entryId]
        const label = prompt('Label:', existing?.label ?? '')
        if (label === null) return
        const note = prompt('Note:', existing?.note ?? '')
        if (note === null) return
        annotationsApi.set(entryId, label, note)
        setAnnotations(annotationsApi.getAll())
    }

    const handleRemoveAnnotation = (entryId: string) => {
        annotationsApi.remove(entryId)
        setAnnotations(annotationsApi.getAll())
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h3>Execution Logs</h3>
                <span className={styles.countBadge}>{entries.length} entries</span>
            </header>

            <div className={styles.filters}>
                <input
                    className={styles.filterInput}
                    value={eventTypeFilter}
                    onChange={e => setEventTypeFilter(e.target.value)}
                    placeholder="Event type..."
                />
                <input
                    className={styles.filterInput}
                    value={planIdFilter}
                    onChange={e => setPlanIdFilter(e.target.value)}
                    placeholder="Plan ID..."
                />
                <input
                    className={styles.filterInput}
                    value={taskIdFilter}
                    onChange={e => setTaskIdFilter(e.target.value)}
                    placeholder="Task ID..."
                />
                <select
                    className={styles.limitSelect}
                    value={limit}
                    onChange={e => setLimit(Number(e.target.value))}
                >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={250}>250</option>
                    <option value={500}>500</option>
                </select>
                <button className={styles.refreshBtn} onClick={load}>Refresh</button>
            </div>

            {error && <div className={styles.error} role="alert">{error}</div>}

            <div className={styles.immutabilityNotice}>
                Execution logs are append-only and immutable. Annotations are local overlays.
            </div>

            {loading ? (
                <div className={styles.loading}>Loading logs...</div>
            ) : entries.length === 0 ? (
                <div className={styles.empty}>No log entries found</div>
            ) : (
                <ul className={styles.entryList}>
                    {entries.map(entry => (
                        <LogEntryRow
                            key={entry.entry_id}
                            entry={entry}
                            annotation={annotations[entry.entry_id]}
                            isExpanded={expanded === entry.entry_id}
                            onToggle={() => toggleExpand(entry.entry_id)}
                            onAnnotate={() => handleAnnotate(entry.entry_id)}
                            onRemoveAnnotation={() => handleRemoveAnnotation(entry.entry_id)}
                        />
                    ))}
                </ul>
            )}
        </div>
    )
}

// ── Entry Row ───────────────────────────────────────────────────────────────

function LogEntryRow({
    entry,
    annotation,
    isExpanded,
    onToggle,
    onAnnotate,
    onRemoveAnnotation,
}: {
    entry: JournalEntry
    annotation?: LogAnnotation
    isExpanded: boolean
    onToggle: () => void
    onAnnotate: () => void
    onRemoveAnnotation: () => void
}) {
    const eventColor = EVENT_TYPE_COLORS[entry.event_type] || '#6b7280'
    let metadata: Record<string, unknown> = {}
    try { metadata = JSON.parse(entry.metadata_json || '{}') } catch { /* ignore */ }

    return (
        <li className={`${styles.entry} ${isExpanded ? styles.entryExpanded : ''}`}>
            <div className={styles.entryHeader} onClick={onToggle}>
                <span className={styles.expandIcon}>{isExpanded ? '▾' : '▸'}</span>
                <span className={styles.eventDot} style={{background: eventColor}} />
                <span className={styles.eventType}>{entry.event_type}</span>
                <span className={styles.entryMessage}>{entry.message || '—'}</span>
                <span className={styles.entryTime}>{formatDate(entry.created_at)}</span>
                {annotation && (
                    <span className={styles.annotationBadge} title={annotation.note}>
                        {annotation.label}
                    </span>
                )}
            </div>

            {isExpanded && (
                <div className={styles.entryDetail}>
                    <div className={styles.detailGrid}>
                        <DetailRow label="Entry ID" value={entry.entry_id} mono />
                        <DetailRow label="Event Type" value={entry.event_type} />
                        {entry.plan_id && <DetailRow label="Plan ID" value={entry.plan_id} mono />}
                        {entry.task_id && <DetailRow label="Task ID" value={entry.task_id} mono />}
                        {entry.packet_id && <DetailRow label="Packet ID" value={entry.packet_id} mono />}
                        {entry.evidence_id && <DetailRow label="Evidence ID" value={entry.evidence_id} mono />}
                        {entry.actor_id && <DetailRow label="Actor" value={entry.actor_id} />}
                        <DetailRow label="Timestamp" value={formatDate(entry.created_at)} />
                    </div>

                    {Object.keys(metadata).length > 0 && (
                        <div className={styles.metadataSection}>
                            <h5>Metadata</h5>
                            <pre className={styles.metadataJson}>
                                {JSON.stringify(metadata, null, 2)}
                            </pre>
                        </div>
                    )}

                    {/* Annotation controls */}
                    <div className={styles.annotationSection}>
                        <h5>Annotation</h5>
                        {annotation ? (
                            <div className={styles.annotationCard}>
                                <div className={styles.annotationLabel}>{annotation.label}</div>
                                <div className={styles.annotationNote}>{annotation.note}</div>
                                <div className={styles.annotationActions}>
                                    <button className={styles.annotateBtn} onClick={onAnnotate}>Edit</button>
                                    <button className={styles.removeAnnotationBtn} onClick={onRemoveAnnotation}>Remove</button>
                                </div>
                            </div>
                        ) : (
                            <button className={styles.annotateBtn} onClick={onAnnotate}>
                                Add annotation
                            </button>
                        )}
                    </div>
                </div>
            )}
        </li>
    )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function DetailRow({label, value, mono}: {label: string; value: string; mono?: boolean}) {
    return (
        <div className={styles.detailRow}>
            <span className={styles.detailLabel}>{label}</span>
            <span className={mono ? styles.mono : ''}>{value}</span>
        </div>
    )
}

function formatDate(iso: string): string {
    if (!iso) return ''
    return new Date(iso).toLocaleString()
}
