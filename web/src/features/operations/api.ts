/**
 * Operations API — unified client for Plans, Queue, Tasks, and Logs.
 *
 * Backend contracts:
 *   Plans → plan_store (stored_plans table)
 *   Queue → oneshot_queue (queue_items, queue_events)
 *   Tasks → extracted from plan content (TaskSpec)
 *   Logs  → execution_journal (append-only, immutable)
 */

// ── Shared ──────────────────────────────────────────────────────────────────

const PLAN_BASE = '/api/plan'
const QUEUE_BASE = '/queue'
const BUILD_BASE = '/api/build'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(path, {
        ...options,
        headers: {'Content-Type': 'application/json', ...options?.headers},
    })
    if (!response.ok) {
        const error = await response.json().catch(() => ({error: 'Unknown error'}))
        throw new Error(error.error || `HTTP ${response.status}`)
    }
    return response.json()
}

// ── Plan types ──────────────────────────────────────────────────────────────

export type PlanStatus = 'draft' | 'submitted' | 'executing' | 'completed' | 'failed' | 'cancelled'

export type WorkflowStage =
    | 'general_plan'
    | 'gap_analysis'
    | 'gap_fix'
    | 'evaluation'
    | 'success_criteria'
    | 'build_handoff'
    | ''

export type StageStatus =
    | 'not_started'
    | 'in_progress'
    | 'ready'
    | 'completed'
    | 'skipped'
    | 'needs_review'
    | 'blocked'

export interface TaskSpec {
    task_id: string
    title: string
    description?: string
    dependencies?: string[]
    write_paths?: string[]
    read_paths?: string[]
    excluded_paths?: string[]
    tests?: string[]
    validators?: string[]
    success_criteria?: string[]
    stop_conditions?: string[]
    metadata?: Record<string, unknown>
}

export interface PlanContent {
    plan_id: string
    plan_version: number
    title: string
    description?: string
    tasks: TaskSpec[]
    metadata?: Record<string, unknown>
}

export interface StoredPlan {
    plan_id: string
    plan_version: number
    title: string
    description: string
    content: PlanContent
    content_digest: string
    task_count: number
    status: PlanStatus
    revised_from: number | null
    workflow_stage: WorkflowStage
    stage_status: StageStatus
    artifact_refs: Record<string, unknown> | null
    created_at: string
    updated_at: string
}

// ── Queue types ─────────────────────────────────────────────────────────────

export type QueueStatus =
    | 'dependent'
    | 'queued'
    | 'in_process'
    | 'completed'
    | 'failed'
    | 'decision_required'
    | 'cancelled'

export interface QueueItem {
    queue_item_id: string
    task_id: string
    queue_status: QueueStatus
    depends_on: string[]
    ready_condition: Record<string, unknown>
    retry_count: number
    max_retries: number
    idempotency_key: string
    version: number
    source: string
    actor_id: string
    metadata: Record<string, unknown>
    admitted_at: string | null
    completed_at: string | null
    hidden: boolean
    created_at: string
    updated_at: string
}

export interface QueueEvent {
    event_id: string
    queue_item_id: string
    event_type: string
    previous_status: string | null
    new_status: string | null
    actor_id: string | null
    source: string | null
    metadata: Record<string, unknown>
    created_at: string
}

// ── Log types ───────────────────────────────────────────────────────────────

export interface JournalEntry {
    entry_id: string
    event_type: string
    plan_id: string
    task_id: string
    packet_id: string
    evidence_id: string
    actor_id: string
    message: string
    metadata_json: string
    created_at: string
}

/** User-editable annotation overlaid on a journal entry. */
export interface LogAnnotation {
    entry_id: string
    label: string
    note: string
    updated_at: string
}

// ── Build types (for cross-referencing) ─────────────────────────────────────

export interface BuildSummary {
    build_id: string
    plan_id: string
    status: string
    completed_tasks: number
    total_tasks: number
}

// ── Plan API ────────────────────────────────────────────────────────────────

export const plansApi = {
    list(params?: {status?: string; limit?: number}) {
        const sp = new URLSearchParams()
        if (params?.status) sp.set('status', params.status)
        if (params?.limit) sp.set('limit', String(params.limit))
        const q = sp.toString()
        return req<{plans: StoredPlan[]; count: number}>(
            `${PLAN_BASE}/${q ? `?${q}` : ''}`,
        )
    },

    get(planId: string) {
        return req<StoredPlan>(`${PLAN_BASE}/${encodeURIComponent(planId)}`)
    },

    create(plan: PlanContent) {
        return req<StoredPlan>(PLAN_BASE, {
            method: 'POST',
            body: JSON.stringify(plan),
        })
    },

    updateStatus(planId: string, status: PlanStatus) {
        return req<StoredPlan>(`${PLAN_BASE}/${encodeURIComponent(planId)}/status`, {
            method: 'PATCH',
            body: JSON.stringify({status}),
        })
    },

    delete(planId: string) {
        return req<{deleted: boolean; plan_id: string}>(
            `${PLAN_BASE}/${encodeURIComponent(planId)}`,
            {method: 'DELETE'},
        )
    },

    submit(planId: string, options?: {executor?: string; mode?: 'execute' | 'queue'}) {
        return req<{
            build_id: string
            plan_id: string
            status: string
            tasks_total: number
        }>(`${PLAN_BASE}/${encodeURIComponent(planId)}/submit`, {
            method: 'POST',
            body: JSON.stringify({
                executor: options?.executor ?? 'local-process',
                mode: options?.mode ?? 'execute',
            }),
        })
    },
}

