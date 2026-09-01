/**
 * Conversation — continuous chat view.
 * Scrolls independently through MessageScroller: the anchor mode (selected in
 * the composer toolbar) decides which row anchors each turn, prepended history
 * preserves the reader's position, and consumers can track the reader via
 * useMessageScrollerVisibility.
 */

import type {ChatMessage, Stage, TaskActivity} from '../agent/types'
import {UserMessage} from './UserMessage'
import {AgentMessage} from './AgentMessage'
import {AgentLoadingState} from './AgentLoadingState'
import {WelcomeDocsIndex} from './WelcomeDocsIndex'
import {
    MessageScroller,
    MessageScrollerViewport,
    MessageScrollerItem,
} from './ui/MessageScroller'
import type {AnchorMode} from './MessageComposer'
import styles from './Conversation.module.css'

interface ConversationProps {
    messages: ChatMessage[]
    loading: boolean
    anchorMode: AnchorMode
    currentStage?: Stage
    currentAction?: string
    activeActivity?: TaskActivity | null
    onOpenFile?: (fileName: string, filePath: string) => void
    onStartPrompt?: (prompt: string) => void
    onOpenDocsModal?: () => void
}

const STAGE_TITLES: Record<string, string> = {
    reading: 'Researching',
    planning: 'Planning',
    reviewing: 'Reviewing & Gaps',
    testing: 'Triple Validation',
    editing: 'Building',
    completed: 'Completed',
}

export function Conversation({
    messages,
    loading,
    anchorMode,
    currentStage,
    currentAction,
    activeActivity,
    onOpenFile,
    onStartPrompt,
    onOpenDocsModal,
}: ConversationProps) {
    const anchorRole: ChatMessage['role'] = anchorMode === 'assistant' ? 'agent' : 'user'
    const phaseName = currentStage ? (STAGE_TITLES[currentStage] || 'Working') : 'Researching'

    return (
        <MessageScroller>
            <MessageScrollerViewport className={styles.conversation}>
                {messages.length === 0 && !loading ? (
                    <WelcomeDocsIndex
                        onOpenFile={onOpenFile || (() => {})}
                        onStartPrompt={onStartPrompt}
                        onOpenDocsModal={onOpenDocsModal}
                    />
                ) : (
                    <div className={styles.list}>
                        {messages.map((msg) => (
                            <MessageScrollerItem
                                key={msg.id}
                                messageId={msg.id}
                                scrollAnchor={msg.role === anchorRole}
                            >
                                {msg.role === 'user' ? (
                                    <UserMessage content={msg.content}/>
                                ) : (
                                    <AgentMessage content={msg.content} activities={msg.activities} tokens={msg.tokens}/>
                                )}
                            </MessageScrollerItem>
                        ))}
                        {loading && (
                            <AgentLoadingState
                                phase={phaseName}
                                status="running"
                                currentAction={currentAction}
                                subEvents={activeActivity?.messages?.map(m => m.text)}
                            />
                        )}
                    </div>
                )}
            </MessageScrollerViewport>
        </MessageScroller>
    )
}
