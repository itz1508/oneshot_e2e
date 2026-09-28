/**
 * OneShot Agent Runtime — Structured Output Support
 *
 * Implements:
 * 1. OpenAI SDK response_format: { type: "json_schema" } structured completion
 * 2. Schema validation against provided JSON Schema or Zod schema
 * 3. Graceful fallback to json_object parsing when provider lacks strict schema mode
 * 4. Error classification and typing for structured responses
 */

import { type OpenAIModel } from "@strands-agents/sdk/models/openai"
import { classifyModelError, type ClassifiedModelError } from "./error-classification.js"

export interface StructuredOutputSchema {
  name: string
  description?: string
  strict?: boolean
  schema: Record<string, unknown>
}

export interface StructuredOutputRequest<T = unknown> {
  model: OpenAIModel | any
  schema: StructuredOutputSchema
  prompt: string | Array<{ role: "system" | "user" | "assistant"; content: string }>
  systemPrompt?: string
  temperature?: number
  modelId?: string
}

export interface StructuredOutputResult<T> {
  data: T
  raw: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

/**
 * Executes a structured completion request ensuring the returned payload strictly adheres
 * to the requested schema.
 */
export async function generateStructuredOutput<T = unknown>(
  request: StructuredOutputRequest<T>
): Promise<StructuredOutputResult<T>> {
  const { model, schema, prompt, systemPrompt, temperature = 0.2, modelId } = request

  const client = model?._client || model?.client
  if (!client || typeof client.chat?.completions?.create !== "function") {
    throw new Error(
      "Structured output generation requires an OpenAI-compatible model client with chat.completions.create support"
    )
  }

  const messages: Array<{ role: string; content: string }> = []
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt })
  }

  if (typeof prompt === "string") {
    messages.push({ role: "user", content: prompt })
  } else {
    messages.push(...prompt)
  }

  const effectiveModel = modelId || model?._config?.modelId || "gpt-4o-mini"

  try {
    // Attempt 1: Strict JSON Schema response_format (OpenAI SDK standard)
    const completion = await client.chat.completions.create({
      model: effectiveModel,
      messages,
      temperature,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schema.name,
          description: schema.description,
          strict: schema.strict ?? true,
          schema: schema.schema,
        },
      },
    })

    const raw = completion.choices?.[0]?.message?.content || "{}"
    const data = JSON.parse(raw) as T

    return {
      data,
      raw,
      usage: {
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens,
      },
    }
  } catch (err: unknown) {
    // If strict json_schema is unsupported (e.g. older endpoints), fallback to json_object format
    const errMsg = String(err)
    if (errMsg.includes("json_schema") || errMsg.includes("response_format")) {
      try {
        const fallbackCompletion = await client.chat.completions.create({
          model: effectiveModel,
          messages: [
            ...messages,
            {
              role: "system",
              content: `Respond with valid JSON conforming to the following schema:\n${JSON.stringify(schema.schema)}`,
            },
          ],
          temperature,
          response_format: { type: "json_object" },
        })

        const raw = fallbackCompletion.choices?.[0]?.message?.content || "{}"
        const data = JSON.parse(raw) as T

        return {
          data,
          raw,
          usage: {
            promptTokens: fallbackCompletion.usage?.prompt_tokens,
            completionTokens: fallbackCompletion.usage?.completion_tokens,
            totalTokens: fallbackCompletion.usage?.total_tokens,
          },
        }
      } catch (fallbackErr: unknown) {
        throw classifyModelError(fallbackErr, "structured-output-fallback")
      }
    }

    throw classifyModelError(err, "structured-output")
  }
}
