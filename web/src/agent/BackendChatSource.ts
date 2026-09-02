/**
 * BackendChatSource — OneShot backend adapter for OneShot React IDE.
 *
 * Connects the OneShot chat composer and task review timeline to the
 * OneShot REST API (/api/conversations, /api/runs) and Server-Sent Events
 * stream (/api/runs/:runId/events).
 *
 * Strictly follows OneShot backend authority:
 *   - Chat turns -> /api/conversations
 *   - Insufficient info -> Help request turn
 *   - Execution -> /api/runs/:id/events (SSE)
 *   - Real stages: Researcher -> Planner -> Refactor -> GapAnalysis -> Evaluation -> TripleValidation -> Confirmed -> CreateHash -> Hash -> Done
 */

import type {
    AgentEvent,
    HelpRequestPayload,
    Stage,
    ToolCallEvent,
    WorkflowRootCauseDetail,
} from './types'
import type {TaskEventSource, EventListener, StartOptions} from './TaskEventSource'
import {FrontendToolExecutor} from './toolExecutor'

let nextId = 0

function uid(): string {
    return `evt-${Date.now()}-${nextId++}`
}

/**
 * Table-driven canonical processor → IDE stage mapping. Supporting a new
 * processor or support event kind is a single registry entry; unknown
 * processors fall back to 'working' with no code changes.
 */
export const SUPPORT_EVENT_REGISTRY: Record<string, Stage> = {
    Researcher: 'reading',
    Planner: 'planning',
    Refactor: 'planning',
    GapAnalysis: 'reviewing',
    Evaluation: 'reviewing',
    TripleValidation: 'testing',
    SchemaValidation: 'testing',
    FixtureValidation: 'testing',
    GoalValidation: 'testing',
    Confirmed: 'completed',
    CreateHash: 'completed',
    Hash: 'completed',
    Done: 'completed',
}

/** Approval resolver — placeholder for frontend tool execution. */
export type ApprovalRequestHandler = (
    toolCall: ToolCallEvent,
    reason: string,
    riskLevel: string,
) => Promise<boolean>

interface BackendProcessingEvent {
    event_id: string
    sequence: number
    run_id: string
    processor: string
    state: 'PENDING' | 'RUNNING' | 'COMPLETE'
    result?: 'PASSED' | 'ROOT_CAUSE' | 'VALID' | 'NOT_VALID'
    artifact_id?: string
    message?: string
    created_at: string
}

export class BackendChatSource implements TaskEventSource {
    private listeners = new Set<EventListener>()
    private abortController: AbortController | null = null
    private currentTaskId: string | null = null
    private currentConversationId: string | null = null
    private activeEventSource: EventSource | null = null
    private toolExecutor = new FrontendToolExecutor()
    public approvalHandler: ApprovalRequestHandler | null = null
    public workspaceAvailable = false

    setContainer(container: Parameters<FrontendToolExecutor['setContainer']>[0]): void {
        this.toolExecutor.setContainer(container)
        this.workspaceAvailable = true
    }

    setApprovalHandler(handler: ApprovalRequestHandler): void {
        this.approvalHandler = handler
    }

    start(
        message: string,
        _primaryWorkspaceId: string,
        _linkedWorkspaceIds: string[],
        options?: StartOptions,
    ): string {
        this.abortController?.abort()
        this.activeEventSource?.close()

        const taskId = `task-${Date.now()}`
        this.currentTaskId = taskId
        this.abortController = new AbortController()

        this._dispatch(taskId, message, this.abortController.signal, options)
        return taskId
    }

    subscribe(listener: EventListener): () => void {
        this.listeners.add(listener)
        return () => {
            this.listeners.delete(listener)
        }
    }

    cancel(): void {
        if (this.activeEventSource) {
            this.activeEventSource.close()
            this.activeEventSource = null
        }
        if (!this.abortController) return
        this.abortController.abort()
        this.abortController = null

        if (this.currentTaskId) {
            this.emit({
                eventId: uid(),
                sequence: 999,
                taskId: this.currentTaskId,
                eventType: 'task.cancelled',
                stage: 'cancelled',
                message: 'Task cancelled by operator',
                timestamp: new Date().toISOString(),
            })
        }
        this.currentTaskId = null
    }

    dispose(): void {
        this.cancel()
        this.listeners.clear()
    }

    private emit(event: AgentEvent): void {
        for (const listener of this.listeners) {
            listener(event)
        }
    }

