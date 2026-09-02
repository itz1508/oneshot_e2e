/**
 * SettingsModal — Application Configuration & Template/Repository Management.
 *
 * Authority:
 * - Location: Settings -> Template / Repository
 * - Modes: Use Template, Clone, Fork, Existing Repository
 * - Invariant: No automatic mutation; requires explicit Apply confirmation.
 */

import {useState} from 'react'
import {X, Settings, FolderGit2, Check, ShieldCheck, Box, Sparkles} from 'lucide-react'
import styles from './SettingsModal.module.css'

interface SettingsModalProps {
    open: boolean
    onClose: () => void
}

type RepoMode = 'template' | 'clone' | 'fork' | 'existing'

export function SettingsModal({open, onClose}: SettingsModalProps) {
    const [activeSection, setActiveSection] = useState<'repo' | 'general' | 'keys'>('repo')
    const [repoMode, setRepoMode] = useState<RepoMode>('template')
    
    // Form states
    const [templateType, setTemplateType] = useState('full-e2e')
    const [remoteUrl, setRemoteUrl] = useState('')
    const [forkTarget, setForkTarget] = useState('')
    const [localPath, setLocalPath] = useState('./workspace')
    const [appliedStatus, setAppliedStatus] = useState<string | null>(null)

    if (!open) return null

    const handleApply = () => {
        let msg = ''
        if (repoMode === 'template') {
            msg = `Applied template [${templateType}] to workspace (${localPath})`
        } else if (repoMode === 'clone') {
            msg = `Configured clone from [${remoteUrl || 'default remote'}] -> local workspace (${localPath})`
        } else if (repoMode === 'fork') {
            msg = `Configured fork target [${forkTarget || 'user-fork'}] from [${remoteUrl || 'source'}] -> local workspace (${localPath})`
        } else {
            msg = `Switched active workspace to local repository (${localPath})`
        }
        setAppliedStatus(msg)
        setTimeout(() => setAppliedStatus(null), 4000)
    }

    return (
        <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.titleGroup}>
                        <Settings className={styles.titleIcon} size={18} />
                        <span className={styles.title}>Workspace & Repository Settings</span>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Close settings">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className={styles.content}>
                    {/* Sidebar Tabs */}
                    <div className={styles.sidebar}>
                        <button
                            className={`${styles.navItem} ${activeSection === 'repo' ? styles.navItemActive : ''}`}
                            onClick={() => setActiveSection('repo')}
                        >
                            <FolderGit2 size={15} />
                            <span>Template / Repository</span>
                        </button>
                        <button
                            className={`${styles.navItem} ${activeSection === 'general' ? styles.navItemActive : ''}`}
                            onClick={() => setActiveSection('general')}
                        >
                            <Box size={15} />
                            <span>General Preferences</span>
                        </button>
                        <button
                            className={`${styles.navItem} ${activeSection === 'keys' ? styles.navItemActive : ''}`}
                            onClick={() => setActiveSection('keys')}
                        >
                            <ShieldCheck size={15} />
                            <span>Provider API Keys</span>
                        </button>
                    </div>

                    {/* Main Panel */}
                    <div className={styles.mainPanel}>
                        {activeSection === 'repo' && (
                            <>
                                <div className={styles.sectionHeader}>
                                    <h3 className={styles.sectionTitle}>Template / Repository Initialization</h3>
                                    <p className={styles.sectionDesc}>
                                        Select how your workspace is provisioned. Changes require explicit confirmation before application.
                                    </p>
                                </div>

                                {/* Option Cards */}
                                <div className={styles.optionGrid}>
                                    <div
                                        className={`${styles.optionCard} ${repoMode === 'template' ? styles.optionCardSelected : ''}`}
                                        onClick={() => setRepoMode('template')}
                                    >
                                        <div className={styles.optionTop}>
                                            <span className={styles.optionName}>Use Template</span>
                                            <span className={styles.optionBadge}>Recommended</span>
                                        </div>
                                        <p className={styles.optionDetails}>
                                            Bootstrap a verified deterministic workspace from an official template structure.
                                        </p>
                                    </div>

                                    <div
                                        className={`${styles.optionCard} ${repoMode === 'clone' ? styles.optionCardSelected : ''}`}
                                        onClick={() => setRepoMode('clone')}
                                    >
                                        <div className={styles.optionTop}>
                                            <span className={styles.optionName}>Clone</span>
                                            <span className={styles.optionBadge}>Remote</span>
                                        </div>
                                        <p className={styles.optionDetails}>
                                            Clone a remote Git repository into a fresh local workspace folder.
                                        </p>
                                    </div>

                                    <div
                                        className={`${styles.optionCard} ${repoMode === 'fork' ? styles.optionCardSelected : ''}`}
                                        onClick={() => setRepoMode('fork')}
                                    >
                                        <div className={styles.optionTop}>
                                            <span className={styles.optionName}>Fork</span>
                                            <span className={styles.optionBadge}>GitHub / Git</span>
                                        </div>
                                        <p className={styles.optionDetails}>
                                            Fork the source repository to your user/org namespace then bind locally.
                                        </p>
                                    </div>

                                    <div
                                        className={`${styles.optionCard} ${repoMode === 'existing' ? styles.optionCardSelected : ''}`}
                                        onClick={() => setRepoMode('existing')}
                                    >
                                        <div className={styles.optionTop}>
                                            <span className={styles.optionName}>Existing Repository</span>
                                            <span className={styles.optionBadge}>Local</span>
                                        </div>
                                        <p className={styles.optionDetails}>
                                            Open and verify an existing directory with tracked source files.
                                        </p>
                                    </div>
                                </div>

                                {/* Form Details */}
                                <div className={styles.formCard}>
                                    {repoMode === 'template' && (
                                        <div className={styles.formRow}>
                                            <label className={styles.formLabel}>Select Template Blueprint</label>
                                            <select
                                                className={styles.formInput}
                                                value={templateType}
                                                onChange={(e) => setTemplateType(e.target.value)}
                                            >
                                                <option value="full-e2e">OneShot Production E2E (Full Google ADK 2.0 Graph)</option>
                                                <option value="starter-python">Deterministic Python Micro-Service Template</option>
                                                <option value="starter-typescript">TypeScript Strict ESM Service Template</option>
                                            </select>
                                        </div>
                                    )}

                                    {(repoMode === 'clone' || repoMode === 'fork') && (
                                        <div className={styles.formRow}>
                                            <label className={styles.formLabel}>Source Repository URL</label>
                                            <input
                                                type="text"
                                                className={styles.formInput}
                                                placeholder="https://github.com/organization/repository.git"
                                                value={remoteUrl}
                                                onChange={(e) => setRemoteUrl(e.target.value)}
                                            />
                                        </div>
                                    )}

                                    {repoMode === 'fork' && (
                                        <div className={styles.formRow}>
                                            <label className={styles.formLabel}>Target User/Organization Fork</label>
                                            <input
                                                type="text"
                                                className={styles.formInput}
                                                placeholder="your-github-handle"
                                                value={forkTarget}
                                                onChange={(e) => setForkTarget(e.target.value)}
                                            />
                                        </div>
                                    )}

                                    <div className={styles.formRow}>
                                        <label className={styles.formLabel}>Local Workspace Path</label>
                                        <input
                                            type="text"
                                            className={styles.formInput}
                                            value={localPath}
                                            onChange={(e) => setLocalPath(e.target.value)}
                                        />
                                    </div>

                                    {appliedStatus && (
                                        <div style={{color: '#3fb950', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem'}}>
                                            <Check size={14} />
                                            <span>{appliedStatus}</span>
                                        </div>
                                    )}

                                    <button className={styles.applyBtn} onClick={handleApply}>
                                        <Sparkles size={14} />
                                        <span>Apply Repository Configuration</span>
                                    </button>
                                </div>
                            </>
                        )}

                        {activeSection === 'general' && (
                            <div className={styles.formCard}>
                                <div className={styles.formRow}>
                                    <label className={styles.formLabel}>Workflow Execution Mode</label>
                                    <input type="text" className={styles.formInput} value="Deterministic Strict Verification (1.3.0)" readOnly />
                                </div>
                                <div className={styles.formRow}>
                                    <label className={styles.formLabel}>Task Management Telemetry</label>
                                    <input type="text" className={styles.formInput} value="Monotonic Append-Only SSE Event Stream" readOnly />
                                </div>
                            </div>
                        )}

                        {activeSection === 'keys' && (
                            <div className={styles.formCard}>
                                <div className={styles.formRow}>
                                    <label className={styles.formLabel}>Google ADK / Gemma 2 API Token</label>
                                    <input type="password" className={styles.formInput} placeholder="Configured via environment / server-side token" readOnly />
                                </div>
                                <div className={styles.formRow}>
                                    <label className={styles.formLabel}>Featherless Provider Token</label>
                                    <input type="password" className={styles.formInput} placeholder="Configured in server .env (never exposed to browser)" readOnly />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className={styles.footer}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '0.4rem'}}>
                        <ShieldCheck size={13} color="#3fb950" />
                        <span>Security Invariant: No automatic workspace mutation without explicit Apply confirmation.</span>
                    </div>
                    <span>OneShot v1.3.0</span>
                </div>
            </div>
        </div>
    )
}
