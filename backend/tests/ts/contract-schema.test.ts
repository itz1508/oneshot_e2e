import test from 'node:test';
import assert from 'node:assert';
import {
  SchemaValidator,
  ContractRegistry,
  JsonSchema,
  ContractSchema,
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
});
