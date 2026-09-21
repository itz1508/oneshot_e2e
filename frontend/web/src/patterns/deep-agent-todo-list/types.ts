export interface BaseMessage {
  id?: string;
  content: string | any;
  _getType?: () => string;
}

export const deepAgentTodoListAgent = {} as any;
export type deepAgentTodoListAgent = typeof deepAgentTodoListAgent;

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface Todo {
  content: string;
  status: TodoStatus;
}

export interface AgentState {
  messages: BaseMessage[];
  todos?: Todo[];
}

