import test from 'node:test';
import assert from 'node:assert';
import {
  ResearchLifecycleManager,
  ResearchPhase,
  QualityLevel,
} from '../../research/lifecycle.js';

test('Research Lifecycle', async (suite) => {
  await suite.test('ResearchLifecycleManager starts research', () => {
    const manager = new ResearchLifecycleManager();
    const research = manager.startResearch('res-1', 'Feasibility Study');

    assert.strictEqual(research.id, 'res-1');
    assert.strictEqual(research.phase, ResearchPhase.Planning);
    assert.strictEqual(research.metadata.title, 'Feasibility Study');
  });

  await suite.test('ResearchLifecycleManager prevents duplicate research', () => {
    const manager = new ResearchLifecycleManager();
    manager.startResearch('res-1', 'Study');

    assert.throws(() => {
      manager.startResearch('res-1', 'Study');
    }, /already exists/);
  });

  await suite.test('ResearchLifecycleManager advances phases', () => {
    const manager = new ResearchLifecycleManager();
    manager.startResearch('res-1', 'Study');

    const result = manager.advancePhase('res-1', ResearchPhase.Exploration);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.phase, ResearchPhase.Exploration);
    }
  });

  await suite.test('ResearchLifecycleManager enforces valid phase transitions', () => {
    const manager = new ResearchLifecycleManager();
    manager.startResearch('res-1', 'Study');

    const result = manager.advancePhase('res-1', ResearchPhase.Synthesis);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert(result.failures[0].message.toLowerCase().includes('transition'));
    }
  });

  await suite.test('ResearchLifecycleManager allows phase loops', () => {
    const manager = new ResearchLifecycleManager();
    manager.startResearch('res-1', 'Study');
    manager.advancePhase('res-1', ResearchPhase.Exploration);
    manager.advancePhase('res-1', ResearchPhase.Analysis);

    const result = manager.advancePhase('res-1', ResearchPhase.Exploration);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.phase, ResearchPhase.Exploration);
    }
  });

  await suite.test('ResearchLifecycleManager completes cycles', () => {
    const manager = new ResearchLifecycleManager();
    manager.startResearch('res-1', 'Study', 5, QualityLevel.Good);
    manager.advancePhase('res-1', ResearchPhase.Exploration);

    const result = manager.completeCycle('res-1', { findings: 'test' }, QualityLevel.Good);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.cycles.length, 1);
      assert.strictEqual(result.value.currentCycle, 1);
    }
  });

  await suite.test('ResearchLifecycleManager tracks quality scores', () => {
    const manager = new ResearchLifecycleManager();
    manager.startResearch('res-1', 'Study', 5, QualityLevel.Good);
    manager.advancePhase('res-1', ResearchPhase.Exploration);

    manager.completeCycle('res-1', { findings: 'test1' }, QualityLevel.Acceptable);
    manager.completeCycle('res-1', { findings: 'test2' }, QualityLevel.Good);

    const research = manager.getResearch('res-1');
    assert(research && research.currentQuality >= QualityLevel.Good);
  });

  await suite.test('ResearchLifecycleManager enforces max cycles', () => {
    const manager = new ResearchLifecycleManager();
    manager.startResearch('res-1', 'Study', 2, QualityLevel.Draft);
    manager.advancePhase('res-1', ResearchPhase.Exploration);

    manager.completeCycle('res-1', { findings: 'test1' }, QualityLevel.Draft);
    manager.completeCycle('res-1', { findings: 'test2' }, QualityLevel.Draft);

    const result = manager.completeCycle('res-1', { findings: 'test3' }, QualityLevel.Draft);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert(result.failures[0].message.includes('Max cycles'));
    }
  });

  await suite.test('ResearchLifecycleManager evaluates quality gates', () => {
    const manager = new ResearchLifecycleManager();
    manager.startResearch('res-1', 'Study', 5, QualityLevel.Good);
    manager.advancePhase('res-1', ResearchPhase.Exploration);

    // First cycle: quality below threshold (should fail required gate)
    const result1 = manager.completeCycle('res-1', { findings: 'test' }, QualityLevel.Draft);

    assert.strictEqual(result1.ok, false);
    if (!result1.ok) {
      assert(result1.failures[0].message.includes('Quality gate'));
    }

    // Second cycle: quality meets threshold
    const result2 = manager.completeCycle(
      'res-1',
      { findings: 'test' },
      QualityLevel.Good
    );

    assert.strictEqual(result2.ok, true);
  });

  await suite.test('ResearchLifecycleManager emits events', () => {
    const manager = new ResearchLifecycleManager();
    const events: string[] = [];

    manager.on(async (event) => {
      events.push(event.type);
    });

    manager.startResearch('res-1', 'Study', 5, QualityLevel.Good);
    manager.advancePhase('res-1', ResearchPhase.Exploration);
    manager.completeCycle('res-1', { findings: 'test' }, QualityLevel.Good);

    assert(events.includes('started'));
    assert(events.includes('phase-changed'));
    assert(events.includes('cycle-completed'));
    assert(events.includes('quality-gate-passed'));
  });

  await suite.test('ResearchLifecycleManager gets research by phase', () => {
    const manager = new ResearchLifecycleManager();
    manager.startResearch('res-1', 'Study1');
    manager.startResearch('res-2', 'Study2');

    manager.advancePhase('res-1', ResearchPhase.Exploration);

    const explorationResearch = manager.getResearchByPhase(ResearchPhase.Exploration);
    assert.strictEqual(explorationResearch.length, 1);
    assert.strictEqual(explorationResearch[0].id, 'res-1');
  });

  await suite.test('ResearchLifecycleManager completes research', () => {
    const manager = new ResearchLifecycleManager();
    manager.startResearch('res-1', 'Study', 5, QualityLevel.Draft);
    manager.advancePhase('res-1', ResearchPhase.Exploration);
    manager.completeCycle('res-1', { findings: 'test' }, QualityLevel.Draft);
    manager.advancePhase('res-1', ResearchPhase.Analysis);
    manager.advancePhase('res-1', ResearchPhase.Synthesis);
    manager.advancePhase('res-1', ResearchPhase.Validation);
    manager.advancePhase('res-1', ResearchPhase.Complete);

    const research = manager.getResearch('res-1');
    assert(research && research.completed);
  });

  await suite.test('ResearchLifecycleManager gets completed research', () => {
    const manager = new ResearchLifecycleManager();
    manager.startResearch('res-1', 'Study1', 5, QualityLevel.Draft);
    manager.startResearch('res-2', 'Study2', 5, QualityLevel.Draft);

    manager.advancePhase('res-1', ResearchPhase.Exploration);
    manager.completeCycle('res-1', { findings: 'test' }, QualityLevel.Draft);
    manager.advancePhase('res-1', ResearchPhase.Analysis);
    manager.advancePhase('res-1', ResearchPhase.Synthesis);
    manager.advancePhase('res-1', ResearchPhase.Validation);
    manager.advancePhase('res-1', ResearchPhase.Complete);

    const completed = manager.getCompleted();
    assert.strictEqual(completed.length, 1);
    assert.strictEqual(completed[0].id, 'res-1');
  });

  await suite.test('ResearchLifecycleManager tracks cycle issues', () => {
    const manager = new ResearchLifecycleManager();
    manager.startResearch('res-1', 'Study', 5, QualityLevel.Draft);
    manager.advancePhase('res-1', ResearchPhase.Exploration);

    manager.completeCycle('res-1', { findings: 'test' }, QualityLevel.Draft, [
      'Incomplete data',
      'Need more samples',
    ]);

    const research = manager.getResearch('res-1');
    assert(research && research.cycles[0].issues?.length === 2);
  });

  await suite.test('ResearchLifecycleManager clears research', () => {
    const manager = new ResearchLifecycleManager();
    manager.startResearch('res-1', 'Study');
    assert.strictEqual(manager.count(), 1);

    manager.clear();
    assert.strictEqual(manager.count(), 0);
  });
});
