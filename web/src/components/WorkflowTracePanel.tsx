import {useSyncExternalStore} from 'react'
import {workflowTraceStore} from '../agent/workflowTrace'
import styles from './TaskReviewDrawer.module.css'

function detailValue(value: unknown): string {
    if (typeof value === 'string') return value
    return JSON.stringify(value, null, 2)
}

export function WorkflowTracePanel() {
    const trace = useSyncExternalStore(
        workflowTraceStore.subscribe,
        workflowTraceStore.getSnapshot,
        workflowTraceStore.getSnapshot,
    )

    if (!trace.length) return null

    return (
        <>
            <div className={styles.divider}/>
            <div className={styles.field}>
                <span className={styles.label}>Canonical execution trace</span>
                <div className={styles.traceList} data-testid="workflow-trace">
                    {trace.map((entry) => (
                        <details className={styles.traceEntry} key={entry.eventId}>
                            <summary className={styles.traceSummary}>
                                <span>#{entry.sequence} {entry.processor}</span>
                                <span>{entry.state}{entry.result ? ` · ${entry.result}` : ''}</span>
                            </summary>
                            <dl className={styles.traceDetails}>
                                <dt>timestamp</dt>
                                <dd>{entry.timestamp}</dd>
                                <dt>run_id</dt>
                                <dd>{entry.runId}</dd>
                                {entry.artifactId && (
                                    <>
                                        <dt>artifact_id</dt>
                                        <dd>{entry.artifactId}</dd>
                                    </>
                                )}
                                {entry.message && (
                                    <>
                                        <dt>message</dt>
                                        <dd>{entry.message}</dd>
                                    </>
                                )}
                                {entry.details && Object.entries(entry.details).map(([key, value]) => (
                                    <div className={styles.traceDetailBlock} key={key}>
                                        <dt>{key}</dt>
                                        <dd><pre>{detailValue(value)}</pre></dd>
                                    </div>
                                ))}
                            </dl>
                        </details>
                    ))}
                </div>
            </div>
        </>
    )
}
