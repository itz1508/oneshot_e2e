import { PythonBridge } from "./python-bridge.js";

/**
 * One dedicated Python worker per Triple Validation branch.
 *
 * ParallelAgent starts Schema / Fixture / Goal concurrently. A single
 * PythonBridge would still serialize those RPCs inside one synchronous Python
 * worker, so the canonical runtime owns exactly three independent lanes.
 */
export class ValidationLanePool {
  readonly schema: PythonBridge;
  readonly fixture: PythonBridge;
  readonly goal: PythonBridge;

  constructor(factory: () => PythonBridge = () => new PythonBridge()) {
    this.schema = factory();
    this.fixture = factory();
    this.goal = factory();
  }

  close(): void {
    this.schema.close();
    this.fixture.close();
    this.goal.close();
  }
}
