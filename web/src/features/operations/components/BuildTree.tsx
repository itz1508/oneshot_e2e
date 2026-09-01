/**
 * BuildTree — sidebar tree for Build mode.
 *
 * Shows build resources: Queue, Tasks, Agent Activity, Logs, Evidence.
 * All data from real backend contracts (queueApi, logsApi, buildsApi).
 * No fabricated data.
 *
 * Expandable sections with status dots and counts.
 */

import {useCallback, useEffect, useState} from 'react'
import {
    ChevronRight,
    ListOrdered,
    ListTodo,
    Radio,
    ScrollText,
    ShieldCheck,
} from 'lucide-react'
import {
    queueApi,
    logsApi,
    buildsApi,
    type QueueItem,
    type QueueStatus,
    type JournalEntry,
    type BuildSummary,
} from '../api'
import styles from './BuildTree.module.css'

const STATUS_CLASS: Record<QueueStatus, string> = {
    dependent: styles.statusDependent,
    queued: styles.statusQueued,
    in_process: styles.statusInProcess,
    completed: styles.statusCompleted,
    failed: styles.statusFailed,
    decision_required: styles.statusDecisionRequired,
    cancelled: styles.statusCancelled,
}

type Section = 'queue' | 'tasks' | 'activity' | 'logs' | 'evidence'

export function BuildTree() {
    const [queueItems, setQueueItems] = useState<QueueItem[]>([])
    const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
    const [builds, setBuilds] = useState<BuildSummary[]>([])
    const [expanded, setExpanded] = useState<Set<Section>>(new Set(['queue']))
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const [queueRes, logsRes, buildsRes] = await Promise.allSettled([
                queueApi.list({include_hidden: false}),
                logsApi.list({limit: 50}),
                buildsApi.list(),
            ])
            if (queueRes.status === 'fulfilled') setQueueItems(queueRes.value.items)
            if (logsRes.status === 'fulfilled') setJournalEntries(logsRes.value.entries)
            if (buildsRes.status === 'fulfilled') setBuilds(buildsRes.value.builds)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load build data')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const toggleSection = (section: Section) => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(section)) next.delete(section)
            else next.add(section)
            return next
        })
    }

    if (loading && queueItems.length === 0) {
        return <div className={styles.status}>Loading build data...</div>
    }

    if (error && queueItems.length === 0) {
        return <div className={styles.error}>{error}</div>
    }

    const tasks = queueItems.map((item) => ({
        task_id: item.task_id,
        status: item.queue_status,
        queue_item_id: item.queue_item_id,
    }))

    const completedCount = queueItems.filter((i) => i.queue_status === 'completed').length
    const failedCount = queueItems.filter((i) => i.queue_status === 'failed').length

    return (
        <div className={styles.container}>
            {/* Queue section */}
            <SectionHeader
                icon={<ListOrdered size={12}/>}
                label="Queue"
                count={queueItems.length}
                expanded={expanded.has('queue')}
                onToggle={() => toggleSection('queue')}
            />
            {expanded.has('queue') && (
                <div className={styles.sectionBody}>
                    {queueItems.length === 0 ? (
                        <div className={styles.empty}>No queue items</div>
                    ) : (
                        queueItems.map((item) => (
                            <div key={item.queue_item_id} className={styles.itemRow}>
                                <span
                                    className={`${styles.statusDot} ${STATUS_CLASS[item.queue_status]}`}
                                />
                                <span className={styles.itemLabel}>{item.task_id}</span>
                                <span className={styles.itemStatus}>{item.queue_status}</span>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Tasks section */}
            <SectionHeader
                icon={<ListTodo size={12}/>}
                label="Tasks"
                count={tasks.length}
                expanded={expanded.has('tasks')}
                onToggle={() => toggleSection('tasks')}
            />
            {expanded.has('tasks') && (
                <div className={styles.sectionBody}>
                    {tasks.length === 0 ? (
                        <div className={styles.empty}>No tasks</div>
                    ) : (
                        tasks.map((t) => (
                            <div key={t.queue_item_id} className={styles.itemRow}>
                                <span
                                    className={`${styles.statusDot} ${STATUS_CLASS[t.status]}`}
                                />
                                <span className={styles.itemLabel}>{t.task_id}</span>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Agent Activity section */}
            <SectionHeader
                icon={<Radio size={12}/>}
                label="Agent Activity"
                count={journalEntries.length}
                expanded={expanded.has('activity')}
                onToggle={() => toggleSection('activity')}
            />
            {expanded.has('activity') && (
                <div className={styles.sectionBody}>
                    {journalEntries.length === 0 ? (
                        <div className={styles.empty}>No activity recorded</div>
                    ) : (
                        journalEntries.slice(0, 10).map((entry) => (
                            <div key={entry.entry_id} className={styles.activityRow}>
                                <span className={styles.activityType}>{entry.event_type}</span>
                                <span className={styles.activityMsg}>{entry.message}</span>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Logs section */}
            <SectionHeader
                icon={<ScrollText size={12}/>}
                label="Logs"
                count={journalEntries.length}
                expanded={expanded.has('logs')}
                onToggle={() => toggleSection('logs')}
            />
            {expanded.has('logs') && (
                <div className={styles.sectionBody}>
                    {journalEntries.length === 0 ? (
                        <div className={styles.empty}>No log entries</div>
                    ) : (
                        journalEntries.slice(0, 8).map((entry) => (
                            <div key={entry.entry_id} className={styles.logRow}>
                                <span className={styles.logTime}>
                                    {entry.created_at.slice(11, 19)}
                                </span>
                                <span className={styles.logType}>{entry.event_type}</span>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Evidence section */}
            <SectionHeader
                icon={<ShieldCheck size={12}/>}
                label="Evidence"
                count={builds.length}
                expanded={expanded.has('evidence')}
                onToggle={() => toggleSection('evidence')}
            />
            {expanded.has('evidence') && (
                <div className={styles.sectionBody}>
                    {builds.length === 0 ? (
                        <div className={styles.empty}>No builds yet</div>
                    ) : (
                        builds.slice(0, 5).map((build) => (
                            <div key={build.build_id} className={styles.itemRow}>
                                <span className={styles.buildStatus}>{build.status}</span>
                                <span className={styles.itemLabel}>{build.build_id}</span>
                                <span className={styles.buildProgress}>
                                    {build.completed_tasks}/{build.total_tasks}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Summary */}
            {queueItems.length > 0 && (
                <div className={styles.summary}>
                    <span>{completedCount} completed</span>
                    {failedCount > 0 && <span className={styles.failed}>{failedCount} failed</span>}
                </div>
            )}
        </div>
    )
}

function SectionHeader({
    icon,
    label,
    count,
    expanded,
    onToggle,
}: {
    icon: React.ReactNode
    label: string
    count: number
    expanded: boolean
    onToggle: () => void
}) {
    return (
        <div className={styles.sectionHeader} onClick={onToggle} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }} role="button" tabIndex={0}>
            <ChevronRight
                size={11}
                className={`${styles.sectionChevron} ${expanded ? styles.sectionChevronOpen : ''}`}
            />
            {icon}
            <span className={styles.sectionLabel}>{label}</span>
            <span className={styles.sectionCount}>{count}</span>
        </div>
    )
}
