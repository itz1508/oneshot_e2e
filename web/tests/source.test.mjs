import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const h=fs.readFileSync('src/index.html','utf8');
const j=fs.readFileSync('src/app.js','utf8');
const c=fs.readFileSync('src/styles.css','utf8');

test('stable E2E selectors',()=>{
  for(const x of['readiness','generate-button','task-management','researcher-stage','researcher-activity','run-context','workspace-tree','message-oneshot']){
    assert.match(h,new RegExp(x));
  }
});

test('uses recovered OneShot browser contracts',()=>{
  for(const x of[
    '/api/health',
    '/api/conversations',
    '/messages',
    '/prompt',
    '/run',
    '/api/runs/',
    '/events',
    '/v1/workspace/tree?path=.&depth=3',
    '/v1/workspace/file?path='
  ]) assert.ok(j.includes(x),`missing ${x}`);
  for(const x of['/api/session','/api/provider','/api/conversations/messages','/api/workspace/tree','/api/workspace/file','/context`']){
    assert.ok(!j.includes(x),`invented route remains: ${x}`);
  }
});

test('no fabricated terminal values',()=>{
  assert.ok(!/run_sample|builder_sample|sha256…|concept data|illustrative result/i.test(h+j));
});

test('runtime events are deduplicated then sequence-sorted',()=>{
  assert.ok(j.includes('state.seen.has(e.eventId)'));
  assert.ok(j.includes('state.seen.add(e.eventId)'));
  assert.ok(j.includes('state.run.events.sort((a,b)=>a.sequence-b.sequence)'));
});

test('Generate readiness is runtime-owned',()=>{
  assert.ok(j.includes('n.intent?.ready_for_prompt'));
  assert.ok(j.includes('c.sufficient===true'));
  assert.ok(!/message\.oninput[^\n]*setReadiness/.test(j));
});

test('approved shell mechanics are present',()=>{
  assert.ok(h.includes('id="rail-stack"'));
  assert.ok(h.includes('data-resize="nw"'));
  assert.ok(h.includes('id="top-handle"'));
  assert.ok(c.includes('--left-open'));
  assert.ok(c.includes('--right-open'));
  assert.ok(j.includes("localStorage.setItem('oneshot.rail.y'"));
  assert.ok(j.includes("localStorage.setItem('oneshot.operator.v3'"));
});
