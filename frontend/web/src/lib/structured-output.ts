/**
 * LangChain Structured Output Frontend Utilities
 *
 * Implements official LangChain best practices for streaming structured outputs:
 * 1. Validate before rendering (check required fields on partial streaming data)
 * 2. Generic extraction function (parameterized by type and required keys)
 * 3. Progressive rendering (display fields as they arrive)
 * 4. Fallback representations (plain-text fallback when rich structures are incomplete)
 * 5. Flat schema priority
 * 6. Match UI to data (badges for status, cards for objects, lists/tables for arrays)
 *
 * Reference: https://docs.langchain.com/oss/python/langchain/frontend/structured-output
 */

export interface StructuredFieldDescriptor<T> {
  key: keyof T;
  type: "string" | "number" | "boolean" | "array" | "object";
  required?: boolean;
  fallback?: string;
}

/**
 * Generic extraction function parameterized with type T and required fields.
 * Safely parses complete or partially streamed JSON chunks.
 */
export function extractStructuredOutput<T extends Record<string, any>>(
  input: string | Record<string, any>,
  requiredFields: (keyof T)[] = []
): Partial<T> | null {
  if (!input) return null;

  let parsed: Record<string, any>;
  if (typeof input === "string") {
    let clean = input.trim();
    // Strip markdown code fences if wrapped
    if (clean.startsWith("```")) {
      clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    }
    // Attempt standard parse first
    try {
      parsed = JSON.parse(clean);
    } catch {
      // Partial streaming parser: attempt to close open braces/brackets
      if (!clean.startsWith("{")) return null;
      try {
        const sanitized = clean.replace(/,\s*$/, "");
        parsed = JSON.parse(sanitized + (sanitized.endsWith("}") ? "" : "}"));
      } catch {
        // If trailing unclosed string exists, attempt closing quote and brace
        try {
          parsed = JSON.parse(clean.replace(/,\s*$/, "") + '"}');
        } catch {
          return null;
        }
      }
    }
  } else {
    parsed = input;
  }

  if (typeof parsed !== "object" || parsed === null) return null;

  // Validate before rendering: check that requested required fields exist
  for (const field of requiredFields) {
    if (parsed[field as string] === undefined || parsed[field as string] === null) {
      return null;
    }
  }

  return parsed as Partial<T>;
}

/**
 * Validates that an object contains all required fields with non-empty values.
 */
export function validateFields<T extends Record<string, any>>(
  data: unknown,
  required: (keyof T)[]
): data is T {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, any>;
  return required.every((key) => {
    const val = record[key as string];
    return val !== undefined && val !== null && val !== "";
  });
}

/**
 * Generates a resilient fallback plain-text representation for any structured object.
 */
export function getStructuredFallbackText(data: Record<string, any> | null | undefined): string {
  if (!data) return "";
  if (typeof data.text === "string") return data.text;
  if (typeof data.content === "string") return data.content;
  if (typeof data.summary === "string") return data.summary;
  if (typeof data.title === "string") return data.title;
  return JSON.stringify(data, null, 2);
}
