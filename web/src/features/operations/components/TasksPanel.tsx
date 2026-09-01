/**
 * TasksPanel — view and track tasks across all plans.
 *
 * Tasks are extracted from stored plan content. Each task shows
 * its plan context, dependencies, and execution paths.
 */

import {useCallback, useEffect, useState} from 'react'
import {plansApi, queueApi, type TaskSpec, type QueueItem} from '../api'
import styles from './TasksPanel.module.css'

interface TaskRow {
    task: TaskSpec
    planId: string
    planTitle: string
    planStatus: string
    queueItem?: QueueItem
}

const QUEUE_STATUS_COLORS: Record<string, string> = {
    dependent: '#6b7280',
    queued: '#3b82f6',
    in_process: '#f59e0b',
    completed: '#22c55e',
    failed: '#ef4444',
    decision_required: '#a855f7',
    cancelled: '#9ca3af',
}

export function TasksPanel() {
    const [rows, setRows] = useState<TaskRow[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [filter, setFilter] = useState('')
    const [selectedPlan, setSelectedPlan] = useState<string>('')

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            // Load all plans and queue items in parallel
            const [plansRes, queueRes] = await Promise.all([
                plansApi.list(),
                queueApi.list({include_hidden: true, limit: 500}),
            ])

            const queueMap = new Map<string, QueueItem>()
            for (const qi of queueRes.items) {
                queueMap.set(qi.task_id, qi)
            }

            const taskRows: TaskRow[] = []
            for (const plan of plansRes.plans) {
                const tasks: TaskSpec[] = plan.content?.tasks ?? []
                for (const task of tasks) {
                    taskRows.push({
                        task,
                        planId: plan.plan_id,
                        planTitle: plan.title,
                        planStatus: plan.status,
                        queueItem: queueMap.get(task.task_id),
                    })
                }
            }

            setRows(taskRows)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load tasks')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const filtered = rows.filter(r => {
        if (selectedPlan && r.planId !== selectedPlan) return false
        if (filter) {
            const q = filter.toLowerCase()
            return (
                r.task.task_id.toLowerCase().includes(q) ||
                r.task.title.toLowerCase().includes(q) ||
                r.planTitle.toLowerCase().includes(q)
            )
        }
        return true
    })

    const planIds = [...new Set(rows.map(r => r.planId))]

    const counts = {
        total: filtered.length,
        completed: filtered.filter(r => r.queueItem?.queue_status === 'completed').length,
        failed: filtered.filter(r => r.queueItem?.queue_status === 'failed').length,
        inProgress: filtered.filter(r => r.queueItem?.queue_status === 'in_process').length,
        queued: filtered.filter(r => r.queueItem?.queue_status === 'queued').length,
        noQueue: filtered.filter(r => !r.queueItem).length,
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h3>Tasks</h3>
                <div className={styles.counts}>
                    <span className={styles.countBadge} title="Total">{counts.total}</span>
                    <span className={styles.countGreen} title="Completed">{counts.completed}</span>
                    <span className={styles.countYellow} title="In Progress">{counts.inProgress}</span>
                    <span className={styles.countRed} title="Failed">{counts.failed}</span>
                    <span className={styles.countBlue} title="Queued">{counts.queued}</span>
                </div>
            </header>

            <div className={styles.filters}>
                <input
                    className={styles.searchInput}
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    placeholder="Filter tasks..."
                />
                <select
                    className={styles.filterSelect}
                    value={selectedPlan}
                    onChange={e => setSelectedPlan(e.target.value)}
                >
                    <option value="">All plans</option>
                    {planIds.map(pid => (
                        <option key={pid} value={pid}>{pid}</option>
                    ))}
                </select>
                <button className={styles.refreshBtn} onClick={load}>Refresh</button>
            </div>

            {error && <div className={styles.error} role="alert">{error}</div>}

            {loading ? (
                <div className={styles.loading}>Loading tasks...</div>
            ) : filtered.length === 0 ? (
                <div className={styles.empty}>No tasks found</div>
            ) : (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Task ID</th>
                                <th>Title</th>
                                <th>Plan</th>
                                <th>Status</th>
                                <th>Dependencies</th>
                                <th>Write Paths</th>
                                <th>Tests</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((row, i) => (
                                <tr key={`${row.planId}:${row.task.task_id}`} className={i % 2 ? styles.even : ''}>
                                    <td className={styles.mono}>{row.task.task_id}</td>
                                    <td>{row.task.title}</td>
                                    <td>
                                        <span className={styles.planLink} title={row.planTitle}>
                                            {row.planId.slice(0, 16)}...
                                        </span>
                                    </td>
                                    <td>
                                        {row.queueItem ? (
                                            <span
                                                className={styles.statusBadge}
                                                style={{background: QUEUE_STATUS_COLORS[row.queueItem.queue_status]}}
                                            >
                                                {row.queueItem.queue_status}
                                            </span>
                                        ) : (
                                            <span className={styles.noQueue}>—</span>
                                        )}
                                    </td>
                                    <td className={styles.mono}>
                                        {row.task.dependencies?.length
                                            ? row.task.dependencies.join(', ')
                                            : '—'}
                                    </td>
                                    <td className={styles.mono}>
                                        {row.task.write_paths?.length
                                            ? row.task.write_paths.length + ' paths'
                                            : '—'}
                                    </td>
                                    <td className={styles.mono}>
                                        {row.task.tests?.length
                                            ? row.task.tests.length + ' tests'
                                            : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
