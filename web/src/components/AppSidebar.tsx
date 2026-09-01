/**
 * AppSidebar — icon-rail + side-panel following the VS Code sidebar pattern.
 *
 * Supports Explorer & Outline subtabs in the side-panel, along with primary navigation tabs
 * for Explorer, Code Fix Editor, and Debug.
 */

import {useState, useRef, useCallback} from 'react'
import {
    FolderOpen,
    GitCompare,
    Bug,
    AppWindow,
    Plus,
    FileCode,
    Box,
    Layers,
    ListTree,
    Braces,
    PanelLeftClose,
} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import {WorkspaceRoot} from './WorkspaceRoot'
import {ExplorerModeIndicator} from './ExplorerModeIndicator'
import {WorkflowOutline} from './WorkflowOutline'
import {PlanTree} from '../features/operations/components/PlanTree'
import {BuildTree} from '../features/operations/components/BuildTree'
import {useAppStore} from '../store/taskStore'
import type {Workspace} from '../agent/types'

export type RailTab = 'explorer' | 'editor' | 'debug' | 'appshell'
export type SidebarSubTab = 'explorer' | 'outline'

interface AppSidebarProps {
    activeTab: RailTab
    onTabSelect: (tab: RailTab) => void
    workspaces: Workspace[]
    participatingWorkspaceIds: string[]
    onLEDClick: (workspaceId: string) => void
    onFileClick?: (fileName: string, filePath: string) => void
}

const tabs: { id: RailTab; icon: typeof FolderOpen; label: string }[] = [
    {id: 'explorer', icon: FolderOpen, label: 'Explorer & Outline'},
    {id: 'editor', icon: GitCompare, label: 'Code Fix & Diff Editor'},
    {id: 'debug', icon: Bug, label: 'Debug'},
    {id: 'appshell', icon: AppWindow, label: 'Application Shell'},
]

const sampleOutlineItems = [
    {id: '1', name: 'AppSidebar.tsx', type: 'file', icon: FileCode, badge: 'TSX'},
    {id: '2', name: 'AppSidebar', type: 'component', icon: Box, badge: 'React'},
    {id: '3', name: 'tabs config', type: 'constant', icon: Layers, badge: 'Array'},
    {id: '4', name: 'renderNode()', type: 'function', icon: Braces, badge: 'Function'},
    {id: '5', name: 'WorkspaceRoot.tsx', type: 'file', icon: FileCode, badge: 'TSX'},
    {id: '6', name: 'renderTree()', type: 'function', icon: ListTree, badge: 'Function'},
]

