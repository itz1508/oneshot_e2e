/**
 * Operations — unified container for Plans, Queue, Tasks, and Logs.
 *
 * Sub-tab routing: internal tab bar switches between the four panels.
 * Flow: Plan → Build Handoff → Submit → Queue → Task Execution → Logs → Report
 */

import {useState} from 'react'
import {PlansPanel} from './components/PlansPanel'
import {QueuePanel} from './components/QueuePanel'
import {TasksPanel} from './components/TasksPanel'
import {LogsPanel} from './components/LogsPanel'
import styles from './Operations.module.css'

type OpsTab = 'plans' | 'queue' | 'tasks' | 'logs'

const TABS: {id: OpsTab; label: string; description: string}[] = [
    {id: 'plans', label: 'Plans', description: 'Create, view, and submit build plans'},
    {id: 'queue', label: 'Queue', description: 'View and manage the task queue'},
    {id: 'tasks', label: 'Tasks', description: 'Track task execution across plans'},
    {id: 'logs', label: 'Logs', description: 'Inspect execution journal entries'},
]

export function Operations() {
    const [activeTab, setActiveTab] = useState<OpsTab>('plans')

    return (
        <div className={styles.container}>
            <nav className={styles.tabBar}>
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                        title={tab.description}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>

            <div className={styles.content}>
                {activeTab === 'plans' && <PlansPanel />}
                {activeTab === 'queue' && <QueuePanel />}
                {activeTab === 'tasks' && <TasksPanel />}
                {activeTab === 'logs' && <LogsPanel />}
            </div>
        </div>
    )
}