// ── Queue API ───────────────────────────────────────────────────────────────

export const queueApi = {
    list(params?: {status?: string; task_id?: string; include_hidden?: boolean; limit?: number}) {
        const sp = new URLSearchParams()
        if (params?.status) sp.set('status', params.status)
        if (params?.task_id) sp.set('task_id', params.task_id)
        if (params?.include_hidden) sp.set('include_hidden', 'true')
        if (params?.limit) sp.set('limit', String(params.limit))
        const q = sp.toString()
        return req<{ok: boolean; count: number; items: QueueItem[]}>(
            `${QUEUE_BASE}/items${q ? `?${q}` : ''}`,
        )
    },

    get(itemId: string) {
        return req<{ok: boolean; item: QueueItem}>(
            `${QUEUE_BASE}/items/${encodeURIComponent(itemId)}`,
        )
    },

    events(itemId: string, params?: {event_type?: string; limit?: number}) {
        const sp = new URLSearchParams()
        if (params?.event_type) sp.set('event_type', params.event_type)
        if (params?.limit) sp.set('limit', String(params.limit))
        const q = sp.toString()
        return req<{ok: boolean; count: number; events: QueueEvent[]}>(
            `${QUEUE_BASE}/items/${encodeURIComponent(itemId)}/events${q ? `?${q}` : ''}`,
        )
    },

    cancel(itemId: string, expectedVersion: number, actorId: string) {
        return req<{ok: boolean; item: QueueItem}>(
            `${QUEUE_BASE}/items/${encodeURIComponent(itemId)}/cancel`,
            {method: 'POST', body: JSON.stringify({expected_version: expectedVersion, actor_id: actorId, source: 'ui'})},
        )
    },

    retry(itemId: string, actorId: string) {
        return req<{ok: boolean; item: QueueItem}>(
            `${QUEUE_BASE}/items/${encodeURIComponent(itemId)}/retry`,
            {method: 'POST', body: JSON.stringify({actor_id: actorId, source: 'ui'})},
        )
    },

    softDelete(itemId: string, expectedVersion: number, actorId: string) {
        return req<{ok: boolean; item: QueueItem}>(
            `${QUEUE_BASE}/items/${encodeURIComponent(itemId)}/soft-delete`,
            {method: 'POST', body: JSON.stringify({expected_version: expectedVersion, actor_id: actorId, source: 'ui'})},
        )
    },

    health(staleThreshold?: number) {
        const sp = new URLSearchParams()
        if (staleThreshold) sp.set('stale_threshold', String(staleThreshold))
        const q = sp.toString()
        return req<{ok: boolean}>(`${QUEUE_BASE}/health${q ? `?${q}` : ''}`)
    },
}

// ── Logs API ────────────────────────────────────────────────────────────────

export const logsApi = {
    list(params?: {event_type?: string; plan_id?: string; task_id?: string; limit?: number; offset?: number}) {
        const sp = new URLSearchParams()
        if (params?.event_type) sp.set('event_type', params.event_type)
        if (params?.plan_id) sp.set('plan_id', params.plan_id)
        if (params?.task_id) sp.set('task_id', params.task_id)
        if (params?.limit) sp.set('limit', String(params.limit))
        if (params?.offset) sp.set('offset', String(params.offset))
        const q = sp.toString()
        return req<{count: number; entries: JournalEntry[]}>(
            `${BUILD_BASE}/journal${q ? `?${q}` : ''}`,
        )
    },

    /** Get journal for a specific build (resolves plan_id internally). */
    forBuild(buildId: string) {
        return req<{count: number; entries: JournalEntry[]}>(
            `${BUILD_BASE}/${encodeURIComponent(buildId)}/journal`,
        )
    },
}

// ── Builds API (for cross-reference) ────────────────────────────────────────

export const buildsApi = {
    list() {
        return req<{count: number; builds: BuildSummary[]}>(`${BUILD_BASE}/`)
    },
}

// ── Annotations (local-only, stored in localStorage) ────────────────────────

const ANNOTATION_KEY = 'oneshot_log_annotations'

function loadAnnotations(): Record<string, LogAnnotation> {
    try {
        return JSON.parse(localStorage.getItem(ANNOTATION_KEY) || '{}')
    } catch {
        return {}
    }
}

export const annotationsApi = {
    get(entryId: string): LogAnnotation | undefined {
        return loadAnnotations()[entryId]
    },

    getAll(): Record<string, LogAnnotation> {
        return loadAnnotations()
    },

    set(entryId: string, label: string, note: string) {
        const all = loadAnnotations()
        all[entryId] = {entry_id: entryId, label, note, updated_at: new Date().toISOString()}
        localStorage.setItem(ANNOTATION_KEY, JSON.stringify(all))
    },

    remove(entryId: string) {
        const all = loadAnnotations()
        delete all[entryId]
        localStorage.setItem(ANNOTATION_KEY, JSON.stringify(all))
    },
}
