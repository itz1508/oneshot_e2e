/**
 * FileViewer — inline file content display within the chat screen.
 * Shown when a file is clicked in the Explorer tree.
 * Content is fetched from the workspace API (real filesystem).
 * 
 * Frontend files (HTML, TSX, JSX) show split view: code left, HTML preview right.
 * Backend files show full-width code.
 */

import {X, FileCode2, Copy, Check, Loader2, Eye, ExternalLink, Download} from 'lucide-react'
import {useState, useEffect} from 'react'
import {readFile} from '../agent/workspaceApi'
import {fetchFileStatus, type StatusColor} from '../agent/statusApi'
import {getStatusBackgroundColor, classifyStatusColor, getStatusColorLabel} from '../utils/codeQuality'
import {fetchIssues, issueForLine, getIssueColor, type Issue, type FixProposal} from '../agent/issueApi'
import {IssueDetailPanel} from './IssueDetailPanel'
import {FixPreviewModal} from './FixPreviewModal'

interface FileViewerProps {
    files: {name: string, path: string}[]
    activeIndex: number
    onSwitch: (index: number) => void
    onClose: () => void
}

const isFrontendFile = (path: string): boolean => {
    const lower = path.toLowerCase()
    return lower.endsWith('.html') || lower.endsWith('.tsx') ||
           lower.endsWith('.jsx') || lower.endsWith('.vue')
}

const isPdfFile = (path: string): boolean => path.toLowerCase().endsWith('.pdf')
const isVideoFile = (path: string): boolean => {
    const lower = path.toLowerCase()
    return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.ogg') || lower.endsWith('.mov')
}

