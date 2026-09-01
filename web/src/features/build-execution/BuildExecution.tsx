/**
 * BuildExecution — live execution view for the main workspace in Build mode.
 *
 * Shows:
 * - Build status (from buildsApi / queueApi)
 * - Agent Activity feed (from execution journal — REAL observable events only)
 * - Queue task status
 * - Log entries
 * - Evidence references
 *
 * All data from real backend sources. No fabricated events, timestamps,
 * tool calls, or progress. If the backend has no data, sections show empty.
 *
 * Identity chain: plan_id → build_id → task_id → journal → evidence
 * All IDs originate from backend responses.
 */

import {useCallback, useEffect, useState} from 'react'
import {
    queueApi,
    logsApi,
    buildsApi,
    type QueueItem,
    type QueueStatus,
    type JournalEntry,
    type BuildSummary,
} from '../operations/api'
import styles from './BuildExecution.module.css'

interface BuildExecutionProps {
    buildId: string
}

const STATUS_CLASS: Record<QueueStatus, string> = {
    dependent: styles.statusDependent,
    queued: styles.statusQueued,
    in_process: styles.statusInProcess,
    completed: styles.statusCompleted,
    failed: styles.statusFailed,
    decision_required: styles.statusDecisionRequired,
    cancelled: styles.statusCancelled,
}

const EVENT_LABELS: Record<string, string> = {
    lease: 'Lease',
    dispatch: 'Dispatch',
    worker_started: 'Worker Started',
    worker_completed: 'Worker Completed',
    worker_failed: 'Worker Failed',
    evidence_validated: 'Evidence Validated',
    evidence_rejected: 'Evidence Rejected',
    task_completed: 'Task Completed',
    task_failed: 'Task Failed',
    retry: 'Retry',
    recover: 'Recover',
    decision_required: 'Decision Required',
    decision_received: 'Decision Received',
    execution_resumed: 'Execution Resumed',
    build_failed: 'Build Failed',
    plan_completed: 'Plan Completed',
    plan_failed: 'Plan Failed',
    heartbeat: 'Heartbeat',
    lease_expired: 'Lease Expired',
    build_cancelled: 'Build Cancelled',
}

export function BuildExecution({buildId}: BuildExecutionProps) {
    const [build, setBuild] = useState<BuildSummary | null>(null)
    const [queueItems, setQueueItems] = useState<QueueItem[]>([])
    const [journal, setJournal] = useState<JournalEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const [buildsRes, queueRes, journalRes] = await Promise.allSettled([
                buildsApi.list(),
                queueApi.list({include_hidden: false}),
                logsApi.forBuild(buildId),
            ])
            if (buildsRes.status === 'fulfilled') {
                const found = buildsRes.value.builds.find((b) => b.build_id === buildId)
                if (found) setBuild(found)
            }
            if (queueRes.status === 'fulfilled') setQueueItems(queueRes.value.items)
            if (journalRes.status === 'fulfilled') setJournal(journalRes.value.entries)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load build data')
        } finally {
            setLoading(false)
        }
    }, [buildId])

    useEffect(() => { load() }, [load])

    if (loading) {
        return <div className={styles.loading}>Loading build execution...</div>
    }

    if (error) {
        return <div className={styles.error}>{error}</div>
    }

    const currentTask = queueItems.find(
        (i) => i.queue_status === 'in_process' || i.queue_status === 'queued',
    )

    return (
        <div className={styles.container}>
            {/* Build Status Header */}
            <div className={styles.header}>
                <div className={styles.headerRow}>
                    <h2 className={styles.title}>Build</h2>
                    {build && (
                        <span className={styles.buildStatus}>{build.status}</span>
                    )}
                </div>
                <div className={styles.buildId}>
                    <span className={styles.idLabel}>build_id</span>
                    <span className={styles.idValue}>{buildId}</span>
                </div>
                {build && (
                    <div className={styles.buildMeta}>
                        <span className={styles.metaItem}>
                            <span className={styles.metaLabel}>plan_id</span>
                            <span className={styles.metaValue}>{build.plan_id}</span>
                        </span>
                        <span className={styles.metaItem}>
                            <span className={styles.metaLabel}>progress</span>
                            <span className={styles.metaValue}>
                                {build.completed_tasks}/{build.total_tasks} tasks
                            </span>
                        </span>
                    </div>
                )}
            </div>

            {/* Current Task */}
            {currentTask && (
                <div className={styles.section}>
                    <h3 className={styles.sectionTitle}>Current Task</h3>
                    <div className={styles.currentTask}>
                        <span
                            className={`${styles.statusDot} ${currentTask ? STATUS_CLASS[currentTask.queue_status] : ''}`}
                        />
                        <span className={styles.currentTaskId}>{currentTask.task_id}</span>
                        <span className={styles.currentTaskStatus}>{currentTask.queue_status}</span>
                    </div>
                </div>
            )}

            {/* Agent Activity — real execution journal events */}
            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Agent Activity</h3>
                {journal.length === 0 ? (
                    <div className={styles.empty}>No activity recorded yet</div>
                ) : (
                    <div className={styles.activityFeed}>
                        {journal.map((entry) => (
                            <div key={entry.entry_id} className={styles.activityEntry}>
                                <span className={styles.activityTime}>
                                    {entry.created_at.slice(11, 19)}
                                </span>
                                <span className={styles.activityType}>
                                    {EVENT_LABELS[entry.event_type] ?? entry.event_type}
                                </span>
                                <span className={styles.activityMsg}>{entry.message}</span>
                                {entry.task_id && (
                                    <span className={styles.activityTask}>{entry.task_id}</span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Queue Tasks */}
            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Tasks ({queueItems.length})</h3>
                {queueItems.length === 0 ? (
                    <div className={styles.empty}>No tasks in queue</div>
                ) : (
                    <div className={styles.taskTable}>
                        <div className={styles.taskRow}>
                            <span className={styles.taskCell}>Task ID</span>
                            <span className={styles.taskCell}>Status</span>
                            <span className={styles.taskCell}>Retries</span>
                        </div>
                        {queueItems.map((item) => (
                            <div key={item.queue_item_id} className={styles.taskRow}>
                                <span className={styles.taskCellMono}>{item.task_id}</span>
                                <span className={styles.taskCell}>
                                    <span
                                        className={`${styles.statusDot} ${STATUS_CLASS[item.queue_status]}`}
                                    />
                                    {item.queue_status}
                                </span>
                                <span className={styles.taskCell}>
                                    {item.retry_count}/{item.max_retries}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Logs */}
            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Execution Log</h3>
                {journal.length === 0 ? (
                    <div className={styles.empty}>No log entries</div>
                ) : (
                    <div className={styles.logList}>
                        {journal.map((entry) => (
                            <div key={entry.entry_id} className={styles.logEntry}>
                                <span className={styles.logTime}>
                                    {entry.created_at.slice(11, 19)}
                                </span>
                                <span className={styles.logEventType}>{entry.event_type}</span>
                                <span className={styles.logMessage}>{entry.message}</span>
                                <span className={styles.logEntryId}>{entry.entry_id}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Evidence */}
            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Evidence</h3>
                <div className={styles.empty}>
                    Evidence packets are available when the build produces validated artifacts
                </div>
            </div>
        </div>
    )
}
