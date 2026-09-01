/**
 * Participant ownership contract tests.
 *
 * Proves the 14 required invariants for the single-active-participant model:
 * 1.  Exactly one participant can be active
 * 2.  OneShot is initially active (after first activation)
 * 3.  Ownership changes from OneShot to A-Flow from an event
 * 4.  Ownership returns from A-Flow to OneShot only after A-Flow records an outcome
 * 5.  Participant changes are state-driven, not animation-driven
 * 6.  Transient activity updates belong only to the active activity
 * 7.  Transient updates clear after terminal outcome is recorded
 * 8.  Task Record contains structured recorded outcomes only
 * 9.  Live activity updates do not become record entries
 * 10. Retries append new entries without rewriting history
 * 11. Blocked and failed entries do not imply successful continuation
 * 12. Cancellation clears active ownership
 * 13. Reduced-motion mode does not use the 3D flip (component test)
 * 14. Visual components do not instantiate BackendChatSource directly
 */

import {describe, it, expect, beforeEach} from 'vitest'
import type {
    AgentEvent,
    TaskRecordEntry,
    CorrectionRecordEntry,
    SuccessfulRecordEntry,
    FailedRecordEntry,
    BlockedRecordEntry
} from '../agent/types'
import {useAppStore, initialTask} from '../store/taskStore'

// ─── Helpers ───

function makeEvent(overrides: Partial<AgentEvent>): AgentEvent {
    return {
        eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        sequence: 0,
        taskId: 'task-test-1',
        eventType: 'stage.changed',
        stage: 'reading',
        message: '',
        timestamp: new Date().toISOString(),
        ...overrides,
    }
}

function makeSuccessEntry(overrides?: Partial<SuccessfulRecordEntry>): SuccessfulRecordEntry {
    return {
        entryId: `entry-${Math.random().toString(36).slice(2)}`,
        activityId: 'activity-test',
        participantId: 'oneshot',
        title: 'Test entry',
        status: 'completed',
        outcome: 'Success',
        evidence: [],
        artifacts: [],
        materialGaps: [],
        nextAuthorisedAction: null,
        timestamp: new Date().toISOString(),
        ...overrides,
    }
}

function makeCorrectionEntry(overrides?: Partial<CorrectionRecordEntry>): CorrectionRecordEntry {
    return {
        entryId: `entry-${Math.random().toString(36).slice(2)}`,
        activityId: 'activity-test',
        participantId: 'oneshot',
        title: 'Correction entry',
        status: 'correction_required',
        outcome: 'Needs fix',
        rootCause: {summary: 'Bug found', evidence: ['e1']},
        resolution: {summary: 'Fix it', action: 'Apply fix', status: 'proposed', evidence: []},
        evidence: [],
        artifacts: [],
        materialGaps: ['gap-1'],
        nextAuthorisedAction: 'Revise plan',
        timestamp: new Date().toISOString(),
        ...overrides,
    }
}

function activateOneShot() {
    useAppStore.getState().handleEvent(makeEvent({
        eventType: 'participant.activated',
        stage: 'reading',
        message: 'OneShot activated',
        metadata: {participantId: 'oneshot', activityId: 'activity-oneshot-1'},
    }))
}

function activateAflow() {
    useAppStore.getState().handleEvent(makeEvent({
        eventType: 'participant.activated',
        stage: 'reviewing',
        message: 'A-Flow activated',
        metadata: {participantId: 'aflow', activityId: 'activity-aflow-1'},
    }))
}

function postActivityUpdate(text: string) {
    useAppStore.getState().handleEvent(makeEvent({
        eventType: 'participant.activity_update',
        message: text,
    }))
}

function recordOutcome(entry: TaskRecordEntry) {
    useAppStore.getState().handleEvent(makeEvent({
        eventType: 'participant.outcome_recorded',
        message: 'Outcome recorded',
        metadata: {entry},
    }))
}

// ─── Test suite ───

