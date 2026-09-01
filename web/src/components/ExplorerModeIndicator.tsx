/**
 * ExplorerModeIndicator — compact segmented control for Explorer context.
 *
 * Shows [Code] [Plan Review] [Build] and reads/writes explorerMode
 * from the Zustand store. Only rendered when the Explorer panel is active.
 */

import {useAppStore, type ExplorerMode} from '../store/taskStore'
import styles from './ExplorerModeIndicator.module.css'

const MODES: {id: ExplorerMode; label: string}[] = [
    {id: 'code', label: 'Files'},
    {id: 'plan-review', label: 'Plans'},
    {id: 'build', label: 'Builds'},
]

export function ExplorerModeIndicator() {
    const explorerMode = useAppStore((s) => s.explorerMode)
    const setExplorerMode = useAppStore((s) => s.setExplorerMode)

    return (
        <div className={styles.container} role="tablist" aria-label="Explorer mode">
            {MODES.map((mode) => (
                <button
                    key={mode.id}
                    type="button"
                    role="tab"
                    aria-selected={explorerMode === mode.id}
                    className={`${styles.segment} ${explorerMode === mode.id ? styles.active : ''}`}
                    onClick={() => setExplorerMode(mode.id)}
                >
                    {mode.label}
                </button>
            ))}
        </div>
    )
}
