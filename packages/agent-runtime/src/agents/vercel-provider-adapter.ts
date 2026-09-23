/**
 * OneShot Agent Runtime — Vercel AI SDK Integration & Model Adapter
 *
 * Implements the Vercel AI SDK Language Model Specification adapter pattern per:
 * https://strandsagents.com/docs/user-guide/sdk/model-providers/vercel/
 *
 * Characteristics:
 * - Bridges Vercel AI SDK providers (@ai-sdk/google, @ai-sdk/openai, @ai-sdk/anthropic, ai-sdk-ollama)
 *   into native Strands Agents SDK models via VercelModel.
 * - Safely handles optional peer dependency (@ai-sdk/provider) without crashing on missing packages.
 * - Adheres to OneShot zero-trust server boundaries (credentials stay server-side in app/env/.env).
 */

export interface VercelModelCallOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stopSequences?: string[];
  seed?: number;
  [key: string]: unknown;
}

export interface VercelModelAdapterConfig extends VercelModelCallOptions {
  provider: unknown;
}

/**
 * Checks whether an object adheres to the Vercel AI SDK LanguageModel (LanguageModelV1 / LanguageModelV3) specification.
 */
export function isVercelLanguageModel(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const candidate = obj as Record<string, unknown>;
  return (
    typeof candidate.modelId === "string" &&
    typeof candidate.provider === "string" &&
    (candidate.specificationVersion === "v1" ||
      candidate.specificationVersion === "v3" ||
      typeof candidate.doGenerate === "function" ||
      typeof candidate.doStream === "function")
  );
}

/**
 * Dynamically resolves and creates a Strands VercelModel adapter.
 * Uses dynamic import so environments without `@ai-sdk/provider` do not fail at startup.
 */
export async function resolveVercelModel(
  provider: unknown,
  config?: VercelModelCallOptions
): Promise<unknown> {
  if (!provider) {
    throw new Error("A Vercel AI SDK LanguageModel provider instance is required.");
  }

  try {
    // Dynamic import of Strands VercelModel
    const { VercelModel } = await import("@strands-agents/sdk/models/vercel");
    return new VercelModel({ provider: provider as any,
      ...config,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg.includes("Cannot find package '@ai-sdk/provider'")) {
      throw new Error(
        `VercelModel integration requires optional peer dependency '@ai-sdk/provider'. ` +
          `Install it alongside your chosen provider (e.g., npm install @ai-sdk/google @ai-sdk/provider) ` +
          `to enable Vercel AI SDK integration in Strands Agents.`
      );
    }
    throw err;
  }
}

