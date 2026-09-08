import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewHTML, researchSummaryHTML, hasVerifiedHash, createHumanGates, collectEdits } from '../src/human-gates.js';
import { jobSnapshotHTML } from '../src/job-history.js';

const gate = {run_id:'run-1',hash:'abc',plan_id:'plan:1',revision:2,status:'pending',confirmed:true,validation:{schema:'VALID',fixture:'VALID',goal:'VALID'},steps:[{step_id:'step:1',description:'Fix <script>unsafe()</script>',responsibility:'Builder'}]};

test('build review shows actual package and authorizes only pending state', () => {
  const html = buildReviewHTML(gate);
  assert.match(html,/Confirm Build/); assert.match(html,/Cancel \/ return/); assert.match(html,/>abc</);
  assert.ok(!html.includes('<script>')); assert.match(html,/Fix &lt;script&gt;/);
  assert.ok(!buildReviewHTML({...gate,status:'approved'}).includes('data-gate-action'));
  const returned = buildReviewHTML(gate,true);
  assert.match(returned,/data-gate-reopen/); assert.ok(!returned.includes('data-gate-action'));
});

test('research uses real requirements, criteria and evidence with escaped content', () => {
  const html = researchSummaryHTML({goal:{objective:'Repair flow',success_criteria:[{statement:'Runs pass',measurement:'Tests',expected_result:'Passed'}]},plan:{requirements:[{statement:'Keep auth'}]},researcher:{evidence:[{statement:'Observed <bad>',source:'Source file',provenance:'Inspection'}]}});
  for (const text of ['Repair flow','Keep auth','Runs pass','Tests','Source file','Inspection','Observed &lt;bad&gt;']) assert.ok(html.includes(text));
});

test('proof requires independent recorded matching hashes and explicit equality', () => {
  assert.equal(hasVerifiedHash({hash:'abc'}),false);
  assert.equal(hasVerifiedHash({hash_proof:{created_hash:'abc',recomputed_hash:'abc'}}),false);
  assert.equal(hasVerifiedHash({hash_proof:{created_hash:'abc',recomputed_hash:'def',equal:true}}),false);
  assert.equal(hasVerifiedHash({hash_proof:{created_hash:'abc',recomputed_hash:'abc',equal:true}}),true);
  assert.match(jobSnapshotHTML({run_id:'run-1',hash:'abc',artifacts:{plan:'a.json'}}),/equality has not been reported/);
  assert.match(jobSnapshotHTML({run_id:'run-1'}),/No file mutation evidence recorded/);
});


test('collectEdits preserves canonical IDs and trims edited text', () => {
  const bundle = {
    goal: { objective: 'Original' },
    plan: { requirements: [{ requirement_id: 'req:1' }], steps: [{ step_id: 'step:1' }] },
  };
  const element = {
    querySelector: sel => ({
      '[data-objective]': { value: '  Edited objective  ' },
      '[data-requirement="0"]': { value: '  Edited requirement  ' },
      '[data-step="0"]': { value: '  Edited step  ' },
    }[sel]),
    querySelectorAll: sel => {
      if (sel === '[data-requirement-id]') return [{ dataset: { requirementId: '0' }, value: 'req:1' }];
      if (sel === '[data-step-id]') return [{ dataset: { stepId: '0' }, value: 'step:1' }];
      return [];
    },
  };
  const edits = collectEdits(element, bundle, ['note']);
  assert.deepEqual(edits, {
    objective: 'Edited objective',
    requirements: [{ id: 'req:1', statement: 'Edited requirement' }],
    steps: [{ id: 'step:1', description: 'Edited step' }],
    notes: ['note'],
  });
});

