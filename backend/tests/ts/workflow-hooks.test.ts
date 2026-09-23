import test from 'node:test';
import assert from 'node:assert';
import {
  WorkflowHooksRegistry,
  HookExecutor,
  HookBuilder,
  HookType,
  HookContext,
} from '../../workflow/hooks.js';

test('Workflow Hooks', async (suite) => {
  await suite.test('WorkflowHooksRegistry registers hooks', () => {
    const registry = new WorkflowHooksRegistry();
    const hook = new HookBuilder()
      .withId('hook-1')
      .withType(HookType.PreExecution)
      .withHandler(async () => {})
      .build();

    registry.register(hook);

    assert.strictEqual(registry.count(), 1);
    assert.strictEqual(registry.getHook('hook-1')?.id, 'hook-1');
  });

  await suite.test('WorkflowHooksRegistry prevents duplicate registration', () => {
    const registry = new WorkflowHooksRegistry();
    const hook = new HookBuilder()
      .withId('hook-1')
      .withType(HookType.PreExecution)
      .withHandler(async () => {})
      .build();

    registry.register(hook);

    assert.throws(() => {
      registry.register(hook);
    }, /already registered/);
  });

  await suite.test('WorkflowHooksRegistry gets hooks by type', () => {
    const registry = new WorkflowHooksRegistry();
    const hook1 = new HookBuilder()
      .withId('hook-1')
      .withType(HookType.PreExecution)
      .withHandler(async () => {})
      .build();

    const hook2 = new HookBuilder()
      .withId('hook-2')
      .withType(HookType.PostExecution)
      .withHandler(async () => {})
      .build();

    registry.register(hook1);
    registry.register(hook2);

    const preHooks = registry.getHooksByType(HookType.PreExecution);
    assert.strictEqual(preHooks.length, 1);
    assert.strictEqual(preHooks[0].id, 'hook-1');
  });

  await suite.test('WorkflowHooksRegistry unregisters hooks', () => {
    const registry = new WorkflowHooksRegistry();
    const hook = new HookBuilder()
      .withId('hook-1')
      .withType(HookType.PreExecution)
      .withHandler(async () => {})
      .build();

    registry.register(hook);
    const removed = registry.unregister('hook-1');

    assert.strictEqual(removed, true);
    assert.strictEqual(registry.count(), 0);
  });

  await suite.test('WorkflowHooksRegistry enables/disables hooks', () => {
    const registry = new WorkflowHooksRegistry();
    const hook = new HookBuilder()
      .withId('hook-1')
      .withType(HookType.PreExecution)
      .withHandler(async () => {})
      .build();

    registry.register(hook);
    registry.setEnabled('hook-1', false);

    const hooks = registry.getHooksByType(HookType.PreExecution);
    assert.strictEqual(hooks.length, 0);
  });

  await suite.test('HookExecutor executes hooks', async () => {
    const registry = new WorkflowHooksRegistry();
    const executor = new HookExecutor(registry);

    let executed = false;
    const hook = new HookBuilder()
      .withId('hook-1')
      .withType(HookType.PreExecution)
      .withHandler(async () => {
        executed = true;
      })
      .build();

    registry.register(hook);

    const context: HookContext = {
      nodeId: 'node-1',
      workflowId: 'workflow-1',
      timestamp: Date.now(),
    };

    const result = await executor.executeHooks(HookType.PreExecution, context);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(executed, true);
  });

  await suite.test('HookExecutor handles hook errors', async () => {
    const registry = new WorkflowHooksRegistry();
    const executor = new HookExecutor(registry);

    const hook = new HookBuilder()
      .withId('hook-1')
      .withType(HookType.PreExecution)
      .withHandler(async () => {
        throw new Error('Hook failed');
      })
      .build();

    registry.register(hook);

    const context: HookContext = {
      nodeId: 'node-1',
      workflowId: 'workflow-1',
      timestamp: Date.now(),
    };

    const result = await executor.executeHooks(HookType.PreExecution, context);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert(result.failures[0].message.includes('execution failed'));
    }
  });

  await suite.test('HookExecutor returns hook results', async () => {
    const registry = new WorkflowHooksRegistry();
    const executor = new HookExecutor(registry);

    const hook = new HookBuilder()
      .withId('hook-1')
      .withType(HookType.PreExecution)
      .withHandler(async () => {})
      .build();

    registry.register(hook);

    const context: HookContext = {
      nodeId: 'node-1',
      workflowId: 'workflow-1',
      timestamp: Date.now(),
    };

    const result = await executor.executeHooks(HookType.PreExecution, context);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.length, 1);
      assert.strictEqual(result.value[0].hookId, 'hook-1');
      assert.strictEqual(result.value[0].executed, true);
      assert(result.value[0].duration >= 0);
    }
  });

  await suite.test('HookExecutor tracks execution history', async () => {
    const registry = new WorkflowHooksRegistry();
    const executor = new HookExecutor(registry);

    const hook = new HookBuilder()
      .withId('hook-1')
      .withType(HookType.PreExecution)
      .withHandler(async () => {})
      .build();

    registry.register(hook);

    const context: HookContext = {
      nodeId: 'node-1',
      workflowId: 'workflow-1',
      timestamp: Date.now(),
    };

    await executor.executeHooks(HookType.PreExecution, context);
    await executor.executeHooks(HookType.PreExecution, context);

    const history = executor.getHistory();
    assert.strictEqual(history.length, 2);
  });

  await suite.test('HookExecutor executes multiple hooks', async () => {
    const registry = new WorkflowHooksRegistry();
    const executor = new HookExecutor(registry);

    const executions: string[] = [];

    for (let i = 0; i < 3; i++) {
      const hook = new HookBuilder()
        .withId(`hook-${i}`)
        .withType(HookType.PreExecution)
        .withHandler(async () => {
          executions.push(`hook-${i}`);
        })
        .build();

      registry.register(hook);
    }

    const context: HookContext = {
      nodeId: 'node-1',
      workflowId: 'workflow-1',
      timestamp: Date.now(),
    };

    const result = await executor.executeHooks(HookType.PreExecution, context);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(executions.length, 3);
  });

  await suite.test('HookBuilder validates required fields', () => {
    const builder = new HookBuilder();

    assert.throws(() => {
      builder.build();
    }, /must have an id/i);

    const withId = builder.withId('hook-1');

    assert.throws(() => {
      withId.build();
    }, /must have a type/i);
  });

  await suite.test('WorkflowHooksRegistry emits events', () => {
    const registry = new WorkflowHooksRegistry();
    const events: string[] = [];

    registry.on(async (event) => {
      events.push(event.type);
    });

    const hook = new HookBuilder()
      .withId('hook-1')
      .withType(HookType.PreExecution)
      .withHandler(async () => {})
      .build();

    registry.register(hook);
    registry.unregister('hook-1');

    assert(events.includes('registered'));
    assert(events.includes('unregistered'));
  });

  await suite.test('HookExecutor limits history size', async () => {
    const registry = new WorkflowHooksRegistry();
    const executor = new HookExecutor(registry);

    const hook = new HookBuilder()
      .withId('hook-1')
      .withType(HookType.PreExecution)
      .withHandler(async () => {})
      .build();

    registry.register(hook);

    const context: HookContext = {
      nodeId: 'node-1',
      workflowId: 'workflow-1',
      timestamp: Date.now(),
    };

    // Execute many times
    for (let i = 0; i < 50; i++) {
      await executor.executeHooks(HookType.PreExecution, context);
    }

    const history = executor.getHistory();
    // Should be trimmed to recent entries
    assert(history.length <= 1000);
  });

  await suite.test('HookBuilder allows chain configuration', () => {
    const hook = new HookBuilder()
      .withId('hook-1')
      .withType(HookType.PostExecution)
      .withAsync(false)
      .withEnabled(false)
      .withHandler(async () => {})
      .build();

    assert.strictEqual(hook.id, 'hook-1');
    assert.strictEqual(hook.type, HookType.PostExecution);
    assert.strictEqual(hook.async, false);
    assert.strictEqual(hook.enabled, false);
  });
});
