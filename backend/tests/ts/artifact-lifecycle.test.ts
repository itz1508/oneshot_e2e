import test from 'node:test';
import assert from 'node:assert';
import {
  ArtifactLifecycleManager,
  ArtifactState,
  DEFAULT_RETENTION_POLICIES,
  ArtifactVersion,
} from '../../artifact/lifecycle.js';
import { FailureType } from '../../validation/failure-taxonomy.js';

test('Artifact Lifecycle', async (suite) => {
  await suite.test('ArtifactLifecycleManager creates artifacts', () => {
    const manager = new ArtifactLifecycleManager();
    const version: ArtifactVersion = {
      version: '1.0.0',
      created: Date.now(),
      hash: 'abc123',
      size: 1024,
    };

    const artifact = manager.createArtifact('art-1', 'Test Artifact', version);

    assert.strictEqual(artifact.id, 'art-1');
    assert.strictEqual(artifact.state, ArtifactState.Draft);
    assert.strictEqual(artifact.metadata.name, 'Test Artifact');
  });

  await suite.test('ArtifactLifecycleManager prevents duplicate creation', () => {
    const manager = new ArtifactLifecycleManager();
    const version: ArtifactVersion = {
      version: '1.0.0',
      created: Date.now(),
      hash: 'abc123',
      size: 1024,
    };

    manager.createArtifact('art-1', 'Test', version);

    assert.throws(() => {
      manager.createArtifact('art-1', 'Test', version);
    }, /already exists/);
  });

  await suite.test('ArtifactLifecycleManager transitions state', () => {
    const manager = new ArtifactLifecycleManager();
    const version: ArtifactVersion = {
      version: '1.0.0',
      created: Date.now(),
      hash: 'abc123',
      size: 1024,
    };

    const artifact = manager.createArtifact('art-1', 'Test', version);
    const result = manager.transitionState('art-1', ArtifactState.Validated, 'Valid');

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.state, ArtifactState.Validated);
    }
  });

  await suite.test('ArtifactLifecycleManager enforces valid transitions', () => {
    const manager = new ArtifactLifecycleManager();
    const version: ArtifactVersion = {
      version: '1.0.0',
      created: Date.now(),
      hash: 'abc123',
      size: 1024,
    };

    manager.createArtifact('art-1', 'Test', version);
    const result = manager.transitionState('art-1', ArtifactState.Archived);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert(result.failures[0].message.toLowerCase().includes('transition'));
    }
  });

  await suite.test('ArtifactLifecycleManager transitions Draft → Validated → Published → Archived', () => {
    const manager = new ArtifactLifecycleManager();
    const version: ArtifactVersion = {
      version: '1.0.0',
      created: Date.now(),
      hash: 'abc123',
      size: 1024,
    };

    manager.createArtifact('art-1', 'Test', version);
    manager.setOnBeforePublish(() => true);
    manager.transitionState('art-1', ArtifactState.Validated);
    manager.transitionState('art-1', ArtifactState.Published);
    const result = manager.transitionState('art-1', ArtifactState.Archived);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.state, ArtifactState.Archived);
    }
  });

  await suite.test('ArtifactLifecycleManager adds versions', () => {
    const manager = new ArtifactLifecycleManager();
    const version1: ArtifactVersion = {
      version: '1.0.0',
      created: Date.now(),
      hash: 'abc123',
      size: 1024,
    };

    manager.createArtifact('art-1', 'Test', version1);

    const version2: ArtifactVersion = {
      version: '1.0.1',
      created: Date.now(),
      hash: 'def456',
      size: 2048,
    };

    const result = manager.addVersion('art-1', version2);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.versions.length, 2);
      assert.strictEqual(result.value.currentVersion.version, '1.0.1');
    }
  });

  await suite.test('ArtifactLifecycleManager respects retention policy', () => {
    const manager = new ArtifactLifecycleManager();
    const version: ArtifactVersion = {
      version: '1.0.0',
      created: Date.now(),
      hash: 'abc123',
      size: 1024,
    };

    const policy = { ...DEFAULT_RETENTION_POLICIES.standard };
    policy.maxVersions = 2;

    manager.createArtifact('art-1', 'Test', version, policy);

    for (let i = 1; i < 5; i++) {
      manager.addVersion('art-1', {
        version: `1.0.${i}`,
        created: Date.now(),
        hash: `hash${i}`,
        size: 1024 * (i + 1),
      });
    }

    const artifact = manager.getArtifact('art-1');
    assert(artifact && artifact.versions.length <= 2);
  });

  await suite.test('ArtifactLifecycleManager gets version history', () => {
    const manager = new ArtifactLifecycleManager();
    const version1: ArtifactVersion = {
      version: '1.0.0',
      created: Date.now(),
      hash: 'abc123',
      size: 1024,
    };

    manager.createArtifact('art-1', 'Test', version1);
    manager.addVersion('art-1', {
      version: '1.0.1',
      created: Date.now(),
      hash: 'def456',
      size: 2048,
    });

    const result = manager.getVersionHistory('art-1');

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.length, 2);
    }
  });

  await suite.test('ArtifactLifecycleManager tracks state transitions', () => {
    const manager = new ArtifactLifecycleManager();
    const version: ArtifactVersion = {
      version: '1.0.0',
      created: Date.now(),
      hash: 'abc123',
      size: 1024,
    };

    manager.createArtifact('art-1', 'Test', version);
    manager.setOnBeforePublish(() => true);
    manager.transitionState('art-1', ArtifactState.Validated);
    manager.transitionState('art-1', ArtifactState.Published);

    const result = manager.getTransitionHistory('art-1');

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.length, 2);
      assert.strictEqual(result.value[0].from, ArtifactState.Draft);
      assert.strictEqual(result.value[0].to, ArtifactState.Validated);
    }
  });

  await suite.test('ArtifactLifecycleManager emits lifecycle events', (t) => {
    const manager = new ArtifactLifecycleManager();
    const events: string[] = [];

    manager.on(async (event) => {
      events.push(event.type);
    });

    const version: ArtifactVersion = {
      version: '1.0.0',
      created: Date.now(),
      hash: 'abc123',
      size: 1024,
    };

    manager.createArtifact('art-1', 'Test', version);
    manager.setOnBeforePublish(() => true);
    manager.transitionState('art-1', ArtifactState.Validated);
    manager.transitionState('art-1', ArtifactState.Published);

    assert(events.includes('created'));
    assert(events.includes('validated'));
    assert(events.includes('published'));
  });

  await suite.test('ArtifactLifecycleManager deletes artifacts', () => {
    const manager = new ArtifactLifecycleManager();
    const version: ArtifactVersion = {
      version: '1.0.0',
      created: Date.now(),
      hash: 'abc123',
      size: 1024,
    };

    manager.createArtifact('art-1', 'Test', version);
    assert.strictEqual(manager.count(), 1);

    manager.transitionState('art-1', ArtifactState.Deleted);
    assert.strictEqual(manager.count(), 0);
  });

  await suite.test('ArtifactLifecycleManager cleanup removes old artifacts', () => {
    const manager = new ArtifactLifecycleManager();
    const pastTime = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
    
    const version: ArtifactVersion = {
      version: '1.0.0',
      created: pastTime,
      hash: 'abc123',
      size: 1024,
    };

    const shortPolicy = { ...DEFAULT_RETENTION_POLICIES.shortLived };
    const artifact = manager.createArtifact('art-1', 'Old Artifact', version, shortPolicy);
    
    // Manually update metadata to make artifact appear old
    artifact.metadata.createdAt = pastTime;

    const removed = manager.cleanup();
    assert.strictEqual(removed, 1);
    assert.strictEqual(manager.count(), 0);
  });

  await suite.test('ArtifactLifecycleManager prevents removal of new artifacts', () => {
    const manager = new ArtifactLifecycleManager();
    const version: ArtifactVersion = {
      version: '1.0.0',
      created: Date.now(),
      hash: 'abc123',
      size: 1024,
    };

    manager.createArtifact('art-1', 'New Artifact', version, DEFAULT_RETENTION_POLICIES.shortLived);

    const removed = manager.cleanup();
    assert.strictEqual(removed, 0);
    assert.strictEqual(manager.count(), 1);
  });

  await suite.test('ArtifactLifecycleManager enforces mandatory onBeforePublish precondition', () => {
    const manager = new ArtifactLifecycleManager();
    const version: ArtifactVersion = {
      version: '1.0.0',
      created: Date.now(),
      hash: 'abc123',
      size: 1024,
    };

    manager.createArtifact('art-blocked', 'Strict Publish Test', version);
    manager.transitionState('art-blocked', ArtifactState.Validated);

    // 1. Unregistered hook: must fail with TransitionFailed
    const blocked = manager.transitionState('art-blocked', ArtifactState.Published);
    assert.strictEqual(blocked.ok, false);
    if (!blocked.ok) {
      assert.strictEqual(blocked.failures[0].type, FailureType.TransitionFailed);
      assert.ok(blocked.failures[0].message.includes('onBeforePublish hook is strictly required'));
    }

    // 2. Hook rejecting: must fail with TransitionFailed
    manager.setOnBeforePublish(() => false);
    const rejected = manager.transitionState('art-blocked', ArtifactState.Published);
    assert.strictEqual(rejected.ok, false);
    if (!rejected.ok) {
      assert.strictEqual(rejected.failures[0].type, FailureType.TransitionFailed);
      assert.ok(rejected.failures[0].message.includes('rejected publication'));
    }

    // 3. Hook approving: succeeds
    manager.setOnBeforePublish(() => true);
    const allowed = manager.transitionState('art-blocked', ArtifactState.Published, 'Release ready', 'Builder');
    assert.strictEqual(allowed.ok, true);
    if (allowed.ok) {
      assert.strictEqual(allowed.value.state, ArtifactState.Published);
    }
  });

  await suite.test('ArtifactLifecycleManager enforces authorized event producer identity', () => {
    const manager = new ArtifactLifecycleManager();
    const version: ArtifactVersion = {
      version: '1.0.0',
      created: Date.now(),
      hash: 'abc123',
      size: 1024,
    };
    manager.createArtifact('art-auth', 'Producer Test', version);
    manager.setOnBeforePublish(() => true);
    manager.transitionState('art-auth', ArtifactState.Validated);

    // Unauthorized producer should throw on transition / emission
    assert.throws(() => {
      manager.transitionState('art-auth', ArtifactState.Published, 'Unverified', 'MaliciousActor');
    }, /Unauthorized event emission/);
  });

  await suite.test('Runtime Artifact Rule and Persistence Artifact Rule for artifact(...) and artifact_id', () => {
    const manager = new ArtifactLifecycleManager();
    const version: ArtifactVersion = {
      version: '1.0.0',
      created: Date.now(),
      hash: 'sha256:1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
      size: 2048,
    };

    // 1. Create runtime artifact(...) instance
    const runtimeArt = manager.createRuntimeArtifact('art-runtime-01', 'Active Architecture Plan', version);
    assert.strictEqual(runtimeArt.artifact_id, 'art-runtime-01');
    assert.strictEqual(runtimeArt.isMutable, true);
    assert.strictEqual(runtimeArt.isInProgress, true);
    assert.strictEqual(runtimeArt.state, ArtifactState.Draft);

    // 2. Can Evolve
    runtimeArt.evolve(ArtifactState.Validated, 'Initial validation passed', 'Planner');
    assert.strictEqual(runtimeArt.state, ArtifactState.Validated);

    // 3. Can Be Refined
    runtimeArt.refine((rec) => {
      rec.metadata.tags = ['core', 'architecture', 'v1.3'];
    });
    assert.deepStrictEqual(runtimeArt.metadata.tags, ['core', 'architecture', 'v1.3']);

    // 4. Can Emit Events
    let eventReceived = false;
    manager.on((evt: any) => {
      if (evt.type === 'validated') eventReceived = true;
    });
    runtimeArt.emit('validated', 'Planner');
    assert.strictEqual(eventReceived, true);

    // 5. Can Fail Validation
    manager.setOnBeforePublish(() => false);
    assert.throws(() => {
      runtimeArt.evolve(ArtifactState.Published, 'Publish attempt', 'Planner');
    }, /Failed to evolve artifact/);

    // 6. Freeze to Persistence Artifact (Stored Record)
    manager.setOnBeforePublish(() => true);
    runtimeArt.evolve(ArtifactState.Published, 'Verified release', 'Planner');
    const stored = runtimeArt.toStoredRecord();

    assert.strictEqual(stored.artifact_id, 'art-runtime-01');
    assert.strictEqual(stored.state, ArtifactState.Published);
    assert.strictEqual(manager.getArtifactById('art-runtime-01')?.artifact_id, 'art-runtime-01');
  });
});
