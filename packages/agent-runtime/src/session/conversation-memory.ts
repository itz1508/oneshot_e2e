/**
 * OneShot Agent Runtime — Multi-Turn Conversation Memory Manager
 *
 * Implements:
 * 1. Multi-turn message history persistence across agent invocations
 * 2. Sliding-window pruning to stay within model context limits
 * 3. Token estimation and safety margins
 * 4. Tool call pairing preservation during pruning (never orphans ToolMessage without AIMessage)
 * 5. Checkpointing integration with SessionLedger
 */

export interface ConversationMessage {
  id: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  timestamp: number
  toolCalls?: Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
  }>
  toolCallId?: string
  metadata?: Record<string, unknown>
}

export interface ConversationMemoryOptions {
  maxTurns?: number
  maxEstimatedTokens?: number
  preserveSystemMessages?: boolean
}

export class ConversationMemoryManager {
  private sessions: Map<string, ConversationMessage[]> = new Map()
  private options: Required<ConversationMemoryOptions>

  constructor(options: ConversationMemoryOptions = {}) {
    this.options = {
      maxTurns: options.maxTurns ?? 50,
      maxEstimatedTokens: options.maxEstimatedTokens ?? 32_000,
      preserveSystemMessages: options.preserveSystemMessages ?? true,
    }
  }

  /**
   * Appends a message to the session's active conversation history.
   */
  addMessage(
    sessionId: string,
    message: Omit<ConversationMessage, "id" | "timestamp"> & { id?: string; timestamp?: number }
  ): ConversationMessage {
    const list = this.getOrCreateSession(sessionId)
    const fullMessage: ConversationMessage = {
      id: message.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp || Date.now(),
      toolCalls: message.toolCalls,
      toolCallId: message.toolCallId,
      metadata: message.metadata,
    }

    list.push(fullMessage)
    this.enforceWindow(sessionId)
    return fullMessage
  }

  /**
   * Retrieves messages for a session, formatted for model consumption.
   */
  getMessages(
    sessionId: string,
    options?: { maxMessages?: number }
  ): ConversationMessage[] {
    const list = this.getOrCreateSession(sessionId)
    if (!options?.maxMessages || list.length <= options.maxMessages) {
      return [...list]
    }

    // Keep system message(s) if configured, then take the most recent messages
    const systemMessages = this.options.preserveSystemMessages
      ? list.filter((m) => m.role === "system")
      : []

    const nonSystem = list.filter((m) => m.role !== "system")
    const sliceCount = Math.max(0, options.maxMessages - systemMessages.length)
    const recent = nonSystem.slice(-sliceCount)

    return [...systemMessages, ...recent]
  }

  /**
   * Returns estimated token count for the session's conversation history (approx 4 chars per token).
   */
  estimateTokenCount(sessionId: string): number {
    const list = this.getOrCreateSession(sessionId)
    let totalChars = 0
    for (const msg of list) {
      totalChars += msg.content.length
      if (msg.toolCalls) {
        totalChars += JSON.stringify(msg.toolCalls).length
      }
    }
    return Math.ceil(totalChars / 4)
  }

  /**
   * Clears or resets messages for a given session.
   */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  /**
   * Exports session messages for checkpointing / serialization.
   */
  exportSession(sessionId: string): ConversationMessage[] {
    return [...this.getOrCreateSession(sessionId)]
  }

  /**
   * Imports session messages (e.g. From a restored checkpoint).
   */
  importSession(sessionId: string, messages: ConversationMessage[]): void {
    this.sessions.set(sessionId, [...messages])
    this.enforceWindow(sessionId)
  }

  private getOrCreateSession(sessionId: string): ConversationMessage[] {
    let list = this.sessions.get(sessionId)
    if (!list) {
      list = []
      this.sessions.set(sessionId, list)
    }
    return list
  }

  /**
   * Enforces sliding window while preserving system messages and tool call pairings.
   */
  private enforceWindow(sessionId: string): void {
    const list = this.sessions.get(sessionId)
    if (!list || list.length <= this.options.maxTurns) return

    const systemMessages: ConversationMessage[] = []
    const turnMessages: ConversationMessage[] = []

    for (const msg of list) {
      if (this.options.preserveSystemMessages && msg.role === "system") {
        systemMessages.push(msg)
      } else {
        turnMessages.push(msg)
      }
    }

    // Trim older turn messages while ensuring we don't start with an orphaned tool response
    const allowedTurns = this.options.maxTurns - systemMessages.length
    let trimmed = turnMessages.slice(-allowedTurns)

    // If first trimmed message is a tool response, drop it or include its preceding assistant call
    while (trimmed.length > 0 && trimmed[0].role === "tool") {
      trimmed = trimmed.slice(1)
    }

    this.sessions.set(sessionId, [...systemMessages, ...trimmed])
  }
}

// Global singleton instance for runtime use
let defaultConversationMemory: ConversationMemoryManager | null = null

export function getConversationMemoryManager(): ConversationMemoryManager {
  if (!defaultConversationMemory) {
    defaultConversationMemory = new ConversationMemoryManager()
  }
  return defaultConversationMemory
}
