/**
 * Status color API client — polls GET /v1/status for file status colors.
 */

export interface StatusColor {
    file_path: string
    language: string
    base_color: string
    final_color: string
    color_detail: string
    severity: string
    gap_status: string
    gap_category: string
    is_dead: boolean
    is_stale: boolean
    message: string
    line_number: number
    trace_source: string
}

export interface StatusResponse {
    statuses: StatusColor[]
    total: number
    color_summary: Record<string, number>
    cached: boolean
    tool_error: string
}

const STATUS_ENDPOINT = '/v1/status'
const STATUS_FILE_ENDPOINT = '/v1/status/file'

/**
 * Fetch all status colors for workspace.
 */
export async function fetchStatuses(directory = '.'): Promise<StatusColor[]> {
    const params = new URLSearchParams({ directory, recursive: 'true' })
    const res = await fetch(`${STATUS_ENDPOINT}?${params}`)
    if (!res.ok) {
        throw new Error(`Status API error: ${res.status}`)
    }
    const data: StatusResponse = await res.json()
    if (data.tool_error) {
        console.warn('Status tool error:', data.tool_error)
    }
    return data.statuses
}

/**
 * Fetch status color for a specific file.
 */
export async function fetchFileStatus(
    path: string,
    options?: {
        severity?: string
        status?: string
        category?: string
        is_dead?: boolean
        is_stale?: boolean
    }
): Promise<StatusColor> {
    const params = new URLSearchParams({ path })
    if (options?.severity) params.set('severity', options.severity)
    if (options?.status) params.set('status', options.status)
    if (options?.category) params.set('category', options.category)
    if (options?.is_dead) params.set('is_dead', 'true')
    if (options?.is_stale) params.set('is_stale', 'true')

    const res = await fetch(`${STATUS_FILE_ENDPOINT}?${params}`)
    if (!res.ok) {
        throw new Error(`Status file API error: ${res.status}`)
    }
    return res.json()
}