export function AppSidebar({
                               activeTab,
                               onTabSelect,
                               workspaces,
                               participatingWorkspaceIds,
                               onLEDClick,
                               onFileClick,
                           }: AppSidebarProps) {
    const [subTab, setSubTab] = useState<SidebarSubTab>('explorer')
    const [collapsed, setCollapsed] = useState(false)
    const [panelWidth, setPanelWidth] = useState(240)
    const dragging = useRef(false)
    const explorerMode = useAppStore((s) => s.explorerMode)
    const workspaceError = useAppStore((s) => s.workspaceError)

    const grouped = workspaces.filter((ws) => participatingWorkspaceIds.includes(ws.id))
    const ungrouped = workspaces.filter((ws) => !participatingWorkspaceIds.includes(ws.id))

    const panelOpen = activeTab === 'explorer' && !collapsed

    // Drag-resize handler for the explorer panel
    const startResize = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        dragging.current = true
        const startX = e.clientX
        const startW = panelWidth
        const onMove = (ev: MouseEvent) => {
            if (!dragging.current) return
            const next = Math.min(480, Math.max(160, startW + (ev.clientX - startX)))
            setPanelWidth(next)
        }
        const onUp = () => {
            dragging.current = false
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }, [panelWidth])

    const handleTabSelect = (tab: RailTab) => {
        if (tab === 'explorer') setCollapsed(false)
        onTabSelect(tab)
    }

    return (
        <TooltipProvider delayDuration={0}>
            <div className="app-sidebar-root">
                {/* ── Icon Rail ── */}
                <nav className="app-sidebar-rail" aria-label="Primary navigation">
                    <div className="app-sidebar-rail__tabs">
                        {tabs.map((tab) => {
                            const Icon = tab.icon
                            const isActive = activeTab === tab.id
                            return (
                                <Tooltip key={tab.id}>
                                    <TooltipTrigger asChild>
                                        <button
                                            className={`app-sidebar-rail__btn${isActive ? ' app-sidebar-rail__btn--active' : ''}`}
                                            onClick={() => handleTabSelect(tab.id)}
                                            aria-label={tab.label}
                                            aria-current={isActive ? 'page' : undefined}
                                        >
                                            <Icon className="app-sidebar-rail__icon"/>
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" align="center">
                                        {tab.label}
                                    </TooltipContent>
                                </Tooltip>
                            )
                        })}
                    </div>
                </nav>

                {/* ── Side Panel (Explorer / Outline) ── */}
                <aside
                    className={`app-sidebar-panel${panelOpen ? ' app-sidebar-panel--open' : ''}`}
                    style={panelOpen ? {width: panelWidth} : undefined}
                    aria-label="Explorer and Outline panel"
                    aria-hidden={!panelOpen}
                >
                    {/* Header with [Explorer] | [Outline] subtab switcher + collapse */}
                    <div className="app-sidebar-panel__header">
                        <div className="app-sidebar-panel__subtabs">
                            <button
                                type="button"
                                className={`app-sidebar-panel__subtab-btn${
                                    subTab === 'explorer' ? ' app-sidebar-panel__subtab-btn--active' : ''
                                }`}
                                onClick={() => setSubTab('explorer')}
                            >
                                Explorer
                            </button>
                            <span className="app-sidebar-panel__subtab-sep">|</span>
                            <button
                                type="button"
                                className={`app-sidebar-panel__subtab-btn${
                                    subTab === 'outline' ? ' app-sidebar-panel__subtab-btn--active' : ''
                                }`}
                                onClick={() => setSubTab('outline')}
                            >
                                Outline
                            </button>
                        </div>
                        <button
                            type="button"
                            className="app-sidebar-panel__collapse"
                            onClick={() => setCollapsed(true)}
                            aria-label="Collapse sidebar"
                        >
                            <PanelLeftClose className="size-3.5"/>
                        </button>
                    </div>

                    {/* Panel Content Body */}
                    <div className="app-sidebar-panel__body">
                        {subTab === 'explorer' ? (
                            <>
                                <ExplorerModeIndicator/>
                                {workspaceError && (
                                    <div
                                        role="alert"
                                        style={{
                                            padding: '6px 8px',
                                            fontSize: '0.75rem',
                                            color: '#b91c1c',
                                            backgroundColor: '#fef2f2',
                                            border: '1px solid #fecaca',
                                            borderRadius: '4px',
                                            marginBottom: '6px',
                                        }}
                                    >
                                        {workspaceError}
                                    </div>
                                )}
                                {explorerMode === 'code' ? (
                                    <>
                                        {grouped.map((ws) => (
                                            <WorkspaceRoot key={ws.id} workspace={ws} onLEDClick={() => onLEDClick(ws.id)} onFileClick={onFileClick}/>
                                        ))}
                                        {ungrouped.map((ws) => (
                                            <WorkspaceRoot key={ws.id} workspace={ws} onLEDClick={() => onLEDClick(ws.id)} onFileClick={onFileClick}/>
                                        ))}
                                    </>
                                ) : explorerMode === 'plan-review' ? (
                                    <PlanTree/>
                                ) : (
                                    <BuildTree/>
                                )}
                            </>
                        ) : explorerMode === 'code' ? (
                            <div className="app-sidebar-outline">
                                <div className="app-sidebar-outline__group-title">Document Structure</div>
                                {sampleOutlineItems.map((item) => {
                                    const Icon = item.icon
                                    return (
                                        <div key={item.id} className="app-sidebar-outline__item" role="button" tabIndex={0}>
                                            <Icon className="size-3.5 text-muted-foreground"/>
                                            <span>{item.name}</span>
                                            <span className="app-sidebar-outline__badge">{item.badge}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            <WorkflowOutline/>
                        )}
                    </div>

                    {subTab === 'explorer' && explorerMode === 'code' ? (
                        <Button variant="ghost" size="sm" className="app-sidebar-panel__add-folder">
                            <Plus className="size-3.5"/>
                            <span className="text-xs">Add folder</span>
                        </Button>
                    ) : null}

                    {/* Drag-resize handle */}
                    <div
                        className="app-sidebar-panel__resize"
                        onMouseDown={startResize}
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize sidebar"
                    />
                </aside>
            </div>
        </TooltipProvider>
    )
}
