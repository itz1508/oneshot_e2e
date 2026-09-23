/**
 * OneShot Hierarchical Subtask & Todo Chain Manager
 *
 * Implements granular task decomposition with active-only focus:
 * - Groups execution into high-level skills (Research, Planning, Building)
 * - Tracks subtasks with deterministic states: wait -> active -> done / fail
 * - Generates Active-Only Snapshots for clean UI rendering
 */

import type {
  SkillNode,
  SubtaskNode,
  TodoNodeState,
  TodoWorkflowSnapshot,
} from "./types.js";

export type TodoChangeListener = (snapshot: TodoWorkflowSnapshot) => void;

export class TodoChainManager {
  private skills: Map<string, SkillNode> = new Map();
  private listeners: Set<TodoChangeListener> = new Set();

  constructor(initialSkills?: SkillNode[]) {
    if (initialSkills) {
      for (const s of initialSkills) {
        this.skills.set(s.id, s);
      }
    } else {
      this.initDefaultSkills();
    }
  }

  private initDefaultSkills(): void {
    this.addSkill({
      id: "skill-research",
      name: "Research Synthesis",
      state: "done",
      todos: [
        { id: "t1", text: "Index official API documentation", state: "done" },
        { id: "t2", text: "Cross-verify Tavily search citations", state: "done" },
      ],
    });

    this.addSkill({
      id: "skill-plan",
      name: "Workflow Planning & Contract Verification",
      state: "active",
      todos: [
        { id: "t3", text: "Review Gate 1 human approval package", state: "done" },
        { id: "t4", text: "Generate hash-bound plan representation", state: "active" },
        { id: "t5", text: "Verify sandbox partition isolation", state: "wait" },
      ],
    });

    this.addSkill({
      id: "skill-builder",
      name: "Build Pipeline Execution",
      state: "wait",
      todos: [
        { id: "t6", text: "Await Gate 2 Build Ready authorization", state: "wait" },
        { id: "t7", text: "Compile production export bundle", state: "wait" },
      ],
    });
  }

  addSkill(skill: SkillNode): void {
    this.skills.set(skill.id, skill);
    this.notify();
  }

  addSubtask(skillId: string, todo: SubtaskNode): boolean {
    const skill = this.skills.get(skillId);
    if (!skill) return false;
    skill.todos.push(todo);
    this.notify();
    return true;
  }

  updateSubtaskState(skillId: string, todoId: string, newState: TodoNodeState): boolean {
    const skill = this.skills.get(skillId);
    if (!skill) return false;
    const todo = skill.todos.find((t) => t.id === todoId);
    if (!todo) return false;

    todo.state = newState;

    // Automatically recalculate parent skill state
    const allDone = skill.todos.every((t) => t.state === "done");
    const anyFail = skill.todos.some((t) => t.state === "fail");
    const anyActive = skill.todos.some((t) => t.state === "active");

    if (anyFail) skill.state = "fail";
    else if (allDone && skill.todos.length > 0) skill.state = "done";
    else if (anyActive) skill.state = "active";
    else skill.state = "wait";

    this.notify();
    return true;
  }

  getSnapshot(): TodoWorkflowSnapshot {
    const skillsList = Array.from(this.skills.values());
    let completed = 0;
    let total = 0;
    let activeSkillId: string | undefined;
    let activeSubtaskId: string | undefined;

    for (const s of skillsList) {
      if (s.state === "active" && !activeSkillId) {
        activeSkillId = s.id;
      }
      for (const t of s.todos) {
        total++;
        if (t.state === "done") completed++;
        if (t.state === "active" && !activeSubtaskId) {
          activeSubtaskId = t.id;
          activeSkillId = s.id;
        }
      }
    }

    return {
      skills: skillsList,
      activeSkillId,
      activeSubtaskId,
      completedCount: completed,
      totalCount: total,
    };
  }

  /**
   * Active-Only view: returns only the skills and subtasks that are currently
   * active or immediately relevant, suppressing noise from pending stages.
   */
  getActiveOnlySnapshot(): {
    activeSkill?: SkillNode;
    activeSubtask?: SubtaskNode;
    recentCompleted: SubtaskNode[];
  } {
    const snapshot = this.getSnapshot();
    const activeSkill = snapshot.skills.find((s) => s.id === snapshot.activeSkillId);
    const activeSubtask = activeSkill?.todos.find((t) => t.id === snapshot.activeSubtaskId);

    const recentCompleted: SubtaskNode[] = [];
    for (const s of snapshot.skills) {
      for (const t of s.todos) {
        if (t.state === "done") recentCompleted.push(t);
      }
    }

    return {
      activeSkill,
      activeSubtask,
      recentCompleted: recentCompleted.slice(-3),
    };
  }

  subscribe(listener: TodoChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
