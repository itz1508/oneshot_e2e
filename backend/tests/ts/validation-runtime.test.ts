import test from 'node:test';
import assert from 'node:assert';
import {
  ValidationRuleRegistry,
  ValidationRuntime,
  RuleBuilder,
  ValidationRule,
} from '../../validation/runtime.js';
import { ConfigScope } from '../../config/boundaries.js';
import { FailureType, FailureSeverity } from '../../validation/failure-taxonomy.js';

test('Validation Runtime', async (suite) => {
  await suite.test('ValidationRuleRegistry can register rules', () => {
    const registry = new ValidationRuleRegistry();
    const rule = new RuleBuilder()
      .withId('rule-1')
      .withName('Test Rule')
      .withScope(ConfigScope.Session)
      .withPriority(50)
      .withPredicate((value) => typeof value === 'string')
      .withFailureHandler(() => ({
        type: FailureType.TypeMismatch,
        severity: FailureSeverity.Error,
        message: 'Expected string',
        timestamp: Date.now(),
      }))
      .build();

    registry.register(rule);

    assert.strictEqual(registry.count(), 1);
    assert.strictEqual(registry.getRule('rule-1')?.id, 'rule-1');
  });

  await suite.test('ValidationRuleRegistry prevents duplicate registration', () => {
    const registry = new ValidationRuleRegistry();
    const rule = new RuleBuilder()
      .withId('rule-1')
      .withName('Test Rule')
      .withScope(ConfigScope.Session)
      .withPriority(50)
      .withPredicate((value) => true)
      .withFailureHandler(() => ({
        type: FailureType.ExecutionFailed,
        severity: FailureSeverity.Error,
        message: 'Failed',
        timestamp: Date.now(),
      }))
      .build();

    registry.register(rule);

    assert.throws(() => {
      registry.register(rule);
    }, /already registered/);
  });

  await suite.test('ValidationRuleRegistry orders rules by priority', () => {
    const registry = new ValidationRuleRegistry();

    for (let i = 0; i < 3; i++) {
      const rule = new RuleBuilder()
        .withId(`rule-${i}`)
        .withName(`Rule ${i}`)
        .withScope(ConfigScope.Workflow)
        .withPriority(i * 30)
        .withPredicate(() => true)
        .withFailureHandler(() => ({
          type: FailureType.ExecutionFailed,
          severity: FailureSeverity.Error,
          message: 'Failed',
          timestamp: Date.now(),
        }))
        .build();

      registry.register(rule);
    }

    const rules = registry.getRulesForScope(ConfigScope.Workflow);
    assert.strictEqual(rules[0].id, 'rule-2'); // Priority 60
    assert.strictEqual(rules[1].id, 'rule-1'); // Priority 30
    assert.strictEqual(rules[2].id, 'rule-0'); // Priority 0
  });

  await suite.test('ValidationRuleRegistry unregisters rules', () => {
    const registry = new ValidationRuleRegistry();
    const rule = new RuleBuilder()
      .withId('rule-1')
      .withName('Test Rule')
      .withScope(ConfigScope.Session)
      .withPriority(50)
      .withPredicate(() => true)
      .withFailureHandler(() => ({
        type: FailureType.ExecutionFailed,
        severity: FailureSeverity.Error,
        message: 'Failed',
        timestamp: Date.now(),
      }))
      .build();

    registry.register(rule);
    assert.strictEqual(registry.count(), 1);

    const removed = registry.unregister('rule-1');
    assert.strictEqual(removed, true);
    assert.strictEqual(registry.count(), 0);
  });

  await suite.test('ValidationRuntime applies rules and validates', async () => {
    const registry = new ValidationRuleRegistry();
    const rule = new RuleBuilder()
      .withId('type-check')
      .withName('Type Check')
      .withScope(ConfigScope.Session)
      .withPriority(50)
      .withPredicate((value) => typeof value === 'string')
      .withFailureHandler(() => ({
        type: FailureType.TypeMismatch,
        severity: FailureSeverity.Error,
        message: 'Must be string',
        timestamp: Date.now(),
      }))
      .build();

    registry.register(rule);
    const runtime = new ValidationRuntime(registry);

    const result = await runtime.applyRules('hello', ConfigScope.Session);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value, 'hello');
    }
  });

  await suite.test('ValidationRuntime collects failures', async () => {
    const registry = new ValidationRuleRegistry();
    const rule = new RuleBuilder()
      .withId('type-check')
      .withName('Type Check')
      .withScope(ConfigScope.Session)
      .withPriority(50)
      .withPredicate((value) => typeof value === 'string')
      .withFailureHandler(() => ({
        type: FailureType.TypeMismatch,
        severity: FailureSeverity.Error,
        message: 'Must be string',
        timestamp: Date.now(),
      }))
      .build();

    registry.register(rule);
    const runtime = new ValidationRuntime(registry);

    const result = await runtime.applyRules(123, ConfigScope.Session);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.failures.length, 1);
      assert.strictEqual(result.failures[0].type, FailureType.TypeMismatch);
    }
  });

  await suite.test('ValidationRuntime handles rule errors', async () => {
    const registry = new ValidationRuleRegistry();
    const rule = new RuleBuilder()
      .withId('bad-rule')
      .withName('Bad Rule')
      .withScope(ConfigScope.Session)
      .withPriority(50)
      .withPredicate(() => {
        throw new Error('Rule crashed');
      })
      .withFailureHandler(() => ({
        type: FailureType.ExecutionFailed,
        severity: FailureSeverity.Error,
        message: 'Failed',
        timestamp: Date.now(),
      }))
      .build();

    registry.register(rule);
    const runtime = new ValidationRuntime(registry);

    const result = await runtime.applyRules('test', ConfigScope.Session);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert(result.failures.length > 0);
      assert.strictEqual(result.failures[0].type, FailureType.ExecutionFailed);
    }
  });

  await suite.test('ValidationRuntime tracks execution history', async () => {
    const registry = new ValidationRuleRegistry();
    const rule = new RuleBuilder()
      .withId('test-rule')
      .withName('Test Rule')
      .withScope(ConfigScope.Session)
      .withPriority(50)
      .withPredicate((value) => value === 'pass')
      .withFailureHandler(() => ({
        type: FailureType.ExecutionFailed,
        severity: FailureSeverity.Error,
        message: 'Failed',
        timestamp: Date.now(),
      }))
      .build();

    registry.register(rule);
    const runtime = new ValidationRuntime(registry);

    await runtime.applyRules('pass', ConfigScope.Session);
    await runtime.applyRules('fail', ConfigScope.Session);

    const history = runtime.getHistory();
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].passed, true);
    assert.strictEqual(history[1].passed, false);
  });

  await suite.test('ValidationRuntime provides statistics', async () => {
    const registry = new ValidationRuleRegistry();
    const rule = new RuleBuilder()
      .withId('test-rule')
      .withName('Test Rule')
      .withScope(ConfigScope.Session)
      .withPriority(50)
      .withPredicate((value) => value === 'pass')
      .withFailureHandler(() => ({
        type: FailureType.ExecutionFailed,
        severity: FailureSeverity.Error,
        message: 'Failed',
        timestamp: Date.now(),
      }))
      .build();

    registry.register(rule);
    const runtime = new ValidationRuntime(registry);

    await runtime.applyRules('pass', ConfigScope.Session);
    await runtime.applyRules('pass', ConfigScope.Session);
    await runtime.applyRules('fail', ConfigScope.Session);

    const stats = runtime.getStats();

    assert.strictEqual(stats.totalExecutions, 3);
    assert.strictEqual(stats.totalPassed, 2);
    assert.strictEqual(stats.totalFailed, 1);
    assert(stats.failureRate > 0.3 && stats.failureRate < 0.4);
    assert(stats.averageDuration > 0);
  });

  await suite.test('RuleBuilder validates required fields', () => {
    const builder = new RuleBuilder();

    assert.throws(() => {
      builder.build();
    }, /must have an id/i);

    const withId = builder.withId('rule-1');

    assert.throws(() => {
      withId.build();
    }, /must have a name/i);
  });

  await suite.test('RuleBuilder constrains priority bounds', () => {
    const rule = new RuleBuilder()
      .withId('rule-1')
      .withName('Test')
      .withScope(ConfigScope.Session)
      .withPriority(150) // Should be clamped to 100
      .withPredicate(() => true)
      .withFailureHandler(() => ({
        type: FailureType.ExecutionFailed,
        severity: FailureSeverity.Error,
        message: 'Failed',
        timestamp: Date.now(),
      }))
      .build();

    assert.strictEqual(rule.priority, 100);
  });
});
