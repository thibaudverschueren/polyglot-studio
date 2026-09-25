/* Polyglot Studio v2 — Solidity Studio: real solc (web worker) + educational EVM + tests + storage-slot view */
'use strict';

PS.fmtWord = (v) => { v = BigInt(v); if (v > (1n << 100n) && v < (1n << 160n)) return PS.accountName('0x' + v.toString(16).padStart(40, '0')); if (v >= 10n ** 15n) return '0x' + v.toString(16); return v.toString(); };

PS.sol = {
  SOLC: 'assets/solc/soljson-v0.8.37.js',
  worker: null, loading: null, seq: 0, pending: new Map(),
  load() {
    if (this.loading) return this.loading;
    this.loading = new Promise((resolve, reject) => {
      let w;
      try { w = new Worker('solc-worker.js'); } catch (e) { reject(new Error('Web Worker niet beschikbaar')); return; }
      const timer = setTimeout(() => reject(new Error('Compiler laden duurde te lang (offline?)')), 90000);
      w.onmessage = (e) => {
        const m = e.data || {};
        if (m.type === 'loaded') { clearTimeout(timer); this.version = m.version; resolve(w); return; }
        if (m.type === 'load-error') { clearTimeout(timer); reject(new Error(m.error)); return; }
        const p = this.pending.get(m.id); if (!p) return; this.pending.delete(m.id); p(m);
      };
      w.onerror = (e) => { clearTimeout(timer); reject(new Error(e.message || 'worker-fout')); };
      w.postMessage({ cmd: 'load', url: new URL(this.SOLC, location.href).href });
      this.worker = w;
    }).catch((e) => { this.loading = null; throw e; });
    return this.loading;
  },
  async compile(sources) {
    const w = await this.load();
    const id = ++this.seq;
    const out = await new Promise((res) => { this.pending.set(id, res); w.postMessage({ cmd: 'compile', id, input: JSON.stringify(PS.solTest.input(sources)) }); });
    if (out.error) throw new Error(out.error);
    return PS.solTest.collect(JSON.parse(out.output));
  },
  highlight: (code) => PS.highlight(code, 'sol'),
  mount(el, item, opts = {}) { return new PS.Studio(el, item, opts); },
  mountDemo(el, opts) { return new PS.Studio(el, { file: opts.file, contract: opts.contract, starter: opts.code, tests: [] }, { demo: true, key: opts.key }); },
};

const SYMS = ['{ }', '( )', ';', '=', '=>', 'msg.sender', 'msg.value', 'uint256', 'address', 'mapping(', 'require(', 'emit ', 'public', 'external', 'view', 'returns (', 'memory', '⇥'];

