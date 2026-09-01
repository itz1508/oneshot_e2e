/**
 * BuildDetails — Detailed view of a single build.
 */

import styles from './BuildDetails.module.css'
import type {Build} from '../api'

interface Props {
    build: Build
}

export function BuildDetails({build}: Props) {
    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h2 className={styles.title}>{build.build_id}</h2>
                <StatusBadge status={build.status} />
            </header>

            <div className={styles.grid}>
                <DetailCard title="Plan Information">
                    <DetailRow label="Plan ID" value={build.plan_id || 'N/A'} />
                    <DetailRow label="Version" value={String(build.plan_version)} />
                    <DetailRow label="Digest" value={build.plan_digest || 'N/A'} mono />
                </DetailCard>

                <DetailCard title="Task Progress">
                    <DetailRow label="Total Tasks" value={String(build.total_tasks)} />
                    <DetailRow label="Completed" value={String(build.completed_tasks)} />
                    <DetailRow label="Failed" value={String(build.failed_tasks)} />
                    <ProgressBar
                        completed={build.completed_tasks}
                        failed={build.failed_tasks}
                        total={build.total_tasks}
                    />
                </DetailCard>

                <DetailCard title="Timing">
                    <DetailRow label="Created" value={formatDateTime(build.created_at)} />
                    <DetailRow label="Started" value={formatDateTime(build.started_at)} />
                    <DetailRow label="Completed" value={formatDateTime(build.completed_at)} />
                    <DetailRow label="Elapsed" value={formatDuration(build.elapsed_ms)} />
                </DetailCard>

                <DetailCard title="Digests">
                    <DetailRow label="Build Context" value={build.build_context_digest || 'N/A'} mono />
                    <DetailRow label="Package" value={build.package_digest || 'N/A'} mono />
                    <DetailRow label="Report" value={build.report_digest || 'N/A'} mono />
                </DetailCard>

                {build.tags.length > 0 && (
                    <DetailCard title="Tags">
                        <div className={styles.tags}>
                            {build.tags.map((tag) => (
                                <span key={tag} className={styles.tag}>
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </DetailCard>
                )}
            </div>
        </div>
    )
}

function DetailCard({title, children}: {title: string; children: React.ReactNode}) {
    return (
        <div className={styles.card}>
            <h3 className={styles.cardTitle}>{title}</h3>
            <div className={styles.cardContent}>{children}</div>
        </div>
    )
}

function DetailRow({label, value, mono}: {label: string; value: string; mono?: boolean}) {
    return (
        <div className={styles.row}>
            <span className={styles.label}>{label}</span>
            <span className={`${styles.value} ${mono ? styles.mono : ''}`}>{value}</span>
        </div>
    )
}

function ProgressBar({completed, failed, total}: {completed: number; failed: number; total: number}) {
    const completedPercent = total > 0 ? (completed / total) * 100 : 0
    const failedPercent = total > 0 ? (failed / total) * 100 : 0

    return (
        <div className={styles.progressBar}>
            <div
                className={styles.progressCompleted}
                style={{width: `${completedPercent}%`}}
            />
            <div
                className={styles.progressFailed}
                style={{width: `${failedPercent}%`}}
            />
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

function formatDateTime(isoString: string): string {
    if (!isoString) return 'N/A'
    return new Date(isoString).toLocaleString()
}

function formatDuration(ms: number): string {
    if (ms === 0) return 'N/A'
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`
    }
    return `${seconds}s`
}
