/**
 * OneShot Hierarchical Subtask / Todo Chain Types
 */

export type TodoNodeState = "wait" | "active" | "done" | "fail";

export interface SubtaskNode {
  id: string;
  text: string;
  state: TodoNodeState;
  metadata?: Record<string, unknown>;
}

export interface SkillNode {
  id: string;
  name: string;
  state: TodoNodeState;
  todos: SubtaskNode[];
}

export interface TodoWorkflowSnapshot {
  skills: SkillNode[];
  activeSkillId?: string;
  activeSubtaskId?: string;
  completedCount: number;
  totalCount: number;
}
