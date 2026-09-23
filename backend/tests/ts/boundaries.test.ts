import test from 'node:test';
import assert from 'node:assert';
import {
  ConfigScope,
  BOUNDARY_RULES,
  canPropagate,
  getPropagatingFields,
  validateBoundaries,
  PropagatingConfig,
} from '../../config/boundaries.js';

test('Configuration Boundaries', async (suite) => {
  await suite.test('canPropagate returns true for valid paths', () => {
    assert.strictEqual(canPropagate(ConfigScope.Session, ConfigScope.Workflow), true);
    assert.strictEqual(canPropagate(ConfigScope.Workflow, ConfigScope.Validation), true);
    assert.strictEqual(canPropagate(ConfigScope.Workflow, ConfigScope.Builder), true);
    assert.strictEqual(canPropagate(ConfigScope.Builder, ConfigScope.Persistence), true);
  });

  await suite.test('canPropagate returns false for invalid paths', () => {
    assert.strictEqual(canPropagate(ConfigScope.Validation, ConfigScope.Builder), false);
    assert.strictEqual(canPropagate(ConfigScope.Persistence, ConfigScope.Builder), false);
    assert.strictEqual(canPropagate(ConfigScope.Research, ConfigScope.Session), false);
    assert.strictEqual(canPropagate(ConfigScope.Validation, ConfigScope.Workflow), false);
  });

  await suite.test('getPropagatingFields returns correct subset', () => {
    const fromSession = getPropagatingFields(ConfigScope.Session, ConfigScope.Workflow);
    assert.deepStrictEqual(fromSession, ['serializationMode', 'encoding']);

    const fromWorkflow = getPropagatingFields(ConfigScope.Workflow, ConfigScope.Validation);
    assert.deepStrictEqual(fromWorkflow, ['serializationMode', 'encoding']);

    const fromBuilder = getPropagatingFields(ConfigScope.Builder, ConfigScope.Persistence);
    assert.deepStrictEqual(fromBuilder, ['serializationMode', 'encoding']);
  });

  await suite.test('getPropagatingFields returns empty for blocked boundaries', () => {
    const blocked = getPropagatingFields(ConfigScope.Validation, ConfigScope.Builder);
    assert.deepStrictEqual(blocked, []);

    const independent = getPropagatingFields(ConfigScope.Research, ConfigScope.Session);
    assert.deepStrictEqual(independent, []);
  });

  await suite.test('validateBoundaries detects violations on blocked boundaries', () => {
    const config: Record<string, unknown> = {
      serializationMode: 'json',
      encoding: 'utf8',
    };

    const violations = validateBoundaries(
      config,
      ConfigScope.Validation,
      ConfigScope.Builder
    );

    assert.strictEqual(violations.length, 2);
    assert.strictEqual(violations[0].fromScope, ConfigScope.Validation);
    assert.strictEqual(violations[0].toScope, ConfigScope.Builder);
    assert(violations[0].reason.includes('cannot propagate'));
  });

  await suite.test('validateBoundaries detects disallowed fields on allowed boundaries', () => {
    const config: Record<string, unknown> = {
      serializationMode: 'json',
      strictMode: true, // This is isolated to Validation, not propagating
    };

    const violations = validateBoundaries(
      config,
      ConfigScope.Workflow,
      ConfigScope.Validation
    );

    // strictMode should be detected as a violation
    const strictModeViolation = violations.find((v) => v.field === 'strictMode');
    assert(strictModeViolation, 'strictMode should be detected as violation');
    assert(strictModeViolation.reason.includes('not allowed to propagate'));
  });

  await suite.test('validateBoundaries allows only propagating fields', () => {
    const config: Record<string, unknown> = {
      serializationMode: 'json',
      encoding: 'utf8',
    };

    const violations = validateBoundaries(
      config,
      ConfigScope.Session,
      ConfigScope.Workflow
    );

    assert.strictEqual(violations.length, 0);
  });

  await suite.test('BOUNDARY_RULES has all scopes defined', () => {
    for (const scope of Object.values(ConfigScope)) {
      assert(scope in BOUNDARY_RULES, `Scope ${scope} missing from BOUNDARY_RULES`);
      const boundary = BOUNDARY_RULES[scope];
      assert(Array.isArray(boundary.propagatesTo));
      assert(Array.isArray(boundary.propagatingFields));
      assert(Array.isArray(boundary.isolatedFields));
    }
  });

  await suite.test('Each scope has correct parent hierarchy', () => {
    assert.strictEqual(BOUNDARY_RULES[ConfigScope.Session].parent, undefined);
    assert.strictEqual(BOUNDARY_RULES[ConfigScope.Workflow].parent, ConfigScope.Session);
    assert.strictEqual(BOUNDARY_RULES[ConfigScope.Validation].parent, ConfigScope.Workflow);
    assert.strictEqual(BOUNDARY_RULES[ConfigScope.Builder].parent, ConfigScope.Workflow);
    assert.strictEqual(BOUNDARY_RULES[ConfigScope.Persistence].parent, ConfigScope.Builder);
    assert.strictEqual(BOUNDARY_RULES[ConfigScope.Research].parent, undefined);
  });

  await suite.test('Isolated fields do not propagate', () => {
    const sessionIsolated: Record<string, unknown> = {
      sessionTimeout: 30000,
      sessionMaxSize: 1024,
    };

    const violations = validateBoundaries(
      sessionIsolated,
      ConfigScope.Session,
      ConfigScope.Workflow
    );

    assert(violations.length > 0);
    assert(violations.some((v) => v.field === 'sessionTimeout'));
    assert(violations.some((v) => v.field === 'sessionMaxSize'));
  });

  await suite.test('Research scope is independent', () => {
    assert.deepStrictEqual(BOUNDARY_RULES[ConfigScope.Research].propagatesTo, []);
    assert.strictEqual(canPropagate(ConfigScope.Research, ConfigScope.Session), false);
    assert.strictEqual(canPropagate(ConfigScope.Session, ConfigScope.Research), false);
  });

  await suite.test('Validation scope does not propagate down', () => {
    assert.deepStrictEqual(BOUNDARY_RULES[ConfigScope.Validation].propagatesTo, []);
    assert.strictEqual(canPropagate(ConfigScope.Validation, ConfigScope.Workflow), false);
    assert.strictEqual(canPropagate(ConfigScope.Validation, ConfigScope.Builder), false);
  });

  await suite.test('Persistence scope is terminal', () => {
    assert.deepStrictEqual(BOUNDARY_RULES[ConfigScope.Persistence].propagatesTo, []);
    assert.strictEqual(canPropagate(ConfigScope.Persistence, ConfigScope.Builder), false);
    assert.strictEqual(canPropagate(ConfigScope.Persistence, ConfigScope.Session), false);
  });
});
