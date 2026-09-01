/**
 * Build Management — Dashboard for build operations.
 *
 * Single responsibility: provide a dashboard for monitoring and managing
 * builds, viewing build history, and handling decisions.
 */

import {useEffect, useState} from 'react'
import styles from './BuildManagement.module.css'
import {BuildDashboard} from './components/BuildDashboard'
import {BuildDetails} from './components/BuildDetails'
import {DecisionPanel} from './components/DecisionPanel'
import {buildApi, type Build, type Decision} from './api'

export function BuildManagement() {
    const [builds, setBuilds] = useState<Build[]>([])
    const [selectedBuild, setSelectedBuild] = useState<Build | null>(null)
    const [decisions, setDecisions] = useState<Decision[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Load builds on mount
    useEffect(() => {
        loadBuilds()
    }, [])

    // Load decisions when a build is selected
    useEffect(() => {
        if (selectedBuild) {
            loadDecisions(selectedBuild.build_id)
        }
    }, [selectedBuild])

    const loadBuilds = async () => {
        setLoading(true)
        setError(null)
        try {
            const response = await buildApi.listBuilds()
            setBuilds(response.builds)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load builds')
        } finally {
            setLoading(false)
        }
    }

    const loadDecisions = async (buildId: string) => {
        try {
            const response = await buildApi.listDecisions(buildId)
            setDecisions(response.decisions)
        } catch (err) {
            console.error('Failed to load decisions:', err)
        }
    }

    const handleBuildSelect = (build: Build) => {
        setSelectedBuild(build)
    }

    const handleDecisionSubmit = async (decisionId: string, chosenOption: string, reasoning: string) => {
        if (!selectedBuild) return

        try {
            await buildApi.submitDecision(decisionId, {
                build_id: selectedBuild.build_id,
                chosen_option: chosenOption,
                actor_id: 'current-user', // In real app, get from auth context
                reasoning,
            })
            // Reload decisions
            await loadDecisions(selectedBuild.build_id)
        } catch (err) {
            console.error('Failed to submit decision:', err)
        }
    }

    const handleRefresh = () => {
        loadBuilds()
        if (selectedBuild) {
            loadDecisions(selectedBuild.build_id)
        }
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1>Build Management</h1>
                <button onClick={handleRefresh} className={styles.refreshBtn}>
                    Refresh
                </button>
            </header>

            {error && (
                <div className={styles.error} role="alert">
                    {error}
                </div>
            )}

            <div className={styles.content}>
                <div className={styles.sidebar}>
                    <BuildDashboard
                        builds={builds}
                        loading={loading}
                        onSelect={handleBuildSelect}
                        selectedBuildId={selectedBuild?.build_id}
                    />
                </div>

                <div className={styles.main}>
                    {selectedBuild ? (
                        <>
                            <BuildDetails build={selectedBuild} />
                            {decisions.length > 0 && (
                                <DecisionPanel
                                    decisions={decisions}
                                    onSubmit={handleDecisionSubmit}
                                />
                            )}
                        </>
                    ) : (
                        <div className={styles.placeholder}>
                            Select a build to view details
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
