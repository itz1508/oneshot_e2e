/**
 * BackendChatSource — OneShot backend adapter for OneShot React IDE.
 *
 * Chat turns go through the canonical conversation boundary. Execution progress
 * is read only from the real run SSE stream. Terminal output is loaded from
 * persisted canonical run artifacts; the frontend never synthesizes a product
 * result or invents runtime proof values.
 */

import type {
    AgentEvent,
    Stage,
    ToolCallEvent,
} from './types'
import type {TaskEventSource, EventListener, StartOptions} from './TaskEventSource'
import {FrontendToolExecutor} from './toolExecutor'
import {workflowTraceStore} from './workflowTrace'

let nextId = 0

function uid(): string {
    return `evt-${Date.now()}-${nextId++}`
}

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
        workflowTraceStore.reset()

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
        for (const listener of this.listeners) listener(event)
    }

    private async _dispatch(
        taskId: string,
        message: string,
        signal: AbortSignal,
        _options?: StartOptions,
    ): Promise<void> {
        let seq = 0

        this.emit({
            eventId: uid(),
            sequence: seq++,
            taskId,
            eventType: 'task.created',
            stage: 'queued',
            message: 'Submitting request to OneShot backend...',
            timestamp: new Date().toISOString(),
        })

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

            const targetConvId = this.currentConversationId || ''
            const runRes = await fetch(`/api/conversations/${encodeURIComponent(targetConvId)}/run`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                signal,
            })
            if (!runRes.ok) throw new Error(`Run initiation failed: ${runRes.status}`)
            const runData = await runRes.json()
            this._connectEvents(runData.run_id, taskId, seq)
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

    private async _artifact(runId: string, name: string): Promise<any | null> {
        try {
            const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(name)}`)
            if (!response.ok) return null
            return await response.json()
        } catch {
            return null
        }
    }

    private _recordTrace(e: BackendProcessingEvent): void {
        workflowTraceStore.record({
            eventId: e.event_id,
            sequence: e.sequence,
            runId: e.run_id,
            processor: e.processor,
            state: e.state,
            result: e.result,
            artifactId: e.artifact_id,
            message: e.message,
            timestamp: e.created_at,
        })
    }

    private _connectEvents(runId: string, taskId: string, initialSeq: number): void {
        let seq = initialSeq
        let terminal = false
        const es = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`)
        this.activeEventSource = es

        es.onmessage = async (msgEvent) => {
            try {
                const e = JSON.parse(msgEvent.data) as BackendProcessingEvent
                this._recordTrace(e)

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
                        message: e.message || `Executing ${e.processor}...`,
                        timestamp: e.created_at || new Date().toISOString(),
                        metadata: {
                            participantId: 'oneshot',
                            activityId: `act-${Date.now()}`,
                            processor: e.processor,
                            result: e.result,
                            artifactId: e.artifact_id,
                        },
                    })
                } else if (e.state === 'COMPLETE' && e.processor === 'Done') {
                    terminal = true
                    es.close()
                    this.activeEventSource = null

                    if (e.result === 'PASSED') {
                        const [builderResult, hashProof, tripleValidation] = await Promise.all([
                            this._artifact(runId, 'builder-result'),
                            this._artifact(runId, 'hash-proof'),
                            this._artifact(runId, 'triple-validation'),
                        ])
                        workflowTraceStore.enrich(e.event_id, {builderResult, hashProof, tripleValidation})

                        const finalOutput = typeof builderResult?.final_output === 'string'
                            ? builderResult.final_output
                            : ''
                        const evidence = builderResult?.evidence
                        const proofLines = [
                            `run_id=${runId}`,
                            `builder_execution_id=${evidence?.execution_id ?? 'NOT_AVAILABLE'}`,
                            `builder_exit_codes=${JSON.stringify(evidence?.exit_codes ?? [])}`,
                            `builder_files_changed=${JSON.stringify(evidence?.file_changes ?? [])}`,
                            `builder_bytes_written=${evidence?.bytes_written ?? 'NOT_AVAILABLE'}`,
                            `created_hash=${hashProof?.created_hash ?? 'NOT_AVAILABLE'}`,
                            `recomputed_hash=${hashProof?.recomputed_hash ?? 'NOT_AVAILABLE'}`,
                            `equal=${hashProof?.equal ?? 'NOT_AVAILABLE'}`,
                            `schema_validation=${tripleValidation?.schema?.result ?? tripleValidation?.schema_result ?? 'NOT_AVAILABLE'}`,
                            `fixture_validation=${tripleValidation?.fixture?.result ?? tripleValidation?.fixture_result ?? 'NOT_AVAILABLE'}`,
                            `goal_validation=${tripleValidation?.goal?.result ?? tripleValidation?.goal_result ?? 'NOT_AVAILABLE'}`,
                            `terminal_processor=${e.processor}`,
                            `workflow_result=${e.result}`,
                        ]
                        const responseMessage = [
                            finalOutput || '[Builder final_output was not available in the persisted runtime artifact]',
                            '',
                            '---',
                            ...proofLines,
                        ].join('\n')

                        this.emit({
                            eventId: uid(),
                            sequence: seq++,
                            taskId,
                            eventType: 'task.completed',
                            stage: 'completed',
                            message: responseMessage,
                            timestamp: e.created_at || new Date().toISOString(),
                            metadata: {runId, builderResult, hashProof, tripleValidation},
                        })
                    } else {
                        const issue = e.message || 'Execution halted at ROOT CAUSE'
                        this.emit({
                            eventId: uid(),
                            sequence: seq++,
                            taskId,
                            eventType: 'task.failed',
                            stage: 'blocked',
                            message: `### Execution Halted (ROOT CAUSE)\n\n${issue}`,
                            timestamp: e.created_at || new Date().toISOString(),
                            metadata: {runId, result: e.result},
                        })
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

    private _mapStage(oneShotStage: string): Stage {
        switch (oneShotStage) {
            case 'Researcher': return 'reading'
            case 'Planner':
            case 'Refactor': return 'planning'
            case 'GapAnalysis':
            case 'Evaluation': return 'reviewing'
            case 'TripleValidation':
            case 'SchemaValidation':
            case 'FixtureValidation':
            case 'GoalValidation': return 'testing'
            case 'Builder': return 'editing'
            case 'Confirmed':
            case 'CreateHash':
            case 'Hash':
            case 'Done': return 'completed'
            default: return 'working' as Stage
        }
    }
}
