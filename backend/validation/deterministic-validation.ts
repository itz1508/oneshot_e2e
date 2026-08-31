import type { Plan, ResearchBundle, TripleValidation } from "../contract/types.js";
import { PythonBridge } from "./python-bridge.js";
export class DeterministicValidationRuntime { constructor(private bridge:PythonBridge){} async triple(bundle:ResearchBundle,plan:Plan):Promise<TripleValidation>{return await this.bridge.call<TripleValidation>("triple-validation",{plan,validation:bundle.validation,schema_artifact:bundle.schema_artifact,fixture:bundle.fixture,goal:bundle.goal});} }
