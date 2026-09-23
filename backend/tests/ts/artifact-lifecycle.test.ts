import test from 'node:test';
import assert from 'node:assert';
import {
  ArtifactLifecycleManager,
  ArtifactState,
  DEFAULT_RETENTION_POLICIES,
  ArtifactVersion,
} from '../../artifact/lifecycle.js';

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
});
