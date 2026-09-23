import test from 'node:test';
import assert from 'node:assert';
import {
  ContractAdapterRegistry,
  JsonSchemaToOpenAPIAdapter,
  OpenAPIToJsonSchemaAdapter,
  BackwardCompatibilityTransformer,
  ContractFormat,
} from '../../adapter/contract-adapter.js';
import { JsonSchema } from '../../contract/schema.js';

test('Contract Adapter', async (suite) => {
  await suite.test('JsonSchemaToOpenAPIAdapter converts schema', () => {
    const adapter = new JsonSchemaToOpenAPIAdapter();
    const schema: JsonSchema = {
      title: 'User',
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
    };

    const result = adapter.adapt({
      format: ContractFormat.JsonSchema,
      version: '7',
      content: schema,
    });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.format, ContractFormat.OpenAPI);
      assert(result.value.content.openapi);
    }
  });

  await suite.test('OpenAPIToJsonSchemaAdapter converts schema', () => {
    const adapter = new OpenAPIToJsonSchemaAdapter();
    const openapi = {
      openapi: '3.1.0',
      info: { title: 'API', version: '1.0' },
      components: {
        schemas: {
          User: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      },
    };

    const result = adapter.adapt({
      format: ContractFormat.OpenAPI,
      version: '3.1.0',
      content: openapi,
    });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.format, ContractFormat.JsonSchema);
    }
  });

  await suite.test('ContractAdapterRegistry registers adapters', () => {
    const registry = new ContractAdapterRegistry();
    const adapter = new JsonSchemaToOpenAPIAdapter();

    registry.register(adapter);

    assert.strictEqual(registry.count(), 1);
    assert.strictEqual(
      registry.getAdapter(ContractFormat.JsonSchema, ContractFormat.OpenAPI),
      adapter
    );
  });

  await suite.test('ContractAdapterRegistry checks conversion capability', () => {
    const registry = new ContractAdapterRegistry();
    const adapter = new JsonSchemaToOpenAPIAdapter();

    registry.register(adapter);

    assert.strictEqual(registry.canConvert(ContractFormat.JsonSchema, ContractFormat.OpenAPI), true);
    assert.strictEqual(registry.canConvert(ContractFormat.OpenAPI, ContractFormat.JsonSchema), false);
  });

  await suite.test('ContractAdapterRegistry converts between formats', () => {
    const registry = new ContractAdapterRegistry();
    registry.register(new JsonSchemaToOpenAPIAdapter());

    const schema: JsonSchema = { type: 'object', title: 'Test' };
    const result = registry.convert(
      { format: ContractFormat.JsonSchema, version: '7', content: schema },
      ContractFormat.OpenAPI
    );

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.format, ContractFormat.OpenAPI);
    }
  });

  await suite.test('ContractAdapterRegistry handles identity conversion', () => {
    const registry = new ContractAdapterRegistry();

    const schema: JsonSchema = { type: 'object' };
    const result = registry.convert(
      { format: ContractFormat.JsonSchema, version: '7', content: schema },
      ContractFormat.JsonSchema
    );

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.format, ContractFormat.JsonSchema);
    }
  });

  await suite.test('ContractAdapterRegistry errors on unsupported conversion', () => {
    const registry = new ContractAdapterRegistry();

    const schema: JsonSchema = { type: 'object' };
    const result = registry.convert(
      { format: ContractFormat.JsonSchema, version: '7', content: schema },
      ContractFormat.Protobuf
    );

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert(result.failures[0].message.includes('No adapter found'));
    }
  });

  await suite.test('BackwardCompatibilityTransformer converts to legacy', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    };

    const result = BackwardCompatibilityTransformer.toLegacy(
      { format: ContractFormat.JsonSchema, version: '7', content: schema },
      '1.0'
    );

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert(result.value.properties);
      assert(result.value.required);
    }
  });

  await suite.test('BackwardCompatibilityTransformer converts from legacy', () => {
    const legacy = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    };

    const result = BackwardCompatibilityTransformer.fromLegacy(legacy);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.format, ContractFormat.JsonSchema);
      assert(result.value.content.properties);
    }
  });

  await suite.test('ContractAdapterRegistry clears adapters', () => {
    const registry = new ContractAdapterRegistry();
    registry.register(new JsonSchemaToOpenAPIAdapter());
    registry.register(new OpenAPIToJsonSchemaAdapter());

    assert.strictEqual(registry.count(), 2);
    registry.clear();
    assert.strictEqual(registry.count(), 0);
  });
});
