/**
 * PlanReview — read-only plan review surface for the main workspace.
 *
 * Displays plan details: title, description, tasks, dependencies,
 * write_paths, tests, validators, success_criteria.
 *
 * The ONLY action is Build Handoff (submit) — no create, edit, or delete.
 * The existing planning workflow is responsible for producing the Plan.
 *
 * All IDs come from backend contracts. No frontend-generated identities.
 */

import {useCallback, useEffect, useState} from 'react'
import {plansApi, type StoredPlan, type PlanStatus, type TaskSpec} from '../operations/api'
import {useAppStore} from '../../store/taskStore'
import styles from './PlanReview.module.css'

interface PlanReviewProps {
    planId: string
}

const STATUS_LABELS: Record<PlanStatus, string> = {
    draft: 'Draft',
    submitted: 'Submitted',
    executing: 'Executing',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
}

const STATUS_BADGE_CLASS: Record<PlanStatus, string> = {
    draft: styles.badgeDraft,
    submitted: styles.badgeSubmitted,
    executing: styles.badgeExecuting,
    completed: styles.badgeCompleted,
    failed: styles.badgeFailed,
    cancelled: styles.badgeCancelled,
}

export function PlanReview({planId}: PlanReviewProps) {
    const [plan, setPlan] = useState<StoredPlan | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const setExplorerMode = useAppStore((s) => s.setExplorerMode)
    const setActiveBuild = useAppStore((s) => s.setActiveBuild)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await plansApi.get(planId)
            setPlan(data)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load plan')
        } finally {
            setLoading(false)
        }
    }, [planId])

    useEffect(() => { load() }, [load])

    const handleSubmit = async () => {
        if (!plan || submitting) return
        setSubmitting(true)
        try {
            const result = await plansApi.submit(plan.plan_id)
            // Build handoff: transition to Build mode with real build_id
            setActiveBuild(result.build_id)
            setExplorerMode('build')
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Submission failed')
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) {
        return <div className={styles.loading}>Loading plan...</div>
    }

    if (error && !plan) {
        return <div className={styles.error}>{error}</div>
    }

    if (!plan) {
        return <div className={styles.empty}>Plan not found</div>
    }

    const tasks: TaskSpec[] = plan.content?.tasks ?? []
    const canSubmit = plan.status === 'draft' || plan.status === 'submitted'

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerRow}>
                    <h2 className={styles.title}>{plan.title}</h2>
                    <span
                        className={`${styles.statusBadge} ${STATUS_BADGE_CLASS[plan.status]}`}
                    >
                        {STATUS_LABELS[plan.status]}
                    </span>
                </div>
                {plan.description && (
                    <p className={styles.description}>{plan.description}</p>
                )}
                <div className={styles.meta}>
                    <span className={styles.metaItem}>
                        <span className={styles.metaLabel}>plan_id</span>
                        <span className={styles.metaValue}>{plan.plan_id}</span>
                    </span>
                    <span className={styles.metaItem}>
                        <span className={styles.metaLabel}>version</span>
                        <span className={styles.metaValue}>{plan.plan_version}</span>
                    </span>
                    <span className={styles.metaItem}>
                        <span className={styles.metaLabel}>digest</span>
                        <span className={styles.metaValueMono}>{plan.content_digest.slice(0, 16)}...</span>
                    </span>
                </div>
            </div>

            {/* Tasks */}
            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Tasks ({tasks.length})</h3>
                {tasks.length === 0 ? (
                    <div className={styles.emptySection}>No tasks defined</div>
                ) : (
                    <div className={styles.taskGrid}>
                        {tasks.map((task, idx) => (
                            <div key={task.task_id} className={styles.taskCard}>
                                <div className={styles.taskHeader}>
                                    <span className={styles.taskIndex}>{idx + 1}</span>
                                    <span className={styles.taskTitle}>{task.title}</span>
                                </div>
                                <div className={styles.taskId}>{task.task_id}</div>
                                {task.description && (
                                    <p className={styles.taskDesc}>{task.description}</p>
                                )}
                                {task.dependencies && task.dependencies.length > 0 && (
                                    <div className={styles.taskField}>
                                        <span className={styles.fieldLabel}>Depends on</span>
                                        <span className={styles.fieldValue}>{task.dependencies.join(', ')}</span>
                                    </div>
                                )}
                                {task.write_paths && task.write_paths.length > 0 && (
                                    <div className={styles.taskField}>
                                        <span className={styles.fieldLabel}>Write paths</span>
                                        <span className={styles.fieldValueMono}>{task.write_paths.join(', ')}</span>
                                    </div>
                                )}
                                {task.tests && task.tests.length > 0 && (
                                    <div className={styles.taskField}>
                                        <span className={styles.fieldLabel}>Tests</span>
                                        <span className={styles.fieldValueMono}>{task.tests.join(', ')}</span>
                                    </div>
                                )}
                                {task.validators && task.validators.length > 0 && (
                                    <div className={styles.taskField}>
                                        <span className={styles.fieldLabel}>Validators</span>
                                        <span className={styles.fieldValueMono}>{task.validators.join(', ')}</span>
                                    </div>
                                )}
                                {task.success_criteria && task.success_criteria.length > 0 && (
                                    <div className={styles.taskField}>
                                        <span className={styles.fieldLabel}>Success criteria</span>
                                        <ul className={styles.criteriaList}>
                                            {task.success_criteria.map((c, i) => (
                                                <li key={i}>{c}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Build Handoff */}
            <div className={styles.handoff}>
                {error && <div className={styles.handoffError}>{error}</div>}
                <button
                    className={styles.submitBtn}
                    onClick={handleSubmit}
                    disabled={!canSubmit || submitting}
                    title={canSubmit ? 'Submit plan to Build system' : `Cannot submit: plan is ${plan.status}`}
                >
                    {submitting ? 'Submitting...' : 'Build Handoff'}
                </button>
                {!canSubmit && (
                    <span className={styles.handoffHint}>
                        Plan status is "{plan.status}" — submission not available
                    </span>
                )}
            </div>
        </div>
    )
}