PS.Studio = class {
  constructor(el, item, opts) {
    this.el = el; this.item = item; this.o = opts; this.env = null; this.compiled = null; this.tab = 'console';
    this.file = item.file || `${item.contract || 'Contract'}.sol`;
    const tests = (item.tests || []).length;
    const canSolve = item.solution && !opts.demo && !(opts.mode === 'mastery');
    el.innerHTML = `<div class="studio">
      <div class="studio-bar"><div class="studio-file"><span class="dot"></span>${PS.esc(this.file)}<span class="log-dim" data-ver></span></div>
        <div class="studio-actions">
          <button type="button" class="sbtn primary" data-a="deploy">${PS.icon('rocket')} Compileer & deploy</button>
          ${tests ? `<button type="button" class="sbtn" data-a="tests">${PS.icon('checkCircle')} Tests (${tests})</button>` : ''}
          <button type="button" class="sbtn" data-a="reset" title="Startcode herstellen">${PS.icon('undo')}</button>
          ${canSolve ? `<button type="button" class="sbtn" data-a="solution" title="Toon oplossing">${PS.icon('eye')}</button>` : ''}
        </div></div>
      <div data-ed></div>
      <div class="studio-tabs" role="tablist">${[['tests', 'Tests'], ['console', 'Console'], ['contract', 'Contract'], ['storage', 'Opslag']].filter(([k]) => k !== 'tests' || tests).map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === this.tab}">${l}</button>`).join('')}</div>
      <div class="studio-panel" data-panel></div>
    </div>`;
    this.ed = new PS.Editor(PS.$('[data-ed]', el), { lang: 'sol', value: item.starter || '', key: opts.key ? `sol:${opts.key}` : null, symbols: SYMS, minLines: 12 });
    this.logs = [`<div class="log-line log-dim">// Klik “Compileer & deploy”. De eerste keer wordt de Solidity-compiler geladen (± 6 MB, daarna offline beschikbaar).</div>`];
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]'); const t = e.target.closest('[data-tab]');
      if (a) this.action(a.dataset.a);
      if (t) this.show(t.dataset.tab);
    });
    this.show(tests ? 'tests' : 'console');
    if (tests) this.renderTests(null);
  }
  code() { return this.ed.value(); }
  log(html, cls = '') { this.logs.push(`<div class="log-line ${cls}">${html}</div>`); if (this.logs.length > 300) this.logs.splice(1, 100); if (this.tab === 'console') this.show('console'); }
  show(tab) {
    this.tab = tab;
    PS.$$('[data-tab]', this.el).forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'));
    const p = PS.$('[data-panel]', this.el);
    if (tab === 'console') { p.innerHTML = this.logs.join(''); p.scrollTop = p.scrollHeight; }
    if (tab === 'tests') p.innerHTML = this.testsHtml || '<span class="log-dim">Nog niet uitgevoerd.</span>';
    if (tab === 'contract') this.renderContract(p);
    if (tab === 'storage') this.renderStorage(p);
  }
  async action(a) {
    if (a === 'deploy') return this.deploy();
    if (a === 'tests') { const r = await this.runTests(); if (this.o.onTests && r) this.o.onTests(r); return r; }
    if (a === 'reset' && confirm('Startcode herstellen? Je huidige code gaat verloren.')) { this.ed.set(this.item.starter || ''); this.log('Startcode hersteld.', 'log-dim'); }
    if (a === 'solution' && confirm('Oplossing in de editor zetten? Probeer het liefst eerst zelf.')) { this.ed.set(this.item.solution); this.log('Oplossing geladen — lees ze regel per regel en run de tests.', 'log-warn'); }
  }
  sources() { return Object.assign({ [this.file]: this.code() }, this.item.extraSources || {}); }
  async build() {
    const busy = PS.$('[data-a="deploy"]', this.el); const old = busy.innerHTML; busy.innerHTML = `<span class="loader"></span> ${PS.sol.worker ? 'Compileren…' : 'Compiler laden…'}`; busy.disabled = true;
    try {
      const t0 = performance.now();
      const C = await PS.sol.compile(this.sources());
      PS.$('[data-ver]', this.el).textContent = PS.sol.version ? ` · solc ${PS.sol.version.split('+')[0]}` : '';
      C.warnings.forEach((w) => this.log(PS.esc(w.split('\n').slice(0, 4).join('\n')), 'log-warn'));
      if (C.errors.length) { C.errors.forEach((e) => this.log(PS.esc(e), 'log-err')); this.show('console'); return null; }
      this.log(`✓ Gecompileerd in ${Math.round(performance.now() - t0)} ms: ${Object.keys(C.contracts).map((n) => PS.esc(n)).join(', ')}`, 'log-ok');
      this.compiled = C;
      return C;
    } catch (e) {
      this.log(`Compiler niet beschikbaar: ${PS.esc(e.message)}`, 'log-err'); this.show('console');
      return { unavailable: true, message: e.message };
    } finally { busy.innerHTML = old; busy.disabled = false; }
  }
  mainName(C) {
    if (this.item.contract && C.contracts[this.item.contract]) return this.item.contract;
    const own = Object.entries(C.contracts).filter(([, c]) => c.file === this.file && c.bytecode);
    return own.length ? own[own.length - 1][0] : Object.keys(C.contracts)[0];
  }
  async deploy() {
    const C = await this.build(); if (!C || C.unavailable) return;
    this.env = new PS.solTest.Env(C.contracts); this.main = this.mainName(C);
    const ctor = (C.contracts[this.main].abi.find((x) => x.type === 'constructor') || { inputs: [] }).inputs;
    if (ctor.length && !this.item.deployArgs) { this.log(`${PS.esc(this.main)} heeft constructor-argumenten: vul ze in bij “Contract”.`, 'log-info'); this.pendingCtor = ctor; this.show('contract'); return; }
    this.doDeploy(this.item.deployArgs || []);
  }
  doDeploy(args) {
    const r = this.env.deploy(this.main, args, { as: 'deployer' });
    if (!r.success) { this.log(`✗ Deploy mislukt: ${PS.esc(r.error)}`, 'log-err'); this.show('console'); return; }
    this.pendingCtor = null; this.lastTx = r;
    this.log(`🚀 ${PS.esc(this.main)} gedeployed op ${r.created.slice(0, 10)}… · ${r.gasUsed.toLocaleString('nl-BE')} gas (benadering)`, 'log-ok');
    this.show('contract');
  }
  async runTests() {
    const C = await this.build();
    if (!C) { this.testsHtml = `<div class="log-err">Compilatiefout — zie Console.</div>`; this.show('console'); return { tests: (this.item.tests || []).map((t) => ({ name: t.name, ok: false, detail: 'compileert niet' })), code: this.code() }; }
    if (C.unavailable) return { error: 'compiler-unavailable', message: C.message, tests: [] };
    const main = this.mainName(C);
    const results = (this.item.tests || []).map((t) => PS.solTest.runTest(C.contracts, t, this.code(), main));
    this.renderTests(results);
    this.show('tests');
    const pass = results.filter((r) => r.ok).length;
    this.log(`${pass === results.length ? '✓' : '✗'} Tests: ${pass}/${results.length} geslaagd`, pass === results.length ? 'log-ok' : 'log-err');
    return { tests: results, code: this.code() };
  }
  renderTests(results) {
    const tests = this.item.tests || [];
    this.testsHtml = tests.map((t, i) => {
      const r = results && results[i];
      return `<div class="test-row"><span class="${r ? (r.ok ? 'log-ok' : 'log-err') : 'log-dim'}">${r ? (r.ok ? '✓' : '✗') : '○'}</span><div><div>${PS.esc(t.name)}</div>${r && !r.ok ? `<div class="d log-err">${PS.esc(r.detail)}</div>` : ''}${r && r.ok && r.steps && r.steps.length ? `<div class="d">${r.steps.map(PS.esc).join('<br>')}</div>` : ''}</div></div>`;
    }).join('');
    if (this.tab === 'tests') this.show('tests');
  }
  /* ---------- interact with the deployed contract ---------- */
  renderContract(p) {
    if (this.pendingCtor) {
      p.innerHTML = `<div class="fn-row"><span class="log-info">constructor</span>${this.pendingCtor.map((inp, i) => `<input data-ctor="${i}" placeholder="${PS.attr(inp.name || 'arg')} (${PS.attr(inp.type)})">`).join('')}<button type="button" class="fn-btn tx" data-ctor-go>deploy</button></div>`;
      PS.$('[data-ctor-go]', p).onclick = () => this.doDeploy(PS.$$('[data-ctor]', p).map((x) => x.value));
      return;
    }
    if (!this.env || !this.env.last) { p.innerHTML = '<span class="log-dim">Deploy eerst je contract.</span>'; return; }
    const T = this.env.target(); const fns = T.abi.filter((x) => x.type === 'function');
    const acc = Object.keys(PS.ACCOUNTS);
    p.innerHTML = `<div class="fn-row"><span class="log-dim">account</span><select data-as>${acc.map((a) => `<option value="${a}" ${a === (this.as || 'deployer') ? 'selected' : ''}>${a} · ${PS.fmtEther(this.env.w.balance(PS.ACCOUNTS[a]))} ETH</option>`).join('')}</select><span class="log-dim">value</span><input data-value placeholder="0 of 1 ether" value="${PS.attr(this.value || '')}" style="max-width:130px"></div>
      <div class="log-dim" style="padding:6px 0">${PS.esc(T.name)} @ ${T.address.slice(0, 10)}… · saldo ${PS.fmtEther(this.env.w.balance(T.address))} ETH</div>
      ${fns.map((f, i) => { const cls = f.stateMutability === 'view' || f.stateMutability === 'pure' ? 'view' : f.stateMutability === 'payable' ? 'pay' : 'tx'; return `<div class="fn-row"><button type="button" class="fn-btn ${cls}" data-fn="${i}">${PS.esc(f.name)}</button>${(f.inputs || []).map((inp, j) => `<input data-arg="${i}-${j}" placeholder="${PS.attr(inp.name || 'arg')} (${PS.attr(inp.type)})">`).join('')}<span class="fn-out" data-out="${i}"></span></div>`; }).join('')}`;
    PS.$('[data-as]', p).onchange = (e) => { this.as = e.target.value; };
    PS.$('[data-value]', p).oninput = (e) => { this.value = e.target.value; };
    PS.$$('[data-fn]', p).forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.fn); const f = fns[i];
      const args = (f.inputs || []).map((_, j) => PS.$(`[data-arg="${i}-${j}"]`, p).value);
      const missing = (f.inputs || []).findIndex((inp, j) => inp.type !== 'string' && !String(args[j]).trim());
      if (missing >= 0) { PS.$(`[data-out="${i}"]`, p).innerHTML = `<span class="log-warn">vul ${PS.esc(f.inputs[missing].name || 'een waarde')} in</span>`; PS.$(`[data-arg="${i}-${missing}"]`, p).focus(); return; }
      let r;
      try { r = this.env.call(f.name, args, { as: this.as || 'deployer', value: f.stateMutability === 'payable' && this.value ? this.value : undefined }); }
      catch (e) { PS.$(`[data-out="${i}"]`, p).innerHTML = `<span class="log-err">${PS.esc(e.message)}</span>`; return; }
      const out = PS.$(`[data-out="${i}"]`, p);
      if (!r.success) { out.innerHTML = `<span class="log-err">revert: ${PS.esc(r.error)}</span>`; this.log(`✗ ${PS.esc(f.name)} → ${PS.esc(r.error)}`, 'log-err'); return; }
      this.lastTx = r;
      const ret = (r.decoded || []).map(PS.fmtVal).join(', ');
      out.innerHTML = r.view ? `→ ${PS.esc(ret || '(geen)')}` : `✓ ${r.gasUsed.toLocaleString('nl-BE')} gas${ret ? ` → ${PS.esc(ret)}` : ''}`;
      if (!r.view) {
        this.log(`⚡ ${PS.esc(this.as || 'deployer')} → ${PS.esc(f.name)}(${args.map(PS.esc).join(', ')}) · ${r.gasUsed.toLocaleString('nl-BE')} gas`, 'log-info');
        (r.events || []).forEach((ev) => this.log(`   ↳ event ${PS.esc(ev.name)}(${Object.entries(ev.args).map(([k, v]) => `${PS.esc(k)}: ${PS.esc(PS.fmtVal(v))}`).join(', ')})`, 'log-ok'));
        (r.sstores || []).forEach((s) => this.log(`   ↳ SSTORE slot ${PS.esc(this.slotLabel(s.slot))}: ${PS.esc(PS.fmtWord(s.from))} → ${PS.esc(PS.fmtWord(s.to))}`, 'log-dim'));
        const nested = (r.calls || []).filter((c) => c.depth > 0);
        if (nested.length) this.log(`   ↳ ${nested.length} interne call(s): ${nested.slice(0, 6).map((c) => `${'  '.repeat(c.depth)}${c.kind} ${PS.accountName(c.to)}${c.value ? ` (${PS.fmtEther(c.value)} ETH)` : ''}`).join(' · ')}`, 'log-warn');
        this.renderContract(p);
      }
    }));
  }
  /* ---------- storage slots, labelled with solc's storageLayout ---------- */
  layout() { const C = this.compiled && this.compiled.contracts[this.env && this.env.byAddr[this.env.target().address.toLowerCase()]]; return C && C.storageLayout; }
  slotLabel(slot) {
    const L = this.layout(); const hex = slot.toString(16);
    if (L) {
      const vars = L.storage.filter((v) => BigInt(v.slot) === slot);
      if (vars.length) return `${slot} (${vars.map((v) => v.label).join(' + ')})`;
      const pre = this.env.w.preimages.get(hex);
      if (pre && pre.length === 64) {
        const key = PS.bytesToBig(pre.slice(0, 32)); const base = PS.bytesToBig(pre.slice(32));
        const v = L.storage.find((x) => BigInt(x.slot) === base);
        const keyTxt = key < 2n ** 160n && key > 2n ** 100n ? PS.accountName('0x' + key.toString(16).padStart(40, '0')) : key.toString();
        if (v) return `keccak(${keyTxt} . ${base}) = ${v.label}[${keyTxt}]`;
        const inner = this.slotLabel(base);
        return `${inner.split('=').pop().trim()}[${keyTxt}]`;
      }
      if (pre && pre.length === 32) { const base = PS.bytesToBig(pre); const v = L.storage.find((x) => BigInt(x.slot) === base); if (v) return `keccak(${base}) → ${v.label}: data`; }
      for (const v of L.storage) {
        const t = L.types[v.type]; if (!t || !(t.encoding === 'dynamic_array' || t.encoding === 'bytes')) continue;
        const start = PS.bytesToBig(PS.keccak(PS.bigToBytes(BigInt(v.slot)))); if (slot >= start && slot < start + 1000n) return `${v.label}[${slot - start}] (keccak(${v.slot}) + ${slot - start})`;
      }
    }
    return slot < 1000n ? String(slot) : '0x' + hex.slice(0, 8) + '…';
  }
  renderStorage(p) {
    if (!this.env || !this.env.last) { p.innerHTML = '<span class="log-dim">Deploy eerst je contract.</span>'; return; }
    const T = this.env.target(); const S = this.env.w.storageOf(T.address); const L = this.layout();
    const hot = new Set(((this.lastTx && this.lastTx.sstores) || []).map((s) => s.slot.toString(16)));
    const slots = new Map();
    if (L) L.storage.forEach((v) => { const k = BigInt(v.slot).toString(16); if (!slots.has(k)) slots.set(k, []); slots.get(k).push(v); });
    for (const k of S.keys()) if (!slots.has(k)) slots.set(k, []);
    const keys = [...slots.keys()].sort((a, b) => (BigInt('0x' + a) < BigInt('0x' + b) ? -1 : 1));
    const palette = ['b1', 'b2', 'b3', 'b4'];
    p.innerHTML = `<div class="log-dim" style="margin-bottom:8px">Elke slot = 32 bytes. Kleine variabelen worden van rechts naar links in één slot “gepakt”. Mappings en arrays staan op keccak256-adressen.</div><div class="slots">${keys.map((k) => {
      const vars = slots.get(k); const val = S.get(k) || 0n; const bytes = PS.bigToBytes(val);
      const owner = new Array(32).fill(-1);
      vars.forEach((v, vi) => { const size = Number((L.types[v.type] || {}).numberOfBytes || 32); for (let b = 0; b < size && b < 32; b++) owner[31 - v.offset - b] = vi; });
      const bar = bytes.length ? Array.from(bytes, (x, i) => `<span class="${owner[i] >= 0 ? palette[owner[i] % 4] : ''}" style="opacity:${x ? 1 : 0.35}" title="byte ${31 - i}"></span>`).join('') : '';
      const label = vars.length ? vars.map((v, vi) => `<span class="lbl" style="border-bottom:2px solid ${['#7dd3fc', '#fda4af', '#fde68a', '#a7f3d0'][vi % 4]}">${PS.esc(v.label)}</span> <span class="log-dim">${PS.esc((L.types[v.type] || {}).label || '')}${vars.length > 1 ? ` · offset ${v.offset}` : ''}</span>`).join(' &nbsp; ') : `<span class="lbl">${PS.esc(this.slotLabel(BigInt('0x' + k)))}</span>`;
      return `<div class="slot ${hot.has(k) ? 'hot' : ''}"><div class="k">slot ${BigInt('0x' + k) < 100000n ? BigInt('0x' + k).toString() : '0x' + k.slice(0, 6) + '…'}</div><div>${label}<div class="val">0x${val.toString(16).padStart(64, '0').replace(/^(0+)/, '<span class="log-dim">$1</span>')}</div><div class="bytes">${bar}</div></div></div>`;
    }).join('')}</div>`;
  }
};
