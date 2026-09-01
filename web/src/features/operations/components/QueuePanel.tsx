/**
 * QueuePanel — view queue items and manage their lifecycle.
 *
 * Shows queue items with status badges, supports cancel, retry,
 * and soft-delete operations. Events are shown inline per item.
 */

import {useCallback, useEffect, useState} from 'react'
import {queueApi, type QueueItem, type QueueStatus, type QueueEvent} from '../api'
import styles from './QueuePanel.module.css'

const STATUS_COLORS: Record<QueueStatus, string> = {
    dependent: '#6b7280',
    queued: '#3b82f6',
    in_process: '#f59e0b',
    completed: '#22c55e',
    failed: '#ef4444',
    decision_required: '#a855f7',
    cancelled: '#9ca3af',
}

const TERMINAL: ReadonlySet<string> = new Set(['completed', 'failed', 'decision_required', 'cancelled'])

export function QueuePanel() {
    const [items, setItems] = useState<QueueItem[]>([])
    const [selected, setSelected] = useState<QueueItem | null>(null)
    const [events, setEvents] = useState<QueueEvent[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [statusFilter, setStatusFilter] = useState<string>('')
    const [showHidden, setShowHidden] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await queueApi.list({
                status: statusFilter || undefined,
                include_hidden: showHidden,
            })
            setItems(res.items)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load queue')
        } finally {
            setLoading(false)
        }
    }, [statusFilter, showHidden])

    useEffect(() => { load() }, [load])

    const handleSelect = async (item: QueueItem) => {
        setSelected(item)
        try {
            const res = await queueApi.events(item.queue_item_id)
            setEvents(res.events)
        } catch {
            setEvents([])
        }
    }

    const handleCancel = async (item: QueueItem) => {
        try {
            await queueApi.cancel(item.queue_item_id, item.version, 'ui-user')
            await load()
            if (selected?.queue_item_id === item.queue_item_id) handleSelect(item)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Cancel failed')
        }
    }

    const handleRetry = async (item: QueueItem) => {
        try {
            await queueApi.retry(item.queue_item_id, 'ui-user')
            await load()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Retry failed')
        }
    }

    const handleSoftDelete = async (item: QueueItem) => {
        try {
            await queueApi.softDelete(item.queue_item_id, item.version, 'ui-user')
            await load()
            setSelected(null)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Soft-delete failed')
        }
    }

    const counts = {
        total: items.length,
        active: items.filter(i => !TERMINAL.has(i.queue_status)).length,
        terminal: items.filter(i => TERMINAL.has(i.queue_status)).length,
    }

    return (
        <div className={styles.container}>
            {/* Left: queue list */}
            <div className={styles.sidebar}>
                <div className={styles.sidebarHeader}>
                    <h3>Queue</h3>
                    <div className={styles.counts}>
                        <span className={styles.countBadge} title="Active">{counts.active}</span>
                        <span className={styles.countBadgeMuted} title="Terminal">{counts.terminal}</span>
                    </div>
                </div>

                <div className={styles.filters}>
                    <select
                        className={styles.filterSelect}
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                    >
                        <option value="">All</option>
                        <option value="dependent">Dependent</option>
                        <option value="queued">Queued</option>
                        <option value="in_process">In Process</option>
                        <option value="completed">Completed</option>
                        <option value="failed">Failed</option>
                        <option value="decision_required">Decision Required</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                    <label className={styles.hiddenToggle}>
                        <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} />
                        Hidden
                    </label>
                </div>

                {loading ? (
                    <div className={styles.loading}>Loading...</div>
                ) : items.length === 0 ? (
                    <div className={styles.empty}>Queue is empty</div>
                ) : (
                    <ul className={styles.list}>
                        {items.map(item => (
                            <li
                                key={item.queue_item_id}
                                className={`${styles.item} ${selected?.queue_item_id === item.queue_item_id ? styles.selected : ''}`}
                                onClick={() => handleSelect(item)}
                            >
                                <div className={styles.itemHeader}>
                                    <span className={styles.taskId}>{item.task_id}</span>
                                    <span
                                        className={styles.statusDot}
                                        style={{background: STATUS_COLORS[item.queue_status]}}
                                        title={item.queue_status}
                                    />
                                </div>
                                <div className={styles.itemMeta}>
                                    <span>v{item.version}</span>
                                    <span>retries: {item.retry_count}/{item.max_retries}</span>
                                    <span>{item.source}</span>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Right: detail + events */}
            <div className={styles.main}>
                {error && <div className={styles.error} role="alert">{error}</div>}

                {selected ? (
                    <QueueDetail
                        item={selected}
                        events={events}
                        onCancel={() => handleCancel(selected)}
                        onRetry={() => handleRetry(selected)}
                        onSoftDelete={() => handleSoftDelete(selected)}
                        onRefresh={() => handleSelect(selected)}
                    />
                ) : (
                    <div className={styles.placeholder}>Select a queue item</div>
                )}

                <button className={styles.refreshBtn} onClick={load}>Refresh</button>
            </div>
        </div>
    )
}

// ── Queue Detail ────────────────────────────────────────────────────────────

function QueueDetail({
    item,
    events,
    onCancel,
    onRetry,
    onSoftDelete,
    onRefresh,
}: {
    item: QueueItem
    events: QueueEvent[]
    onCancel: () => void
    onRetry: () => void
    onSoftDelete: () => void
    onRefresh: () => void
}) {
    const isTerminal = TERMINAL.has(item.queue_status)

    return (
        <div className={styles.detail}>
            <header className={styles.detailHeader}>
                <div>
                    <h2 className={styles.detailTitle}>{item.task_id}</h2>
                    <span className={styles.detailId}>{item.queue_item_id}</span>
                </div>
                <span className={styles.badge} style={{background: STATUS_COLORS[item.queue_status]}}>
                    {item.queue_status}
                </span>
            </header>

            <div className={styles.metaGrid}>
                <MetaItem label="Version" value={`v${item.version}`} />
                <MetaItem label="Retries" value={`${item.retry_count}/${item.max_retries}`} />
                <MetaItem label="Source" value={item.source} />
                <MetaItem label="Actor" value={item.actor_id} />
                <MetaItem label="Created" value={formatDate(item.created_at)} />
                {item.admitted_at && <MetaItem label="Admitted" value={formatDate(item.admitted_at)} />}
                {item.completed_at && <MetaItem label="Completed" value={formatDate(item.completed_at)} />}
            </div>

            {item.depends_on.length > 0 && (
                <div className={styles.section}>
                    <h4>Dependencies</h4>
                    <ul className={styles.depList}>
                        {item.depends_on.map(d => <li key={d}>{d}</li>)}
                    </ul>
                </div>
            )}

            {/* Actions */}
            <div className={styles.actions}>
                {!isTerminal && (
                    <>
                        <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
                    </>
                )}
                {item.queue_status === 'failed' && (
                    <button className={styles.retryBtn} onClick={onRetry}>Retry</button>
                )}
                <button className={styles.deleteBtn} onClick={onSoftDelete}>Soft Delete</button>
                <button className={styles.refreshBtn} onClick={onRefresh}>Refresh</button>
            </div>

            {/* Event log */}
            {events.length > 0 && (
                <div className={styles.section}>
                    <h4>Events ({events.length})</h4>
                    <ul className={styles.eventList}>
                        {events.map(evt => (
                            <li key={evt.event_id} className={styles.eventItem}>
                                <div className={styles.eventHeader}>
                                    <span className={styles.eventType}>{evt.event_type}</span>
                                    <span className={styles.eventTime}>{formatDate(evt.created_at)}</span>
                                </div>
                                {evt.previous_status && evt.new_status && (
                                    <div className={styles.eventTransition}>
                                        {evt.previous_status} → {evt.new_status}
                                    </div>
                                )}
                                {evt.actor_id && (
                                    <div className={styles.eventActor}>by {evt.actor_id}</div>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function MetaItem({label, value}: {label: string; value: string}) {
    return (
        <div className={styles.metaItem}>
            <span className={styles.metaLabel}>{label}</span>
            <span>{value}</span>
        </div>
    )
}

function formatDate(iso: string): string {
    if (!iso) return ''
    return new Date(iso).toLocaleString()
}