export function FileViewer({files, activeIndex, onSwitch, onClose}: FileViewerProps) {
    const [copied, setCopied] = useState(false)
    const [content, setContent] = useState<string>('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showPreview, setShowPreview] = useState(true)
    const [contextMenu, setContextMenu] = useState<{x: number, y: number, line: number} | null>(null)
    const [statuses, setStatuses] = useState<StatusColor[]>([])
    const [selectedStatus, setSelectedStatus] = useState<StatusColor | null>(null)
    const [issues, setIssues] = useState<Issue[]>([])
    const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
    const [fixProposal, setFixProposal] = useState<FixProposal | null>(null)

    const active = files[activeIndex] ?? files[0]
    const isFrontend = active ? isFrontendFile(active.path) : false
    const isPdf = active ? isPdfFile(active.path) : false
    const isVideo = active ? isVideoFile(active.path) : false

    // Fetch file content when the active file changes (skip for PDF and Video)
    useEffect(() => {
        if (!active) return
        if (isPdfFile(active.path) || isVideoFile(active.path)) {
            setLoading(false)
            setError(null)
            setContent('')
            return
        }
        let cancelled = false
        setLoading(true)
        setError(null)
        setContent('')

        readFile(active.path)
            .then((text) => {
                if (!cancelled) setContent(text)
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : String(err))
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {cancelled = true}
    }, [active?.path])

    // Poll status color for the active file every 5s
    useEffect(() => {
        if (!active) return
        let cancelled = false

        const loadStatus = () => {
            fetchFileStatus(active.path)
                .then((s) => { if (!cancelled) setStatuses(s ? [s] : []) })
                .catch((err) => { console.warn('Status poll error:', err) })
            fetchIssues('.')
                .then((i) => { if (!cancelled) setIssues(i) })
                .catch((err) => { console.warn('Issues poll error:', err) })
        }

        loadStatus()
        const interval = setInterval(loadStatus, 5000)

        return () => {
            cancelled = true
            clearInterval(interval)
        }
    }, [active?.path])

    if (!active) return null

    const handleCopy = () => {
        navigator.clipboard.writeText(content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleContextMenu = (e: React.MouseEvent, lineNum: number) => {
        e.preventDefault()
        setContextMenu({x: e.clientX, y: e.clientY, line: lineNum})
    }

    const closeContextMenu = () => setContextMenu(null)

    useEffect(() => {
        if (contextMenu) {
            document.addEventListener('click', closeContextMenu)
            return () => document.removeEventListener('click', closeContextMenu)
        }
    }, [contextMenu])

    const lines = content.split('\n')

    return (
        <div className="file-viewer">
            <div className="file-viewer__header">
                <div className="file-viewer__meta">
                    <FileCode2 size={14} className="file-viewer__icon"/>
                    <span className="file-viewer__path">{active.path}</span>
                    {!loading && !error && <span className="file-viewer__lines">{lines.length} lines</span>}
                    {loading && <span className="file-viewer__lines">Loading...</span>}
                </div>
                <div className="file-viewer__actions">
                    {isPdf && (
                        <>
                            <a
                                href={`/v1/workspace/raw?path=${encodeURIComponent(active.path)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="file-viewer__btn"
                                style={{textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px'}}
                                title="Open PDF in new tab"
                            >
                                <ExternalLink size={13}/>
                                <span>Open PDF</span>
                            </a>
                            <a
                                href={`/v1/workspace/raw?path=${encodeURIComponent(active.path)}`}
                                download={active.name}
                                className="file-viewer__btn"
                                style={{textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px'}}
                                title="Download PDF diagram"
                            >
                                <Download size={13}/>
                                <span>Download</span>
                            </a>
                        </>
                    )}
                    {isFrontend && !loading && !error && (
                        <button
                            className="file-viewer__btn"
                            onClick={() => setShowPreview(!showPreview)}
                            title={showPreview ? 'Hide preview' : 'Show preview'}
                        >
                            <Eye size={13}/>
                            <span>{showPreview ? 'Hide' : 'Show'}</span>
                        </button>
                    )}
                    {!isPdf && (
                        <button
                            className="file-viewer__btn"
                            onClick={handleCopy}
                            title="Copy file content"
                            disabled={loading || !!error}
                        >
                            {copied ? <Check size={13}/> : <Copy size={13}/>}
                            <span>{copied ? 'Copied' : 'Copy'}</span>
                        </button>
                    )}
                    <button
                        className="file-viewer__btn file-viewer__btn--close"
                        onClick={onClose}
                        title="Close file viewer"
                    >
                        <X size={13}/>
                    </button>
                </div>
            </div>
            <div className="file-viewer__body" style={{display: 'flex', gap: 0, height: '100%'}}>
                {isPdf ? (
                    <div style={{flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: '400px', background: '#18181b'}}>
                        <iframe
                            src={`/v1/workspace/raw?path=${encodeURIComponent(active.path)}`}
                            style={{flex: 1, width: '100%', height: '100%', border: 'none'}}
                            title={active.name}
                        />
                    </div>
                ) : isVideo ? (
                    <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '400px', background: '#09090b', padding: '24px'}}>
                        <video
                            src={`/v1/workspace/raw?path=${encodeURIComponent(active.path)}`}
                            controls
                            playsInline
                            autoPlay
                            style={{maxWidth: '100%', maxHeight: '80vh', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)'}}
                        />
                    </div>
                ) : (
                    <>
                        {/* Code pane */}
                        <div style={{flex: 1, overflow: 'auto', borderRight: isFrontend && showPreview ? '1px solid var(--border)' : 'none'}}>
                            {loading ? (
                                <div className="file-viewer__loading">
                                    <Loader2 size={16} className="file-viewer__spinner"/>
                                    <span>Loading file content...</span>
                                </div>
                            ) : error ? (
                                <div className="file-viewer__error">
                                    <span>Failed to load: {error}</span>
                                </div>
                            ) : (
                                <>
                            <pre className="file-viewer__code">
                                {lines.map((line, i) => {
                                    const lineNum = i + 1
                                    // Status colour (file-level background)
                                    const normalizedActive = active.path.replace(/\\/g, '/')
                                    const fileStatus = statuses.find(s => {
                                        const normalized = s.file_path.replace(/\\/g, '/')
                                        return normalizedActive.endsWith(normalized) || normalized === normalizedActive
                                    })
                                    const statusBg = fileStatus ? getStatusBackgroundColor(fileStatus) : 'transparent'

                                    // Issue indicator (line-level left border)
                                    const lineIssue = issueForLine(issues, active.path, lineNum)
                                    const issueBorder = lineIssue
                                        ? `3px solid ${getIssueColor(lineIssue.color_category, lineIssue.is_dead)}`
                                        : '3px solid transparent'

                                    return (
                                        <div
                                            key={i}
                                            className="file-viewer__line"
                                            style={{background: statusBg, borderLeft: issueBorder}}
                                            onContextMenu={(e) => handleContextMenu(e, lineNum)}
                                            onClick={() => {
                                                if (lineIssue) {
                                                    setSelectedIssue(lineIssue)
                                                    setSelectedStatus(null)
                                                } else if (fileStatus) {
                                                    setSelectedStatus(fileStatus)
                                                    setSelectedIssue(null)
                                                }
                                            }}
                                        >
                                            <span className="file-viewer__lineno">{lineNum}</span>
                                            <code className="file-viewer__content">{line || ' '}</code>
                                        </div>
                                    )
                                })}
                            </pre>
                            
                            {/* Right-click context menu */}
                            {contextMenu && (
                                <div
                                    style={{
                                        position: 'fixed',
                                        left: contextMenu.x,
                                        top: contextMenu.y,
                                        background: 'var(--background)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '6px',
                                        padding: '4px 0',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                        zIndex: 1000,
                                        fontSize: '12px',
                                        minWidth: '140px'
                                    }}
                                >
                                    <div style={{padding: '6px 12px', cursor: 'pointer'}}>
                                        Copy line {contextMenu.line}
                                    </div>
                                    <div style={{padding: '6px 12px', cursor: 'pointer'}}>
                                        Copy path
                                    </div>
                                    <div style={{padding: '6px 12px', cursor: 'pointer', borderTop: '1px solid var(--border)'}}>
                                        Open in IDE
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Issue detail panel */}
                {selectedIssue && (
                    <div style={{width: '320px', borderLeft: '1px solid var(--border)', overflow: 'auto'}}>
                        <IssueDetailPanel
                            issue={selectedIssue}
                            onClose={() => setSelectedIssue(null)}
                            onFixRequested={(proposal) => setFixProposal(proposal)}
                        />
                    </div>
                )}

                {/* Status detail panel */}
                {selectedStatus && !selectedIssue && (
                    <div style={{
                        width: '280px',
                        borderLeft: '1px solid var(--border)',
                        background: 'var(--muted)',
                        padding: '12px',
                        fontSize: '12px',
                        overflow: 'auto'
                    }}>
                        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '12px'}}>
                            <strong>Status Detail</strong>
                            <button onClick={() => setSelectedStatus(null)} style={{background: 'none', border: 'none', cursor: 'pointer', padding: 0}}>
                                <X size={14}/>
                            </button>
                        </div>
                        <div style={{display: 'grid', gap: '8px'}}>
                            <div>
                                <div style={{fontWeight: 600, marginBottom: '2px'}}>Color</div>
                                <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                                    <div style={{
                                        width: '16px',
                                        height: '16px',
                                        borderRadius: '3px',
                                        background: getStatusBackgroundColor(selectedStatus)
                                    }}/>
                                    <span>{getStatusColorLabel(classifyStatusColor(selectedStatus))}</span>
                                </div>
                            </div>
                            <div>
                                <div style={{fontWeight: 600, marginBottom: '2px'}}>Language</div>
                                <div>{selectedStatus.language}</div>
                            </div>
                            <div>
                                <div style={{fontWeight: 600, marginBottom: '2px'}}>Severity</div>
                                <div>{selectedStatus.severity}</div>
                            </div>
                            <div>
                                <div style={{fontWeight: 600, marginBottom: '2px'}}>Gap Status</div>
                                <div>{selectedStatus.gap_status || 'none'}</div>
                            </div>
                            <div>
                                <div style={{fontWeight: 600, marginBottom: '2px'}}>Category</div>
                                <div>{selectedStatus.gap_category || 'none'}</div>
                            </div>
                            {selectedStatus.is_stale && (
                                <div>
                                    <div style={{fontWeight: 600, marginBottom: '2px'}}>Stale</div>
                                    <div>Yes — repo changed since last check</div>
                                </div>
                            )}
                            {selectedStatus.is_dead && (
                                <div>
                                    <div style={{fontWeight: 600, marginBottom: '2px'}}>Dead</div>
                                    <div>No references found</div>
                                </div>
                            )}
                            <div>
                                <div style={{fontWeight: 600, marginBottom: '2px'}}>Message</div>
                                <div>{selectedStatus.message || 'no issues'}</div>
                            </div>
                            <div>
                                <div style={{fontWeight: 600, marginBottom: '2px'}}>Trace</div>
                                <div style={{fontSize: '10px', color: 'var(--muted-foreground)'}}>{selectedStatus.trace_source}</div>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Preview pane (frontend files only) */}
                {isFrontend && showPreview && !loading && !error && (
                    <div style={{flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column'}}>
                        <div style={{padding: '6px 12px', fontSize: '11px', fontWeight: 600, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--muted)'}}>
                            <Eye size={12}/>
                            <span>Preview</span>
                        </div>
                        <iframe
                            srcDoc={content}
                            style={{flex: 1, border: 'none', width: '100%', height: '100%'}}
                            sandbox="allow-scripts"
                            title="HTML Preview"
                        />
                    </div>
                )}
                </>
                )}
            </div>
            {files.length > 1 ? (
                <div className="file-viewer__pager">
                    {files.map((file, i) => (
                        <button
                            key={file.path}
                            className={`file-viewer__dot${i === activeIndex ? ' file-viewer__dot--active' : ''}`}
                            onClick={() => onSwitch(i)}
                            title={`${file.name} (${i + 1}/${files.length})`}
                            aria-label={`Switch to ${file.name}`}
                        />
                    ))}
                    <span className="file-viewer__page-label">{activeIndex + 1} / {files.length}</span>
                </div>
            ) : null}

            {/* Fix preview modal */}
            {fixProposal && (
                <FixPreviewModal
                    proposal={fixProposal}
                    onApply={() => {
                        setFixProposal(null)
                        setSelectedIssue(null)
                        // Re-read file content and re-detect issues
                        if (active) {
                            readFile(active.path)
                                .then(setContent)
                                .catch(() => {})
                            fetchIssues('.').then(setIssues).catch(() => {})
                        }
                    }}
                    onCancel={() => setFixProposal(null)}
                />
            )}
        </div>
    )
}
