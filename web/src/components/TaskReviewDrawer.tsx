/**
 * TaskReviewDrawer — header dropdown for at-a-glance task review.
 * Compact chevron trigger sits next to connection status; opens a
 * right-aligned dropdown panel with objective, status, runner, activity,
 * and the persistent canonical runtime trace.
 */

import {useRef, useEffect, useSyncExternalStore} from 'react'
import {ChevronDown} from 'lucide-react'
import type {TaskState} from '../agent/types'
import {workflowTraceStore} from '../agent/workflowTrace'
import {ParticipantHeader} from './ParticipantHeader'
import {WorkflowTracePanel} from './WorkflowTracePanel'
import styles from './TaskReviewDrawer.module.css'

interface TaskReviewDrawerProps {
    open: boolean
    task: TaskState
    runnerMode: string
    onToggle: () => void
    onCancel: () => void
}

const STATUS_DOT: Record<string, string> = {
    running: styles.dotRunning,
    queued: styles.dotQueued,
    completed: styles.dotCompleted,
    failed: styles.dotFailed,
}

export function TaskReviewDrawer({open, task, runnerMode, onToggle, onCancel}: TaskReviewDrawerProps) {
    const ref = useRef<HTMLDivElement>(null)
    const trace = useSyncExternalStore(
        workflowTraceStore.subscribe,
        workflowTraceStore.getSnapshot,
        workflowTraceStore.getSnapshot,
    )
    const hasTask = task.taskId !== null || trace.length > 0
    const isRunning = task.status === 'running' || task.status === 'queued'
    const dotClass = STATUS_DOT[task.status] ?? styles.dotIdle

    useEffect(() => {
        if (!open) return
        const onMouse = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onToggle()
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onToggle()
        }
        document.addEventListener('mousedown', onMouse)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onMouse)
            document.removeEventListener('keydown', onKey)
        }
    }, [open, onToggle])

    return (
        <div className={styles.dropdown} ref={ref}>
            <button
                className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
                onClick={onToggle}
                aria-expanded={open}
                aria-haspopup="true"
                aria-label="Task review"
            >
                <ChevronDown size={14}/>
            </button>

            {open && (
                <div className={styles.panel} role="menu">
                    <div className={styles.panelHeader}>
                        <span className={styles.panelTitle}>Task Review</span>
                    </div>

                    {hasTask ? (
                        <div className={styles.panelBody}>
                            {task.taskId && (
                                <>
                                    <ParticipantHeader
                                        participantId={task.activeParticipantId}
                                        status={task.activeActivity?.status ?? 'idle'}
                                        summary={task.activeActivity?.summary ?? ''}
                                    />
                                    <div className={styles.field}>
                                        <span className={styles.label}>Objective</span>
                                        <p className={styles.objective}>{task.objective}</p>
                                    </div>

                                    <div className={styles.divider}/>

                                    <div className={styles.metaGrid}>
                                        <div className={styles.metaItem}>
                                            <span className={styles.label}>Status</span>
                                            <span className={styles.statusValue}>
                                                <span className={`${styles.dot} ${dotClass}`}/>
                                                {task.status}
                                            </span>
                                        </div>
                                        <div className={styles.metaItem}>
                                            <span className={styles.label}>Runner</span>
                                            <span className={styles.value}>{runnerMode}</span>
                                        </div>
                                    </div>

                                    {task.activeActivity && (
                                        <>
                                            <div className={styles.divider}/>
                                            <div className={styles.field}>
                                                <span className={styles.label}>Activity</span>
                                                <p className={styles.activity}>{task.activeActivity.summary}</p>
                                            </div>
                                        </>
                                    )}
                                </>
                            )}

                            <WorkflowTracePanel/>

                            {isRunning && (
                                <div className={styles.panelFooter}>
                                    <button className={styles.cancelBtn} onClick={onCancel}>
                                        Cancel task
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className={styles.empty}>
                            <span className={styles.emptyTitle}>No active task</span>
                            <span className={styles.emptyHint}>Send a message to start one</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
