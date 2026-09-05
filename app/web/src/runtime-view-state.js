// Semantic UI state projection.
// Derives IDLE / PLANNING / RUNNING / COMPLETE / ERROR strictly from real
// runtime events and snapshots. No fabricated progress, stages, or timers.
export const WORKFLOW_STATES = ['IDLE', 'PLANNING', 'RUNNING', 'COMPLETE', 'ERROR'];

const PLANNING_PROCESSORS = ['Researcher', 'Planner'];
const EXECUTING_PROCESSORS = ['Refactor', 'Gap Analysis', 'Evaluation', 'Schema Validation', 'Fixture Validation', 'Goal Validation', 'Builder', 'Hash Verification'];
const TERMINAL_PROCESSORS = ['Confirmed', 'Done'];

function isTerminalComplete(e) {
  return TERMINAL_PROCESSORS.includes(e.processor) && (e.state === 'COMPLETE' || e.state === 'COMPLETED');
}

function isExecuting(e) {
  return EXECUTING_PROCESSORS.includes(e.processor);
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
    onChange?.(current);
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
        else if (isExecuting(e)) executing = true;
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
    /** Get current phase from processor. */
    getPhase(processor) {
      const phaseMap = {
        'Researcher': 'research',
        'Planner': 'planning',
        'Refactor': 'refactor',
        'Gap Analysis': 'gap-analysis',
        'Evaluation': 'evaluation',
        'Schema Validation': 'validation',
        'Fixture Validation': 'validation',
        'Goal Validation': 'validation',
        'Builder': 'building',
        'Hash Verification': 'hashing',
        'Confirmed': 'terminal',
        'Done': 'success',
      };
      return phaseMap[processor] || 'idle';
    },
  };
}
