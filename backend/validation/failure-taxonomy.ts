/**
 * OneShot Failure Taxonomy
 *
 * Structured error classification for validation, execution, and workflow events.
 * Replaces binary VALID/NOT_VALID with semantic failure categories.
 *
 * Pattern: Extracted from Pydantic architecture validation error taxonomy
 */

/**
 * Core failure types organized by domain
 */
export enum FailureType {
  // Schema & Contract Failures
  SchemaMismatch = 'schema_mismatch',
  SchemaNotFound = 'schema_not_found',
  ContractMismatch = 'contract_mismatch',

  // Data Validation Failures
  TypeMismatch = 'type_mismatch',
  ValueOutOfRange = 'value_out_of_range',
  PatternMismatch = 'pattern_mismatch',
  RequiredFieldMissing = 'required_field_missing',
  UnexpectedField = 'unexpected_field',
  CoercionFailed = 'coercion_failed',

  // Artifact Failures
  ArtifactMissing = 'artifact_missing',
  ArtifactInvalid = 'artifact_invalid',
  HashMismatch = 'hash_mismatch',
  ManifestMismatch = 'manifest_mismatch',

  // Dependency Failures
  DependencyMissing = 'dependency_missing',
  DependencyInvalid = 'dependency_invalid',
  RuntimeMissing = 'runtime_missing',
  StoreMissing = 'store_missing',

  // Execution Failures
  ExecutionFailed = 'execution_failed',
  EventMismatch = 'event_mismatch',
  TerminationFailed = 'termination_failed',

  // Configuration Failures
  ConfigNotFound = 'config_not_found',
  ConfigInvalid = 'config_invalid',
  BoundaryViolation = 'boundary_violation',

  // Workflow Failures
  WorkflowInvalid = 'workflow_invalid',
  NodeFailed = 'node_failed',
  TransitionFailed = 'transition_failed',

  // Research Failures
  RefreshmentFailed = 'refreshment_failed',
  FragmentationFailed = 'fragmentation_failed',
  MergeFailed = 'merge_failed',
  ValidationCycleMaxed = 'validation_cycle_maxed',

  // Serialization Failures
  SerializationFailed = 'serialization_failed',
  DeserializationFailed = 'deserialization_failed',
  EncodingFailed = 'encoding_failed',
}

/**
 * Failure severity levels
 */
export enum FailureSeverity {
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
  Critical = 'critical',
}

/**
 * Structured failure representation
 */
export interface ValidationFailure {
  type: FailureType;
  severity: FailureSeverity;
  message: string;
  path?: string[];
  context?: Record<string, unknown>;
  originalError?: Error;
  originalErrorMessage?: string;
  causedBy?: ValidationFailure;
  timestamp: number;
}

/**
 * Validation result - either success or structured failures
 */
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; failures: ValidationFailure[] };

/**
 * Helper to create validation failures
 */
export function createFailure(
  type: FailureType,
  message: string,
  options?: {
    severity?: FailureSeverity;
    path?: string[];
    context?: Record<string, unknown>;
    originalError?: Error;
    causedBy?: ValidationFailure;
  }
): ValidationFailure {
  return {
    type,
    severity: options?.severity ?? FailureSeverity.Error,
    message,
    path: options?.path,
    context: options?.context,
    originalError: options?.originalError,
    originalErrorMessage: options?.originalError?.message,
    causedBy: options?.causedBy,
    timestamp: Date.now(),
  };
}

/**
 * Helper to create success result
 */
export function validationSuccess<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

/**
 * Helper to create failure result
 */
export function validationError<T>(
  ...failures: ValidationFailure[]
): ValidationResult<T> {
  return { ok: false, failures };
}

/**
 * Classify error by examining message and context
 */
export function classifyError(error: unknown): FailureType {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    
    if (msg.includes('schema') || msg.includes('definition')) {
      return FailureType.SchemaMismatch;
    }
    if (msg.includes('type') || msg.includes('typeof')) {
      return FailureType.TypeMismatch;
    }
    if (msg.includes('range') || msg.includes('bound')) {
      return FailureType.ValueOutOfRange;
    }
    if (msg.includes('required')) {
      return FailureType.RequiredFieldMissing;
    }
    if (msg.includes('hash') || msg.includes('checksum')) {
      return FailureType.HashMismatch;
    }
    if (msg.includes('artifact') || msg.includes('not found')) {
      return FailureType.ArtifactMissing;
    }
    if (msg.includes('dependency')) {
      return FailureType.DependencyMissing;
    }
  }

  return FailureType.ExecutionFailed;
}

