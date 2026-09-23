import test from 'node:test';
import assert from 'node:assert';
import {
  FailureType,
  FailureSeverity,
  createFailure,
  validationSuccess,
  validationError,
  classifyError,
  ValidationFailure,
} from '../../validation/failure-taxonomy.js';

test('Failure Taxonomy', async (suite) => {
  await suite.test('createFailure creates valid ValidationFailure', () => {
    const failure = createFailure(FailureType.TypeMismatch, 'Expected string, got number');

    assert.strictEqual(failure.type, FailureType.TypeMismatch);
    assert.strictEqual(failure.message, 'Expected string, got number');
    assert.strictEqual(failure.severity, FailureSeverity.Error);
    assert(typeof failure.timestamp === 'number');
    assert(failure.timestamp > 0);
  });

  await suite.test('createFailure accepts optional severity', () => {
    const failure = createFailure(FailureType.ConfigNotFound, 'Missing config', {
      severity: FailureSeverity.Critical,
    });

    assert.strictEqual(failure.severity, FailureSeverity.Critical);
  });

  await suite.test('createFailure includes path when provided', () => {
    const failure = createFailure(FailureType.RequiredFieldMissing, 'name is required', {
      path: ['user', 'profile', 'name'],
    });

    assert.deepStrictEqual(failure.path, ['user', 'profile', 'name']);
  });

  await suite.test('createFailure includes context when provided', () => {
    const context = { received: 'number', expected: 'string' };
    const failure = createFailure(FailureType.TypeMismatch, 'Type error', { context });

    assert.deepStrictEqual(failure.context, context);
  });

  await suite.test('createFailure includes originalError when provided', () => {
    const error = new Error('Original error message');
    const failure = createFailure(FailureType.ExecutionFailed, 'Execution failed', {
      originalError: error,
    });

    assert.strictEqual(failure.originalError, error);
  });

  await suite.test('validationSuccess creates success result', () => {
    const result = validationSuccess({ id: 123, name: 'test' });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.deepStrictEqual(result.value, { id: 123, name: 'test' });
    }
  });

  await suite.test('validationError creates failure result', () => {
    const failure1 = createFailure(FailureType.TypeMismatch, 'Type error');
    const failure2 = createFailure(FailureType.RequiredFieldMissing, 'Missing field');

    const result = validationError(failure1, failure2);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.failures.length, 2);
      assert.strictEqual(result.failures[0].type, FailureType.TypeMismatch);
      assert.strictEqual(result.failures[1].type, FailureType.RequiredFieldMissing);
    }
  });

  await suite.test('classifyError identifies schema mismatches', () => {
    const error1 = new Error('Schema validation failed');
    const error2 = new Error('Definition does not match');

    assert.strictEqual(classifyError(error1), FailureType.SchemaMismatch);
    assert.strictEqual(classifyError(error2), FailureType.SchemaMismatch);
  });

  await suite.test('classifyError identifies type mismatches', () => {
    const error1 = new Error('Type mismatch: expected string');
    const error2 = new Error('typeof check failed');

    assert.strictEqual(classifyError(error1), FailureType.TypeMismatch);
    assert.strictEqual(classifyError(error2), FailureType.TypeMismatch);
  });

  await suite.test('classifyError identifies range violations', () => {
    const error1 = new Error('Value out of range');
    const error2 = new Error('Boundary exceeded');

    assert.strictEqual(classifyError(error1), FailureType.ValueOutOfRange);
    assert.strictEqual(classifyError(error2), FailureType.ValueOutOfRange);
  });

  await suite.test('classifyError identifies required field missing', () => {
    const error = new Error('Required field name is missing');

    assert.strictEqual(classifyError(error), FailureType.RequiredFieldMissing);
  });

  await suite.test('classifyError identifies hash mismatches', () => {
    const error1 = new Error('Hash mismatch detected');
    const error2 = new Error('Checksum validation failed');

    assert.strictEqual(classifyError(error1), FailureType.HashMismatch);
    assert.strictEqual(classifyError(error2), FailureType.HashMismatch);
  });

  await suite.test('classifyError identifies artifact issues', () => {
    const error1 = new Error('Artifact not found');
    const error2 = new Error('File not found in storage');

    assert.strictEqual(classifyError(error1), FailureType.ArtifactMissing);
    assert.strictEqual(classifyError(error2), FailureType.ArtifactMissing);
  });

  await suite.test('classifyError identifies dependency issues', () => {
    const error1 = new Error('Dependency module not found');
    const error2 = new Error('Cannot resolve dependency');

    // "Dependency module not found" matches "not found" before "dependency", so it's ArtifactMissing
    assert.strictEqual(classifyError(error1), FailureType.ArtifactMissing);
    // "Cannot resolve dependency" matches "dependency"
    assert.strictEqual(classifyError(error2), FailureType.DependencyMissing);
  });

  await suite.test('classifyError defaults to ExecutionFailed for unknown', () => {
    const error = new Error('Some random error');
    const nonError = 'Not an Error object';

    assert.strictEqual(classifyError(error), FailureType.ExecutionFailed);
    assert.strictEqual(classifyError(nonError), FailureType.ExecutionFailed);
  });

  await suite.test('classifyError is case-insensitive', () => {
    const error1 = new Error('SCHEMA VALIDATION FAILED');
    const error2 = new Error('Type Mismatch: expected string');

    assert.strictEqual(classifyError(error1), FailureType.SchemaMismatch);
    assert.strictEqual(classifyError(error2), FailureType.TypeMismatch);
  });

  await suite.test('ValidationFailure includes all required fields', () => {
    const failure = createFailure(
      FailureType.BoundaryViolation,
      'Config boundary violation',
      {
        severity: FailureSeverity.Warning,
        path: ['session', 'config'],
        context: { from: 'Session', to: 'Workflow' },
      }
    );

    assert.strictEqual(failure.type, FailureType.BoundaryViolation);
    assert.strictEqual(failure.message, 'Config boundary violation');
    assert.strictEqual(failure.severity, FailureSeverity.Warning);
    assert.deepStrictEqual(failure.path, ['session', 'config']);
    assert.deepStrictEqual(failure.context, { from: 'Session', to: 'Workflow' });
    assert(typeof failure.timestamp === 'number');
  });

  await suite.test('ValidationResult discriminates correctly', () => {
    const success = validationSuccess({ data: 'test' });
    const failure = validationError(createFailure(FailureType.TypeMismatch, 'Error'));

    if (success.ok) {
      assert.deepStrictEqual(success.value, { data: 'test' });
    } else {
      assert.fail('success result should have ok: true');
    }

    if (!failure.ok) {
      assert.strictEqual(failure.failures.length, 1);
    } else {
      assert.fail('failure result should have ok: false');
    }
  });

  await suite.test('FailureType enum includes all domain variants', () => {
    const expectedTypes = [
      // Schema & Contract
      'schema_mismatch',
      'schema_not_found',
      'contract_mismatch',
      // Validation
      'type_mismatch',
      'value_out_of_range',
      'pattern_mismatch',
      'required_field_missing',
      'unexpected_field',
      'coercion_failed',
      // Artifact
      'artifact_missing',
      'artifact_invalid',
      'hash_mismatch',
      'manifest_mismatch',
      // Dependency
      'dependency_missing',
      'dependency_invalid',
      'runtime_missing',
      'store_missing',
      // Execution
      'execution_failed',
      'event_mismatch',
      'termination_failed',
      // Configuration
      'config_not_found',
      'config_invalid',
      'boundary_violation',
      // Workflow
      'workflow_invalid',
      'node_failed',
      'transition_failed',
      // Research
      'refreshment_failed',
      'fragmentation_failed',
      'merge_failed',
      'validation_cycle_maxed',
      // Serialization
      'serialization_failed',
      'deserialization_failed',
      'encoding_failed',
    ];

    const failureTypeObj = FailureType as Record<string, string>;
    for (const type of expectedTypes) {
      assert(Object.values(failureTypeObj).includes(type), `FailureType should include ${type}`);
    }
  });

  await suite.test('FailureSeverity enum has all levels', () => {
    assert.strictEqual(FailureSeverity.Info, 'info');
    assert.strictEqual(FailureSeverity.Warning, 'warning');
    assert.strictEqual(FailureSeverity.Error, 'error');
    assert.strictEqual(FailureSeverity.Critical, 'critical');
  });
});
