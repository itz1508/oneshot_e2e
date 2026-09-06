import { Ajv } from "ajv";
import reasoningRequestSchema from "../../schema/reasoning/request.schema.json" with { type: "json" };
import reasoningResponseSchema from "../../schema/reasoning/response.schema.json" with { type: "json" };

const ajv = new Ajv({
  allErrors: true,
  strict: true,
});

const validateReasoningRequest = ajv.compile(
  reasoningRequestSchema,
);

const validateReasoningResponse = ajv.compile(
  reasoningResponseSchema,
);

export interface EvidenceItem {
  source: string;
  content: string;
  confidence: number;
}

export interface ReasoningRequest {
  run_id: string;
  task:
    | "researcher"
    | "planner"
    | "gap-analysis"
    | "evaluation"
    | "critic";
  goal: string;
  evidence: EvidenceItem[];
  constraints: string[];
  plan?: Record<string, unknown> | null;
}

export interface Finding {
  code: string;
  severity: string;
  message: string;
}

export interface ReasoningResponse {
  run_id: string;
  task: string;
  success: boolean;
  confidence: number;
  analysis: string[];
  findings: Finding[];
  risks: string[];
  missing_evidence: string[];
  recommendation: string;
}

export function assertReasoningRequest(
  value: unknown,
): asserts value is ReasoningRequest {
  const valid = validateReasoningRequest(value);
  if (!valid) {
    throw new Error(
      `Invalid Python reasoning request: ${JSON.stringify(
        validateReasoningRequest.errors,
      )}`,
    );
  }
}

export function assertReasoningResponse(
  value: unknown,
): asserts value is ReasoningResponse {
  const valid = validateReasoningResponse(value);
  if (!valid) {
    throw new Error(
      `Invalid Python reasoning response: ${JSON.stringify(
        validateReasoningResponse.errors,
      )}`,
    );
  }
}

/**
 * Minimal client for the Python reasoning addon. The base URL is provided by
 * PYTHON_REASONING_URL; if unset, the addon is considered unavailable and any
 * call throws.
 */
export async function callReasoning(
  request: ReasoningRequest,
): Promise<ReasoningResponse> {
  const baseUrl = process.env.PYTHON_REASONING_URL;
  if (!baseUrl) {
    throw new Error("PYTHON_REASONING_URL is not configured");
  }

  assertReasoningRequest(request);

  const response = await fetch(`${baseUrl}/v1/reason`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(
      `Python reasoning service returned ${response.status}: ${await response.text()}`,
    );
  }

  const body = (await response.json()) as unknown;
  assertReasoningResponse(body);
  return body;
}
