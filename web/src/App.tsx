/** App shell connecting Operator Chat, feature tabs, and workspace views. */

import {lazy, Suspense, useEffect, useState} from 'react'
import {TopMenu} from './components/TopMenu'
import {AppSidebar, type RailTab} from './components/AppSidebar'
import {Conversation} from './components/Conversation'
import {MessageComposer, type AnchorMode} from './components/MessageComposer'
import {TurnIndicator} from './components/TurnIndicator'
import {FileViewer} from './components/FileViewer'
import {DocsIndexModal} from './components/DocsIndexModal'
import {useAppStore} from './store/taskStore'
import {BackendChatSource} from './agent/BackendChatSource'
import {restoreSession, setAuthRequiredHandler} from './agent/authApi'
import styles from './App.module.css'

const CodeFixEditor = lazy(() =>
    import('./features/code-fix-editor/CodeFixEditor').then((m) => ({default: m.CodeFixEditor})),
)
const PlanReview = lazy(() =>
    import('./features/plan-review/PlanReview').then((m) => ({default: m.PlanReview})),
)
const BuildExecution = lazy(() =>
    import('./features/build-execution/BuildExecution').then((m) => ({default: m.BuildExecution})),
)
const AppShell = lazy(() =>
    import('./features/app-shell/AppShell').then((m) => ({default: m.AppShell})),
)

const AuthLoginPage = lazy(() =>
    import('./components/AuthLoginPage').then((m) => ({default: m.AuthLoginPage})),
)

const eventSource = new BackendChatSource()

function App() {
    const [railTab, setRailTab] = useState<RailTab>('explorer')
    const [anchorMode, setAnchorMode] = useState<AnchorMode>('user')
    const [openFiles, setOpenFiles] = useState<{name: string, path: string}[]>([])
    const [activeFileIndex, setActiveFileIndex] = useState(0)
    const [authReady, setAuthReady] = useState(false)
    const [showLogin, setShowLogin] = useState(false)
    const [docsModalOpen, setDocsModalOpen] = useState(false)

    const workspaces = useAppStore((state) => state.workspaces)
    const participatingWorkspaceIds = useAppStore((state) => state.participatingWorkspaceIds)
    const task = useAppStore((state) => state.task)
    const messages = useAppStore((state) => state.messages)
    const loading = useAppStore((state) => state.loading)
    const turn = useAppStore((state) => state.turn)
    const drawerOpen = useAppStore((state) => state.drawerOpen)
    const runnerMode = useAppStore((state) => state.runnerMode)
    const bindEventSource = useAppStore((state) => state.bindEventSource)
    const sendMessage = useAppStore((state) => state.sendMessage)
    const cancelTask = useAppStore((state) => state.cancelTask)
    const toggleDrawer = useAppStore((state) => state.toggleDrawer)
    const openDrawerForWorkspace = useAppStore((state) => state.openDrawerForWorkspace)
    const explorerMode = useAppStore((state) => state.explorerMode)
    const activePlanId = useAppStore((state) => state.activePlanId)
    const activeBuildId = useAppStore((state) => state.activeBuildId)
    const fetchRealWorkspaces = useAppStore((state) => state.fetchRealWorkspaces)

    useEffect(() => {
        (window as unknown as { __ONESHOT_STORE__?: typeof useAppStore })
            .__ONESHOT_STORE__ = useAppStore
        setAuthRequiredHandler(() => setShowLogin(true))
        restoreSession()
            .then((session) => {
                if (session) setAuthReady(true)
                else setShowLogin(true)
            })
            .catch(() => setShowLogin(true))
    }, [bindEventSource])

    useEffect(() => {
        if (!authReady) return
        bindEventSource(eventSource)
        fetchRealWorkspaces()
        return () => eventSource.dispose()
    }, [bindEventSource, authReady])

    const handleRailSelect = (tab: RailTab) => {
        setRailTab(tab)
    }

    const handleFileClick = (fileName: string, filePath: string) => {
        setOpenFiles((prev) => {
            const existing = prev.findIndex((f) => f.path === filePath)
            if (existing >= 0) {
                setActiveFileIndex(existing)
                return prev
            }
            setActiveFileIndex(prev.length)
            return [...prev, {name: fileName, path: filePath}]
        })
    }

    const handleFileSwitch = (index: number) => {
        setActiveFileIndex(index)
    }

    const handleFileClose = () => {
        setOpenFiles((prev) => {
            const next = prev.filter((_, i) => i !== activeFileIndex)
            const newIndex = Math.min(activeFileIndex, next.length - 1)
            setActiveFileIndex(next.length === 0 ? 0 : newIndex)
            return next
        })
    }

    if (showLogin) {
        return (
            <Suspense fallback={null}>
                <AuthLoginPage onAuthenticated={() => setShowLogin(false)} />
            </Suspense>
        )
    }
    if (!authReady) {
        return <div style={{padding: '2rem'}}>Loading OneShot…</div>
    }

    return (
        <div className={styles.shell}>
                <TopMenu
                    runnerMode={runnerMode}
                    loading={loading}
                    task={task}
                    drawerOpen={drawerOpen}
                    onToggleDrawer={toggleDrawer}
                    onCancelTask={cancelTask}
                    onOpenDocsModal={() => setDocsModalOpen(true)}
                />
                <div className={styles.body}>
                    <AppSidebar
                        activeTab={railTab}
                        onTabSelect={handleRailSelect}
                        workspaces={workspaces}
                        participatingWorkspaceIds={participatingWorkspaceIds}
                        onLEDClick={openDrawerForWorkspace}
                        onFileClick={handleFileClick}
                    />
                    <main className={styles.main}>
                        {railTab === 'appshell' ? (
                            <Suspense fallback={null}>
                                <AppShell/>
                            </Suspense>
                        ) : railTab === 'editor' ? (
                            <Suspense fallback={null}>
                                <CodeFixEditor/>
                            </Suspense>
                        ) : railTab === 'explorer' && explorerMode === 'plan-review' && activePlanId ? (
                            <Suspense fallback={null}>
                                <PlanReview planId={activePlanId}/>
                            </Suspense>
                        ) : railTab === 'explorer' && explorerMode === 'build' && activeBuildId ? (
                            <Suspense fallback={null}>
                                <BuildExecution buildId={activeBuildId}/>
                            </Suspense>
                        ) : (
                            openFiles.length > 0 ? (
                                <FileViewer
                                    files={openFiles}
                                    activeIndex={activeFileIndex}
                                    onSwitch={handleFileSwitch}
                                    onClose={handleFileClose}
                                />
                            ) : (
                                <>
                                    <Conversation
                                        messages={messages}
                                        loading={loading}
                                        anchorMode={anchorMode}
                                        currentStage={task.currentStage}
                                        currentAction={task.currentAction}
                                        activeActivity={task.activeActivity}
                                        onOpenFile={handleFileClick}
                                        onStartPrompt={(p) => sendMessage(p)}
                                        onOpenDocsModal={() => setDocsModalOpen(true)}
                                    />
                                    <TurnIndicator turn={turn}/>
                                    <MessageComposer
                                        onSend={sendMessage}
                                        anchorMode={anchorMode}
                                        onAnchorModeChange={setAnchorMode}
                                        disabled={turn !== 'user'}
                                    />
                                </>
                            )
                        )}
                    </main>
                </div>
                <DocsIndexModal
                    open={docsModalOpen}
                    onClose={() => setDocsModalOpen(false)}
                    onOpenFile={handleFileClick}
                />
        </div>
    )
}

export default App
