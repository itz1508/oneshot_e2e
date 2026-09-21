import type { BaseMessage } from "@langchain/core/messages";

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface Todo {
  content: string;
  status: TodoStatus;
}

export interface AgentState {
  messages: BaseMessage[];
  todos?: Todo[];
}