test('editable research review sends edits through inline review contract', async () => {
  const nodes = new Map();
  function acceptButton() {
    return {
      dataset: {},
      disabled: false,
      textContent: 'Accept Research',
      _listeners: {},
      addEventListener(type, handler) { this._listeners[type] = handler; },
      click() { this._listeners.click?.({ target: this }); },
    };
  }
  function makeElement(tag) {
    const accept = acceptButton();
    const el = {
      id: tag,
      dataset: {},
      innerHTML: '',
      accept,
      addEventListener(type, handler) { this._listeners[type] = handler; },
      querySelector(sel) {
        if (sel === '[data-research-error]') return { textContent: '' };
        if (sel === '[data-objective]') return { value: 'Edited objective' };
        if (sel === '[data-requirement="0"]') return { value: 'Edited requirement' };
        if (sel === '[data-step="0"]') return { value: 'Edited step' };
        if (sel === '[data-requirement-id="0"]') return { value: 'req:1' };
        if (sel === '[data-step-id="0"]') return { value: 'step:1' };
        if (sel === '[data-accept-research]') return accept;
        return null;
      },
      querySelectorAll(sel) {
        if (sel === '[data-requirement-id]') return [{ dataset: { requirementId: '0' }, value: 'req:1' }];
        if (sel === '[data-step-id]') return [{ dataset: { stepId: '0' }, value: 'step:1' }];
        return [];
      },
    };
    el._listeners = {};
    return el;
  }
  const previous = globalThis.document;
  globalThis.document = {
    querySelector: sel => {
      if (sel === '#chat') return { prepend(el) { nodes.set(el.id, el); } };
      if (sel.startsWith('#')) return nodes.get(sel.slice(1)) || null;
      return null;
    },
    createElement: tag => makeElement(tag),
  };
  const requests = [];
  try {
    const reviewContract = { run_id: 'run-1', revision: 3, status: 'pending', edits: { requirements: [{ id: 'req:1' }], steps: [{ id: 'step:1' }] } };
    const controller = createHumanGates({
      toast: assert.fail,
      apiFetch: async (url, options) => {
        if (!options) return { ok: true, json: async () => reviewContract };
        requests.push({ url, body: JSON.parse(options.body) });
        return { ok: true, json: async () => ({ status: 'approved' }) };
      },
    });
    await controller.refresh('run-1', { artifacts: { research_bundle: 'research.json' } });
    const card = nodes.get('research-summary-card');
    card.accept.click();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/api/runs/run-1/review');
    assert.equal(requests[0].body.action, 'approve');
    assert.equal(requests[0].body.revision, 3);
    assert.equal(requests[0].body.edits.objective, 'Edited objective');
  } finally { globalThis.document = previous; }
});

test('editable research review surfaces stale-revision server errors', async () => {
  const nodes = new Map();
  function acceptButton() {
    return {
      dataset: {},
      disabled: false,
      textContent: 'Accept Research',
      _listeners: {},
      addEventListener(type, handler) { this._listeners[type] = handler; },
      click() { this._listeners.click?.({ target: this }); },
    };
  }
  function makeElement(tag) {
    const accept = acceptButton();
    const error = { textContent: '' };
    const el = {
      id: tag,
      dataset: {},
      innerHTML: '',
      accept,
      _error: error,
      addEventListener(type, handler) { this._listeners[type] = handler; },
      querySelector(sel) {
        if (sel === '[data-research-error]') return error;
        if (sel === '[data-objective]') return { value: 'Objective' };
        if (sel === '[data-requirement="0"]') return { value: 'Requirement' };
        if (sel === '[data-step="0"]') return { value: 'Step' };
        if (sel === '[data-requirement-id="0"]') return { value: 'req:1' };
        if (sel === '[data-step-id="0"]') return { value: 'step:1' };
        if (sel === '[data-accept-research]') return accept;
        return null;
      },
      querySelectorAll(sel) {
        if (sel === '[data-requirement-id]') return [{ dataset: { requirementId: '0' }, value: 'req:1' }];
        if (sel === '[data-step-id]') return [{ dataset: { stepId: '0' }, value: 'step:1' }];
        return [];
      },
    };
    el._listeners = {};
    return el;
  }
  const previous = globalThis.document;
  globalThis.document = {
    querySelector: sel => {
      if (sel === '#chat') return { prepend(el) { nodes.set(el.id, el); } };
      if (sel.startsWith('#')) return nodes.get(sel.slice(1)) || null;
      return null;
    },
    createElement: tag => makeElement(tag),
  };
  try {
    const reviewContract = { run_id: 'run-1', revision: 3, status: 'pending', edits: { requirements: [{ id: 'req:1' }], steps: [{ id: 'step:1' }] } };
    const controller = createHumanGates({
      toast: assert.fail,
      apiFetch: async (url, options) => {
        if (!options) return { ok: true, json: async () => reviewContract };
        return { ok: false, status: 409, json: async () => ({ error: 'Review contract has changed (revision mismatch).' }) };
      },
    });
    await controller.refresh('run-1', { artifacts: { research_bundle: 'research.json' } });
    const card = nodes.get('research-summary-card');
    card.accept.click();
    await new Promise(r => setTimeout(r, 0));
    assert.match(card._error.textContent, /Review contract has changed/);
    assert.equal(card.accept.disabled, false);
  } finally { globalThis.document = previous; }
});

