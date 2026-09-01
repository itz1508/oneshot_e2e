/**
 * WorkspaceRoot — a single project root in the Explorer.
 * Uses nested shadcn Collapsibles with Button triggers for the file tree.
 * Follows the shadcn collapsible file tree pattern.
 */

import {ChevronRightIcon, FileIcon, FolderIcon} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from '@/components/ui/collapsible'
import type {Workspace, FileNode} from '../agent/types'
import {ActivityLED} from './ActivityLED'

interface WorkspaceRootProps {
    workspace: Workspace
    onLEDClick: () => void
    onFileClick?: (fileName: string, filePath: string) => void
}

/* ── Recursive file-tree node (matches reference renderItem pattern) ── */

function renderNode(node: FileNode, depth = 0, onFileClick?: (fileName: string, filePath: string) => void, parentPath = ''): React.ReactNode {
    const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name
    if (node.type === 'folder') {
        return (
            <Collapsible key={node.id} defaultOpen={depth === 0}>
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="group w-full justify-start transition-none hover:bg-accent hover:text-accent-foreground h-7 text-xs"
                        style={{paddingLeft: 8 + depth * 12}}
                    >
                        <ChevronRightIcon className="size-3 transition-transform group-data-[state=open]:rotate-90"/>
                        <FolderIcon className="size-3"/>
                        <span>{node.name}</span>
                    </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="ml-3">
                    <div className="flex flex-col gap-0.5">
                        {node.children?.map((child) => renderNode(child, depth + 1, onFileClick, nodePath))}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        )
    }

    return (
        <Button
            key={node.id}
            variant="link"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground h-7 text-xs"
            style={{paddingLeft: 8 + depth * 12 + 12}}
            onClick={() => onFileClick?.(node.name, nodePath)}
        >
            <FileIcon className="size-3"/>
            <span>{node.name}</span>
        </Button>
    )
}

/* ── Workspace root — collapsible dropdown with file tree ── */

export function WorkspaceRoot({workspace, onLEDClick, onFileClick}: WorkspaceRootProps) {
    return (
        <Collapsible defaultOpen>
            <div className="flex items-center gap-1.5 px-3 py-1.5">
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="group w-full justify-start h-7 text-xs font-medium text-foreground flex-1 truncate p-0 hover:bg-transparent"
                    >
                        <ChevronRightIcon className="size-3 transition-transform group-data-[state=open]:rotate-90 mr-1"/>
                        <FolderIcon className="size-3.5 mr-1.5"/>
                        {workspace.name}
                    </Button>
                </CollapsibleTrigger>
                <span
                    className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    Host
                </span>
                <ActivityLED stage={workspace.stage} onClick={onLEDClick}/>
            </div>
            <CollapsibleContent className="ml-1">
                <div className="flex flex-col gap-0.5 px-1">
                    {workspace.files.map((node) => renderNode(node, 0, onFileClick))}
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}
