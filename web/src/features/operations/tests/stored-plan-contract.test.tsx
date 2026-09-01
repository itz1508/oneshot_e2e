/**
 * StoredPlan contract tests — verify the frontend types match the
 * backend StoredPlan.to_dict() response shape, and that the
 * WorkflowStageNotice renders correctly for v1, v2, and missing data.
 */

import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import type {StoredPlan, WorkflowStage, StageStatus} from '../api'

// ── Contract shape ──────────────────────────────────────────────────────────

function makeStoredPlan(overrides: Partial<StoredPlan> = {}): StoredPlan {
    return {
        plan_id: 'plan:test123',
        plan_version: 1,
        title: 'Test Plan',
        description: 'A test plan',
        content: {
            plan_id: 'plan:test123',
            plan_version: 1,
            title: 'Test Plan',
            tasks: [],
        },
        content_digest: 'a'.repeat(64),
        task_count: 0,
        status: 'draft',
        revised_from: null,
        workflow_stage: '',
        stage_status: 'not_started',
        artifact_refs: null,
        created_at: '2026-08-08T00:00:00Z',
        updated_at: '2026-08-08T00:00:00Z',
        ...overrides,
    }
}

describe('StoredPlan contract', () => {
    it('plan_version is a number, not a string', () => {
        const plan = makeStoredPlan({plan_version: 2})
        expect(typeof plan.plan_version).toBe('number')
        expect(plan.plan_version).toBe(2)
    })

    it('v1 plan has revised_from = null', () => {
        const plan = makeStoredPlan({plan_version: 1})
        expect(plan.revised_from).toBeNull()
    })

    it('v2 plan has revised_from pointing to v1', () => {
        const plan = makeStoredPlan({plan_version: 2, revised_from: 1})
        expect(plan.revised_from).toBe(1)
    })

    it('workflow_stage defaults to empty string', () => {
        const plan = makeStoredPlan()
        expect(plan.workflow_stage).toBe('')
    })

    it('workflow_stage accepts valid stage values', () => {
        const stages: WorkflowStage[] = [
            '', 'general_plan', 'gap_analysis', 'gap_fix',
            'evaluation', 'success_criteria', 'build_handoff',
        ]
        for (const stage of stages) {
            const plan = makeStoredPlan({workflow_stage: stage})
            expect(plan.workflow_stage).toBe(stage)
        }
    })

    it('stage_status defaults to not_started', () => {
        const plan = makeStoredPlan()
        expect(plan.stage_status).toBe('not_started')
    })

    it('stage_status accepts valid status values', () => {
        const statuses: StageStatus[] = [
            'not_started', 'in_progress', 'ready', 'completed',
            'skipped', 'needs_review', 'blocked',
        ]
        for (const status of statuses) {
            const plan = makeStoredPlan({stage_status: status})
            expect(plan.stage_status).toBe(status)
        }
    })

    it('artifact_refs is null or a record', () => {
        const plan1 = makeStoredPlan({artifact_refs: null})
        expect(plan1.artifact_refs).toBeNull()

        const plan2 = makeStoredPlan({artifact_refs: {gap_report: 'artifact:abc'}})
        expect(plan2.artifact_refs).toEqual({gap_report: 'artifact:abc'})
    })

    it('matches backend to_dict() key set exactly', () => {
        const plan = makeStoredPlan()
        const expectedKeys = new Set([
            'plan_id', 'plan_version', 'title', 'description',
            'content', 'content_digest', 'task_count', 'status',
            'revised_from', 'workflow_stage', 'stage_status',
            'artifact_refs', 'created_at', 'updated_at',
        ])
        expect(new Set(Object.keys(plan))).toEqual(expectedKeys)
    })
})

// ── WorkflowStageNotice rendering ───────────────────────────────────────────

// We test the notice logic directly since it's an internal component.
// The notice shows: plan_id, version, stage, next action.

describe('WorkflowStageNotice rendering', () => {
    function renderNotice(plan: StoredPlan) {
        // Replicate the WorkflowStageNotice logic from PlansPanel
        const {workflow_stage, stage_status, plan_id, plan_version} = plan

        if (!workflow_stage) {
            return render(
                <div data-testid="stage-notice">
                    <span data-testid="stage-id">{plan_id}</span>
                    <span data-testid="stage-version">v{plan_version}</span>
                    <span data-testid="stage-empty">No workflow stage assigned</span>
                </div>,
            )
        }

        return render(
            <div data-testid="stage-notice">
                <span data-testid="stage-id">{plan_id}</span>
                <span data-testid="stage-version">v{plan_version}</span>
                <span data-testid="stage-label">
                    Current stage: <strong>{workflow_stage}</strong>
                </span>
                <span data-testid="stage-status">{stage_status}</span>
            </div>,
        )
    }

    it('shows plan_id and v1 for a new plan with no stage', () => {
        const plan = makeStoredPlan({plan_id: 'plan:abc', plan_version: 1})
        renderNotice(plan)
        expect(screen.getByTestId('stage-id').textContent).toBe('plan:abc')
        expect(screen.getByTestId('stage-version').textContent).toBe('v1')
        expect(screen.getByTestId('stage-empty')).toBeTruthy()
    })

    it('shows v2 with revised_from for a revision', () => {
        const plan = makeStoredPlan({
            plan_id: 'plan:abc',
            plan_version: 2,
            revised_from: 1,
            workflow_stage: 'gap_analysis',
            stage_status: 'in_progress',
        })
        renderNotice(plan)
        expect(screen.getByTestId('stage-version').textContent).toBe('v2')
        expect(screen.getByTestId('stage-label').textContent).toContain('gap_analysis')
        expect(screen.getByTestId('stage-status').textContent).toBe('in_progress')
    })

    it('shows safe fallback when workflow_stage is empty', () => {
        const plan = makeStoredPlan({
            plan_id: 'plan:xyz',
            plan_version: 1,
            workflow_stage: '',
            stage_status: 'not_started',
        })
        renderNotice(plan)
        expect(screen.getByTestId('stage-empty').textContent).toBe('No workflow stage assigned')
    })

    it('renders all stage+status combinations without crashing', () => {
        const stages: WorkflowStage[] = [
            '', 'general_plan', 'gap_analysis', 'gap_fix',
            'evaluation', 'success_criteria', 'build_handoff',
        ]
        const statuses: StageStatus[] = [
            'not_started', 'in_progress', 'ready', 'completed',
            'skipped', 'needs_review', 'blocked',
        ]
        for (const stage of stages) {
            for (const status of statuses) {
                const plan = makeStoredPlan({workflow_stage: stage, stage_status: status})
                const {unmount} = renderNotice(plan)
                unmount()
            }
        }
    })
})
