/**
 * WorkflowOutline — contextual workflow steps for the Outline panel.
 *
 * Shows where the user is in the current workflow.
 * Plan Review mode: plan sections (Plan, Source, Requirements, etc.)
 * Build mode: execution stages (Plan → Review → Build Handoff → ... → Completed)
 *
 * The active step is derived from real state where available.
 */

import {useAppStore} from '../store/taskStore'
import type {TaskStatus} from '../agent/types'
import styles from './WorkflowOutline.module.css'

interface WorkflowStep {
    id: string
    label: string
}

const PLAN_REVIEW_STEPS: WorkflowStep[] = [
    {id: 'plan', label: 'Plan'},
    {id: 'source', label: 'Source / Context'},
    {id: 'requirements', label: 'Requirements'},
    {id: 'gap-analysis', label: 'Gap Analysis'},
    {id: 'tasks', label: 'Tasks'},
    {id: 'dependencies', label: 'Dependencies'},
    {id: 'build-handoff', label: 'Build Handoff'},
    {id: 'evidence', label: 'Evidence'},
]

const BUILD_STEPS: WorkflowStep[] = [
    {id: 'plan', label: 'Plan'},
    {id: 'review', label: 'Review'},
    {id: 'build-handoff', label: 'Build Handoff'},
    {id: 'submitted', label: 'Submitted'},
    {id: 'queued', label: 'Queued'},
    {id: 'executing', label: 'Executing'},
    {id: 'verification', label: 'Verification'},
    {id: 'completed', label: 'Completed'},
]

/** Derive the active build step from real task/queue state. */
function deriveActiveBuildStep(taskStatus: TaskStatus, hasBuildId: boolean): string {
    if (!hasBuildId) return 'plan'
    switch (taskStatus) {
        case 'idle':
            return 'submitted'
        case 'queued':
            return 'queued'
        case 'running':
            return 'executing'
        case 'completed':
            return 'completed'
        case 'failed':
            return 'verification'
        case 'cancelled':
            return 'verification'
        default:
            return 'executing'
    }
}

export function WorkflowOutline() {
    const explorerMode = useAppStore((s) => s.explorerMode)
    const activePlanId = useAppStore((s) => s.activePlanId)
    const activeBuildId = useAppStore((s) => s.activeBuildId)
    const taskStatus = useAppStore((s) => s.task.status)

    if (explorerMode === 'code') {
        return null // Code mode uses the existing document outline
    }

    const steps = explorerMode === 'plan-review' ? PLAN_REVIEW_STEPS : BUILD_STEPS
    const activeStep = explorerMode === 'plan-review'
        ? (activePlanId ? 'plan' : 'plan')
        : deriveActiveBuildStep(taskStatus, !!activeBuildId)

    return (
        <div className={styles.container}>
            <div className={styles.title}>Workflow</div>
            {steps.map((step) => {
                const isActive = step.id === activeStep
                return (
                    <div
                        key={step.id}
                        className={`${styles.item} ${isActive ? styles.active : ''}`}
                    >
                        <span className={styles.dot} aria-hidden="true"/>
                        <span className={styles.label}>{step.label}</span>
                        {isActive && <span className={styles.indicator}/>}
                    </div>
                )
            })}
        </div>
    )
}
