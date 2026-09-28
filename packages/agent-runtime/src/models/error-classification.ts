/**
 * OneShot Error Classification — SDK-Aware Error Taxonomy
 *
 * Maps raw errors from OpenAI/Gemini/Strands SDK calls into a normalized
 * error taxonomy with appropriate HTTP status codes, retry eligibility,
 * and user-facing messages.
 *
 * References:
 * - OpenAI Node SDK error types: APIError, RateLimitError, AuthenticationError, APIConnectionError
 * - Gemini API error codes: https://ai.google.dev/gemini-api/docs/troubleshooting
 */

export enum ModelErrorCode {
  /** Transient — retry eligible */
  RATE_LIMITED = 'RATE_LIMITED',
  SERVER_ERROR = 'SERVER_ERROR',
  TIMEOUT = 'TIMEOUT',
  CONNECTION_ERROR = 'CONNECTION_ERROR',

  /** Permanent — do NOT retry */
  AUTH_FAILED = 'AUTH_FAILED',
  INVALID_REQUEST = 'INVALID_REQUEST',
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  CONTENT_FILTERED = 'CONTENT_FILTERED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',

  /** Internal */
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  UNKNOWN = 'UNKNOWN',
}

export interface ClassifiedModelError {
  code: ModelErrorCode
  message: string
  httpStatus: number
  retryEligible: boolean
  provider: string
  originalError: unknown
  /** Suggested wait time in ms before retry (only meaningful when retryEligible) */
  retryAfterMs?: number
}

/**
 * Classifies a raw error from an SDK model call into a structured error.
 */
export function classifyModelError(
  err: unknown,
  provider: string
): ClassifiedModelError {
  if (!err) {
    return {
      code: ModelErrorCode.UNKNOWN,
      message: 'An unknown error occurred',
      httpStatus: 500,
      retryEligible: false,
      provider,
      originalError: err,
    }
  }

  const error = err as Record<string, unknown>
  const message = (error.message || String(err)) as string
  const status = (error.status || error.statusCode || 0) as number
  const errorType = (error.type || error.code || error.name || '') as string

  // OpenAI SDK exports specific error classes — check by name or status
  // RateLimitError (429)
  if (
    status === 429 ||
    errorType === 'rate_limit_exceeded' ||
    (error.constructor?.name === 'RateLimitError') ||
    message.toLowerCase().includes('rate limit')
  ) {
    const retryAfter = parseRetryAfter(error)
    return {
      code: ModelErrorCode.RATE_LIMITED,
      message: `Rate limited by ${provider}: ${message}`,
      httpStatus: 429,
      retryEligible: true,
      provider,
      originalError: err,
      retryAfterMs: retryAfter || 10_000,
    }
  }

  // AuthenticationError (401)
  if (
    status === 401 ||
    errorType === 'authentication_error' ||
    (error.constructor?.name === 'AuthenticationError') ||
    message.toLowerCase().includes('api key')
  ) {
    return {
      code: ModelErrorCode.AUTH_FAILED,
      message: `Authentication failed for ${provider}: ${message}`,
      httpStatus: 401,
      retryEligible: false,
      provider,
      originalError: err,
    }
  }

  // Forbidden / Quota (403)
  if (status === 403) {
    return {
      code: ModelErrorCode.QUOTA_EXCEEDED,
      message: `Access denied or quota exceeded for ${provider}: ${message}`,
      httpStatus: 403,
      retryEligible: false,
      provider,
      originalError: err,
    }
  }

  // Not Found (404) — model doesn't exist
  if (
    status === 404 ||
    message.toLowerCase().includes('model not found') ||
    message.toLowerCase().includes('does not exist')
  ) {
    return {
      code: ModelErrorCode.MODEL_NOT_FOUND,
      message: `Model not found on ${provider}: ${message}`,
      httpStatus: 404,
      retryEligible: false,
      provider,
      originalError: err,
    }
  }

  // Bad Request (400) — invalid parameters
  if (
    status === 400 ||
    errorType === 'invalid_request_error'
  ) {
    return {
      code: ModelErrorCode.INVALID_REQUEST,
      message: `Invalid request to ${provider}: ${message}`,
      httpStatus: 400,
      retryEligible: false,
      provider,
      originalError: err,
    }
  }

  // Content filtered (Gemini safety / OpenAI content_filter)
  if (
    message.toLowerCase().includes('content filter') ||
    message.toLowerCase().includes('safety') ||
    message.toLowerCase().includes('blocked')
  ) {
    return {
      code: ModelErrorCode.CONTENT_FILTERED,
      message: `Content filtered by ${provider}: ${message}`,
      httpStatus: 422,
      retryEligible: false,
      provider,
      originalError: err,
    }
  }

  // Server errors (500, 502, 503) — transient, retry eligible
  if (status >= 500 && status < 600) {
    return {
      code: ModelErrorCode.SERVER_ERROR,
      message: `Server error from ${provider} (${status}): ${message}`,
      httpStatus: 502,
      retryEligible: true,
      provider,
      originalError: err,
      retryAfterMs: 5_000,
    }
  }

  // Connection / timeout errors
  if (
    errorType === 'ECONNREFUSED' ||
    errorType === 'ENOTFOUND' ||
    errorType === 'ETIMEDOUT' ||
    errorType === 'UND_ERR_CONNECT_TIMEOUT' ||
    (error.constructor?.name === 'APIConnectionError') ||
    message.toLowerCase().includes('timeout') ||
    message.toLowerCase().includes('econnrefused') ||
    message.toLowerCase().includes('fetch failed')
  ) {
    const isTimeout = message.toLowerCase().includes('timeout') || errorType === 'ETIMEDOUT'
    return {
      code: isTimeout ? ModelErrorCode.TIMEOUT : ModelErrorCode.CONNECTION_ERROR,
      message: `${isTimeout ? 'Timeout' : 'Connection failed'} for ${provider}: ${message}`,
      httpStatus: 504,
      retryEligible: true,
      provider,
      originalError: err,
      retryAfterMs: isTimeout ? 5_000 : 3_000,
    }
  }

  // Fallback — unknown error
  return {
    code: ModelErrorCode.UNKNOWN,
    message: `Unexpected error from ${provider}: ${message}`,
    httpStatus: 500,
    retryEligible: false,
    provider,
    originalError: err,
  }
}

/**
 * Extracts retry-after header value from error objects.
 * OpenAI SDK sometimes includes headers on the error.
 */
function parseRetryAfter(error: Record<string, unknown>): number | undefined {
  const headers = error.headers as Record<string, string> | undefined
  if (!headers) return undefined

  const retryAfter = headers['retry-after']
  if (!retryAfter) return undefined

  const seconds = Number(retryAfter)
  if (!Number.isNaN(seconds) && seconds > 0) {
    return seconds * 1000
  }

  return undefined
}
