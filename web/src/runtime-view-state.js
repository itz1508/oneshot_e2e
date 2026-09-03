// Semantic UI state projection.
// Derives IDLE / PLANNING / RUNNING / COMPLETE / ERROR strictly from real
// runtime events and snapshots. No fabricated progress, stages, or timers.
export const WORKFLOW_STATES = ['IDLE', 'PLANNING', 'RUNNING', 'COMPLETE', 'ERROR'];

const PLANNING_PROCESSORS = ['Researcher', 'Planner'];
const TERMINAL_PROCESSOR = 'Done';

function isTerminalComplete(e) {
  return e.processor === TERMINAL_PROCESSOR && (e.state === 'COMPLETE' || e.state === 'COMPLETED');
}

export function createStateMachine(app, { onChange } = {}) {
  let current = 'IDLE';
  let planning = false;
  let executing = false;
  let terminal = null; // 'COMPLETE' | 'ERROR'

  // Initial semantic class is applied immediately (idle until real events).
  if (app) app.classList.add('state-idle');

  function set(next) {
    if (next === current) return;
    current = next;
    if (app) {
      for (const s of WORKFLOW_STATES) app.classList.remove(`state-${s.toLowerCase()}`);
      app.classList.add(`state-${next.toLowerCase()}`);
    }
    onChange?.(next);
  }

  function derive() {
    if (terminal) return terminal;
    if (executing) return 'RUNNING';
    if (planning) return 'PLANNING';
    return current === 'IDLE' ? 'IDLE' : 'RUNNING';
  }

  return {
    /** Feed one real normalized event. */
    onEvent(e) {
      if (!e) return;
      if (isTerminalComplete(e)) {
        terminal = e.result === 'PASSED' ? 'COMPLETE' : 'ERROR';
      } else if (e.state === 'RUNNING') {
        if (PLANNING_PROCESSORS.includes(e.processor)) planning = true;
        else executing = true;
      }
      set(derive());
    },
    /** A real run was created (Generate accepted by the runtime). */
    onRunCreated() {
      planning = true;
      executing = false;
      terminal = null;
      set('PLANNING');
    },
    /** No active run (restore failed / cleared). */
    onReset() {
      planning = false;
      executing = false;
      terminal = null;
      set('IDLE');
    },
    current: () => current,
  };
}
