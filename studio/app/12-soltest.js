/* Polyglot Studio v2 — declarative Solidity test runner (browser + node).
   Test = { name, source?: {contains|notContains|matches|notMatches}, steps?: [...] }
   Steps:
     { deploy: "Bank", args?, as?, value?, alias?, reverts? }
     { call: "deposit", on?, args?, as?, value?, reverts?, returns?, emits?, gasLt?, tx? }
     { expect: { call: "balances", on?, args?, eq|ne|gt|gte|lt|lte } }
     { expect: { balance: "alice" | "$bank", eq|… } }
     { expect: { slot: 0, on?, eq|… } }            raw storage word
     { expect: { slotsUsed: "bank", eq|lte|… } }    number of non-zero slots
     { fund: "alice", value: "10 ether" }  { warp: 3600 }  { roll: 5 }
   Values: 42 · "1 ether" · "2.5 gwei" · "alice" · "$bank" (address of alias) · true · "tekst" · [1,2] */
'use strict';
(function (PS) {
  const low = (a) => String(a).toLowerCase();
  const CMP = { eq: (a, b) => a === b, ne: (a, b) => a !== b, gt: (a, b) => a > b, gte: (a, b) => a >= b, lt: (a, b) => a < b, lte: (a, b) => a <= b };
  const CMP_NL = { eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤' };

  function normVal(v) {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)) return low(v);
    if (Array.isArray(v)) return JSON.stringify(v.map((x) => String(normVal(x))));
    return v;
  }
  const show = (v) => (typeof v === 'bigint' ? PS.fmtVal(v) : typeof v === 'string' && /^0x[0-9a-f]{40}$/i.test(v) ? PS.accountName(v) : JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? x.toString() : x)));

  class Env {
    constructor(compiled) {
      this.evm = new PS.EVM(); this.w = this.evm.w;
      this.contracts = compiled; this.refs = {}; this.byAddr = {}; this.log = [];
      Object.values(PS.ACCOUNTS).forEach((a) => this.w.fund(a, 100n * 10n ** 18n));
      PS.contractNames = PS.contractNames || {};
    }
    addr(ref) {
      if (ref == null) return null;
      const s = String(ref);
      if (PS.ACCOUNTS[s.toLowerCase()]) return PS.ACCOUNTS[s.toLowerCase()];
      if (s.startsWith('$') && this.refs[s.slice(1)]) return this.refs[s.slice(1)];
      if (this.refs[s]) return this.refs[s];
      if (/^0x[0-9a-fA-F]{40}$/.test(s)) return s;
      throw new Error(`Onbekend adres of alias "${s}"`);
    }
    target(on) {
      const key = on || this.last;
      if (!key) throw new Error('Nog geen contract gedeployed');
      const a = this.addr(key); const name = this.byAddr[low(a)];
      if (!name) throw new Error(`"${key}" is geen gedeployed contract`);
      return { address: a, name, abi: this.contracts[name].abi };
    }
    fn(abi, name, args) {
      const cands = abi.filter((x) => x.type === 'function' && x.name === name);
      if (!cands.length) throw new Error(`Functie "${name}" bestaat niet (of is niet public/external)`);
      return cands.find((f) => (f.inputs || []).length === (args || []).length) || cands[0];
    }
    deploy(name, args = [], o = {}) {
      const C = this.contracts[name]; if (!C) throw new Error(`Contract "${name}" niet gevonden in de compilatie`);
      if (!C.bytecode || C.bytecode === '0x') throw new Error(`"${name}" is abstract of een interface — kan niet deployen`);
      const ctor = C.abi.find((x) => x.type === 'constructor') || { inputs: [] };
      const vals = (ctor.inputs || []).map((inp, i) => PS.parseArg(args[i], inp.type, this.refs));
      const data = PS.concat(PS.fromHex(C.bytecode), PS.abi.encodeParams(ctor.inputs || [], vals));
      const res = this.evm.transact({ from: this.addr(o.as || 'deployer'), value: o.value != null ? PS.parseArg(String(o.value), 'uint256') : 0n, data });
      if (res.success) {
        const alias = o.alias || name;
        this.refs[alias] = res.created; this.refs[name] = this.refs[name] || res.created; this.byAddr[low(res.created)] = name; this.last = alias;
        PS.contractNames[low(res.created)] = alias;
      }
      res.error = res.success ? null : this.errText(C.abi, res);
      return res;
    }
    call(fnName, args = [], o = {}) {
      const T = this.target(o.on);
      const f = this.fn(T.abi, fnName, args);
      const vals = (f.inputs || []).map((inp, i) => PS.parseArg(args[i], inp.type, this.refs));
      const data = PS.abi.encodeCall(f, vals);
      const view = (f.stateMutability === 'view' || f.stateMutability === 'pure') && !o.tx;
      const from = this.addr(o.as || 'deployer');
      const value = o.value != null ? PS.parseArg(String(o.value), 'uint256') : 0n;
      const res = view ? this.evm.staticCall({ from, to: T.address, data }) : this.evm.transact({ from, to: T.address, value, data });
      res.fn = f; res.view = view; res.target = T;
      if (res.success) { try { res.decoded = PS.abi.decodeOutputs(f, res.returnData); } catch (e) { res.decoded = []; } }
      else res.error = this.errText(T.abi, res);
      res.events = (res.logs || []).map((l) => { const addrName = this.byAddr[low(l.address)]; return PS.abi.decodeLog(addrName ? this.contracts[addrName].abi : T.abi, l) || { name: '(onbekend event)', args: {} }; });
      return res;
    }
    errText(abi, res) {
      const all = Object.values(this.contracts).flatMap((c) => c.abi || []);
      const d = PS.abi.decodeError(all.length ? all : abi, res.returnData);
      if (d && d.message) return d.message;
      if (d && d.name === 'onbekend' && res.returnData && res.returnData.length === 0) return res.error === 'revert' ? 'revert zonder reden' : res.error || 'revert';
      return res.error === 'revert' ? 'revert zonder reden' : res.error || 'mislukt';
    }
  }

  function expectRevert(res, want) {
    if (res.success) return `verwacht een revert, maar de transactie slaagde`;
    if (want === true || want == null) return null;
    const txt = String(res.error || '');
    return txt.toLowerCase().includes(String(want).toLowerCase()) ? null : `verwacht revert "${want}", kreeg "${txt}"`;
  }
  function checkEmits(env, res, want) {
    const list = Array.isArray(want) ? want : [want];
    for (const w of list) {
      const ev = (res.events || []).find((e) => e.name === w.name);
      if (!ev) return `event ${w.name} werd niet uitgestoten${res.events && res.events.length ? ` (wel: ${res.events.map((e) => e.name).join(', ')})` : ''}`;
      for (const [k, v] of Object.entries(w.args || {})) {
        const got = ev.args[k]; if (got === undefined) return `event ${w.name} heeft geen argument "${k}"`;
        const exp = typeof got === 'bigint' ? PS.parseArg(String(v), 'uint256', env.refs) : typeof got === 'boolean' ? v === true || v === 'true' : /^0x[0-9a-f]{40}$/i.test(String(got)) ? low(env.addr(v)) : v;
        if (normVal(got) !== normVal(exp)) return `event ${w.name}.${k}: verwacht ${show(exp)}, kreeg ${show(got)}`;
      }
    }
    return null;
  }
  function compare(got, spec, type, env) {
    for (const op of Object.keys(CMP)) {
      if (!(op in spec)) continue;
      const exp = typeof got === 'bigint' ? PS.parseArg(String(spec[op]), type && /^int/.test(type) ? 'int256' : 'uint256', env.refs) : typeof got === 'boolean' ? spec[op] === true || spec[op] === 'true' : typeof got === 'string' && /^0x[0-9a-f]{40}$/i.test(got) ? low(env.addr(spec[op])) : spec[op];
      const ok = typeof got === 'bigint' || typeof got === 'boolean' ? CMP[op](got, exp) : CMP[op](normVal(got), normVal(exp));
      if (!ok) return `verwacht ${CMP_NL[op]} ${show(exp)}, kreeg ${show(got)}`;
    }
    return null;
  }

  function stripComments(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); }

  function runTest(compiled, test, source, mainContract) {
    const out = { name: test.name, ok: true, detail: '', steps: [] };
    try {
      if (test.source) {
        const src = stripComments(source); const s = test.source;
        if (s.contains && !src.includes(s.contains)) throw new Error(`je code bevat "${s.contains}" niet`);
        if (s.notContains && src.includes(s.notContains)) throw new Error(`je code mag "${s.notContains}" niet bevatten`);
        if (s.matches && !new RegExp(s.matches, 'm').test(src)) throw new Error(s.hint || `patroon niet gevonden: ${s.matches}`);
        if (s.notMatches && new RegExp(s.notMatches, 'm').test(src)) throw new Error(s.hint || `ongewenst patroon gevonden: ${s.notMatches}`);
      }
      if (!test.steps || !test.steps.length) return out;
      const env = new Env(compiled);
      const steps = test.steps.some((s) => s.deploy) ? test.steps : [{ deploy: mainContract }].concat(test.steps);
      for (const st of steps) {
        if (st.deploy) {
          const r = env.deploy(st.deploy, st.args || [], st);
          if (st.reverts != null && st.reverts !== false) { const e = expectRevert(r, st.reverts); if (e) throw new Error(`deploy ${st.deploy}: ${e}`); continue; }
          if (!r.success) throw new Error(`deploy ${st.deploy} faalde: ${r.error}`);
          out.steps.push(`deploy ${st.deploy} → ${r.created.slice(0, 10)}… (${r.gasUsed.toLocaleString('nl-BE')} gas)`);
        } else if (st.call) {
          const r = env.call(st.call, st.args || [], st);
          const label = `${st.as || 'deployer'} → ${st.call}(${(st.args || []).join(', ')})${st.value ? ` {value: ${st.value}}` : ''}`;
          if (st.reverts != null && st.reverts !== false) { const e = expectRevert(r, st.reverts); if (e) throw new Error(`${label}: ${e}`); out.steps.push(`${label} → revert ✓ (${r.error})`); continue; }
          if (!r.success) throw new Error(`${label} faalde onverwacht: ${r.error}`);
          if (st.returns !== undefined) {
            const exp = Array.isArray(st.returns) ? st.returns : [st.returns];
            for (let i = 0; i < exp.length; i++) { const e = compare(r.decoded[i], { eq: exp[i] }, (r.fn.outputs[i] || {}).type, env); if (e) throw new Error(`${label} return: ${e}`); }
          }
          if (st.emits) { const e = checkEmits(env, r, st.emits); if (e) throw new Error(`${label}: ${e}`); }
          if (st.gasLt != null && r.gasUsed >= st.gasLt) throw new Error(`${label}: ${r.gasUsed.toLocaleString('nl-BE')} gas (moet < ${Number(st.gasLt).toLocaleString('nl-BE')})`);
          if (st.save) env.refs[st.save] = r.decoded && r.decoded[0];
          out.steps.push(`${label} ✓ (${r.view ? 'view' : r.gasUsed.toLocaleString('nl-BE') + ' gas'})`);
        } else if (st.expect) {
          const x = st.expect;
          if (x.call) {
            const r = env.call(x.call, x.args || [], { on: x.on, as: x.as });
            if (!r.success) throw new Error(`${x.call}(${(x.args || []).join(', ')}) faalde: ${r.error}`);
            const e = compare(r.decoded[x.index || 0], x, (r.fn.outputs[x.index || 0] || {}).type, env);
            if (e) throw new Error(`${x.call}(${(x.args || []).join(', ')}): ${e}`);
          } else if (x.balance) {
            const e = compare(env.w.balance(env.addr(x.balance)), x, 'uint256', env);
            if (e) throw new Error(`saldo van ${x.balance}: ${e}`);
          } else if (x.slot != null) {
            const T = env.target(x.on); const v = env.w.storageOf(T.address).get(BigInt(x.slot).toString(16)) || 0n;
            const e = compare(v, x, 'uint256', env); if (e) throw new Error(`storage slot ${x.slot}: ${e}`);
          } else if (x.slotsUsed) {
            const T = env.target(x.slotsUsed === true ? null : x.slotsUsed); const n = BigInt(env.w.storageOf(T.address).size);
            const e = compare(n, x, 'uint256', env); if (e) throw new Error(`aantal gebruikte storage-slots: ${e}`);
          }
        } else if (st.fund) env.w.fund(env.addr(st.fund), PS.parseArg(String(st.value), 'uint256'));
        else if (st.warp) env.w.block.timestamp += BigInt(st.warp);
        else if (st.roll) env.w.block.number += BigInt(st.roll);
      }
    } catch (e) { out.ok = false; out.detail = e.message; }
    return out;
  }

  /* Parse solc standard-JSON output into {name: {abi, bytecode, storageLayout}} */
  function collect(output) {
    const res = {}; const errors = []; const warnings = [];
    (output.errors || []).forEach((e) => (e.severity === 'error' ? errors : warnings).push(e.formattedMessage || e.message));
    for (const file of Object.keys(output.contracts || {})) for (const [name, c] of Object.entries(output.contracts[file])) {
      res[name] = { abi: c.abi || [], bytecode: c.evm && c.evm.bytecode ? c.evm.bytecode.object : '', deployed: c.evm && c.evm.deployedBytecode ? c.evm.deployedBytecode.object : '', storageLayout: c.storageLayout || null, file };
    }
    return { contracts: res, errors, warnings };
  }
  function input(sources) {
    return { language: 'Solidity', sources: Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, { content: v }])), settings: { optimizer: { enabled: false, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'storageLayout'] } } } };
  }
  PS.solTest = { Env, runTest, collect, input, stripComments };
})(typeof PS !== 'undefined' ? PS : (globalThis.PS = globalThis.PS || {}));
