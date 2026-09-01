/**
 * CodeFixEditor — Interactive Code Diff & Code Fix Preview Editor.
 *
 * Split View (2 Panels):
 *   - Left Panel: Stacked Original Code (top) & Proposed Code Fix (bottom).
 *   - Right Panel: Rootcause (top), Decision (middle), Recommendation (bottom).
 *
 * Unified View (Single Panel):
 *   - Unified Diff Pane (top)
 *   - Divider Line (middle)
 *   - Stacked Rootcause, Decision & Recommendation (bottom)
 */

import {useState, useCallback, useRef, useEffect} from 'react'
import {
    Check,
    Copy,
    RefreshCw,
    X,
    Columns,
    AlignJustify,
    AlertCircle,
    GitCommit,
    CheckCircle2,
    Lightbulb,
    GripVertical,
    GripHorizontal,
    ChevronDown,
    ChevronRight,
    FileCode2,
} from 'lucide-react'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import styles from './CodeFixEditor.module.css'

export interface DiffChunk {
    type: 'same' | 'add' | 'del'
    oldLine?: number
    newLine?: number
    content: string
}

export interface CodeFixFile {
    id: string
    path: string
    additions: number
    deletions: number
    chunks: DiffChunk[]
    rootCause: string
    nextDecisionSteps: string[]
    recommendations: string[]
}

const sampleFiles: CodeFixFile[] = [
    {
        id: 'sidebar',
        path: 'src/components/AppSidebar.tsx',
        additions: 14,
        deletions: 8,
        chunks: [
            {type: 'same', oldLine: 20, newLine: 20, content: "export type RailTab = 'explorer' | 'editor' | 'debug' | 'video'"},
            {type: 'del', oldLine: 21, content: "const tabs = [{id: 'explorer', label: 'Explorer'}]"},
            {type: 'add', newLine: 21, content: "const tabs = [{id: 'explorer', label: 'Explorer'}, {id: 'editor', label: 'Code Fix'}]"},
            {type: 'same', oldLine: 22, newLine: 22, content: ''},
            {type: 'del', oldLine: 23, content: "  const [subTab, setSubTab] = useState('explorer')"},
            {type: 'add', newLine: 23, content: "  const [sidebarTab, setSidebarTab] = useState<'explorer' | 'outline'>('explorer')"},
            {type: 'same', oldLine: 24, newLine: 24, content: '  return ('},
            {type: 'same', oldLine: 25, newLine: 25, content: '    <aside className="app-sidebar-panel">'},
            {type: 'del', oldLine: 26, content: '      <div className="app-sidebar-panel__header">Explorer</div>'},
            {type: 'add', newLine: 26, content: '      <div className="app-sidebar-panel__header">'},
            {type: 'add', newLine: 27, content: '        <button onClick={() => setSidebarTab("explorer")}>Explorer</button>'},
            {type: 'add', newLine: 28, content: '        <button onClick={() => setSidebarTab("outline")}>Outline</button>'},
            {type: 'add', newLine: 29, content: '      </div>'},
            {type: 'same', oldLine: 30, newLine: 30, content: '    </aside>'},
        ],
        rootCause:
            'The sidebar mixed icon navigation buttons and the Explorer tree inside a single collapsible container, causing element overlapping when expanded, missing outline subtab navigation, and flex height collapse.',
        nextDecisionSteps: [
            'Decide on a fixed 48px primary icon rail for top-level navigation.',
            'Separate the side panel into an independent container that expands beside the rail.',
            'Implement an interactive [Explorer] | [Outline] subtab toggle in the panel header.',
            'Add the Code Fix & Diff Editor as a primary rail navigation item.',
        ],
        recommendations: [
            'Maintain strict separation of concerns between rail navigation and content panels.',
            'Use explicit CSS flexbox width transitions instead of collapsing full components.',
            'Add accessible aria-current attributes to active tab buttons for keyboard & screen reader support.',
        ],
    },
    {
        id: 'app',
        path: 'src/App.tsx',
        additions: 6,
        deletions: 2,
        chunks: [
            {type: 'same', oldLine: 50, newLine: 50, content: '  const handleRailSelect = (tab: RailTab) => {'},
            {type: 'same', oldLine: 51, newLine: 51, content: '    setRailTab(tab)'},
            {type: 'same', oldLine: 52, newLine: 52, content: '  }'},
            {type: 'del', oldLine: 53, content: '  return <SidebarProvider><div className={styles.shell}>'},
            {type: 'add', newLine: 53, content: '  return <div className={styles.shell}>'},
            {type: 'add', newLine: 54, content: '    {railTab === "editor" ? <CodeFixEditor /> : null}'},
            {type: 'same', oldLine: 55, newLine: 55, content: '  </div>'},
        ],
        rootCause:
            'The App layout wrapped the shell in an unnecessary SidebarProvider containing min-h-svh constraints that conflicted with the app shell 100vh layout.',
        nextDecisionSteps: [
            'Remove SidebarProvider wrapper from App.tsx.',
            'Lazy-load CodeFixEditor and render it when railTab === "editor".',
            'Verify clean rendering of feature panels in 100vh app shell.',
        ],
        recommendations: [
            'Keep layout providers scoped to specific component subtrees rather than top-level app wrappers.',
            'Use React.lazy and Suspense for all heavy feature tabs to preserve initial load speed.',
        ],
    },
]