/**
 * Serialize ValidationFailure for transport (HTTP, storage)
 * Converts Error objects to strings and removes circular references
 */
export function serializeFailure(failure: ValidationFailure): Record<string, unknown> {
  return {
    type: failure.type,
    severity: failure.severity,
    message: failure.message,
    path: failure.path,
    context: failure.context,
    originalErrorMessage: failure.originalErrorMessage,
    causedBy: failure.causedBy ? serializeFailure(failure.causedBy) : undefined,
    timestamp: failure.timestamp,
  };
}

/**
 * Chain failures to track root causes
 * Adds a failure as the cause of another failure
 */
export function chainFailure(
  current: ValidationFailure,
  causedBy: ValidationFailure
): ValidationFailure {
  return {
    ...current,
    causedBy,
  };
}

/**
 * Collect all failures in a chain
 */
export function getFailureChain(failure: ValidationFailure): ValidationFailure[] {
  const chain: ValidationFailure[] = [failure];
  let current = failure.causedBy;
  
  while (current) {
    chain.push(current);
    current = current.causedBy;
  }
  
  return chain;
}

/**
 * Map for failure type to default severity
 */
export const FAILURE_SEVERITY_MAP: Record<FailureType, FailureSeverity> = {
  // Schema & Contract
  [FailureType.SchemaMismatch]: FailureSeverity.Error,
  [FailureType.SchemaNotFound]: FailureSeverity.Error,
  [FailureType.ContractMismatch]: FailureSeverity.Error,

  // Data Validation
  [FailureType.TypeMismatch]: FailureSeverity.Error,
  [FailureType.ValueOutOfRange]: FailureSeverity.Warning,
  [FailureType.PatternMismatch]: FailureSeverity.Warning,
  [FailureType.RequiredFieldMissing]: FailureSeverity.Error,
  [FailureType.UnexpectedField]: FailureSeverity.Warning,
  [FailureType.CoercionFailed]: FailureSeverity.Error,

  // Artifact
  [FailureType.ArtifactMissing]: FailureSeverity.Error,
  [FailureType.ArtifactInvalid]: FailureSeverity.Error,
  [FailureType.HashMismatch]: FailureSeverity.Critical,
  [FailureType.ManifestMismatch]: FailureSeverity.Critical,

  // Dependency
  [FailureType.DependencyMissing]: FailureSeverity.Critical,
  [FailureType.DependencyInvalid]: FailureSeverity.Error,
  [FailureType.RuntimeMissing]: FailureSeverity.Critical,
  [FailureType.StoreMissing]: FailureSeverity.Critical,

  // Execution
  [FailureType.ExecutionFailed]: FailureSeverity.Error,
  [FailureType.EventMismatch]: FailureSeverity.Warning,
  [FailureType.TerminationFailed]: FailureSeverity.Critical,

  // Configuration
  [FailureType.ConfigNotFound]: FailureSeverity.Error,
  [FailureType.ConfigInvalid]: FailureSeverity.Error,
  [FailureType.BoundaryViolation]: FailureSeverity.Warning,

  // Workflow
  [FailureType.WorkflowInvalid]: FailureSeverity.Error,
  [FailureType.NodeFailed]: FailureSeverity.Error,
  [FailureType.TransitionFailed]: FailureSeverity.Error,

  // Research
  [FailureType.RefreshmentFailed]: FailureSeverity.Warning,
  [FailureType.FragmentationFailed]: FailureSeverity.Warning,
  [FailureType.MergeFailed]: FailureSeverity.Error,
  [FailureType.ValidationCycleMaxed]: FailureSeverity.Warning,

  // Serialization
  [FailureType.SerializationFailed]: FailureSeverity.Error,
  [FailureType.DeserializationFailed]: FailureSeverity.Error,
  [FailureType.EncodingFailed]: FailureSeverity.Error,
};
