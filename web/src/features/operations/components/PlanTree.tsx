/**
 * PlanTree — sidebar tree for Plan Review mode.
 *
 * Shows stored plans with status dots and expandable task lists.
 * Clicking a plan sets activePlanId and shows detail in main workspace.
 * Read-only — no create, edit, or delete controls.
 *
 * Data source: plansApi (backend plan_store contract).
 */

import {useCallback, useEffect, useState} from 'react'
import {ChevronRight, FileText, ListTodo} from 'lucide-react'
import {plansApi, type StoredPlan, type PlanStatus} from '../api'
import {useAppStore} from '../../../store/taskStore'
import styles from './PlanTree.module.css'

const STATUS_CLASS: Record<PlanStatus, string> = {
    draft: styles.statusDraft,
    submitted: styles.statusSubmitted,
    executing: styles.statusExecuting,
    completed: styles.statusCompleted,
    failed: styles.statusFailed,
    cancelled: styles.statusCancelled,
}

export function PlanTree() {
    const [plans, setPlans] = useState<StoredPlan[]>([])
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const activePlanId = useAppStore((s) => s.activePlanId)
    const setActivePlan = useAppStore((s) => s.setActivePlan)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await plansApi.list()
            setPlans(res.plans)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load plans')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const toggleExpand = (planId: string) => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(planId)) next.delete(planId)
            else next.add(planId)
            return next
        })
    }

    const handleSelectPlan = (planId: string) => {
        setActivePlan(planId)
    }

    if (loading) {
        return <div className={styles.status}>Loading plans...</div>
    }

    if (error) {
        return <div className={styles.error}>{error}</div>
    }

    if (plans.length === 0) {
        return (
            <div className={styles.empty}>
                <FileText className={styles.emptyIcon} size={16}/>
                <span>No plans available</span>
                <span className={styles.emptyHint}>Plans come from the planning workflow</span>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            {plans.map((plan) => {
                const isExpanded = expanded.has(plan.plan_id)
                const isActive = activePlanId === plan.plan_id
                const tasks = plan.content?.tasks ?? []

                return (
                    <div key={plan.plan_id} className={styles.planGroup}>
                        <div
                            className={`${styles.planRow} ${isActive ? styles.planRowActive : ''}`}
                            onClick={() => {
                                handleSelectPlan(plan.plan_id)
                                toggleExpand(plan.plan_id)
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    handleSelectPlan(plan.plan_id)
                                    toggleExpand(plan.plan_id)
                                }
                            }}
                            role="button"
                            tabIndex={0}
                        >
                            <ChevronRight
                                size={12}
                                className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`}
                            />
                            <span
                                className={`${styles.statusDot} ${STATUS_CLASS[plan.status]}`}
                            />
                            <span className={styles.planTitle}>{plan.title}</span>
                            <span className={styles.taskCount}>{plan.task_count}</span>
                        </div>

                        {isExpanded && tasks.length > 0 && (
                            <div className={styles.taskList}>
                                {tasks.map((task) => (
                                    <div key={task.task_id} className={styles.taskRow}>
                                        <ListTodo size={11} className={styles.taskIcon}/>
                                        <span className={styles.taskTitle}>{task.title}</span>
                                        <span className={styles.taskId}>{task.task_id}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
