/**
 * PlansPanel — view, create, and submit build plans.
 *
 * Layout: left list of stored plans, right detail/editor pane.
 */

import {useCallback, useEffect, useState} from 'react'
import {plansApi, type StoredPlan, type PlanContent, type PlanStatus, type TaskSpec, type WorkflowStage, type StageStatus} from '../api'
import styles from './PlansPanel.module.css'

type ViewMode = 'list' | 'detail' | 'create'

const STATUS_COLORS: Record<PlanStatus, string> = {
    draft: '#6b7280',
    submitted: '#3b82f6',
    executing: '#f59e0b',
    completed: '#22c55e',
    failed: '#ef4444',
    cancelled: '#9ca3af',
}

export function PlansPanel() {
    const [plans, setPlans] = useState<StoredPlan[]>([])
    const [selected, setSelected] = useState<StoredPlan | null>(null)
    const [mode, setMode] = useState<ViewMode>('list')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [statusFilter, setStatusFilter] = useState<string>('')

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await plansApi.list(statusFilter ? {status: statusFilter} : undefined)
            setPlans(res.plans)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load plans')
        } finally {
            setLoading(false)
        }
    }, [statusFilter])

    useEffect(() => { load() }, [load])

    const handleSelect = async (plan: StoredPlan) => {
        setSelected(plan)
        setMode('detail')
        try {
            const full = await plansApi.get(plan.plan_id)
            setSelected(full)
        } catch { /* keep list data */ }
    }

    const handleSubmit = async (planId: string, execMode: 'execute' | 'queue') => {
        try {
            await plansApi.submit(planId, {mode: execMode})
            await load()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Submit failed')
        }
    }

    const handleDelete = async (planId: string) => {
        try {
            await plansApi.delete(planId)
            setSelected(null)
            setMode('list')
            await load()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Delete failed')
        }
    }

    const handleCreated = (plan: StoredPlan) => {
        setSelected(plan)
        setMode('detail')
        load()
    }

    return (
        <div className={styles.container}>
            {/* Left: plan list */}
            <div className={styles.sidebar}>
                <div className={styles.sidebarHeader}>
                    <h3>Plans</h3>
                    <button className={styles.createBtn} onClick={() => { setMode('create'); setSelected(null) }}>
                        + New
                    </button>
                </div>

                <select
                    className={styles.filterSelect}
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                >
                    <option value="">All statuses</option>
                    <option value="draft">Draft</option>
                    <option value="submitted">Submitted</option>
                    <option value="executing">Executing</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                </select>

                {loading ? (
                    <div className={styles.loading}>Loading...</div>
                ) : plans.length === 0 ? (
                    <div className={styles.empty}>No plans found</div>
                ) : (
                    <ul className={styles.list}>
                        {plans.map(p => (
                            <li
                                key={p.plan_id}
                                className={`${styles.item} ${selected?.plan_id === p.plan_id ? styles.selected : ''}`}
                                onClick={() => handleSelect(p)}
                            >
                                <div className={styles.itemHeader}>
                                    <span className={styles.itemTitle}>{p.title || 'Untitled'}</span>
                                    <span
                                        className={styles.statusDot}
                                        style={{background: STATUS_COLORS[p.status]}}
                                        title={p.status}
                                    />
                                </div>
                                <div className={styles.itemMeta}>
                                    <span>{p.task_count} tasks</span>
                                    <span className={styles.itemId}>{p.plan_id}</span>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Right: detail / create */}
            <div className={styles.main}>
                {error && <div className={styles.error} role="alert">{error}</div>}

                {mode === 'create' ? (
                    <PlanCreateForm onCreated={handleCreated} />
                ) : selected ? (
                    <PlanDetail
                        plan={selected}
                        onSubmit={handleSubmit}
                        onDelete={handleDelete}
                        onRefresh={load}
                    />
                ) : (
                    <div className={styles.placeholder}>Select a plan or create a new one</div>
                )}
            </div>
        </div>
    )
}

// ── Plan Detail ─────────────────────────────────────────────────────────────

function PlanDetail({
    plan,
    onSubmit,
    onDelete,
    onRefresh,
}: {
    plan: StoredPlan
    onSubmit: (id: string, mode: 'execute' | 'queue') => Promise<void>
    onDelete: (id: string) => Promise<void>
    onRefresh: () => void
}) {
    const [submitting, setSubmitting] = useState(false)
    const [showTasks, setShowTasks] = useState(true)

    const tasks: TaskSpec[] = plan.content?.tasks ?? []

    return (
        <div className={styles.detail}>
            <header className={styles.detailHeader}>
                <div>
                    <h2 className={styles.detailTitle}>{plan.title || 'Untitled'}</h2>
                    <span className={styles.detailId}>{plan.plan_id}</span>
                </div>
                <StatusBadge status={plan.status} />
            </header>

            {plan.description && (
                <p className={styles.description}>{plan.description}</p>
            )}

            <WorkflowStageNotice
                planId={plan.plan_id}
                planVersion={plan.plan_version}
                workflowStage={plan.workflow_stage}
                stageStatus={plan.stage_status}
            />

            <div className={styles.metaGrid}>
                <MetaItem label="Version" value={`v${plan.plan_version}`} />
                {plan.revised_from != null && (
                    <MetaItem label="Revises" value={`v${plan.revised_from}`} />
                )}
                <MetaItem label="Tasks" value={String(plan.task_count)} />
                <MetaItem label="Digest" value={plan.content_digest.slice(0, 16) + '...'} mono />
                <MetaItem label="Created" value={formatDate(plan.created_at)} />
                <MetaItem label="Updated" value={formatDate(plan.updated_at)} />
            </div>

            {/* Actions */}
            <div className={styles.actions}>
                {plan.status === 'draft' && (
                    <>
                        <button
                            className={styles.submitBtn}
                            disabled={submitting}
                            onClick={async () => { setSubmitting(true); await onSubmit(plan.plan_id, 'execute'); setSubmitting(false) }}
                        >
                            Submit & Execute
                        </button>
                        <button
                            className={styles.queueBtn}
                            disabled={submitting}
                            onClick={async () => { setSubmitting(true); await onSubmit(plan.plan_id, 'queue'); setSubmitting(false) }}
                        >
                            Queue Only
                        </button>
                        <button
                            className={styles.deleteBtn}
                            onClick={() => onDelete(plan.plan_id)}
                        >
                            Delete
                        </button>
                    </>
                )}
                <button className={styles.refreshBtn} onClick={onRefresh}>Refresh</button>
            </div>

            {/* Task list */}
            {tasks.length > 0 && (
                <div className={styles.tasksSection}>
                    <button
                        className={styles.tasksToggle}
                        onClick={() => setShowTasks(!showTasks)}
                    >
                        {showTasks ? '▾' : '▸'} Tasks ({tasks.length})
                    </button>
                    {showTasks && (
                        <ul className={styles.taskList}>
                            {tasks.map(t => (
                                <li key={t.task_id} className={styles.taskItem}>
                                    <div className={styles.taskHeader}>
                                        <span className={styles.taskId}>{t.task_id}</span>
                                        {t.dependencies && t.dependencies.length > 0 && (
                                            <span className={styles.taskDeps}>
                                                depends: {t.dependencies.join(', ')}
                                            </span>
                                        )}
                                    </div>
                                    <div className={styles.taskTitle}>{t.title}</div>
                                    {t.description && (
                                        <div className={styles.taskDesc}>{t.description}</div>
                                    )}
                                    {t.write_paths && t.write_paths.length > 0 && (
                                        <div className={styles.taskPaths}>
                                            write: {t.write_paths.join(', ')}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Plan Create Form ────────────────────────────────────────────────────────

function PlanCreateForm({onCreated}: {onCreated: (plan: StoredPlan) => void}) {
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [tasksJson, setTasksJson] = useState('[\n  {\n    "task_id": "task-1",\n    "title": "First task",\n    "tests": ["echo ok"]\n  }\n]')
    const [error, setError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    const handleCreate = async () => {
        setError(null)
        if (!title.trim()) { setError('Title is required'); return }

        let tasks: TaskSpec[]
        try {
            tasks = JSON.parse(tasksJson)
            if (!Array.isArray(tasks)) throw new Error('Tasks must be an array')
        } catch (e) {
            setError(`Invalid tasks JSON: ${e instanceof Error ? e.message : 'parse error'}`)
            return
        }

        const plan: PlanContent = {
            plan_id: '',
            plan_version: 1,
            title: title.trim(),
            description: description.trim(),
            tasks,
        }

        setSubmitting(true)
        try {
            const stored = await plansApi.create(plan)
            onCreated(stored)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Create failed')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className={styles.createForm}>
            <h2>Create Plan</h2>

            {error && <div className={styles.error} role="alert">{error}</div>}

            <label className={styles.label}>Title</label>
            <input
                className={styles.input}
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Plan title"
            />

            <label className={styles.label}>Description</label>
            <textarea
                className={styles.textarea}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What does this plan do?"
                rows={3}
            />

            <label className={styles.label}>Tasks (JSON array)</label>
            <textarea
                className={`${styles.textarea} ${styles.mono}`}
                value={tasksJson}
                onChange={e => setTasksJson(e.target.value)}
                rows={12}
                spellCheck={false}
            />

            <button
                className={styles.submitBtn}
                disabled={submitting}
                onClick={handleCreate}
            >
                {submitting ? 'Creating...' : 'Create Plan'}
            </button>
        </div>
    )
}

// ── Workflow Stage Notice ──────────────────────────────────────────────────

const STAGE_LABELS: Record<WorkflowStage, string> = {
    '': '',
    general_plan: 'General Plan',
    gap_analysis: 'Gap Analysis',
    gap_fix: 'Gap Fix',
    evaluation: 'Evaluation',
    success_criteria: 'Success Criteria',
    build_handoff: 'Build Handoff',
}

const NEXT_ACTION: Record<string, string> = {
    'not_started': 'Start stage',
    'in_progress': 'Continue work',
    'ready': 'Stage ready for next step',
    'completed': 'Stage complete',
    'skipped': 'Skipped',
    'needs_review': 'Review required',
    'blocked': 'Unblock to proceed',
}

function WorkflowStageNotice({
    planId,
    planVersion,
    workflowStage,
    stageStatus,
}: {
    planId: string
    planVersion: number
    workflowStage: WorkflowStage
    stageStatus: StageStatus
}) {
    // Safe fallback: no stage data available
    if (!workflowStage) {
        return (
            <div className={styles.stageNotice}>
                <span className={styles.stageId}>{planId}</span>
                <span className={styles.stageVersion}>v{planVersion}</span>
                <span className={styles.stageEmpty}>No workflow stage assigned</span>
            </div>
        )
    }

    return (
        <div className={styles.stageNotice}>
            <span className={styles.stageId}>{planId}</span>
            <span className={styles.stageVersion}>v{planVersion}</span>
            <span className={styles.stageLabel}>
                Current stage: <strong>{STAGE_LABELS[workflowStage] ?? workflowStage}</strong>
            </span>
            <span className={styles.stageStatus}>{NEXT_ACTION[stageStatus] ?? stageStatus}</span>
        </div>
    )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({status}: {status: PlanStatus}) {
    return (
        <span className={styles.badge} style={{background: STATUS_COLORS[status]}}>
            {status}
        </span>
    )
}

function MetaItem({label, value, mono}: {label: string; value: string; mono?: boolean}) {
    return (
        <div className={styles.metaItem}>
            <span className={styles.metaLabel}>{label}</span>
            <span className={mono ? styles.mono : ''}>{value}</span>
        </div>
    )
}

function formatDate(iso: string): string {
    if (!iso) return ''
    return new Date(iso).toLocaleString()
}
