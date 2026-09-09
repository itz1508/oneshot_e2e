import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
function load(relative) {
    const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
    const module = { exports: {} };
    const localRequire = name => name === '../lib/projections' ? load('../lib/projections.ts') : require(name);
    new Function('require', 'module', 'exports', outputText)(localRequire, module, module.exports);
    return module.exports;
}
const { BuildCard, ResultCard, MutationsTable } = load('../components/review-cards.tsx');
const review = { run_id: 'review-test', status: 'pending', hash: 'recorded-hash', steps: [] };
test('active React Build Ready reports absent validation as unavailable', () => {
    const html = renderToStaticMarkup(React.createElement(BuildCard, { review, terminal: false, busy: false, onDecision: async () => false }));
    assert.equal((html.match(/Unavailable/g) || []).length, 3);
    assert.doesNotMatch(html, />VALID</);
    assert.match(html, /Confirm Build/);
});
test('approved React build card removes approval controls and waiting claim', () => {
    const html = renderToStaticMarkup(React.createElement(BuildCard, { review: { ...review, status: 'approved' }, terminal: false, busy: false, onDecision: async () => true }));
    assert.doesNotMatch(html, /Confirm Build|Cancel \/ Return|Builder is waiting/);
    assert.match(html, /runtime accepted authorization/);
});

test('missing proof and mutation evidence are unavailable, not verified or empty', () => {
    const html = renderToStaticMarkup(React.createElement(ResultCard, { run: { run_id: 'test', pipeline_status: 'Done', test_result: 'Failed' }, mutations: null }));
    assert.match(html, /UNAVAILABLE/);
    assert.doesNotMatch(html, /Verified deterministic proof|NOT EQUAL/);
    assert.match(renderToStaticMarkup(React.createElement(MutationsTable, { records: null })), /evidence unavailable/);
    assert.match(renderToStaticMarkup(React.createElement(MutationsTable, { records: [] })), /No workspace file mutations recorded/);
});