export function CodeFixEditor() {
    const [selectedFileId, setSelectedFileId] = useState<string>('sidebar')
    const [viewMode, setViewMode] = useState<'split' | 'unified'>('split')
    const [appliedStatus, setAppliedStatus] = useState<Record<string, boolean>>({})
    const [copied, setCopied] = useState(false)
    const [rootDrawerOpen, setRootDrawerOpen] = useState(false)
    const [unifiedCollapsed, setUnifiedCollapsed] = useState(false)

    // Resize state for split view: width of the right analysis panel (px)
    const [splitRightWidth, setSplitRightWidth] = useState(380)
    // Resize state for split view: height ratio of top code pane (0-1)
    const [splitCodeRatio, setSplitCodeRatio] = useState(0.5)
    // Resize state for unified view: height of the unified diff pane (px)
    const [unifiedDiffHeight, setUnifiedDiffHeight] = useState(320)

    // Refs for resize containers
    const splitViewRef = useRef<HTMLDivElement>(null)
    const codeColRef = useRef<HTMLDivElement>(null)
    const unifiedContainerRef = useRef<HTMLDivElement>(null)

    // Track dragging state
    const dragStateRef = useRef<{
        type: 'split-vertical' | 'split-horizontal' | 'unified-horizontal' | null
        startX: number
        startY: number
        startValue: number
    }>({type: null, startX: 0, startY: 0, startValue: 0})

    const handleMouseDown = useCallback(
        (type: 'split-vertical' | 'split-horizontal' | 'unified-horizontal', e: React.MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()
            if (type === 'split-vertical') {
                dragStateRef.current = {type, startX: e.clientX, startY: e.clientY, startValue: splitRightWidth}
            } else if (type === 'split-horizontal') {
                dragStateRef.current = {type, startX: e.clientX, startY: e.clientY, startValue: splitCodeRatio}
            } else {
                dragStateRef.current = {type, startX: e.clientX, startY: e.clientY, startValue: unifiedDiffHeight}
            }

            const handleMouseMove = (moveEvent: MouseEvent) => {
                const state = dragStateRef.current
                if (state.type === 'split-vertical' && splitViewRef.current) {
                    const containerWidth = splitViewRef.current.getBoundingClientRect().width
                    const delta = state.startX - moveEvent.clientX
                    const newWidth = Math.max(240, Math.min(state.startValue + delta, containerWidth - 300))
                    setSplitRightWidth(newWidth)
                } else if (state.type === 'split-horizontal' && codeColRef.current) {
                    const containerHeight = codeColRef.current.getBoundingClientRect().height
                    const delta = moveEvent.clientY - state.startY
                    const ratioDelta = delta / containerHeight
                    const newRatio = Math.max(0.2, Math.min(state.startValue + ratioDelta, 0.8))
                    setSplitCodeRatio(newRatio)
                } else if (state.type === 'unified-horizontal' && unifiedContainerRef.current) {
                    const containerRect = unifiedContainerRef.current.getBoundingClientRect()
                    const relativeY = moveEvent.clientY - containerRect.top
                    const newHeight = Math.max(150, Math.min(relativeY, containerRect.height - 200))
                    setUnifiedDiffHeight(newHeight)
                }
            }

            const handleMouseUp = () => {
                dragStateRef.current = {type: null, startX: 0, startY: 0, startValue: 0}
                document.removeEventListener('mousemove', handleMouseMove)
                document.removeEventListener('mouseup', handleMouseUp)
                document.body.style.cursor = ''
                document.body.style.userSelect = ''
            }

            document.body.style.cursor =
                type === 'split-vertical' ? 'col-resize' : 'row-resize'
            document.body.style.userSelect = 'none'
            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
        },
        [splitRightWidth, splitCodeRatio, unifiedDiffHeight]
    )

    // Cleanup drag listeners on unmount
    useEffect(() => {
        return () => {
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }
    }, [])

    const activeFile = sampleFiles.find((f) => f.id === selectedFileId) ?? sampleFiles[0]
    const isApplied = !!appliedStatus[activeFile.id]

    const handleApplyFix = () => {
        setAppliedStatus((prev) => ({...prev, [activeFile.id]: true}))
    }

    const handleDiscardFix = () => {
        setAppliedStatus((prev) => ({...prev, [activeFile.id]: false}))
    }

    const handleCopy = () => {
        const diffText = activeFile.chunks
            .map((c) => `${c.type === 'add' ? '+' : c.type === 'del' ? '-' : ' '} ${c.content}`)
            .join('\n')
        navigator.clipboard.writeText(diffText)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className={styles.container}>
            {/* Header controls */}
            <div className={styles.header}>
                <div className={styles.fileMeta}>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button type="button" className={styles.fileSelect} aria-label="Select file for code diff">
                                <FileCode2 size={13} />
                                <span>{activeFile.path}</span>
                                <ChevronDown size={12} className={styles.fileSelectChevron} />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="bottom" align="start" sideOffset={6} className="min-w-[260px]">
                            {sampleFiles.map((file) => (
                                <DropdownMenuItem
                                    key={file.id}
                                    onSelect={() => setSelectedFileId(file.id)}
                                    className={selectedFileId === file.id ? styles.fileMenuItemActive : ''}
                                >
                                    <FileCode2 size={13} className="shrink-0 opacity-60" />
                                    <span>{file.path}</span>
                                    {selectedFileId === file.id && (
                                        <Check size={12} className="ml-auto opacity-70" />
                                    )}
                                </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => handleCopy()}>
                                <Copy size={13} className="shrink-0 opacity-60" />
                                <span>{copied ? 'Copied!' : 'Copy Diff'}</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <div className={styles.diffStat}>
                        <span className={styles.statAdd}>+{activeFile.additions}</span>
                        <span className={styles.statDel}>-{activeFile.deletions}</span>
                    </div>

                    <span
                        className={`${styles.statusBadge} ${isApplied ? styles.statusApplied : styles.statusPending}`}
                    >
            {isApplied ? 'Fix Applied' : 'Pending Fix'}
          </span>
                </div>

                <div className={styles.controls}>
                    <button
                        className={`${styles.btn} ${viewMode === 'split' ? styles.btnActive : ''}`}
                        onClick={() => setViewMode('split')}
                        title="2-Panel Split View (Left: Code, Right: Analysis)"
                    >
                        <Columns size={14}/>
                        <span>Split (2-Panel)</span>
                    </button>
                    <button
                        className={`${styles.btn} ${viewMode === 'unified' ? styles.btnActive : ''}`}
                        onClick={() => setViewMode('unified')}
                        title="Single Panel Unified View with Analysis"
                    >
                        <AlignJustify size={14}/>
                        <span>Unified View</span>
                    </button>

                    {isApplied ? (
                        <button className={styles.btn} onClick={handleDiscardFix}>
                            <RefreshCw size={14}/>
                            <span>Reset</span>
                        </button>
                    ) : (
                        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleApplyFix}>
                            <Check size={14}/>
                            <span>Apply Fix</span>
                        </button>
                    )}
                </div>
            </div>

            {isApplied && (
                <div className={styles.banner} role="status">
                    <span>✓ Proposed code fix has been applied to {activeFile.path}</span>
                    <button className={styles.btn} onClick={handleDiscardFix}>
                        <X size={12}/> Revert
                    </button>
                </div>
            )}

            {/* Code Diff & Analysis Layout */}
            <div className={styles.editorBody}>
                {viewMode === 'split' ? (
                    <div className={styles.splitView} ref={splitViewRef} style={{gridTemplateColumns: `1fr 6px ${splitRightWidth}px`}}>
                        {/* LEFT PANEL: Stacked Original Code (top) & Proposed Code Fix (bottom) */}
                        <div className={styles.codeCol} ref={codeColRef}>
                            {/* Top: Original Code */}
                            <div className={styles.pane} style={{flex: `0 0 ${splitCodeRatio * 100}%`}}>
                                <div className={styles.paneHeader}>Original Code</div>
                                <div className={styles.codeScroll}>
                                    {activeFile.chunks
                                        .filter((c) => c.type !== 'add')
                                        .map((c, i) => (
                                            <div
                                                key={i}
                                                className={`${styles.line} ${c.type === 'del' ? styles.lineDel : styles.lineSame}`}
                                            >
                                                <span className={styles.lineNo}>{c.oldLine}</span>
                                                <span className={styles.lineContent}>{c.content}</span>
                                            </div>
                                        ))}
                                </div>
                            </div>

                            {/* Horizontal resize handle between code panes */}
                            <div
                                className={styles.resizeHandleH}
                                onMouseDown={(e) => handleMouseDown('split-horizontal', e)}
                                role="separator"
                                aria-orientation="horizontal"
                                aria-label="Resize code panes"
                                title="Drag to resize"
                            >
                                <GripHorizontal size={12} className={styles.resizeGripIcon}/>
                            </div>

                            {/* Bottom: Proposed Code Fix */}
                            <div className={styles.pane} style={{flex: `0 0 ${(1 - splitCodeRatio) * 100}%`}}>
                                <div className={styles.paneHeader}>Proposed Code Fix</div>
                                <div className={styles.codeScroll}>
                                    {activeFile.chunks
                                        .filter((c) => c.type !== 'del')
                                        .map((c, i) => (
                                            <div
                                                key={i}
                                                className={`${styles.line} ${c.type === 'add' ? styles.lineAdd : styles.lineSame}`}
                                            >
                                                <span className={styles.lineNo}>{c.newLine}</span>
                                                <span className={styles.lineContent}>{c.content}</span>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </div>

                        {/* Vertical resize handle between code and analysis */}
                        <div
                            className={styles.resizeHandleV}
                            onMouseDown={(e) => handleMouseDown('split-vertical', e)}
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="Resize analysis panel"
                            title="Drag to resize"
                        >
                            <GripVertical size={12} className={styles.resizeGripIcon}/>
                        </div>

                        {/* RIGHT PANEL: [ Rootcause ] | [ Decision ] | [ Recommendation ] */}
                        <aside className={styles.analysisPane} aria-label="Rootcause, Decision and Recommendation panel">
                            {/* Top: Rootcause */}
                            <div className={styles.sectionCard}>
                                <button
                                    type="button"
                                    className={`${styles.cardHeader} ${styles.cardHeaderRoot} ${styles.cardHeaderClickable}`}
                                    onClick={() => setRootDrawerOpen(true)}
                                    aria-label="Open rootcause details"
                                >
                                    <AlertCircle size={15}/>
                                    <span>Rootcause</span>
                                    <ChevronRight size={14} className={styles.cardHeaderChevron}/>
                                </button>
                                <p className={styles.cardBody}>{activeFile.rootCause}</p>
                            </div>

                            {/* Middle: Decision */}
                            <div className={styles.sectionCard}>
                                <div className={`${styles.cardHeader} ${styles.cardHeaderDecision}`}>
                                    <GitCommit size={15}/>
                                    <span>Decision</span>
                                </div>
                                <div className={styles.stepList}>
                                    {activeFile.nextDecisionSteps.map((step, idx) => (
                                        <div key={idx} className={styles.stepItem}>
                                            <span className={styles.stepNumber}>{idx + 1}</span>
                                            <span>{step}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Bottom: Recommendation */}
                            <div className={styles.sectionCard}>
                                <div className={`${styles.cardHeader} ${styles.cardHeaderRec}`}>
                                    <Lightbulb size={15}/>
                                    <span>Recommendation</span>
                                </div>
                                <div className={styles.recList}>
                                    {activeFile.recommendations.map((rec, idx) => (
                                        <div key={idx} className={styles.recItem}>
                                            <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5"/>
                                            <span>{rec}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </aside>
                    </div>
                ) : (
                    /* UNIFIED VIEW: Single Panel Layout */
                    <div className={styles.unifiedContainer} ref={unifiedContainerRef}>
                        {/* Top: Unified Diff Pane */}
                        <div className={styles.unifiedPane} style={{height: unifiedDiffHeight, minHeight: 150}}>
                            <div className={styles.paneHeader}>Unified Diff</div>
                            <div className={styles.codeScroll}>
                                {activeFile.chunks.map((c, i) => (
                                    <div
                                        key={i}
                                        className={`${styles.line} ${
                                            c.type === 'add' ? styles.lineAdd : c.type === 'del' ? styles.lineDel : styles.lineSame
                                        }`}
                                    >
                                        <span className={styles.lineNo}>{c.newLine ?? c.oldLine}</span>
                                        <span className={styles.lineContent}>
                      {c.type === 'add' ? '+ ' : c.type === 'del' ? '- ' : '  '}
                                            {c.content}
                    </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Horizontal resize handle between diff and analysis */}
                        <div
                            className={styles.resizeHandleH}
                            onMouseDown={(e) => handleMouseDown('unified-horizontal', e)}
                            role="separator"
                            aria-orientation="horizontal"
                            aria-label="Resize unified diff pane"
                            title="Drag to resize"
                        >
                            <GripHorizontal size={12} className={styles.resizeGripIcon}/>
                        </div>

                        {/* Divider Line — click to toggle analysis panel */}
                        <div
                            className={`${styles.dividerSection} ${styles.dividerClickable}`}
                            onClick={() => setUnifiedCollapsed((prev) => !prev)}
                            role="button"
                            tabIndex={0}
                            aria-expanded={!unifiedCollapsed}
                            aria-label={unifiedCollapsed ? 'Expand analysis panel' : 'Collapse analysis panel'}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setUnifiedCollapsed((prev) => !prev) }}
                        >
                            <div className={styles.dividerLine}/>
                            <span className={styles.dividerText}>
                                {unifiedCollapsed ? 'Show Analysis' : 'Diagnostic Analysis & Decision Path'}
                            </span>
                            <ChevronDown
                                size={14}
                                className={`${styles.dividerChevron} ${unifiedCollapsed ? styles.dividerChevronCollapsed : ''}`}
                            />
                            <div className={styles.dividerLine}/>
                        </div>

                        {/* Bottom: Rootcause, Decision & Recommendation */}
                        {!unifiedCollapsed && (
                        <div className={styles.unifiedAnalysis}>
                            {/* Rootcause */}
                            <div className={styles.sectionCard}>
                                <button
                                    type="button"
                                    className={`${styles.cardHeader} ${styles.cardHeaderRoot} ${styles.cardHeaderClickable}`}
                                    onClick={() => setUnifiedCollapsed(true)}
                                    aria-label="Collapse analysis panel"
                                >
                                    <AlertCircle size={15}/>
                                    <span>Rootcause</span>
                                    <ChevronDown size={14} className={styles.cardHeaderChevron}/>
                                </button>
                                <p className={styles.cardBody}>{activeFile.rootCause}</p>
                            </div>

                            {/* Decision */}
                            <div className={styles.sectionCard}>
                                <div className={`${styles.cardHeader} ${styles.cardHeaderDecision}`}>
                                    <GitCommit size={15}/>
                                    <span>Decision</span>
                                </div>
                                <div className={styles.stepList}>
                                    {activeFile.nextDecisionSteps.map((step, idx) => (
                                        <div key={idx} className={styles.stepItem}>
                                            <span className={styles.stepNumber}>{idx + 1}</span>
                                            <span>{step}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Recommendation */}
                            <div className={styles.sectionCard}>
                                <div className={`${styles.cardHeader} ${styles.cardHeaderRec}`}>
                                    <Lightbulb size={15}/>
                                    <span>Recommendation</span>
                                </div>
                                <div className={styles.recList}>
                                    {activeFile.recommendations.map((rec, idx) => (
                                        <div key={idx} className={styles.recItem}>
                                            <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5"/>
                                            <span>{rec}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        )}
                    </div>
                )}
            </div>

            {/* Rootcause Drawer for Split View */}
            <Sheet open={rootDrawerOpen} onOpenChange={setRootDrawerOpen}>
                <SheetContent side="right" className="w-[400px] sm:w-[540px]">
                    <SheetHeader>
                        <SheetTitle className="flex items-center gap-2 text-red-500">
                            <AlertCircle size={18}/>
                            Rootcause Analysis
                        </SheetTitle>
                        <SheetDescription>Diagnostic analysis for {activeFile.path}</SheetDescription>
                    </SheetHeader>
                    <div className="mt-4 space-y-4">
                        <div className={styles.sectionCard}>
                            <div className={`${styles.cardHeader} ${styles.cardHeaderRoot}`}>
                                <AlertCircle size={15}/>
                                <span>Rootcause</span>
                            </div>
                            <p className={styles.cardBody}>{activeFile.rootCause}</p>
                        </div>
                        <div className={styles.sectionCard}>
                            <div className={`${styles.cardHeader} ${styles.cardHeaderDecision}`}>
                                <GitCommit size={15}/>
                                <span>Decision</span>
                            </div>
                            <div className={styles.stepList}>
                                {activeFile.nextDecisionSteps.map((step, idx) => (
                                    <div key={idx} className={styles.stepItem}>
                                        <span className={styles.stepNumber}>{idx + 1}</span>
                                        <span>{step}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className={styles.sectionCard}>
                            <div className={`${styles.cardHeader} ${styles.cardHeaderRec}`}>
                                <Lightbulb size={15}/>
                                <span>Recommendation</span>
                            </div>
                            <div className={styles.recList}>
                                {activeFile.recommendations.map((rec, idx) => (
                                    <div key={idx} className={styles.recItem}>
                                        <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5"/>
                                        <span>{rec}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}
