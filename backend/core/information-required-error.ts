import type { RootCause } from "../contracts/schema/types.js";
import type { HelpRequest } from "../intent/types.js";
import { WorkflowRootCauseError } from "./root-cause-error.js";

export class WorkflowInformationRequiredError extends WorkflowRootCauseError {
  constructor(
    rootCause: RootCause,
    public readonly helpRequest: HelpRequest,
  ) {
    super(rootCause);
    this.name = "WorkflowInformationRequiredError";
  }
}
