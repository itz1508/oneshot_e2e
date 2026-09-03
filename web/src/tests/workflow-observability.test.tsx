import {randomUUID} from 'node:crypto'
import {render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import type {AgentEvent} from '../agent/types'
import {BackendChatSource} from '../agent/BackendChatSource'
import {workflowTraceStore} from '../agent/workflowTrace'
import {WorkflowTracePanel} from '../components/WorkflowTracePanel'

class MockEventSource {
    static instances: MockEventSource[] = []
    onmessage: ((event: MessageEvent) => void | Promise<void>) | null = null
    onerror: (() => void) | null = null
    closed = false

    constructor(public url: string) {
        MockEventSource.instances.push(this)
    }

    close() {
        this.closed = true
    }

    emit(payload: Record<string, unknown>) {
        return this.onmessage?.({data: JSON.stringify(payload)} as MessageEvent)
    }
}

function response(body: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(body), {
        status,
        headers: {'content-type': 'application/json'},
    }))
}

describe('canonical workflow observability fixtures', () => {
    beforeEach(() => {
        workflowTraceStore.reset()
        MockEventSource.instances = []
        vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        workflowTraceStore.reset()
    })

    it('renders real SSE history in arrival sequence and deduplicates replayed events', () => {
        const runId = `run-${randomUUID()}`
        const first = {
            eventId: `event-${randomUUID()}`,
            sequence: 9,
            runId,
            processor: `Processor-${randomUUID()}`,
            state: 'RUNNING' as const,
            timestamp: new Date().toISOString(),
        }
        const second = {
            eventId: `event-${randomUUID()}`,
            sequence: 10,
            runId,
            processor: `Processor-${randomUUID()}`,
            state: 'COMPLETE' as const,
            result: 'PASSED',
            artifactId: `artifact-${randomUUID()}`,
            message: `message-${randomUUID()}`,
            timestamp: new Date().toISOString(),
        }

        workflowTraceStore.record(second)
        workflowTraceStore.record(first)
        workflowTraceStore.record(second)

        expect(workflowTraceStore.getSnapshot().map((entry) => entry.eventId))
            .toEqual([first.eventId, second.eventId])

        render(<WorkflowTracePanel/>)
        expect(screen.getByText(new RegExp(first.processor))).toBeInTheDocument()
        expect(screen.getByText(new RegExp(second.processor))).toBeInTheDocument()
    })

    it('shows the exact persisted Builder output and concrete hash values after Done', async () => {
        const conversationId = `conversation-${randomUUID()}`
        const runId = `run-${randomUUID()}`
        const finalOutput = JSON.stringify({
            kind: `generated-${randomUUID()}`,
            evidence: `runtime-${randomUUID()}`,
        })
        const createdHash = `sha256:${randomUUID().replaceAll('-', '')}`
        const recomputedHash = createdHash
        const builderExecutionId = `execution-${randomUUID()}`

        const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input)
            if (url === '/api/conversations' && init?.method === 'POST') {
                return response({
                    conversation_id: conversationId,
                    intent: {ready_for_prompt: true},
                }, 201)
            }
            if (url === `/api/conversations/${conversationId}/run`) {
                return response({run_id: runId}, 202)
            }
            if (url === `/api/runs/${runId}/artifacts/builder-result`) {
                return response({
                    result: 'PASSED',
                    final_output: finalOutput,
                    evidence: {
                        execution_id: builderExecutionId,
                        exit_codes: [0, 0, 0],
                        file_changes: [],
                        bytes_written: 0,
                    },
                })
            }
            if (url === `/api/runs/${runId}/artifacts/hash-proof`) {
                return response({
                    created_hash: createdHash,
                    recomputed_hash: recomputedHash,
                    equal: true,
                })
            }
            if (url === `/api/runs/${runId}/artifacts/triple-validation`) {
                return response({
                    schema_result: 'VALID',
                    fixture_result: 'VALID',
                    goal_result: 'VALID',
                })
            }
            throw new Error(`Unexpected fetch ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const source = new BackendChatSource()
        const emitted: AgentEvent[] = []
        source.subscribe((event) => emitted.push(event))
        source.start(`request-${randomUUID()}`, '', [])

        await waitFor(() => expect(MockEventSource.instances).toHaveLength(1))
        const stream = MockEventSource.instances[0]

        const common = {run_id: runId, created_at: new Date().toISOString()}
        const researcherEvent = {
            ...common,
            event_id: `event-${randomUUID()}`,
            sequence: 1,
            processor: 'Researcher',
            state: 'RUNNING',
            message: `provider=${randomUUID()}`,
        }
        await stream.emit(researcherEvent)
        await stream.emit(researcherEvent)

        await stream.emit({
            ...common,
            event_id: `event-${randomUUID()}`,
            sequence: 2,
            processor: 'Builder',
            state: 'COMPLETE',
            result: 'PASSED',
            artifact_id: `artifact-${randomUUID()}`,
        })
        await stream.emit({
            ...common,
            event_id: `event-${randomUUID()}`,
            sequence: 3,
            processor: 'Done',
            state: 'COMPLETE',
            result: 'PASSED',
        })

        await waitFor(() => {
            expect(emitted.some((event) =>
                event.eventType === 'task.completed' &&
                event.message.includes(finalOutput),
            )).toBe(true)
        })

        const completed = emitted.find((event) => event.eventType === 'task.completed')
        expect(completed?.message).toContain(`created_hash=${createdHash}`)
        expect(completed?.message).toContain(`recomputed_hash=${recomputedHash}`)
        expect(completed?.message).toContain('equal=true')
        expect(completed?.message).toContain(`builder_execution_id=${builderExecutionId}`)
        expect(completed?.message).not.toContain('Cryptographic Hash (SHA-256): `verified`')

        const trace = workflowTraceStore.getSnapshot()
        expect(trace.filter((entry) => entry.eventId === researcherEvent.event_id)).toHaveLength(1)
        expect(trace.map((entry) => entry.processor)).toEqual(['Researcher', 'Builder', 'Done'])
        expect(trace.at(-1)?.details).toMatchObject({
            hashProof: {
                created_hash: createdHash,
                recomputed_hash: recomputedHash,
                equal: true,
            },
        })
    })

    it('renders the exact canonical help request and does not start SSE when intent is incomplete', async () => {
        const question = `question-${randomUUID()}`
        vi.stubGlobal('fetch', vi.fn(() => response({
            conversation_id: `conversation-${randomUUID()}`,
            intent: {ready_for_prompt: false},
            help_request: {question},
        }, 201)))

        const source = new BackendChatSource()
        const emitted: AgentEvent[] = []
        source.subscribe((event) => emitted.push(event))
        source.start(`incomplete-${randomUUID()}`, '', [])

        await waitFor(() => {
            expect(emitted.some((event) =>
                event.eventType === 'message.received' && event.message === question,
            )).toBe(true)
        })
        expect(MockEventSource.instances).toHaveLength(0)
    })

    it('keeps the real root-cause message and does not convert it to completion', async () => {
        const conversationId = `conversation-${randomUUID()}`
        const runId = `run-${randomUUID()}`
        const rootCause = `root-cause-${randomUUID()}`

        vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
            const url = String(input)
            if (url === '/api/conversations') {
                return response({
                    conversation_id: conversationId,
                    intent: {ready_for_prompt: true},
                }, 201)
            }
            if (url === `/api/conversations/${conversationId}/run`) {
                return response({run_id: runId}, 202)
            }
            throw new Error(`Unexpected fetch ${url}`)
        }))

        const source = new BackendChatSource()
        const emitted: AgentEvent[] = []
        source.subscribe((event) => emitted.push(event))
        source.start(`request-${randomUUID()}`, '', [])

        await waitFor(() => expect(MockEventSource.instances).toHaveLength(1))
        await MockEventSource.instances[0].emit({
            event_id: `event-${randomUUID()}`,
            sequence: 1,
            run_id: runId,
            processor: 'Done',
            state: 'COMPLETE',
            result: 'ROOT_CAUSE',
            message: rootCause,
            created_at: new Date().toISOString(),
        })

        await waitFor(() => {
            expect(emitted.some((event) =>
                event.eventType === 'task.failed' && event.message.includes(rootCause),
            )).toBe(true)
        })
        expect(emitted.some((event) => event.eventType === 'task.completed')).toBe(false)
    })
})
