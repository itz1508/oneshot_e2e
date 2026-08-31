import type { RootCause } from "../contract/types.js";
export class WorkflowRootCauseError extends Error {
  constructor(public readonly rootCause:RootCause){ super(rootCause.actual); this.name="WorkflowRootCauseError"; }
}
