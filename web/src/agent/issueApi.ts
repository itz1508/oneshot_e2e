/**
 * Issue detection API client — fetches code quality issues from backend.
 *
 * Issues carry root cause, success criteria, fix recommendation,
 * and a colour category for visual overlay.
 */

import {fetchAuthed} from './authApi'

export interface Issue {
    id: string
    type: string
    severity: string
    file_path: string
    line_number: number
    message: string
    root_cause: string
    success_criteria: string
    recommendation: string
    refactor_suggestion: string | null
    color_category: string
    is_dead: boolean
}

export interface IssueListResponse {
    issues: Issue[]
    total: number
    cached: boolean
    tool_error: string
}

export interface FixProposal {
    issue_id: string
    file_path: string
    original_content: string
    fixed_content: string
    description: string
    auto_applicable: boolean
    lines_removed: number
    lines_added: number
}

const ISSUES_ENDPOINT = '/v1/issues'

/**
 * Fetch all detected issues for the workspace.
 */
export async function fetchIssues(directory = '.'): Promise<Issue[]> {
    const params = new URLSearchParams({directory})
    const res = await fetch(`${ISSUES_ENDPOINT}?${params}`)
    if (!res.ok) {
        throw new Error(`Issues API error: ${res.status}`)
    }
    const data: IssueListResponse = await res.json()
    if (data.tool_error) {
        console.warn('Issues tool error:', data.tool_error)
    }
    return data.issues
}

/**
 * Fetch a single issue by ID.
 */
export async function fetchIssueDetail(issueId: string): Promise<Issue> {
    const res = await fetch(`${ISSUES_ENDPOINT}/${encodeURIComponent(issueId)}`)
    if (!res.ok) {
        throw new Error(`Issue detail API error: ${res.status}`)
    }
    return res.json()
}

/**
 * Get the CSS background colour for an issue colour category.
 */
export function getIssueColor(category: string, isDead: boolean): string {
    if (isDead) {
        return 'rgba(127, 29, 29, 0.20)'
    }
    const colors: Record<string, string> = {
        blue:   'rgba(59, 130, 246, 0.15)',
        green:  'rgba(34, 197, 94, 0.15)',
        orange: 'rgba(249, 115, 22, 0.15)',
        yellow: 'rgba(234, 179, 8, 0.15)',
    }
    return colors[category] || 'transparent'
}

/**
 * Filter issues that apply to a specific file path.
 */
export function issuesForFile(issues: Issue[], filePath: string): Issue[] {
    return issues.filter(i =>
        i.file_path === filePath || filePath.endsWith(i.file_path)
    )
}

/**
 * Request a fix proposal for a specific issue.
 */
export async function fetchFixProposal(issueId: string): Promise<FixProposal> {
    const res = await fetchAuthed(`${ISSUES_ENDPOINT}/${encodeURIComponent(issueId)}/fix`, {
        method: 'POST',
    })
    if (!res.ok) {
        throw new Error(`Fix proposal API error: ${res.status}`)
    }
    return res.json()
}

/**
 * Find the issue (if any) for a specific line in a file.
 */
export function issueForLine(
    issues: Issue[],
    filePath: string,
    lineNumber: number,
): Issue | undefined {
    return issues.find(i =>
        i.line_number === lineNumber &&
        (i.file_path === filePath || filePath.endsWith(i.file_path))
    )
}
