/**
 * FixPreviewModal — before/after diff view for issue fix proposals.
 *
 * Shows removed lines (red) and the full fixed content.
 * User can Apply (writes fix via workspace API) or Cancel.
 */

import {X, Check, AlertTriangle, Loader2} from 'lucide-react'
import {useState} from 'react'
import type {FixProposal} from '../agent/issueApi'
import {writeFile} from '../agent/workspaceApi'
import styles from './FixPreviewModal.module.css'

interface FixPreviewModalProps {
    proposal: FixProposal
    onApply: () => void
    onCancel: () => void
}

export function FixPreviewModal({proposal, onApply, onCancel}: FixPreviewModalProps) {
    const [applying, setApplying] = useState(false)
    const [applyError, setApplyError] = useState<string | null>(null)

    const handleApply = async () => {
        setApplying(true)
        setApplyError(null)
        try {
            await writeFile(proposal.file_path, proposal.fixed_content)
            onApply()
        } catch (err) {
            setApplyError(err instanceof Error ? err.message : String(err))
            setApplying(false)
        }
    }

    // Build simple diff view: show removed lines in red
    const originalLines = proposal.original_content.split('\n')
    const fixedLines = proposal.fixed_content.split('\n')

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <AlertTriangle size={14} className={styles.headerIcon}/>
                        <span className={styles.title}>Fix Preview</span>
                        <span className={styles.filePath}>{proposal.file_path}</span>
                    </div>
                    <button className={styles.closeBtn} onClick={onCancel} title="Cancel">
                        <X size={14}/>
                    </button>
                </div>

                <div className={styles.description}>
                    {proposal.description}
                </div>

                {!proposal.auto_applicable && (
                    <div className={styles.warning}>
                        This fix cannot be auto-applied. Use the recommendation as guidance.
                    </div>
                )}

                <div className={styles.diffContainer}>
                    {/* Removed lines */}
                    {proposal.lines_removed > 0 && (
                        <div className={styles.diffSection}>
                            <div className={styles.diffLabel}>Removed ({proposal.lines_removed} line{proposal.lines_removed !== 1 ? 's' : ''})</div>
                            <pre className={styles.diffRemoved}>
                                {originalLines.filter((line, i) => {
                                    // Show lines around the fix area
                                    const totalOrig = originalLines.length
                                    const totalFixed = fixedLines.length
                                    const diff = totalOrig - totalFixed
                                    if (diff <= 0) return false
                                    // Mark lines that exist in original but not in fixed
                                    return i >= fixedLines.length || line !== fixedLines[i]
                                }).slice(0, 20).join('\n')}
                            </pre>
                        </div>
                    )}

                    {/* Fixed content preview */}
                    <div className={styles.diffSection}>
                        <div className={styles.diffLabel}>
                            {proposal.auto_applicable ? 'Result' : 'Current content'}
                        </div>
                        <pre className={styles.codePreview}>
                            {fixedLines.slice(
                                Math.max(0, (proposal.lines_removed > 0 ? 0 : 0)),
                                Math.min(fixedLines.length, 50)
                            ).join('\n')}
                            {fixedLines.length > 50 && '\n... (truncated)'}
                        </pre>
                    </div>
                </div>

                {applyError && (
                    <div className={styles.error}>{applyError}</div>
                )}

                <div className={styles.footer}>
                    <button
                        className={styles.cancelBtn}
                        onClick={onCancel}
                        disabled={applying}
                    >
                        Cancel
                    </button>
                    <button
                        className={proposal.auto_applicable ? styles.applyBtn : styles.applyBtnDisabled}
                        onClick={handleApply}
                        disabled={applying || !proposal.auto_applicable}
                    >
                        {applying ? (
                            <><Loader2 size={13} className={styles.spinner}/> Applying...</>
                        ) : (
                            <><Check size={13}/> {proposal.auto_applicable ? 'Apply Fix' : 'Not Auto-Applicable'}</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