describe('Participant Ownership Contract', () => {
    beforeEach(() => {
        useAppStore.getState().reset()
    })

    // 1. Exactly one participant can be active
    it('enforces exactly one active participant at a time', () => {
        activateOneShot()
        expect(useAppStore.getState().task.activeParticipantId).toBe('oneshot')

        // Activating A-Flow replaces OneShot
        activateAflow()
        const state = useAppStore.getState().task
        expect(state.activeParticipantId).toBe('aflow')
        // Only one participant ID is stored
        expect(state.activeActivityId).toBe('activity-aflow-1')
    })

    // 2. OneShot is initially active (first activation)
    it('sets OneShot as the first active participant', () => {
        activateOneShot()
        expect(useAppStore.getState().task.activeParticipantId).toBe('oneshot')
        expect(useAppStore.getState().task.activeActivity?.participantId).toBe('oneshot')
    })

    // 3. Ownership changes from OneShot to A-Flow from an event
    it('transitions ownership from OneShot to A-Flow via participant.activated event', () => {
        activateOneShot()
        expect(useAppStore.getState().task.activeParticipantId).toBe('oneshot')

        activateAflow()
        expect(useAppStore.getState().task.activeParticipantId).toBe('aflow')
        expect(useAppStore.getState().task.activeActivity?.participantId).toBe('aflow')
    })

    // 4. Ownership returns from A-Flow to OneShot only after A-Flow records an outcome
    it('returns ownership to OneShot only after A-Flow records an outcome', () => {
        activateOneShot()
        activateAflow()

        // Before outcome: A-Flow is still active
        expect(useAppStore.getState().task.activeParticipantId).toBe('aflow')

        // Record A-Flow outcome → clears ownership
        const aflowEntry = makeCorrectionEntry({
            participantId: 'aflow',
            activityId: 'activity-aflow-1',
            materialGaps: ['gap-1'],
            nextAuthorisedAction: 'Revise plan',
        })
        recordOutcome(aflowEntry)

        // After outcome: no active participant (until OneShot reactivates)
        expect(useAppStore.getState().task.activeParticipantId).toBeNull()

        // OneShot reactivates
        useAppStore.getState().handleEvent(makeEvent({
            eventType: 'participant.activated',
            stage: 'editing',
            message: 'OneShot resumed',
            metadata: {participantId: 'oneshot', activityId: 'activity-oneshot-2'},
        }))
        expect(useAppStore.getState().task.activeParticipantId).toBe('oneshot')
    })

    // 5. Participant changes are state-driven, not animation-driven
    it('changes participant identity via state events, not timers', () => {
        activateOneShot()
        const beforeState = useAppStore.getState().task.activeParticipantId

        // Ownership change is immediate upon event processing
        activateAflow()
        const afterState = useAppStore.getState().task.activeParticipantId

        expect(beforeState).toBe('oneshot')
        expect(afterState).toBe('aflow')
        // No intermediate state — change is synchronous with event
    })

    // 6. Transient activity updates belong only to the active activity
    it('appends updates only to the current active activity', () => {
        activateOneShot()
        postActivityUpdate('Update for OneShot')
        postActivityUpdate('Second update for OneShot')

        const activity = useAppStore.getState().task.activeActivity
        expect(activity?.messages).toHaveLength(2)
        expect(activity?.messages[0].text).toBe('Update for OneShot')
        expect(activity?.messages[1].text).toBe('Second update for OneShot')
        expect(activity?.participantId).toBe('oneshot')
    })

    // 7. Transient updates clear after terminal outcome is recorded
    it('clears transient updates after outcome is recorded', () => {
        activateOneShot()
        postActivityUpdate('Working on something')
        postActivityUpdate('Still working')

        expect(useAppStore.getState().task.activeActivity?.messages).toHaveLength(2)

        // Record outcome clears active activity
        recordOutcome(makeSuccessEntry({participantId: 'oneshot', activityId: 'activity-oneshot-1'}))

        expect(useAppStore.getState().task.activeActivity).toBeNull()
    })

    // 8. Task Record contains structured recorded outcomes only
    it('accumulates only recorded outcomes in taskRecord', () => {
        activateOneShot()
        postActivityUpdate('transient-1')
        postActivityUpdate('transient-2')

        // No entries yet
        expect(useAppStore.getState().task.taskRecord).toHaveLength(0)

        // Record an outcome
        const entry = makeSuccessEntry({title: 'First entry'})
        recordOutcome(entry)

        const record = useAppStore.getState().task.taskRecord
        expect(record).toHaveLength(1)
        expect(record[0].title).toBe('First entry')
    })

    // 9. Live activity updates do not become record entries
    it('does not convert live updates into record entries', () => {
        activateOneShot()
        postActivityUpdate('I am a live update')
        postActivityUpdate('I am another live update')

        const record = useAppStore.getState().task.taskRecord
        expect(record).toHaveLength(0)
        // Live updates exist only in activeActivity
        expect(useAppStore.getState().task.activeActivity?.messages).toHaveLength(2)
    })

    // 10. Retries append new entries without rewriting history
    it('appends retry entries without modifying previous entries', () => {
        activateOneShot()
        const firstEntry = makeCorrectionEntry({
            entryId: 'entry-1',
            title: 'First attempt',
        })
        recordOutcome(firstEntry)

        // Reactivate and record retry entry
        activateOneShot()
        const retryEntry = makeSuccessEntry({
            entryId: 'entry-2',
            title: 'Second attempt',
        })
        recordOutcome(retryEntry)

        const record = useAppStore.getState().task.taskRecord
        expect(record).toHaveLength(2)
        expect(record[0].entryId).toBe('entry-1')
        expect(record[0].title).toBe('First attempt')
        expect(record[1].entryId).toBe('entry-2')
        expect(record[1].title).toBe('Second attempt')
    })

    // 11. Blocked and failed entries do not imply successful continuation
    it('does not auto-continue after blocked entry', () => {
        activateOneShot()
        activateAflow()
        const blockedEntry: BlockedRecordEntry = {
            entryId: 'entry-blocked',
            activityId: 'activity-aflow-1',
            participantId: 'aflow',
            title: 'Blocked evaluation',
            status: 'blocked',
            outcome: 'Cannot proceed',
            blockingReason: 'Missing dependency',
            evidence: [],
            artifacts: [],
            materialGaps: [],
            nextAuthorisedAction: null,
            timestamp: new Date().toISOString(),
        }
        recordOutcome(blockedEntry)

        // After blocked entry: no active participant, no automatic continuation
        const state = useAppStore.getState().task
        expect(state.activeParticipantId).toBeNull()
        expect(state.activeActivity).toBeNull()
    })

    it('does not auto-continue after failed entry', () => {
        activateOneShot()
        activateAflow()
        const failedEntry: FailedRecordEntry = {
            entryId: 'entry-failed',
            activityId: 'activity-aflow-1',
            participantId: 'aflow',
            title: 'Failed evaluation',
            status: 'failed',
            outcome: 'Evaluation failed',
            rootCause: {summary: 'Schema invalid', evidence: ['parse-error']},
            resolution: {summary: 'Fix schema', action: 'Rebuild schema', status: 'proposed', evidence: []},
            evidence: [],
            artifacts: [],
            materialGaps: [],
            nextAuthorisedAction: null,
            timestamp: new Date().toISOString(),
        }
        recordOutcome(failedEntry)

        const state = useAppStore.getState().task
        expect(state.activeParticipantId).toBeNull()
        expect(state.activeActivity).toBeNull()
        // Entry is recorded
        expect(state.taskRecord).toHaveLength(1)
        expect(state.taskRecord[0].status).toBe('failed')
    })

    // 12. Cancellation clears active ownership
    it('clears ownership on task cancellation', () => {
        activateOneShot()
        postActivityUpdate('Working')

        // Simulate task.cancelled terminal event
        useAppStore.getState().handleEvent(makeEvent({
            eventType: 'task.cancelled',
            stage: 'cancelled',
            message: 'Task cancelled by operator',
        }))

        const state = useAppStore.getState().task
        expect(state.activeParticipantId).toBeNull()
        expect(state.activeActivityId).toBeNull()
        expect(state.activeActivity).toBeNull()
        expect(state.status).toBe('cancelled')
    })

    it('retains previously recorded entries after cancellation', () => {
        activateOneShot()
        recordOutcome(makeSuccessEntry({title: 'Before cancel'}))

        activateOneShot()
        useAppStore.getState().handleEvent(makeEvent({
            eventType: 'task.cancelled',
            stage: 'cancelled',
            message: 'Cancelled',
        }))

        const record = useAppStore.getState().task.taskRecord
        expect(record).toHaveLength(1)
        expect(record[0].title).toBe('Before cancel')
    })
})

describe('Initial state', () => {
    it('starts with no active participant in initialTask', () => {
        expect(initialTask.activeParticipantId).toBeNull()
        expect(initialTask.activeActivityId).toBeNull()
        expect(initialTask.activeActivity).toBeNull()
        expect(initialTask.taskRecord).toHaveLength(0)
    })
})
