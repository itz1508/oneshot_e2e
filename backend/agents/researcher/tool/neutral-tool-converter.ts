import { FunctionTool } from "../../../../app/integration/strands/src/index.js";

/**
 * Neutral tool definition (M9). Provider/SDK-agnostic: the Researcher describes
 * tools in this shape, and `toStrandsFunctionTool` converts them to Strands
 * `FunctionTool`s. This decouples the Researcher from direct Strands
 * construction (migration bridge), preserving the validation contract.
 */
export interface OneShotToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly callback: (rawInput: unknown) => Promise<string>;
}

export function toStrandsFunctionTool(def: OneShotToolDefinition): FunctionTool {
  return new FunctionTool({
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema as Record<string, unknown>,
    callback: def.callback,
  });
}