test('editable research review falls back to confirm-plan with edits in pipeline mode', async () => {
  const nodes = new Map();
  function acceptButton() {
    return {
      dataset: {},
      disabled: false,
      textContent: 'Accept Research',
      _listeners: {},
      addEventListener(type, handler) { this._listeners[type] = handler; },
      click() { this._listeners.click?.({ target: this }); },
    };
  }
  function makeElement(tag) {
    const accept = acceptButton();
    const el = {
      id: tag,
      dataset: {},
      innerHTML: '',
      accept,
      addEventListener(type, handler) { this._listeners[type] = handler; },
      querySelector(sel) {
        if (sel === '[data-research-error]') return { textContent: '' };
        if (sel === '[data-objective]') return { value: 'Pipeline objective' };
        if (sel === '[data-requirement="0"]') return { value: 'Pipeline requirement' };
        if (sel === '[data-step="0"]') return { value: 'Pipeline step' };
        if (sel === '[data-requirement-id="0"]') return { value: 'req:1' };
        if (sel === '[data-step-id="0"]') return { value: 'step:1' };
        if (sel === '[data-accept-research]') return accept;
        return null;
      },
      querySelectorAll(sel) {
        if (sel === '[data-requirement-id]') return [{ dataset: { requirementId: '0' }, value: 'req:1' }];
        if (sel === '[data-step-id]') return [{ dataset: { stepId: '0' }, value: 'step:1' }];
        return [];
      },
    };
    el._listeners = {};
    return el;
  }
  const previous = globalThis.document;
  globalThis.document = {
    querySelector: sel => {
      if (sel === '#chat') return { prepend(el) { nodes.set(el.id, el); } };
      if (sel.startsWith('#')) return nodes.get(sel.slice(1)) || null;
      return null;
    },
    createElement: tag => makeElement(tag),
  };
  const requests = [];
  try {
    const controller = createHumanGates({
      toast: assert.fail,
      apiFetch: async (url, options) => {
        if (!options) {
          if (url === '/api/runs/run-1/review') return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
          return { ok: true, json: async () => ({}) };
        }
        requests.push({ url, body: JSON.parse(options.body) });
        return { ok: true, json: async () => ({ status: 'confirmed' }) };
      },
    });
    await controller.refresh('run-1', { artifacts: { research_bundle: 'research.json' } });
    const card = nodes.get('research-summary-card');
    card.accept.click();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/api/runs/run-1/confirm-plan');
    assert.equal(requests[0].body.edits.objective, 'Pipeline objective');
    assert.equal(requests[0].body.edits.requirements[0].statement, 'Pipeline requirement');
  } finally { globalThis.document = previous; }
});

test('build decision sends displayed hash, preserves server errors, and return stays pending', async () => {
  const nodes = new Map();
  function node() {
    const element = {dataset:{},buttons:[],error:{textContent:''},remove(){nodes.delete(this.id)},set innerHTML(value){this.html=value;this.buttons=['approve','return'].map(action=>({dataset:{gateAction:action},disabled:false,addEventListener(_,handler){this.click=handler}}));},get innerHTML(){return this.html},querySelector(selector){return selector==='[data-gate-error]'?this.error:null},querySelectorAll(){return this.buttons}};
    return element;
  }
  const previous = globalThis.document;
  globalThis.document = {querySelector:selector=>selector==='#chat'?{prepend(element){nodes.set(element.id,element)}}:nodes.get(selector.slice(1)),createElement:node};
  const requests = []; let fail = true;
  try {
    const controller = createHumanGates({toast:assert.fail,apiFetch:async(url,options)=>{
      if (!options) return {ok:true,json:async()=>gate};
      requests.push(JSON.parse(options.body));
      return fail?{ok:false,status:409,json:async()=>({error:'Package changed; refresh'})}:{ok:true,json:async()=>gate};
    }});
    await controller.refresh('run-1',{});
    const element = nodes.get('build-review-card');
    await element.buttons[0].click();
    assert.deepEqual(requests[0],{hash:'abc',action:'approve'});
    assert.equal(element.error.textContent,'Package changed; refresh');
    assert.equal(element.buttons[0].disabled,false);
    fail=false; await element.buttons[1].click();
    assert.deepEqual(requests[1],{hash:'abc',action:'return'});
    assert.equal(element.dataset.status,'pending'); assert.match(element.innerHTML,/data-gate-reopen/);
    controller.reset(); assert.equal(nodes.size,0);
  } finally {globalThis.document=previous;}
});
