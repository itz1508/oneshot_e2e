/**
 * BuildDashboard — List of builds with status indicators.
 */

import styles from './BuildDashboard.module.css'
import type {Build} from '../api'

interface Props {
    builds: Build[]
    loading: boolean
    onSelect: (build: Build) => void
    selectedBuildId?: string
}

export function BuildDashboard({builds, loading, onSelect, selectedBuildId}: Props) {
    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>Loading builds...</div>
            </div>
        )
    }

    if (builds.length === 0) {
        return (
            <div className={styles.container}>
                <div className={styles.empty}>No builds found</div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <span className={styles.title}>Builds</span>
                <span className={styles.count}>{builds.length}</span>
            </div>
            <ul className={styles.list}>
                {builds.map((build) => (
                    <li
                        key={build.build_id}
                        className={`${styles.item} ${selectedBuildId === build.build_id ? styles.selected : ''}`}
                        onClick={() => onSelect(build)}
                    >
                        <div className={styles.itemHeader}>
                            <span className={styles.buildId}>{build.build_id}</span>
                            <StatusBadge status={build.status} />
                        </div>
                        <div className={styles.itemMeta}>
                            <span>Plan: {build.plan_id || 'N/A'}</span>
                            <span>Tasks: {build.completed_tasks}/{build.total_tasks}</span>
                        </div>
                        <div className={styles.itemTime}>
                            {formatTime(build.created_at)}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    )
}

function StatusBadge({status}: {status: Build['status']}) {
    const statusConfig = {
        pending: {label: 'Pending', className: styles.statusPending},
        running: {label: 'Running', className: styles.statusRunning},
        completed: {label: 'Completed', className: styles.statusCompleted},
        failed: {label: 'Failed', className: styles.statusFailed},
        aborted: {label: 'Aborted', className: styles.statusAborted},
    }

    const config = statusConfig[status] || statusConfig.pending

    return (
        <span className={`${styles.statusBadge} ${config.className}`}>
            {config.label}
        </span>
    )
}

function formatTime(isoString: string): string {
    if (!isoString) return ''
    const date = new Date(isoString)
    return date.toLocaleString()
}
