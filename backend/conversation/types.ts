/**
 * M14: Conversation and message types.
 *
 * Conversations are durable containers for chat messages. Messages
 * carry roles (user/assistant/system), statuses (pending/streaming/
 * completed/failed/cancelled), and optional run associations.
 *
 * Credentials and hidden reasoning are NEVER persisted in messages or
 * conversations. Only the user-visible content and status are stored.
 */
export type MessageRole = "user" | "assistant" | "system";

export type MessageStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "failed"
  | "cancelled";

export interface Conversation {
  conversationId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  messageId: string;
  conversationId: string;
  runId?: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  sequence: number;
  createdAt: string;
  updatedAt: string;
}

/** A conversation with its messages (projection for API responses). */
export interface ConversationWithMessages {
  conversation: Conversation;
  messages: ConversationMessage[];
}
