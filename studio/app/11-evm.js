/* Polyglot Studio v2 — a compact, educational EVM (Cancun rules, gas price 0).
   Runs real solc bytecode: storage, memory, calls, creates, reverts, events, transient storage.
   Gas follows EIP-150/2200/2929/3529/3860 closely enough to compare designs (labelled "benadering"). */
'use strict';
(function (PS) {
  const T256 = 1n << 256n, MAX = T256 - 1n, SIGN = 1n << 255n, A160 = (1n << 160n) - 1n;
  const u = (x) => ((x % T256) + T256) % T256;
  const sg = (x) => (x >= SIGN ? x - T256 : x);
  const ah = (b) => '0x' + (BigInt(b) & A160).toString(16).padStart(40, '0');
  const low = (a) => String(a).toLowerCase();
  const words = (n) => Math.ceil(n / 32);
  const EMPTY = new Uint8Array(0);
  const EMPTY_HASH = BigInt('0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');

  class Halt extends Error { constructor(msg, kind = 'error') { super(msg); this.kind = kind; } }

  class World {
    constructor() {
      this.acc = new Map();
      this.block = { number: 19000000n, timestamp: 1790000000n, coinbase: '0x0000000000000000000000000000000000000c0b', gaslimit: 30000000n, basefee: 0n, chainid: 31337n, prevrandao: 0x1234n };
      this.preimages = new Map();
    }
    get(a) { a = low(a); let x = this.acc.get(a); if (!x) { x = { nonce: 0n, balance: 0n, code: EMPTY, storage: new Map() }; this.acc.set(a, x); } return x; }
    peek(a) { return this.acc.get(low(a)); }
    empty(a) { const x = this.peek(a); return !x || (x.nonce === 0n && x.balance === 0n && x.code.length === 0); }
    snapshot() { const m = new Map(); for (const [k, v] of this.acc) m.set(k, { nonce: v.nonce, balance: v.balance, code: v.code, storage: new Map(v.storage) }); return m; }
    restore(m) { this.acc = m; }
    fund(a, wei) { this.get(a).balance += BigInt(wei); }
    balance(a) { const x = this.peek(a); return x ? x.balance : 0n; }
    storageOf(a) { const x = this.peek(a); return x ? x.storage : new Map(); }
  }

  const jdCache = new WeakMap();
  function jumpdests(code) {
    let s = jdCache.get(code); if (s) return s;
    s = new Set();
    for (let i = 0; i < code.length; i++) { const op = code[i]; if (op === 0x5b) s.add(i); else if (op >= 0x60 && op <= 0x7f) i += op - 0x5f; }
    jdCache.set(code, s); return s;
  }

  function sha256(bytes) {
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const l = bytes.length; const p = new Uint8Array(((l + 9 + 63) >> 6) << 6); p.set(bytes); p[l] = 0x80;
    const dv = new DataView(p.buffer); dv.setUint32(p.length - 4, (l * 8) >>> 0); dv.setUint32(p.length - 8, Math.floor(l * 8 / 2 ** 32));
    const W = new Uint32Array(64);
    for (let o = 0; o < p.length; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) { const a = W[i - 15], b = W[i - 2]; W[i] = (W[i - 16] + (((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) + W[i - 7] + (((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10))) >>> 0; }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) { const t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0; const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0; h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0; }
      H = [H[0] + a, H[1] + b, H[2] + c, H[3] + d, H[4] + e, H[5] + f, H[6] + g, H[7] + h].map((x) => x >>> 0);
    }
    const out = new Uint8Array(32); const odv = new DataView(out.buffer); H.forEach((x, i) => odv.setUint32(i * 4, x)); return out;
  }

  class EVM {
    constructor(world) { this.w = world || new World(); }

    /* ---------------- transactions ---------------- */
    transact({ from, to = null, value = 0n, data = EMPTY, gasLimit = 30000000 }) {
      const w = this.w; value = BigInt(value); from = low(from);
      const create = !to;
      let intrinsic = 21000; for (const b of data) intrinsic += b ? 16 : 4;
      if (create) intrinsic += 32000 + 2 * words(data.length);
      const res = { success: false, gasUsed: intrinsic, returnData: EMPTY, logs: [], sstores: [], calls: [], gasBy: {}, error: null, created: null };
      if (gasLimit < intrinsic) { res.error = 'intrinsieke gas hoger dan gaslimit'; return res; }
      const sender = w.get(from);
      if (sender.balance < value) { res.error = 'onvoldoende saldo voor value'; return res; }
      const tx = this.tx = { origin: from, warmA: new Set([from, low(w.block.coinbase), ...Array.from({ length: 10 }, (_, i) => ah(BigInt(i + 1)))]), warmS: new Set(), orig: new Map(), refund: 0, logs: [], sstores: [], calls: [], transient: new Map(), created: new Set(), gasBy: {} };
      const snap = w.snapshot();
      const nonce = sender.nonce;
      let r;
      if (create) {
        const addr = PS.createAddress(from, nonce);
        sender.nonce += 1n;
        tx.warmA.add(low(addr));
        r = this.create({ caller: from, address: addr, value, code: data, gas: gasLimit - intrinsic, depth: 0 });
        if (r.success) res.created = PS.toChecksum(addr);
      } else {
        sender.nonce += 1n;
        tx.warmA.add(low(to));
        r = this.call({ caller: from, to: low(to), code: low(to), value, data, gas: gasLimit - intrinsic, depth: 0, isStatic: false, kind: 'CALL' });
      }
      let used = gasLimit - r.gasLeft;
      if (r.success) used -= Math.min(tx.refund, Math.floor(used / 5));
      else { w.restore(snap); w.get(from).nonce = nonce + 1n; }
      Object.assign(res, { success: r.success, gasUsed: used, returnData: r.returnData || EMPTY, logs: r.success ? tx.logs : [], sstores: r.success ? tx.sstores : [], calls: tx.calls, gasBy: tx.gasBy, error: r.error || null });
      this.tx = null;
      return res;
    }
    /* eth_call: run without committing anything */
    staticCall({ from = PS.ACCOUNTS.deployer, to, data }) {
      const snap = this.w.snapshot(); const n = this.w.get(from).nonce;
      const r = this.transact({ from, to, data, value: 0n });
      this.w.restore(snap); this.w.get(from).nonce = n;
      return r;
    }

    /* ---------------- frames ---------------- */
    call(m) {
      const w = this.w; const tx = this.tx;
      if (m.depth > 1024) return { success: false, gasLeft: m.gas, returnData: EMPTY, error: 'call depth > 1024' };
      const snap = w.snapshot(); const tSnap = new Map(tx.transient); const logN = tx.logs.length, sN = tx.sstores.length, refund = tx.refund, wa = new Set(tx.warmA), ws = new Set(tx.warmS);
      const rec = { depth: m.depth, kind: m.kind, from: m.caller, to: m.to, value: m.value, selector: m.data.length >= 4 ? PS.hex(m.data.slice(0, 4)) : '', success: true };
      tx.calls.push(rec);
      if (m.kind === 'CALL' || m.kind === 'CALLCODE') {
        if (m.value > 0n) {
          const from = w.get(m.caller);
          if (from.balance < m.value) { rec.success = false; return { success: false, gasLeft: m.gas, returnData: EMPTY, error: 'onvoldoende saldo' }; }
          from.balance -= m.value; w.get(m.to).balance += m.value;
        } else w.get(m.to);
      }
      const pre = this.precompile(m);
      let r;
      if (pre) r = pre;
      else {
        const code = (w.peek(m.code) || {}).code || EMPTY;
        r = code.length ? this.run(code, m) : { success: true, gasLeft: m.gas, returnData: EMPTY };
      }
      if (!r.success) { w.restore(snap); tx.transient = tSnap; tx.logs.length = logN; tx.sstores.length = sN; tx.refund = refund; tx.warmA = wa; tx.warmS = ws; rec.success = false; rec.error = r.error; }
      rec.gasUsed = m.gas - r.gasLeft;
      return r;
    }
    create(m) {
      const w = this.w; const tx = this.tx; const addr = low(m.address);
      const ex = w.peek(addr);
      if (ex && (ex.code.length || ex.nonce > 0n)) return { success: false, gasLeft: 0, returnData: EMPTY, error: 'adresconflict bij CREATE' };
      const snap = w.snapshot(); const logN = tx.logs.length, sN = tx.sstores.length, refund = tx.refund;
      const rec = { depth: m.depth, kind: m.kind || 'CREATE', from: m.caller, to: addr, value: m.value, selector: '', success: true };
      tx.calls.push(rec);
      const from = w.get(m.caller);
      if (from.balance < m.value) { rec.success = false; return { success: false, gasLeft: m.gas, returnData: EMPTY, error: 'onvoldoende saldo' }; }
      from.balance -= m.value;
      const acct = w.get(addr); acct.nonce = 1n; acct.balance += m.value; acct.code = EMPTY; acct.storage = new Map();
      tx.created.add(addr);
      let r = this.run(m.code, { caller: m.caller, to: addr, code: addr, value: m.value, data: EMPTY, gas: m.gas, depth: m.depth, isStatic: false, kind: 'CREATE', initcode: m.code });
      if (r.success) {
        const code = r.returnData; const deposit = 200 * code.length;
        if (code.length > 24576) r = { success: false, gasLeft: 0, returnData: EMPTY, error: 'contract te groot (> 24 KB, EIP-170)' };
        else if (code.length && code[0] === 0xef) r = { success: false, gasLeft: 0, returnData: EMPTY, error: 'code begint met 0xEF (EIP-3541)' };
        else if (r.gasLeft < deposit) r = { success: false, gasLeft: 0, returnData: EMPTY, error: 'out of gas (code deposit)' };
        else { r.gasLeft -= deposit; w.get(addr).code = code; r.returnData = EMPTY; this.bump('code-deposit', deposit); }
      }
      if (!r.success) { w.restore(snap); tx.logs.length = logN; tx.sstores.length = sN; tx.refund = refund; rec.success = false; rec.error = r.error; }
      rec.gasUsed = m.gas - r.gasLeft;
      return r;
    }
    precompile(m) {
      const a = BigInt(m.code);
      if (a < 1n || a > 10n) return null;
      const d = m.data; const n = Number(a);
      if (n === 2) { const cost = 60 + 12 * words(d.length); return m.gas < cost ? { success: false, gasLeft: 0, returnData: EMPTY, error: 'out of gas' } : { success: true, gasLeft: m.gas - cost, returnData: sha256(d) }; }
      if (n === 4) { const cost = 15 + 3 * words(d.length); return m.gas < cost ? { success: false, gasLeft: 0, returnData: EMPTY, error: 'out of gas' } : { success: true, gasLeft: m.gas - cost, returnData: d.slice() }; }
      if (n === 1) return { success: true, gasLeft: Math.max(0, m.gas - 3000), returnData: EMPTY, note: 'ecrecover niet ondersteund in de simulator' };
      return { success: false, gasLeft: 0, returnData: EMPTY, error: `precompile 0x${n.toString(16)} niet ondersteund in de simulator` };
    }
    bump(cat, g) { const t = this.tx; if (t) t.gasBy[cat] = (t.gasBy[cat] || 0) + g; }

    /* ---------------- interpreter ---------------- */
    run(code, m) {
      const w = this.w, tx = this.tx, self = this;
      const JD = jumpdests(code);
      const st = []; let pc = 0; let gas = m.gas; let mem = new Uint8Array(1024); let memWords = 0; let rdata = EMPTY;
      const me = low(m.to);
      const use = (g, cat = 'rekenen') => { gas -= g; if (gas < 0) throw new Halt('out of gas', 'oog'); self.bump(cat, g); };
      const pop = () => { if (!st.length) throw new Halt('stack underflow'); return st.pop(); };
      const push = (v) => { if (st.length >= 1024) throw new Halt('stack overflow'); st.push(v); };
      const memCost = (wds) => 3 * wds + Math.floor((wds * wds) / 512);
      const expand = (off, size) => {
        if (size === 0n || size === 0) return;
        const end = Number(off) + Number(size);
        if (!Number.isSafeInteger(end) || end > 0x7fffffff) throw new Halt('out of gas (geheugen)', 'oog');
        const nw = words(end);
        if (nw > memWords) {
          use(memCost(nw) - memCost(memWords), 'geheugen'); memWords = nw;
          if (nw * 32 > mem.length) { let cap = mem.length; while (cap < nw * 32) cap *= 2; const n = new Uint8Array(cap); n.set(mem); mem = n; }
        }
      };
      const mread = (off, size) => { const o = Number(off), s = Number(size); return s === 0 ? EMPTY : mem.slice(o, o + s); };
      const toBig = (bytes) => PS.bytesToBig(bytes);
      const access = (a) => { a = low(a); if (tx.warmA.has(a)) return 100; tx.warmA.add(a); return 2600; };
      const slotKey = (slot) => `${me}:${slot.toString(16)}`;
      const sload = (slot) => { const v = w.get(me).storage.get(slot.toString(16)); return v || 0n; };
      const touchOrig = (k, v) => { if (!tx.orig.has(k)) tx.orig.set(k, v); };
      try {
        while (pc < code.length) {
          const op = code[pc];
          switch (op) {
            case 0x00: return { success: true, gasLeft: gas, returnData: EMPTY };
            case 0x01: use(3); push(u(pop() + pop())); break;
            case 0x02: use(5); push(u(pop() * pop())); break;
            case 0x03: { use(3); const a = pop(), b = pop(); push(u(a - b)); break; }
            case 0x04: { use(5); const a = pop(), b = pop(); push(b === 0n ? 0n : a / b); break; }
            case 0x05: { use(5); const a = sg(pop()), b = sg(pop()); push(b === 0n ? 0n : u(a / b)); break; }
            case 0x06: { use(5); const a = pop(), b = pop(); push(b === 0n ? 0n : a % b); break; }
            case 0x07: { use(5); const a = sg(pop()), b = sg(pop()); push(b === 0n ? 0n : u(a % b)); break; }
            case 0x08: { use(8); const a = pop(), b = pop(), n = pop(); push(n === 0n ? 0n : (a + b) % n); break; }
            case 0x09: { use(8); const a = pop(), b = pop(), n = pop(); push(n === 0n ? 0n : (a * b) % n); break; }
            case 0x0a: {
              const b = pop(), e = pop(); const eb = e === 0n ? 0 : Math.ceil(e.toString(16).length / 2); use(10 + 50 * eb);
              let r = 1n, base = b, ex = e; while (ex > 0n) { if (ex & 1n) r = (r * base) & MAX; base = (base * base) & MAX; ex >>= 1n; } push(r); break;
            }
            case 0x0b: { use(5); const b = pop(), x = pop(); if (b < 31n) { const bit = b * 8n + 7n; const mask = (1n << (bit + 1n)) - 1n; push((x >> bit) & 1n ? (x | (MAX ^ mask)) : (x & mask)); } else push(x); break; }
            case 0x10: { use(3); const a = pop(), b = pop(); push(a < b ? 1n : 0n); break; }
            case 0x11: { use(3); const a = pop(), b = pop(); push(a > b ? 1n : 0n); break; }
            case 0x12: { use(3); const a = sg(pop()), b = sg(pop()); push(a < b ? 1n : 0n); break; }
            case 0x13: { use(3); const a = sg(pop()), b = sg(pop()); push(a > b ? 1n : 0n); break; }
            case 0x14: use(3); push(pop() === pop() ? 1n : 0n); break;
            case 0x15: use(3); push(pop() === 0n ? 1n : 0n); break;
            case 0x16: use(3); push(pop() & pop()); break;
            case 0x17: use(3); push(pop() | pop()); break;
            case 0x18: use(3); push(pop() ^ pop()); break;
            case 0x19: use(3); push(MAX ^ pop()); break;
            case 0x1a: { use(3); const i = pop(), x = pop(); push(i >= 32n ? 0n : (x >> (248n - i * 8n)) & 0xffn); break; }
            case 0x1b: { use(3); const s = pop(), v = pop(); push(s >= 256n ? 0n : (v << s) & MAX); break; }
            case 0x1c: { use(3); const s = pop(), v = pop(); push(s >= 256n ? 0n : v >> s); break; }
            case 0x1d: { use(3); const s = pop(), v = pop(); push(s >= 256n ? (v & SIGN ? MAX : 0n) : u(sg(v) >> s)); break; }
            case 0x1e: { use(5); const x = pop(); push(x === 0n ? 256n : BigInt(256 - x.toString(2).length)); break; }
            case 0x20: {
              const off = pop(), size = pop(); use(30 + 6 * words(Number(size)), 'keccak'); expand(off, size);
              const data = mread(off, size); const h = PS.keccak(data); const hv = toBig(h);
              if (data.length === 64 || data.length === 32) w.preimages.set(hv.toString(16), data);
              push(hv); break;
            }
            case 0x30: use(2); push(BigInt(me)); break;
            case 0x31: { const a = ah(pop()); use(access(a), 'opslag'); push(w.balance(a)); break; }
            case 0x32: use(2); push(BigInt(tx.origin)); break;
            case 0x33: use(2); push(BigInt(m.caller)); break;
            case 0x34: use(2); push(m.value); break;
            case 0x35: { use(3); const i = pop(); const buf = new Uint8Array(32); if (i < BigInt(m.data.length)) { const o = Number(i); buf.set(m.data.slice(o, o + 32)); } push(toBig(buf)); break; }
            case 0x36: use(2); push(BigInt(m.data.length)); break;
            case 0x37: case 0x39: case 0x3e: {
              const dst = pop(), src = pop(), size = pop(); use(3 + 3 * words(Number(size)), 'geheugen'); expand(dst, size);
              const s = Number(size); if (s === 0) break;
              const from = op === 0x37 ? m.data : op === 0x39 ? code : rdata;
              if (op === 0x3e && Number(src) + s > rdata.length) throw new Halt('returndata buiten bereik');
              const buf = new Uint8Array(s); const so = Number(src > 0xffffffffn ? 0xffffffffn : src); if (so < from.length) buf.set(from.slice(so, so + s)); mem.set(buf, Number(dst)); break;
            }
            case 0x38: use(2); push(BigInt(code.length)); break;
            case 0x3a: use(2); push(0n); break;
            case 0x3b: { const a = ah(pop()); use(access(a), 'opslag'); const x = w.peek(a); push(BigInt(x ? x.code.length : 0)); break; }
            case 0x3c: {
              const a = ah(pop()), dst = pop(), src = pop(), size = pop(); use(access(a) + 3 * words(Number(size)), 'geheugen'); expand(dst, size);
              const s = Number(size); if (s) { const c = (w.peek(a) || {}).code || EMPTY; const buf = new Uint8Array(s); const so = Number(src); if (so < c.length) buf.set(c.slice(so, so + s)); mem.set(buf, Number(dst)); } break;
            }
            case 0x3d: use(2); push(BigInt(rdata.length)); break;
            case 0x3f: { const a = ah(pop()); use(access(a), 'opslag'); push(w.empty(a) ? 0n : toBig(PS.keccak((w.peek(a) || {}).code || EMPTY))); break; }
            case 0x40: { use(20); const n = pop(); push(n < w.block.number && n >= w.block.number - 256n ? toBig(PS.keccak(PS.bigToBytes(n))) : 0n); break; }
            case 0x41: use(2); push(BigInt(w.block.coinbase)); break;
            case 0x42: use(2); push(w.block.timestamp); break;
            case 0x43: use(2); push(w.block.number); break;
            case 0x44: use(2); push(w.block.prevrandao); break;
            case 0x45: use(2); push(w.block.gaslimit); break;
            case 0x46: use(2); push(w.block.chainid); break;
            case 0x47: use(5); push(w.balance(me)); break;
            case 0x48: use(2); push(w.block.basefee); break;
            case 0x49: use(3); pop(); push(0n); break;
            case 0x4a: use(2); push(1n); break;
            case 0x50: use(2); pop(); break;
            case 0x51: { use(3); const off = pop(); expand(off, 32n); push(toBig(mread(off, 32))); break; }
            case 0x52: { use(3); const off = pop(), v = pop(); expand(off, 32n); mem.set(PS.bigToBytes(v), Number(off)); break; }
            case 0x53: { use(3); const off = pop(), v = pop(); expand(off, 1n); mem[Number(off)] = Number(v & 0xffn); break; }
            case 0x54: {
              const slot = pop(); const k = slotKey(slot); const cold = !tx.warmS.has(k); tx.warmS.add(k);
              use(cold ? 2100 : 100, 'opslag'); const v = sload(slot); touchOrig(k, v); push(v); break;
            }
            case 0x55: {
              if (m.isStatic) throw new Halt('state-wijziging in static call');
              if (gas <= 2300) throw new Halt('out of gas (SSTORE sentry)', 'oog');
              const slot = pop(), val = pop(); const k = slotKey(slot); let cost = 0;
              if (!tx.warmS.has(k)) { cost += 2100; tx.warmS.add(k); }
              const cur = sload(slot); touchOrig(k, cur); const orig = tx.orig.get(k);
              if (val === cur) cost += 100;
              else if (orig === cur) { if (orig === 0n) cost += 20000; else { cost += 2900; if (val === 0n) tx.refund += 4800; } }
              else {
                cost += 100;
                if (orig !== 0n) { if (cur === 0n) tx.refund -= 4800; else if (val === 0n) tx.refund += 4800; }
                if (orig === val) tx.refund += orig === 0n ? 19900 : 2800;
              }
              use(cost, 'opslag');
              const S = w.get(me).storage; if (val === 0n) S.delete(slot.toString(16)); else S.set(slot.toString(16), val);
              tx.sstores.push({ address: me, slot, from: cur, to: val }); break;
            }
            case 0x56: { use(8); const d = Number(pop()); if (!JD.has(d)) throw new Halt('ongeldige JUMP'); pc = d; continue; }
            case 0x57: { use(10); const d = pop(), c = pop(); if (c !== 0n) { if (!JD.has(Number(d))) throw new Halt('ongeldige JUMPI'); pc = Number(d); continue; } break; }
            case 0x58: use(2); push(BigInt(pc)); break;
            case 0x59: use(2); push(BigInt(memWords * 32)); break;
            case 0x5a: use(2); push(BigInt(gas)); break;
            case 0x5b: use(1); break;
            case 0x5c: { use(100, 'opslag'); const s = pop(); push(tx.transient.get(`${me}:${s.toString(16)}`) || 0n); break; }
            case 0x5d: { if (m.isStatic) throw new Halt('TSTORE in static call'); use(100, 'opslag'); const s = pop(), v = pop(); tx.transient.set(`${me}:${s.toString(16)}`, v); break; }
            case 0x5e: { const dst = pop(), src = pop(), size = pop(); use(3 + 3 * words(Number(size)), 'geheugen'); expand(dst > src ? dst : src, size); if (size) mem.copyWithin(Number(dst), Number(src), Number(src) + Number(size)); break; }
            case 0x5f: use(2); push(0n); break;
            case 0xf3: case 0xfd: {
              const off = pop(), size = pop(); expand(off, size);
              const out = mread(off, size);
              if (op === 0xf3) return { success: true, gasLeft: gas, returnData: out };
              return { success: false, gasLeft: gas, returnData: out, error: 'revert', reverted: true };
            }
            case 0xfe: throw new Halt('INVALID opcode (0xFE)');
            case 0xff: {
              if (m.isStatic) throw new Halt('SELFDESTRUCT in static call');
              const b = ah(pop()); let cost = 5000; if (!tx.warmA.has(low(b))) { cost += 2600; tx.warmA.add(low(b)); }
              const bal = w.balance(me); if (bal > 0n && w.empty(b)) cost += 25000; use(cost);
              w.get(me).balance = 0n; w.get(b).balance += bal;
              if (tx.created.has(me)) w.acc.delete(me);
              return { success: true, gasLeft: gas, returnData: EMPTY };
            }
            case 0xf0: case 0xf5: {
              if (m.isStatic) throw new Halt('CREATE in static call');
              const value = pop(), off = pop(), size = pop(); const salt = op === 0xf5 ? pop() : null;
              use(32000 + 2 * words(Number(size)) + (op === 0xf5 ? 6 * words(Number(size)) : 0), 'aanroepen'); expand(off, size);
              if (Number(size) > 49152) throw new Halt('initcode te groot (EIP-3860)');
              const init = mread(off, size);
              const callGas = gas - Math.floor(gas / 64); use(callGas, 'aanroepen');
              const creator = w.get(me);
              let addr;
              if (op === 0xf0) addr = PS.createAddress(me, creator.nonce);
              else addr = '0x' + PS.hex(PS.keccak(PS.concat(Uint8Array.of(0xff), PS.fromHex(me), PS.bigToBytes(salt), PS.keccak(init))).slice(12));
              creator.nonce += 1n; tx.warmA.add(low(addr));
              const r = this.create({ caller: me, address: addr, value, code: init, gas: callGas, depth: m.depth + 1, kind: op === 0xf0 ? 'CREATE' : 'CREATE2' });
              gas += r.gasLeft; rdata = r.success ? EMPTY : r.returnData || EMPTY;
              push(r.success ? BigInt(addr) : 0n); break;
            }
            case 0xf1: case 0xf2: case 0xf4: case 0xfa: {
              const gReq = pop(); const to = ah(pop());
              const value = op === 0xf1 || op === 0xf2 ? pop() : 0n;
              const ao = pop(), as = pop(), ro = pop(), rs = pop();
              expand(ao, as); expand(ro, rs);
              let cost = access(to);
              if (op === 0xf1 && value > 0n) { if (m.isStatic) throw new Halt('CALL met value in static call'); cost += 9000; if (w.empty(to)) cost += 25000; }
              if (op === 0xf2 && value > 0n) cost += 9000;
              use(cost, 'aanroepen');
              const avail = gas - Math.floor(gas / 64); let cg = gReq > BigInt(avail) ? avail : Number(gReq);
              use(cg, 'aanroepen'); if (value > 0n) cg += 2300;
              const data = mread(ao, as);
              const kind = { 0xf1: 'CALL', 0xf2: 'CALLCODE', 0xf4: 'DELEGATECALL', 0xfa: 'STATICCALL' }[op];
              const msg = op === 0xf4 ? { caller: m.caller, to: me, code: to, value: m.value, data, gas: cg, depth: m.depth + 1, isStatic: m.isStatic, kind }
                : op === 0xf2 ? { caller: me, to: me, code: to, value, data, gas: cg, depth: m.depth + 1, isStatic: m.isStatic, kind }
                  : { caller: me, to, code: to, value, data, gas: cg, depth: m.depth + 1, isStatic: m.isStatic || op === 0xfa, kind };
              const r = this.call(msg);
              gas += r.gasLeft; rdata = r.returnData || EMPTY;
              const n = Math.min(Number(rs), rdata.length); if (n) mem.set(rdata.slice(0, n), Number(ro));
              push(r.success ? 1n : 0n); break;
            }
            default: {
              if (op >= 0x60 && op <= 0x7f) { use(3); const n = op - 0x5f; let v = 0n; for (let i = 1; i <= n; i++) v = (v << 8n) | BigInt(code[pc + i] || 0); push(v); pc += n + 1; continue; }
              if (op >= 0x80 && op <= 0x8f) { use(3); const i = op - 0x7f; if (st.length < i) throw new Halt('stack underflow'); push(st[st.length - i]); break; }
              if (op >= 0x90 && op <= 0x9f) { use(3); const i = op - 0x8f; if (st.length <= i) throw new Halt('stack underflow'); const t = st[st.length - 1]; st[st.length - 1] = st[st.length - 1 - i]; st[st.length - 1 - i] = t; break; }
              if (op >= 0xa0 && op <= 0xa4) {
                if (m.isStatic) throw new Halt('LOG in static call');
                const off = pop(), size = pop(); const n = op - 0xa0; const topics = [];
                for (let i = 0; i < n; i++) topics.push(PS.bigToBytes(pop()));
                use(375 + 375 * n + 8 * Number(size), 'events'); expand(off, size);
                tx.logs.push({ address: PS.toChecksum(me), topics, data: mread(off, size) }); break;
              }
              throw new Halt(`onbekende opcode 0x${op.toString(16)}`);
            }
          }
          pc++;
        }
        return { success: true, gasLeft: gas, returnData: EMPTY };
      } catch (e) {
        if (!(e instanceof Halt)) throw e;
        return { success: false, gasLeft: 0, returnData: EMPTY, error: e.message };
      }
    }
  }
  PS.EVM = EVM; PS.EVMWorld = World;
})(typeof PS !== 'undefined' ? PS : (globalThis.PS = globalThis.PS || {}));