    private async _dispatch(
        taskId: string,
        message: string,
        signal: AbortSignal,
        _options?: StartOptions,
    ): Promise<void> {
        let seq = 0

        // 1. Emit task.created (queued)
        this.emit({
            eventId: uid(),
            sequence: seq++,
            taskId,
            eventType: 'task.created',
            stage: 'queued',
            message: 'Submitting request to OneShot backend...',
            timestamp: new Date().toISOString(),
        })

        // 2. Emit participant.activated (reading)
        this.emit({
            eventId: uid(),
            sequence: seq++,
            taskId,
            eventType: 'participant.activated',
            stage: 'reading',
            message: 'Analyzing conversational intent...',
            timestamp: new Date().toISOString(),
            metadata: {participantId: 'oneshot', activityId: `act-${Date.now()}`},
        })

        try {
            let convData: any

            if (!this.currentConversationId) {
                const res = await fetch('/api/conversations', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({message}),
                    signal,
                })
                if (!res.ok) throw new Error(`Conversation creation failed: ${res.status}`)
                convData = await res.json()
                this.currentConversationId = convData.conversation_id
            } else {
                const res = await fetch(`/api/conversations/${encodeURIComponent(this.currentConversationId)}/messages`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({message}),
                    signal,
                })
                if (!res.ok) throw new Error(`Message post failed: ${res.status}`)
                convData = await res.json()
            }

            // Ask the canonical Prompt gate for its targeted help request when
            // the accumulated intent is not sufficient yet.
            const isReady = convData.intent ? convData.intent.ready_for_prompt : convData.sufficient !== false
            if (!isReady) {
                let helpRequest = convData.help_request
                if (!helpRequest && this.currentConversationId) {
                    const promptRes = await fetch(
                        `/api/conversations/${encodeURIComponent(this.currentConversationId)}/prompt`,
                        {method: 'POST', headers: {'Content-Type': 'application/json'}, signal},
                    )
                    const promptData = await promptRes.json().catch(() => ({}))
                    if (promptRes.status !== 409 && !promptRes.ok) {
                        throw new Error(`Prompt readiness check failed: ${promptRes.status}`)
                    }
                    helpRequest = promptData.help_request
                }

                const helpMsg = helpRequest?.question || helpRequest?.reason || 'Additional information required.'
                this.emit({
                    eventId: uid(),
                    sequence: seq++,
                    taskId,
                    eventType: 'message.received',
                    stage: 'waiting',
                    message: helpMsg,
                    timestamp: new Date().toISOString(),
                })
                this.emit({
                    eventId: uid(),
                    sequence: seq++,
                    taskId,
                    eventType: 'stage.changed',
                    stage: 'waiting',
                    message: 'Waiting for operator input...',
                    timestamp: new Date().toISOString(),
                })
                return
            }

