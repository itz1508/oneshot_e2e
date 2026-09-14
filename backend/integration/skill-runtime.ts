/**
 * Generic runtime seam for skill tool/model calls.
 *
 * Wraps a skill tool invocation with timeout, provenance, and error handling.
 */
export interface SkillRuntimeCall {
  skillId: string;
  tool: string;
  input: unknown;
  timeoutMs?: number;
}

export interface SkillRuntimeResult {
  ok: boolean;
  output?: unknown;
  error?: string;
  elapsedMs: number;
}

export async function callSkillTool(
  handler: (input: unknown) => Promise<unknown>,
  call: SkillRuntimeCall,
): Promise<SkillRuntimeResult> {
  const start = Date.now();
  const timeout = call.timeoutMs ?? 120_000;

  try {
    const output = await Promise.race([
      handler(call.input),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Skill tool timeout: ${call.skillId}.${call.tool}`)), timeout),
      ),
    ]);
    return { ok: true, output, elapsedMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - start,
    };
  }
}
