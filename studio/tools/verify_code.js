#!/usr/bin/env node
/* verify_code.js — executes every code-based exercise in lesson/daily JSON files:
     • Solidity "code" items + production: the solution must compile and pass ALL tests;
       the starter must fail at least one test (otherwise the exercise is pointless).
     • n8n "jsexpr" items: the model expression must evaluate to `expected`.
     • n8n "jscode" items + production: the solution must produce `expected` for every case.
   Usage: node verify_code.js file1.json [file2.json …]   (exit 1 on any failure) */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const STUDIO = path.resolve(__dirname, '..');
const REPO = path.resolve(STUDIO, '..');
globalThis.PS = {};
['10-keccak-abi.js', '11-evm.js', '12-soltest.js'].forEach((f) => require(path.join(STUDIO, 'app', f)));

let solc = null;
function compile(sources) {
  if (!solc) {
    const Module = require(path.join(REPO, 'assets', 'solc', 'soljson-v0.8.37.js'));
    solc = Module.cwrap('solidity_compile', 'string', ['string', 'number', 'number']);
  }
  return PS.solTest.collect(JSON.parse(solc(JSON.stringify(PS.solTest.input(sources)), 0, 0)));
}

/* ---- n8n sandbox in a node vm (same source as the browser iframe) ---- */
const BOX = fs.readFileSync(path.join(STUDIO, 'app', 'box', 'n8n-box.src.js'), 'utf8');
function makeBox() {
  let handler = null; const replies = [];
  const ctx = {
    window: { addEventListener: (t, fn) => { if (t === 'message') handler = fn; } },
    parent: { postMessage: (m) => replies.push(m) },
    TextEncoder, TextDecoder, btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    console, Proxy, Date, Math, JSON, Object, Array, String, Number, Boolean, Error, Promise, Set, Map, Uint8Array, Uint32Array, DataView, ArrayBuffer, RegExp, parseInt, parseFloat, isNaN, isFinite,
  };
  vm.createContext(ctx);
  vm.runInContext(BOX, ctx);
  return async (msg) => {
    const id = Math.random().toString(36).slice(2); replies.length = 0;
    await handler({ data: Object.assign({ id }, msg) });
    for (let i = 0; i < 50 && !replies.find((r) => r.id === id); i++) await new Promise((r) => setTimeout(r, 10));
    return replies.find((r) => r.id === id) || { ok: false, error: 'geen antwoord (timeout)' };
  };
}
const box = makeBox();
const canon = (v) => {
  const walk = (x) => (Array.isArray(x) ? x.map(walk) : x && typeof x === 'object' ? Object.keys(x).sort().reduce((o, k) => { o[k] = walk(x[k]); return o; }, {}) : typeof x === 'number' ? Math.round(x * 1e9) / 1e9 : x);
  return JSON.stringify(walk(v));
};

async function checkItem(it, where, errors) {
  const tag = `${where}:${it.id}`;
  if (it.type === 'code') {
    const file = it.file || `${it.contract}.sol`;
    const extra = it.extraSources || {};
    const sol = compile(Object.assign({ [file]: it.solution }, extra));
    if (sol.errors.length) { errors.push(`${tag}: solution compileert niet: ${sol.errors[0].split('\n')[0]}`); return; }
    const res = (it.tests || []).map((t) => PS.solTest.runTest(sol.contracts, t, it.solution, it.contract));
    res.filter((r) => !r.ok).forEach((r) => errors.push(`${tag}: solution faalt test "${r.name}": ${r.detail}`));
    const st = compile(Object.assign({ [file]: it.starter }, extra));
    if (!st.errors.length) {
      const sres = (it.tests || []).map((t) => PS.solTest.runTest(st.contracts, t, it.starter, it.contract));
      if (sres.every((r) => r.ok)) errors.push(`${tag}: starter slaagt al voor alle tests — oefening zinloos`);
    }
  } else if (it.type === 'jsexpr') {
    const items = it.items || (it.input !== undefined ? [it.input] : [{}]);
    const r = await box({ kind: 'expr', template: it.solution, items, index: it.itemIndex || 0, nodes: it.nodes || null, perItem: !!it.perItem });
    if (!r.ok) errors.push(`${tag}: solution-expressie faalt: ${r.error}`);
    else { const got = r.value && r.value.__undef ? undefined : r.value; if (canon(got) !== canon(it.expected)) errors.push(`${tag}: solution geeft ${JSON.stringify(got)}, expected ${JSON.stringify(it.expected)}`); }
  } else if (it.type === 'jscode') {
    for (const [i, c] of (it.cases || []).entries()) {
      const r = await box({ kind: 'code', code: it.solution, mode: it.mode || 'all', items: c.items || [], nodes: c.nodes || null });
      if (!r.ok) { errors.push(`${tag}: case ${i + 1}: solution faalt: ${r.error}`); continue; }
      const ok = it.unordered ? canon(r.value.map(canon).sort()) === canon(c.expected.map(canon).sort()) : canon(r.value) === canon(c.expected);
      if (!ok) errors.push(`${tag}: case ${i + 1}: solution geeft ${JSON.stringify(r.value).slice(0, 300)} ≠ expected ${JSON.stringify(c.expected).slice(0, 300)}`);
      if (it.starter) {
        const s = await box({ kind: 'code', code: it.starter, mode: it.mode || 'all', items: c.items || [], nodes: c.nodes || null });
        if (s.ok && canon(s.value) === canon(c.expected) && i === 0 && (it.cases || []).length === 1) errors.push(`${tag}: starter geeft al het verwachte resultaat`);
      }
    }
  }
}

async function main(files) {
  let bad = 0;
  for (const f of files) {
    const L = JSON.parse(fs.readFileSync(f, 'utf8')); const errors = []; let n = 0;
    const pools = [];
    (L.sections || []).forEach((s) => (s.checks || []).forEach((it) => pools.push(['check', it])));
    ['practice', 'mastery'].forEach((p) => (L[p] || []).forEach((it) => pools.push([p, it])));
    if (L.diagnostic) L.diagnostic.items.forEach((it) => pools.push(['diagnostic', it]));
    (L.drills || []).forEach((d) => (d.items || []).forEach((it) => pools.push(['drill', it])));
    if (L.production && (L.production.type === 'code' || L.production.type === 'jscode')) pools.push(['production', Object.assign({ id: 'production' }, L.production, { type: L.production.type })]);
    for (const [where, it] of pools) if (['code', 'jsexpr', 'jscode'].includes(it.type)) { n++; await checkItem(it, where, errors); }
    const rel = path.relative(STUDIO, f);
    if (errors.length) { bad++; console.log(`✗ ${rel}: ${errors.length} probleem/problemen in ${n} code-items`); errors.forEach((e) => console.log('    ' + e)); }
    else console.log(`✓ ${rel}: ${n} code-items geverifieerd`);
  }
  process.exit(bad ? 1 : 0);
}
main(process.argv.slice(2));