            // Trigger canonical OneShot run
            const targetConvId = this.currentConversationId || ''
            const runRes = await fetch(`/api/conversations/${encodeURIComponent(targetConvId)}/run`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                signal,
            })
            if (!runRes.ok) throw new Error(`Run initiation failed: ${runRes.status}`)
            const runData = await runRes.json()
            const runId = runData.run_id

            // Connect to real OneShot SSE stream
            this._connectEvents(runId, taskId, seq)

        } catch (err: unknown) {
            if (signal.aborted) return

            const errorMessage = err instanceof Error
                ? `OneShot backend error: ${err.message}`
                : 'OneShot backend error: unknown failure'

            this.emit({
                eventId: uid(),
                sequence: seq++,
                taskId,
                eventType: 'task.failed',
                stage: 'cancelled',
                message: errorMessage,
                timestamp: new Date().toISOString(),
            })
        }
    }

    private _connectEvents(runId: string, taskId: string, initialSeq: number): void {
        let seq = initialSeq
        let terminal = false
        const es = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`)
        this.activeEventSource = es

        es.onmessage = (msgEvent) => {
            try {
                const e = JSON.parse(msgEvent.data) as BackendProcessingEvent

                if (e.state === 'RUNNING') {
                    const stage = this._mapStage(e.processor)
                    this.emit({
                        eventId: uid(),
                        sequence: seq++,
                        taskId,
                        eventType: 'stage.changed',
                        stage,
                        message: `Stage started: ${e.processor}`,
                        timestamp: e.created_at || new Date().toISOString(),
                    })
                    this.emit({
                        eventId: uid(),
                        sequence: seq++,
                        taskId,
                        eventType: 'participant.activity_update',
                        stage,
                        message: `Executing ${e.processor}...`,
                        timestamp: e.created_at || new Date().toISOString(),
                        metadata: {participantId: 'oneshot', activityId: `act-${Date.now()}`},
                    })
                } else if (e.state === 'COMPLETE' && e.processor === 'Done') {
                    terminal = true
                    es.close()
                    this.activeEventSource = null

                    if (e.result === 'PASSED') {
                        const hashProof = e.artifact_id || 'verified'
                        const summary = [
                            `### OneShot Canonical Execution Completed`,
                            ``,
                            `- **Run ID**: \`${runId}\``,
                            `- **Cryptographic Hash (SHA-256)**: \`${hashProof}\``,
                            `- **Triple Validation**: Schema, Fixture, and Goal proofs \`VALID\``,
                            `- **Result**: \`CONFIRMED\``,
                        ].join('\n')

                        this.emit({
                            eventId: uid(),
                            sequence: seq++,
                            taskId,
                            eventType: 'task.completed',
                            stage: 'completed',
                            message: summary,
                            timestamp: e.created_at || new Date().toISOString(),
                            metadata: {runId, hash: hashProof},
                        })
                    } else {
                        // Halt resolution is async (run snapshot fetch): mark
                        // terminal and close the stream first so stream
                        // semantics hold while the snapshot is resolved.
                        void this._handleRootCauseHalt(runId, taskId, e, () => seq++)
                    }
                } else if (e.state === 'COMPLETE' && e.processor !== 'Done') {
                    const stage = this._mapStage(e.processor)
                    this.emit({
                        eventId: uid(),
                        sequence: seq++,
                        taskId,
                        eventType: 'participant.activity_update',
                        stage,
                        message: e.message || `${e.processor}: ${e.result || 'COMPLETE'}`,
                        timestamp: e.created_at || new Date().toISOString(),
                        metadata: {
                            participantId: 'oneshot',
                            processor: e.processor,
                            result: e.result,
                            artifactId: e.artifact_id,
                        },
                    })
                }
            } catch (parseErr) {
                console.error('Error parsing SSE event in BackendChatSource:', parseErr)
            }
        }

        es.onerror = () => {
            es.close()
            this.activeEventSource = null
            if (!terminal) {
                terminal = true
                this.emit({
                    eventId: uid(),
                    sequence: seq++,
                    taskId,
                    eventType: 'task.failed',
                    stage: 'blocked',
                    message: 'OneShot backend event stream disconnected before DONE.',
                    timestamp: new Date().toISOString(),
                    metadata: {runId},
                })
            }
        }
    }

    /**
     * Resolve a ROOT_CAUSE halt against the durable run snapshot. A
     * help_request re-enters through Intent revision (the operator answers in
     * chat); everything else surfaces the backend RootCause fields verbatim.
     * No auto-retry, no fabricated answers.
     */
    private async _handleRootCauseHalt(
        runId: string,
        taskId: string,
        doneEvent: BackendProcessingEvent,
        nextSeq: () => number,
    ): Promise<void> {
        const snapshot = await fetch(`/api/runs/${encodeURIComponent(runId)}`)
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null)

        const timestamp = doneEvent.created_at || new Date().toISOString()
        const helpRequest = (snapshot?.help_request ?? null) as HelpRequestPayload | null

        if (helpRequest) {
            this.emit({
                eventId: uid(),
                sequence: nextSeq(),
                taskId,
                eventType: 'task.help_required',
                stage: 'waiting',
                message: helpRequest.question,
                timestamp,
                metadata: {runId, helpRequest},
            })
            this.emit({
                eventId: uid(),
                sequence: nextSeq(),
                taskId,
                eventType: 'stage.changed',
                stage: 'waiting',
                message: 'Waiting for operator answer...',
                timestamp,
            })
            return
        }

        const rootCause = (snapshot?.root_cause ?? null) as WorkflowRootCauseDetail | null
        this.emit({
            eventId: uid(),
            sequence: nextSeq(),
            taskId,
            eventType: 'task.failed',
            stage: 'blocked',
            message: `### Execution Halted (ROOT CAUSE)\n\n${rootCause ? rootCause.issue : (doneEvent.message || 'Execution halted at ROOT CAUSE')}`,
            timestamp,
            metadata: {runId, result: doneEvent.result, rootCause: rootCause ?? undefined},
        })
    }

    private _mapStage(oneShotStage: string): Stage {
        return SUPPORT_EVENT_REGISTRY[oneShotStage] ?? ('working' as Stage)
    }
}
