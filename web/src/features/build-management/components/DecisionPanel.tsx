/**
 * DecisionPanel — Panel for managing pending decisions.
 */

import {useState} from 'react'
import styles from './DecisionPanel.module.css'
import type {Decision} from '../api'

interface Props {
    decisions: Decision[]
    onSubmit: (decisionId: string, chosenOption: string, reasoning: string) => Promise<void>
}

export function DecisionPanel({decisions, onSubmit}: Props) {
    if (decisions.length === 0) {
        return null
    }

    return (
        <div className={styles.container}>
            <h3 className={styles.title}>Pending Decisions ({decisions.length})</h3>
            <div className={styles.list}>
                {decisions.map((decision) => (
                    <DecisionCard
                        key={decision.decision_id}
                        decision={decision}
                        onSubmit={onSubmit}
                    />
                ))}
            </div>
        </div>
    )
}

function DecisionCard({decision, onSubmit}: {decision: Decision; onSubmit: Props['onSubmit']}) {
    const [selectedOption, setSelectedOption] = useState(decision.recommended_option || decision.options[0] || '')
    const [reasoning, setReasoning] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const handleSubmit = async () => {
        if (!selectedOption) return
        setSubmitting(true)
        try {
            await onSubmit(decision.decision_id, selectedOption, reasoning)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className={styles.card}>
            <header className={styles.cardHeader}>
                <span className={styles.decisionType}>{decision.decision_type}</span>
                <span className={styles.decisionId}>{decision.decision_id}</span>
            </header>

            <h4 className={styles.cardTitle}>{decision.title}</h4>

            {decision.description && (
                <p className={styles.description}>{decision.description}</p>
            )}

            <div className={styles.options}>
                <label className={styles.optionsLabel}>Options:</label>
                <div className={styles.optionsList}>
                    {decision.options.map((option) => (
                        <label key={option} className={styles.option}>
                            <input
                                type="radio"
                                name={`decision-${decision.decision_id}`}
                                value={option}
                                checked={selectedOption === option}
                                onChange={() => setSelectedOption(option)}
                            />
                            <span>{option}</span>
                            {option === decision.recommended_option && (
                                <span className={styles.recommended}>(recommended)</span>
                            )}
                        </label>
                    ))}
                </div>
            </div>

            <div className={styles.reasoning}>
                <label className={styles.reasoningLabel}>Reasoning (optional):</label>
                <textarea
                    value={reasoning}
                    onChange={(e) => setReasoning(e.target.value)}
                    placeholder="Explain your decision..."
                    rows={3}
                />
            </div>

            <div className={styles.actions}>
                <button
                    onClick={handleSubmit}
                    disabled={!selectedOption || submitting}
                    className={styles.submitBtn}
                >
                    {submitting ? 'Submitting...' : 'Submit Decision'}
                </button>
            </div>

            {decision.expires_at && (
                <div className={styles.expires}>
                    Expires: {new Date(decision.expires_at).toLocaleString()}
                </div>
            )}
        </div>
    )
}
