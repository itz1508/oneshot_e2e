export interface WorkflowTraceEntry {
    eventId: string
    sequence: number
    runId: string
    processor: string
    state: 'PENDING' | 'RUNNING' | 'COMPLETE'
    result?: string
    artifactId?: string
    message?: string
    timestamp: string
    details?: Record<string, unknown>
}

const STORAGE_KEY = 'oneshot.workflow-trace.v1'
const listeners = new Set<() => void>()

function loadInitial(): WorkflowTraceEntry[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

let snapshot: WorkflowTraceEntry[] = loadInitial()

function persist(): void {
    if (typeof window === 'undefined') return
    try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    } catch {
        // Session persistence is best-effort; runtime events remain in memory.
    }
}

function notify(): void {
    for (const listener of listeners) listener()
}

function publish(next: WorkflowTraceEntry[]): void {
    snapshot = [...next].sort((a, b) => a.sequence - b.sequence)
    persist()
    notify()
}

export const workflowTraceStore = {
    getSnapshot(): WorkflowTraceEntry[] {
        return snapshot
    },

    subscribe(listener: () => void): () => void {
        listeners.add(listener)
        return () => listeners.delete(listener)
    },

    reset(): void {
        publish([])
    },

    record(entry: WorkflowTraceEntry): void {
        if (snapshot.some((current) => current.eventId === entry.eventId)) return
        publish([...snapshot, entry])
    },

    enrich(eventId: string, details: Record<string, unknown>): void {
        let changed = false
        const next = snapshot.map((entry) => {
            if (entry.eventId !== eventId) return entry
            changed = true
            return {
                ...entry,
                details: {...entry.details, ...details},
            }
        })
        if (changed) publish(next)
    },
}
