/**
 * HelpRequestCard — renders a backend help_request as an answerable question.
 *
 * The question and required_information[] come verbatim from the backend run
 * snapshot (docs/INTENT_AUTHORITY_AND_HELP.md). Answers re-enter through the
 * regular chat pipeline: POST /api/conversations/:id/messages → Intent
 * revision → Prompt gate. No auto-retry, no fabricated answers.
 */

import {useState} from 'react'
import type {HelpRequestPayload} from '../agent/types'
import styles from './HelpRequestCard.module.css'

interface HelpRequestCardProps {
    helpRequest: HelpRequestPayload
    onAnswer: (answer: string) => void
}

export function HelpRequestCard({helpRequest, onAnswer}: HelpRequestCardProps) {
    const [draft, setDraft] = useState('')

    const submit = () => {
        const answer = draft.trim()
        if (!answer) return
        onAnswer(answer)
        setDraft('')
    }

    return (
        <div className={styles.card} role="group" aria-label="Information required by the workflow">
            <div className={styles.header}>
                <span className={styles.badge}>Information required</span>
                <span className={styles.source}>asked by {helpRequest.source_processor}</span>
            </div>
            <p className={styles.question}>{helpRequest.question}</p>
            {helpRequest.required_information.length > 0 && (
                <ul className={styles.requiredList} aria-label="Missing information">
                    {helpRequest.required_information.map((item) => (
                        <li key={item} className={styles.requiredItem}>{item}</li>
                    ))}
                </ul>
            )}
            <div className={styles.composer}>
                <textarea
                    className={styles.input}
                    value={draft}
                    placeholder="Type your answer..."
                    aria-label="Answer"
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            submit()
                        }
                    }}
                />
                <button
                    className={styles.submit}
                    onClick={submit}
                    disabled={!draft.trim()}
                >
                    Answer
                </button>
            </div>
        </div>
    )
}