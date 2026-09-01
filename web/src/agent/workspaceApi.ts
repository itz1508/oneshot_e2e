/**
 * Workspace API client — real filesystem access via backend endpoints.
 *
 * Communicates with /v1/workspace/* endpoints proxied to the assistant backend.
 * All paths are relative to ONESHOT_WORKSPACE_ROOT on the server.
 */

import type {FileNode} from './types'
import {fetchAuthed} from './authApi'

// ─── Backend response shapes ───

interface BackendTreeNode {
    name: string
    path: string
    type: 'file' | 'folder'
    children?: BackendTreeNode[]
}

interface TreeResponse {
    root: string
    path: string
    depth: number | null
    nodes: BackendTreeNode[]
}

interface FileResponse {
    path: string
    content: string
}

// ─── ID generation ───

let _idCounter = 0
function nextId(): string {
    return `ws-${++_idCounter}`
}

// ─── Tree conversion ───

function convertTree(nodes: BackendTreeNode[]): FileNode[] {
    return nodes.map((node) => ({
        id: nextId(),
        name: node.name,
        type: node.type,
        ...(node.children ? {children: convertTree(node.children)} : {}),
    }))
}

// ─── Public API ───

/**
 * Fetch the workspace file tree from the backend.
 *
 * @param path Relative path within workspace (default: '.')
 * @param depth Optional maximum recursion depth (1-100). Omit to load the whole source tree.
 * @returns FileNode[] ready for Explorer rendering
 */
export async function fetchWorkspaceTree(
    path = '.',
    depth?: number,
): Promise<FileNode[]> {
    const params = new URLSearchParams({path})
    if (depth !== undefined) params.set('depth', String(depth))
    const res = await fetch(`/v1/workspace/tree?${params}`)
    if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Failed to fetch workspace tree: ${res.status}`)
    }
    const data: TreeResponse = await res.json()
    return convertTree(data.nodes)
}

/**
 * Read a file's text content from the workspace.
 *
 * @param path Relative path to the file
 * @returns The file content as a string
 */
export async function readFile(path: string): Promise<string> {
    const params = new URLSearchParams({path})
    const res = await fetch(`/v1/workspace/file?${params}`)
    if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Failed to read file: ${res.status}`)
    }
    const data: FileResponse = await res.json()
    return data.content
}

/**
 * Write content to a file in the workspace.
 *
 * @param path Relative path to the file
 * @param content The text content to write
 */
export async function writeFile(
    path: string,
    content: string,
): Promise<void> {
    const res = await fetchAuthed('/v1/workspace/file', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({path, content}),
    })
    if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Failed to write file: ${res.status}`)
    }
}
