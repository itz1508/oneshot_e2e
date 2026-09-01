/**
 * TopMenu — 40px application header.
 * Shows brand, runner mode, connection status, and theme toggle.
 */

import {useState, useEffect} from 'react'
import {Wifi, WifiOff, Sun, Moon} from 'lucide-react'
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
}

export function TopMenu({runnerMode, loading, task, drawerOpen, onToggleDrawer, onCancelTask}: TopMenuProps) {
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
