import styles from './AgentLoadingState.module.css'

interface AgentLoadingStateProps {
    phase?: string
    status?: string
    currentAction?: string
    subEvents?: string[]
}

const DEFAULT_SUB_EVENTS: Record<string, string[]> = {
    reading: [
        'Searching project',
        'Reading relevant files',
        'Checking authoritative references',
        'Collecting evidence',
        'Defining success criteria',
    ],
    planning: [
        'Synthesizing build plan',
        'Structuring execution steps',
        'Checking for gaps',
    ],
    reviewing: [
        'Auditing findings',
        'Checking gap analysis',
        'Evaluating 9-point criteria',
    ],
    testing: [
        'Schema Validation proof',
        'Fixture Validation proof',
        'Goal Validation proof',
    ],
    editing: [
        'Applying confirmed change set',
        'Executing sandbox handoff',
    ],
}

export function AgentLoadingState({
    phase = 'Researching',
    status = 'running',
    currentAction,
    subEvents,
}: AgentLoadingStateProps) {
    const eventsToDisplay = subEvents && subEvents.length > 0
        ? subEvents
        : (DEFAULT_SUB_EVENTS[phase.toLowerCase()] || [
            'Searching project',
            'Reading relevant files',
            'Collecting evidence',
            'Defining success criteria',
        ])

    return (
        <div className={styles.wrapper}>
            <div className={styles.container}>
                <div className={styles.phaseHeader}>
                    <span className={styles.statusDot}/>
                    <span className={styles.phaseTitle}>{currentAction || phase}</span>
                    <span className={styles.phaseBadge}>{status}</span>
                </div>

                <div className={styles.eventStream}>
                    {eventsToDisplay.map((eventText, idx) => (
                        <div key={idx} className={styles.eventItem}>
                            <span className={styles.eventBullet}>●</span>
                            <span className={styles.eventText}>{eventText}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
