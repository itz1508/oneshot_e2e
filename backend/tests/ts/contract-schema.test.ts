import test from 'node:test';
import assert from 'node:assert';
import {
  SchemaValidator,
  ContractRegistry,
  JsonSchema,
  ContractSchema,
  ValidateFixturesSchema,
  ValidateFixturesInput,
  fixture,
} from '../../contract/schema.js';
import { FailureType } from '../../validation/failure-taxonomy.js';

test('Contract Schema', async (suite) => {
  await suite.test('SchemaValidator validates type', () => {
    const schema: JsonSchema = { type: 'string' };

    const validViolations = SchemaValidator.validate('hello', schema);
    assert.strictEqual(validViolations.length, 0);

    const invalidViolations = SchemaValidator.validate(123, schema);
    assert(invalidViolations.length > 0);
    assert(invalidViolations[0].message.includes('type'));
  });

  await suite.test('SchemaValidator validates enum', () => {
    const schema: JsonSchema = { enum: ['red', 'green', 'blue'] };

    const validViolations = SchemaValidator.validate('red', schema);
    assert.strictEqual(validViolations.length, 0);

    const invalidViolations = SchemaValidator.validate('yellow', schema);
    assert(invalidViolations.length > 0);
    assert(invalidViolations[0].message.includes('one of'));
  });

  await suite.test('SchemaValidator validates const', () => {
    const schema: JsonSchema = { const: 42 };

    const validViolations = SchemaValidator.validate(42, schema);
    assert.strictEqual(validViolations.length, 0);

    const invalidViolations = SchemaValidator.validate(43, schema);
    assert(invalidViolations.length > 0);
    assert(invalidViolations[0].message.includes('exactly'));
  });

  await suite.test('SchemaValidator validates string length', () => {
    const schema: JsonSchema = { type: 'string', minLength: 3, maxLength: 5 };

    const validViolations = SchemaValidator.validate('test', schema);
    assert.strictEqual(validViolations.length, 0);

    const tooShort = SchemaValidator.validate('ab', schema);
    assert(tooShort.length > 0);
    assert(tooShort[0].message.includes('less than minimum'));

    const tooLong = SchemaValidator.validate('toolong', schema);
    assert(tooLong.length > 0);
    assert(tooLong[0].message.includes('exceeds maximum'));
  });

  await suite.test('SchemaValidator validates string pattern', () => {
    const schema: JsonSchema = { type: 'string', pattern: '^[a-z]+$' };

    const validViolations = SchemaValidator.validate('hello', schema);
    assert.strictEqual(validViolations.length, 0);

    const invalidViolations = SchemaValidator.validate('Hello123', schema);
    assert(invalidViolations.length > 0);
    assert(invalidViolations[0].message.includes('pattern'));
  });

  await suite.test('SchemaValidator validates number bounds', () => {
    const schema: JsonSchema = { type: 'number', minimum: 0, maximum: 100 };

    const validViolations = SchemaValidator.validate(50, schema);
    assert.strictEqual(validViolations.length, 0);

    const tooSmall = SchemaValidator.validate(-1, schema);
    assert(tooSmall.length > 0);
    assert(tooSmall[0].message.includes('less than minimum'));

    const tooLarge = SchemaValidator.validate(101, schema);
    assert(tooLarge.length > 0);
    assert(tooLarge[0].message.includes('exceeds maximum'));
  });

  await suite.test('SchemaValidator validates required properties', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name'],
    };

    const validViolations = SchemaValidator.validate({ name: 'Alice', age: 30 }, schema);
    assert.strictEqual(validViolations.length, 0);

    const missingRequired = SchemaValidator.validate({ age: 30 }, schema);
    assert(missingRequired.length > 0);
    assert(missingRequired[0].message.includes('Required') || missingRequired[0].message.includes('missing'));
  });

  await suite.test('SchemaValidator validates object properties recursively', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
          },
          required: ['city'],
        },
      },
    };

    const validViolations = SchemaValidator.validate(
      { name: 'Alice', address: { street: 'Main St', city: 'NYC' } },
      schema
    );
    assert.strictEqual(validViolations.length, 0);

    const invalidViolations = SchemaValidator.validate(
      { name: 'Alice', address: { street: 'Main St' } },
      schema
    );
    assert(invalidViolations.length > 0);
    assert(invalidViolations[0].path.includes('address'));
  });

  await suite.test('SchemaValidator validates arrays', () => {
    const schema: JsonSchema = {
      type: 'array',
      items: { type: 'string' },
    };

    const validViolations = SchemaValidator.validate(['a', 'b', 'c'], schema);
    assert.strictEqual(validViolations.length, 0);

    const invalidViolations = SchemaValidator.validate(['a', 'b', 123], schema);
    assert(invalidViolations.length > 0);
    assert(invalidViolations[0].message.includes('type'));
  });

  await suite.test('SchemaValidator prevents additional properties', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      additionalProperties: false,
    };

    const validViolations = SchemaValidator.validate({ name: 'Alice' }, schema);
    assert.strictEqual(validViolations.length, 0);

    const extraProp = SchemaValidator.validate({ name: 'Alice', age: 30 }, schema);
    assert(extraProp.length > 0);
    assert(extraProp[0].message.includes('Unexpected'));
  });

  await suite.test('SchemaValidator handles invalid regex patterns', () => {
    const schema: JsonSchema = {
      type: 'string',
      pattern: '[invalid(regex',
    };

    const violations = SchemaValidator.validate('test', schema);
    assert(violations.length > 0);
    assert(violations[0].message.includes('Invalid regex'));
  });

  await suite.test('ContractRegistry can register contracts', () => {
    const registry = new ContractRegistry();
    const contract: ContractSchema = {
      id: 'contract-1',
      name: 'Test Contract',
      version: '1.0.0',
      input: { type: 'object' },
      output: { type: 'object' },
    };

    registry.register(contract);

    assert.strictEqual(registry.count(), 1);
    assert.strictEqual(registry.getContract('contract-1')?.id, 'contract-1');
  });

  await suite.test('ContractRegistry prevents duplicate registration', () => {
    const registry = new ContractRegistry();
    const contract: ContractSchema = {
      id: 'contract-1',
      name: 'Test Contract',
      version: '1.0.0',
      input: { type: 'object' },
      output: { type: 'object' },
    };

    registry.register(contract);

    assert.throws(() => {
      registry.register(contract);
    }, /already registered/);
  });

  await suite.test('ContractRegistry validates input against contract', () => {
    const registry = new ContractRegistry();
    const contract: ContractSchema = {
      id: 'contract-1',
      name: 'Test Contract',
      version: '1.0.0',
      input: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
      output: { type: 'object' },
    };

    registry.register(contract);

    const validResult = registry.validateInput('contract-1', { name: 'Alice' });
    assert.strictEqual(validResult.ok, true);

    const invalidResult = registry.validateInput('contract-1', { age: 30 });
    assert.strictEqual(invalidResult.ok, false);
    if (!invalidResult.ok) {
      assert.strictEqual(invalidResult.failures[0].type, 'contract_mismatch');
    }
  });

  await suite.test('ContractRegistry validates output against contract', () => {
    const registry = new ContractRegistry();
    const contract: ContractSchema = {
      id: 'contract-1',
      name: 'Test Contract',
      version: '1.0.0',
      input: { type: 'object' },
      output: {
        type: 'object',
        properties: {
          result: { type: 'string' },
        },
        required: ['result'],
      },
    };

    registry.register(contract);

    const validResult = registry.validateOutput('contract-1', { result: 'success' });
    assert.strictEqual(validResult.ok, true);

    const invalidResult = registry.validateOutput('contract-1', { error: 'failed' });
    assert.strictEqual(invalidResult.ok, false);
    if (!invalidResult.ok) {
      assert.strictEqual(invalidResult.failures[0].type, 'contract_mismatch');
    }
  });

  await suite.test('ContractRegistry returns error for unknown contract', () => {
    const registry = new ContractRegistry();

    const result = registry.validateInput('unknown', { test: 'data' });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.failures[0].type, FailureType.ContractMismatch);
      assert(result.failures[0].message.includes('not found'));
    }
  });

  await suite.test('ContractRegistry links contracts to manifests', () => {
    const registry = new ContractRegistry();
    const contract: ContractSchema = {
      id: 'contract-1',
      name: 'Test Contract',
      version: '1.0.0',
      input: { type: 'object' },
      output: { type: 'object' },
    };

    registry.register(contract);
    registry.linkToManifest('contract-1', {
      contractId: 'contract-1',
      artifactPath: 'backend/index.ts',
      artifactHash: 'abc123',
      lastVerified: Date.now(),
      verified: true,
    });

    const links = registry.getManifestLinks('contract-1');
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].artifactPath, 'backend/index.ts');
  });

  await suite.test('ContractRegistry clears all contracts', () => {
    const registry = new ContractRegistry();
    const contract: ContractSchema = {
      id: 'contract-1',
      name: 'Test Contract',
      version: '1.0.0',
      input: { type: 'object' },
      output: { type: 'object' },
    };

    registry.register(contract);
    assert.strictEqual(registry.count(), 1);

    registry.clear();
    assert.strictEqual(registry.count(), 0);
  });

  await suite.test('ValidateFixturesSchema enforces mandatory sessionId', () => {
    // 1. Valid input with authoritative sessionId
    const validInput: ValidateFixturesInput = {
      sessionId: 'session-e2e-101',
      fixtures: [
        {
          id: 'fix-1',
          path: 'app/fixtures/sample.json',
          expectedHash: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
      ],
      strict: true,
    };
    const validViolations = SchemaValidator.validate(validInput, ValidateFixturesSchema);
    assert.strictEqual(validViolations.length, 0);

    // 2. Missing sessionId: must produce contract violation
    const missingSession = {
      fixtures: [
        {
          id: 'fix-1',
          path: 'app/fixtures/sample.json',
          expectedHash: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
      ],
    };
    const missingViolations = SchemaValidator.validate(missingSession, ValidateFixturesSchema);
    assert.ok(missingViolations.length > 0);
    assert.ok(missingViolations.some((v) => v.message.includes('sessionId')));

    // 3. Invalid sessionId type: must produce contract violation
    const invalidSessionType = {
      sessionId: 12345,
      fixtures: [],
    };
    const typeViolations = SchemaValidator.validate(invalidSessionType, ValidateFixturesSchema);
    assert.ok(typeViolations.length > 0);

    // 4. Validate input with fixture_id and session_id
    const persistenceInput = {
      sessionId: 'session-e2e-202',
      session_id: 'session-e2e-202',
      fixtures: [
        {
          id: 'fix-2',
          fixture_id: 'fix-2',
          path: 'app/fixtures/sample.json',
          expectedHash: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          actualHash: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          status: 'validated',
        },
      ],
    };
    const persistenceViolations = SchemaValidator.validate(persistenceInput, ValidateFixturesSchema);
    assert.strictEqual(persistenceViolations.length, 0);
  });

  await suite.test('Fixture Runtime Rule and Persistence Artifact Rule for fixture(...) and fixture_id', () => {
    // 1. Create mutable runtime fixture(...) in progress
    const activeFixture = fixture(
      'fix-test-01',
      'session-audit-999',
      'app/fixtures/sample.json',
      'sha256:expected_hash_value'
    );
    assert.strictEqual(activeFixture.fixture_id, 'fix-test-01');
    assert.strictEqual(activeFixture.session_id, 'session-audit-999');
    assert.strictEqual(activeFixture.isMutable, true);
    assert.strictEqual(activeFixture.isInProgress, true);
    assert.strictEqual(activeFixture.status, 'draft');

    // 2. Can Evolve
    activeFixture.evolve({ status: 'in_progress', actualHash: 'sha256:different_hash' });
    assert.strictEqual(activeFixture.status, 'in_progress');
    assert.strictEqual(activeFixture.actualHash, 'sha256:different_hash');

    // 3. Can Be Refined
    activeFixture.refine((curr: any) => ({
      expectedHash: 'sha256:matching_hash',
    }));
    assert.strictEqual(activeFixture.expectedHash, 'sha256:matching_hash');

    // 4. Can Emit Events
    let eventFired = false;
    activeFixture.onEvent((evt: any) => {
      if (evt.type === 'fixture:refined') eventFired = true;
    });
    activeFixture.emit('fixture:refined', { detail: 'refined for test' });
    assert.strictEqual(eventFired, true);

    // 5. Can Fail Validation
    activeFixture.actualHash = 'sha256:mismatch_hash';
    const failedResult = activeFixture.validate();
    assert.strictEqual(failedResult.ok, false);
    assert.strictEqual(activeFixture.status, 'failed');

    // 6. Validation Success & Freeze to Persistence Artifact (Stored Record)
    activeFixture.actualHash = 'sha256:matching_hash';
    const validatedResult = activeFixture.validate();
    assert.strictEqual(validatedResult.ok, true);
    assert.strictEqual(activeFixture.status, 'validated');

    const stored = activeFixture.toStoredRecord();
    assert.strictEqual(stored.fixture_id, 'fix-test-01');
    assert.strictEqual(stored.session_id, 'session-audit-999');
    assert.strictEqual(stored.status, 'validated');
    assert.strictEqual(activeFixture.isInProgress, false);
    assert.ok(stored.auditTrail.length > 0);
  });
});
