import { Ajv2020 } from "ajv/dist/2020.js";
import reasoningRequestSchema from "../schema/reasoning/request.schema.json" with { type: "json" };
import reasoningResponseSchema from "../schema/reasoning/response.schema.json" with { type: "json" };

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
});

const validateReasoningRequest = ajv.compile(reasoningRequestSchema);
const validateReasoningResponse = ajv.compile(reasoningResponseSchema);

export type ReasoningTask =
  | "researcher"
  | "planner"
  | "gap-analysis"
  | "evaluation"
  | "critic";

export interface ReasoningEvidence {
  source: string;
  content: string;
  confidence: number;
}

export interface ReasoningPlanTask {
  id: string;
  title: string;
  action: string;
  required: boolean;
}

export interface ReasoningPlan {
  id: string;
  objective: string;
  status: string;
  tasks: ReasoningPlanTask[];
}

export interface ReasoningRequest {
  run_id: string;
  task: ReasoningTask;
  goal: string;
  constraints: string[];
  evidence: ReasoningEvidence[];
  plan?: ReasoningPlan | null;
}

export interface ReasoningFinding {
  code: string;
  severity: string;
  message: string;
}

export interface ReasoningResponse {
  run_id: string;
  task: ReasoningTask;
  success: boolean;
  confidence: number;
  analysis: string[];
  findings: ReasoningFinding[];
  risks: string[];
  missing_evidence: string[];
  recommendation: string;
}

export interface PythonReasonerOptions {
  baseUrl?: string;
  token?: string;
  timeoutMs?: number;
}

export class PythonReasoner {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(options: PythonReasonerOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.PYTHON_REASONER_URL ??
      "http://127.0.0.1:8100"
    ).replace(/\/+$/, "");

    this.token =
      options.token ?? process.env.ONESHOT_INTERNAL_TOKEN ?? "";

    this.timeoutMs = options.timeoutMs ?? 60_000;

    if (!this.token) {
      throw new Error(
        "ONESHOT_INTERNAL_TOKEN is required for PythonReasoner.",
      );
    }
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5_000),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  async reason(
    request: ReasoningRequest,
  ): Promise<ReasoningResponse> {
    assertReasoningRequest(request);

    const response = await fetch(`${this.baseUrl}/v1/reason`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Python reasoner failed with HTTP ${response.status}: ${body}`,
      );
    }

    const value: unknown = await response.json();
    assertReasoningResponse(value);
    return value;
  }
}

export function createPythonReasoner(): PythonReasoner | undefined {
  const url = process.env.PYTHON_REASONER_URL;
  const token = process.env.ONESHOT_INTERNAL_TOKEN;
  if (!url || !token) return undefined;
  return new PythonReasoner({ baseUrl: url, token });
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
