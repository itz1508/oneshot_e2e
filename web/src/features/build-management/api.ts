/**
 * Build API — Client for the Build REST API.
 *
 * Single responsibility: provide a typed client for interacting with
 * the Build API backend.
 */

const API_BASE = '/api/build'

// ── Types ────────────────────────────────────────────────────────────────────

export interface Build {
    build_id: string
    plan_id: string
    plan_version: number
    plan_digest: string
    status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted'
    created_at: string
    started_at: string
    completed_at: string
    total_tasks: number
    completed_tasks: number
    failed_tasks: number
    elapsed_ms: number
    build_context_digest: string
    package_digest: string
    report_digest: string
    tags: string[]
    metadata: Record<string, unknown>
    updated_at: string
}

export interface Decision {
    decision_id: string
    build_id: string
    task_id: string
    packet_id: string
    decision_type: string
    title: string
    description: string
    options: string[]
    recommended_option: string
    context: Record<string, unknown>
    required_role: string
    timeout_sec: number
    created_at: string
    expires_at: string
    request_digest: string
}

export interface DecisionResponse {
    response_id: string
    decision_id: string
    build_id: string
    chosen_option: string
    reasoning: string
    actor_id: string
    responded_at: string
    response_digest: string
}

export interface BuildReport {
    build_id: string
    plan_id: string
    status: string
    total_tasks: number
    completed_tasks: number
    failed_tasks: number
    elapsed_ms: number
    task_results: Array<{
        task_id: string
        status: string
        outcome: string
        evidence_id: string
    }>
}

// ── API Client ───────────────────────────────────────────────────────────────

class BuildApiClient {
    private async request<T>(path: string, options?: RequestInit): Promise<T> {
        const response = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }))
            throw new Error(error.error || `HTTP ${response.status}`)
        }

        return response.json()
    }

    // ── Build Operations ─────────────────────────────────────────────────

    async listBuilds(params?: {
        plan_id?: string
        status?: string
        limit?: number
        offset?: number
    }): Promise<{ builds: Build[]; count: number }> {
        const searchParams = new URLSearchParams()
        if (params?.plan_id) searchParams.set('plan_id', params.plan_id)
        if (params?.status) searchParams.set('status', params.status)
        if (params?.limit) searchParams.set('limit', String(params.limit))
        if (params?.offset) searchParams.set('offset', String(params.offset))

        const query = searchParams.toString()
        return this.request(`/${query ? `?${query}` : ''}`)
    }

    async getBuild(buildId: string): Promise<Build> {
        return this.request(`/${buildId}`)
    }

    async createBuild(data: {
        build_id: string
        plan_id?: string
        plan_version?: number
        total_tasks?: number
        tags?: string[]
    }): Promise<Build> {
        return this.request('/', {
            method: 'POST',
            body: JSON.stringify(data),
        })
    }

    async deleteBuild(buildId: string): Promise<{ deleted: boolean; build_id: string }> {
        return this.request(`/${buildId}`, { method: 'DELETE' })
    }

    async getBuildReport(buildId: string): Promise<BuildReport> {
        return this.request(`/${buildId}/report`)
    }

    // ── Decision Operations ──────────────────────────────────────────────

    async listDecisions(buildId: string): Promise<{ decisions: Decision[]; count: number }> {
        return this.request(`/${buildId}/decisions`)
    }

    async requestDecision(
        buildId: string,
        data: {
            decision_type: string
            title: string
            description?: string
            options?: string[]
            recommended_option?: string
            task_id?: string
            packet_id?: string
        }
    ): Promise<Decision> {
        return this.request(`/${buildId}/decisions`, {
            method: 'POST',
            body: JSON.stringify(data),
        })
    }

    async submitDecision(
        decisionId: string,
        data: {
            build_id: string
            chosen_option: string
            actor_id: string
            reasoning?: string
        }
    ): Promise<DecisionResponse> {
        return this.request(`/decisions/${decisionId}/respond`, {
            method: 'POST',
            body: JSON.stringify(data),
        })
    }
}

export const buildApi = new BuildApiClient()
