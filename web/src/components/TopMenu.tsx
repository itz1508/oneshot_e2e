/**
 * TopMenu — 40px application header.
 * Shows brand, runner mode, connection status, settings, docs, graph, and theme toggle.
 */

import {useState, useEffect} from 'react'
import {Wifi, WifiOff, Sun, Moon, BookOpen, GitBranch, Settings} from 'lucide-react'
import {TaskReviewDrawer} from './TaskReviewDrawer'
import type {TaskState} from '../agent/types'
import styles from './TopMenu.module.css'

interface TopMenuProps {
    runnerMode: string
    loading: boolean
    task: TaskState
    drawerOpen: boolean
    onToggleDrawer: () => void
    onCancelTask: () => void
    onOpenDocsModal?: () => void
    onOpenGraphModal?: () => void
    onOpenSettingsModal?: () => void
}

export function TopMenu({
    runnerMode,
    loading,
    task,
    drawerOpen,
    onToggleDrawer,
    onCancelTask,
    onOpenDocsModal,
    onOpenGraphModal,
    onOpenSettingsModal,
}: TopMenuProps) {
    const [dark, setDark] = useState(() => !document.documentElement.classList.contains('light'))

    useEffect(() => {
        if (dark) {
            document.documentElement.classList.remove('light')
        } else {
            document.documentElement.classList.add('light')
        }
    }, [dark])

    return (
        <header className={styles.bar}>
            <div className={styles.left}>
                <span className={styles.brand}>OneShot</span>
                <span className={styles.sep}/>
                <span className={styles.mode}>{runnerMode}</span>
            </div>
            <div className={styles.right}>
                {onOpenSettingsModal && (
                    <button
                        className={styles.docsBtn}
                        onClick={onOpenSettingsModal}
                        title="Configure Template, Clone, Fork, or Workspace settings"
                    >
                        <Settings size={13}/>
                        <span>Settings</span>
                    </button>
                )}
                {onOpenGraphModal && (
                    <button
                        className={styles.docsBtn}
                        onClick={onOpenGraphModal}
                        title="View Google ADK 2.0 Workflow Graph, JoinNode fan-in barrier, and proof states"
                    >
                        <GitBranch size={13}/>
                        <span>ADK Graph</span>
                    </button>
                )}
                {onOpenDocsModal && (
                    <button
                        className={styles.docsBtn}
                        onClick={onOpenDocsModal}
                        title="View OneShot architecture, canonical contracts, and workflow tree"
                    >
                        <BookOpen size={13}/>
                        <span>Docs & Architecture</span>
                    </button>
                )}
                <button
                    className={styles.themeBtn}
                    onClick={() => setDark((d) => !d)}
                    aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
                >
                    {dark ? <Sun size={14}/> : <Moon size={14}/>}
                </button>
                <span className={styles.sep}/>
                <div className={styles.statusGroup}>
                    <span className={`${styles.status} ${loading ? styles.active : ''}`}>
                        {loading ? <Wifi size={12}/> : <WifiOff size={12}/>}
                        <span>{loading ? 'Running' : 'Idle'}</span>
                    </span>
                    <TaskReviewDrawer
                        open={drawerOpen}
                        task={task}
                        runnerMode={runnerMode}
                        onToggle={onToggleDrawer}
                        onCancel={onCancelTask}
                    />
                </div>
            </div>
        </header>
    )
}
