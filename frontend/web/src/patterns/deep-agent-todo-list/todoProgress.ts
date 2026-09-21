import type { Todo, TodoStatus } from "./types";

export interface TodoMetrics {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  percentage: number;
  firstInProgressIndex: number;
}

export interface TodoRowModel extends Todo {
  index: number;
  isFirstInProgress: boolean;
  isDimmed: boolean;
  icon: string;
  ariaLabel: string;
}

export function getTodosFromStreamValues(values: { todos?: Todo[] } | null | undefined): Todo[] {
  return values?.todos ?? [];
}

export function calculateTodoMetrics(todos: Todo[]): TodoMetrics {
  const completed = todos.filter((todo) => todo.status === "completed").length;
  const inProgress = todos.filter((todo) => todo.status === "in_progress").length;
  const pending = todos.filter((todo) => todo.status === "pending").length;
  const total = todos.length;
  return {
    total,
    completed,
    inProgress,
    pending,
    percentage: total ? Math.round((completed / total) * 100) : 0,
    firstInProgressIndex: todos.findIndex((todo) => todo.status === "in_progress"),
  };
}

const statusIcons: Record<TodoStatus, string> = {
  pending: "○",
  in_progress: "◉",
  completed: "✓",
};

export function buildTodoRows(todos: Todo[]): TodoRowModel[] {
  const { firstInProgressIndex } = calculateTodoMetrics(todos);
  return todos.map((todo, index) => ({
    ...todo,
    index,
    isFirstInProgress: todo.status === "in_progress" && index === firstInProgressIndex,
    isDimmed: todo.status === "completed",
    icon: statusIcons[todo.status],
    ariaLabel: `${todo.status.replace("_", " ")}: ${todo.content}`,
  }));
}

export function shouldRenderAgentProgress(todos: Todo[], isLoading: boolean): boolean {
  return todos.length > 0 || isLoading;
}
