import test from 'node:test';
import assert from 'node:assert';
import {
  GuardRegistry,
  GuardEvaluator,
  GuardBuilder,
  GuardDecision,
  GuardContext,
} from '../../workflow/node/guard.js';
import { ConfigScope } from '../../config/boundaries.js';
import { FailureType, FailureSeverity } from '../../validation/failure-taxonomy.js';

test('Execution Guards', async (suite) => {
  await suite.test('GuardRegistry can register guards', () => {
    const registry = new GuardRegistry();
    const guard = new GuardBuilder()
      .withId('guard-1')
      .withName('Test Guard')
      .withDescription('Test guard')
      .withEvaluator(async () => GuardDecision.Allow)
      .build();

    registry.register(guard);

    assert.strictEqual(registry.count(), 1);
    assert.strictEqual(registry.getGuard('guard-1')?.id, 'guard-1');
  });

  await suite.test('GuardRegistry prevents duplicate registration', () => {
    const registry = new GuardRegistry();
    const guard = new GuardBuilder()
      .withId('guard-1')
      .withName('Test Guard')
      .withDescription('Test guard')
      .withEvaluator(async () => GuardDecision.Allow)
      .build();

    registry.register(guard);

    assert.throws(() => {
      registry.register(guard);
    }, /already registered/);
  });

  await suite.test('GuardRegistry assigns guards to nodes', () => {
    const registry = new GuardRegistry();
    const guard = new GuardBuilder()
      .withId('guard-1')
      .withName('Test Guard')
      .withDescription('Test guard')
      .withEvaluator(async () => GuardDecision.Allow)
      .build();

    registry.register(guard);
    registry.assignToNode('node-1', ['guard-1']);

    const nodeGuards = registry.getGuardsForNode('node-1');
    assert.strictEqual(nodeGuards.length, 1);
    assert.strictEqual(nodeGuards[0].id, 'guard-1');
  });

  await suite.test('GuardRegistry throws on unregistered guard assignment', () => {
    const registry = new GuardRegistry();

    assert.throws(() => {
      registry.assignToNode('node-1', ['unknown-guard']);
    }, /not registered/);
  });

  await suite.test('GuardEvaluator allows all guards', async () => {
    const registry = new GuardRegistry();
    const guard = new GuardBuilder()
      .withId('guard-1')
      .withName('Allow Guard')
      .withDescription('Allows execution')
      .withEvaluator(async () => GuardDecision.Allow)
      .build();

    registry.register(guard);
    registry.assignToNode('node-1', ['guard-1']);

    const evaluator = new GuardEvaluator(registry);
    const context: GuardContext = {
      nodeId: 'node-1',
      nodeType: 'workflow',
      scope: ConfigScope.Session,
      timestamp: Date.now(),
    };

    const result = await evaluator.evaluateNodeGuards(context);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value, GuardDecision.Allow);
    }
  });

  await suite.test('GuardEvaluator denies on guard rejection', async () => {
    const registry = new GuardRegistry();
    const guard = new GuardBuilder()
      .withId('guard-1')
      .withName('Deny Guard')
      .withDescription('Denies execution')
      .withEvaluator(async () => GuardDecision.Deny)
      .withDenialHandler(() => ({
        type: FailureType.NodeFailed,
        severity: FailureSeverity.Warning,
        message: 'Guard denied execution',
        timestamp: Date.now(),
      }))
      .build();

    registry.register(guard);
    registry.assignToNode('node-1', ['guard-1']);

    const evaluator = new GuardEvaluator(registry);
    const context: GuardContext = {
      nodeId: 'node-1',
      nodeType: 'workflow',
      scope: ConfigScope.Session,
      timestamp: Date.now(),
    };

    const result = await evaluator.evaluateNodeGuards(context);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert(result.failures.length > 0);
      assert.strictEqual(result.failures[0].type, FailureType.NodeFailed);
    }
  });

  await suite.test('GuardEvaluator returns Retry when any guard retries', async () => {
    const registry = new GuardRegistry();
    const guard1 = new GuardBuilder()
      .withId('guard-1')
      .withName('Allow Guard')
      .withDescription('Allows execution')
      .withEvaluator(async () => GuardDecision.Allow)
      .build();

    const guard2 = new GuardBuilder()
      .withId('guard-2')
      .withName('Retry Guard')
      .withDescription('Requests retry')
      .withEvaluator(async () => GuardDecision.Retry)
      .build();

    registry.register(guard1);
    registry.register(guard2);
    registry.assignToNode('node-1', ['guard-1', 'guard-2']);

    const evaluator = new GuardEvaluator(registry);
    const context: GuardContext = {
      nodeId: 'node-1',
      nodeType: 'workflow',
      scope: ConfigScope.Session,
      timestamp: Date.now(),
    };

    const result = await evaluator.evaluateNodeGuards(context);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value, GuardDecision.Retry);
    }
  });

  await suite.test('GuardEvaluator handles boolean return values', async () => {
    const registry = new GuardRegistry();
    const guard = new GuardBuilder()
      .withId('guard-1')
      .withName('Boolean Guard')
      .withDescription('Returns boolean')
      .withEvaluator(async () => true) // Boolean instead of GuardDecision
      .build();

    registry.register(guard);
    registry.assignToNode('node-1', ['guard-1']);

    const evaluator = new GuardEvaluator(registry);
    const context: GuardContext = {
      nodeId: 'node-1',
      nodeType: 'workflow',
      scope: ConfigScope.Session,
      timestamp: Date.now(),
    };

    const result = await evaluator.evaluateNodeGuards(context);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value, GuardDecision.Allow);
    }
  });

  await suite.test('GuardEvaluator handles guard errors', async () => {
    const registry = new GuardRegistry();
    const guard = new GuardBuilder()
      .withId('guard-1')
      .withName('Error Guard')
      .withDescription('Throws error')
      .withEvaluator(async () => {
        throw new Error('Guard crashed');
      })
      .build();

    registry.register(guard);
    registry.assignToNode('node-1', ['guard-1']);

    const evaluator = new GuardEvaluator(registry);
    const context: GuardContext = {
      nodeId: 'node-1',
      nodeType: 'workflow',
      scope: ConfigScope.Session,
      timestamp: Date.now(),
    };

    const result = await evaluator.evaluateNodeGuards(context);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert(result.failures.length > 0);
      assert.strictEqual(result.failures[0].type, FailureType.ExecutionFailed);
    }
  });

  await suite.test('GuardEvaluator tracks evaluation history', async () => {
    const registry = new GuardRegistry();
    const guard = new GuardBuilder()
      .withId('guard-1')
      .withName('Test Guard')
      .withDescription('Test guard')
      .withEvaluator(async () => GuardDecision.Allow)
      .build();

    registry.register(guard);
    registry.assignToNode('node-1', ['guard-1']);

    const evaluator = new GuardEvaluator(registry);
    const context: GuardContext = {
      nodeId: 'node-1',
      nodeType: 'workflow',
      scope: ConfigScope.Session,
      timestamp: Date.now(),
    };

    await evaluator.evaluateNodeGuards(context);

    const history = evaluator.getHistory();
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].guardId, 'guard-1');
    assert.strictEqual(history[0].decision, GuardDecision.Allow);
    assert(history[0].duration >= 0);
  });

  await suite.test('GuardEvaluator evaluates individual guards', async () => {
    const registry = new GuardRegistry();
    const guard = new GuardBuilder()
      .withId('guard-1')
      .withName('Test Guard')
      .withDescription('Test guard')
      .withEvaluator(async () => true)
      .build();

    registry.register(guard);

    const evaluator = new GuardEvaluator(registry);
    const context: GuardContext = {
      nodeId: 'test-node',
      nodeType: 'workflow',
      scope: ConfigScope.Session,
      timestamp: Date.now(),
    };

    const result = await evaluator.evaluateGuard('guard-1', context);

    assert.strictEqual(result.guardId, 'guard-1');
    assert.strictEqual(result.decision, GuardDecision.Allow);
    assert(result.duration >= 0);
  });

  await suite.test('GuardBuilder validates required fields', () => {
    const builder = new GuardBuilder();

    assert.throws(() => {
      builder.build();
    }, /must have an id/i);

    const withId = builder.withId('guard-1');

    assert.throws(() => {
      withId.build();
    }, /must have a name/i);
  });

  await suite.test('GuardRegistry unregisters guards', () => {
    const registry = new GuardRegistry();
    const guard = new GuardBuilder()
      .withId('guard-1')
      .withName('Test Guard')
      .withDescription('Test guard')
      .withEvaluator(async () => GuardDecision.Allow)
      .build();

    registry.register(guard);
    assert.strictEqual(registry.count(), 1);

    const removed = registry.unregister('guard-1');
    assert.strictEqual(removed, true);
    assert.strictEqual(registry.count(), 0);
  });
});
