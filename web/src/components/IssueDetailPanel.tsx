/**
 * IssueDetailPanel — displays full issue context when clicking a coloured line.
 *
 * Shows: root cause, success criteria, fix recommendation,
 * optional refactor suggestion, and colour trace.
 */

import {X, AlertCircle, CheckCircle, Lightbulb, Wrench, Wrench as FixIcon, Loader2} from 'lucide-react'
import {useState} from 'react'
import type {Issue, FixProposal} from '../agent/issueApi'
import {getIssueColor, fetchFixProposal} from '../agent/issueApi'
import styles from './IssueDetailPanel.module.css'

interface IssueDetailPanelProps {
    issue: Issue
    onClose: () => void
    onFixRequested?: (proposal: FixProposal) => void
}

const TYPE_LABEL: Record<string, string> = {
    test_failure: 'Test Failure',
    type_error: 'Type Error',
    lint: 'Lint Issue',
    dead_code: 'Dead Code',
}

const SEVERITY_CLASS: Record<string, string> = {
    error: styles.severityError,
    warning: styles.severityWarning,
    info: styles.severityInfo,
}

export function IssueDetailPanel({issue, onClose, onFixRequested}: IssueDetailPanelProps) {
    const typeLabel = TYPE_LABEL[issue.type] || issue.type
    const sevClass = SEVERITY_CLASS[issue.severity] || ''
    const [fixLoading, setFixLoading] = useState(false)

    const handleRequestFix = async () => {
        setFixLoading(true)
        try {
            const proposal = await fetchFixProposal(issue.id)
            onFixRequested?.(proposal)
        } catch (err) {
            console.error('Fix proposal failed:', err)
        } finally {
            setFixLoading(false)
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <AlertCircle size={14} className={styles.headerIcon}/>
                    <span className={styles.typeLabel}>{typeLabel}</span>
                    <span className={`${styles.severityBadge} ${sevClass}`}>
                        {issue.severity}
                    </span>
                </div>
                <button className={styles.closeBtn} onClick={onClose} title="Close">
                    <X size={14}/>
                </button>
            </div>

            <div className={styles.message}>
                {issue.message}
            </div>

            <div className={styles.colorBar}>
                <div
                    className={styles.colorSwatch}
                    style={{background: getIssueColor(issue.color_category, issue.is_dead)}}
                />
                <span className={styles.colorLabel}>
                    {issue.color_category}{issue.is_dead ? ' (dead)' : ''}
                </span>
                <span className={styles.location}>
                    {issue.file_path}:{issue.line_number}
                </span>
            </div>

            {issue.root_cause && (
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>
                        <AlertCircle size={12}/>
                        <span>Root Cause</span>
                    </div>
                    <p className={styles.sectionBody}>{issue.root_cause}</p>
                </div>
            )}

            {issue.success_criteria && (
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>
                        <CheckCircle size={12}/>
                        <span>Success Criteria</span>
                    </div>
                    <p className={styles.sectionBody}>{issue.success_criteria}</p>
                </div>
            )}

            {issue.recommendation && (
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>
                        <Lightbulb size={12}/>
                        <span>Recommendation</span>
                    </div>
                    <p className={styles.sectionBody}>{issue.recommendation}</p>
                </div>
            )}

            {issue.refactor_suggestion && (
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>
                        <Wrench size={12}/>
                        <span>Refactor Suggestion</span>
                    </div>
                    <p className={styles.sectionBody}>{issue.refactor_suggestion}</p>
                </div>
            )}

            <button
                className={styles.fixBtn}
                onClick={handleRequestFix}
                disabled={fixLoading}
            >
                {fixLoading ? (
                    <><Loader2 size={12} className={styles.fixSpinner}/> Analysing...</>
                ) : (
                    <><FixIcon size={12}/> Apply Fix</>
                )}
            </button>
        </div>
    )
}
