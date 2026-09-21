import type { Todo } from "./types";
import { buildTodoRows, calculateTodoMetrics, shouldRenderAgentProgress } from "./todoProgress";

export function AgentProgress({ todos, isLoading = false }: { todos: Todo[]; isLoading?: boolean }) {
  if (!shouldRenderAgentProgress(todos, isLoading)) {
    return null;
  }

  if (todos.length === 0 && isLoading) {
    return (
      <aside className="agent-progress-card" aria-label="Agent Progress" data-state="planning">
        <div className="agent-progress-loading" role="status" aria-live="polite">
          <span className="agent-progress-spinner" aria-hidden="true">↻</span>
          <span>Agent is creating a plan…</span>
        </div>
      </aside>
    );
  }

  const metrics = calculateTodoMetrics(todos);
  const rows = buildTodoRows(todos);

  return (
    <aside className="agent-progress-card" aria-label="Agent Progress" data-state="ready">
      <div className="agent-progress-header">
        <div>
          <p className="agent-progress-eyebrow">Live plan</p>
          <h2>Agent Progress</h2>
        </div>
        <div className="agent-progress-count" aria-label={`${metrics.completed} of ${metrics.total} tasks completed`}>
          <strong>{metrics.completed}/{metrics.total}</strong>
          <span>tasks</span>
        </div>
      </div>

      <div className="agent-progress-bar-block">
        <div className="agent-progress-bar-label">
          <span>Progress</span>
          <span>{metrics.percentage}%</span>
        </div>
        <div className="agent-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={metrics.percentage}>
          <div className="agent-progress-fill" style={{ width: `${metrics.percentage}%` }} />
        </div>
      </div>

      <ul className="agent-progress-list">
        {rows.map((todo) => (
          <li
            key={`${todo.index}-${todo.content}`}
            className={`agent-progress-row agent-progress-row--${todo.status} ${todo.isFirstInProgress ? "agent-progress-row--active" : ""}`}
            data-status={todo.status}
            data-first-in-progress={todo.isFirstInProgress ? "true" : "false"}
            aria-label={todo.ariaLabel}
          >
            <span className="agent-progress-icon" aria-hidden="true">{todo.icon}</span>
            <span className="agent-progress-content">{todo.content}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function TodoList(props: { todos: Todo[]; isLoading?: boolean }) {
  return <AgentProgress {...props} />;
}
