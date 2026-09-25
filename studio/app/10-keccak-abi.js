/* Polyglot Studio v2 — keccak-256, RLP, ABI encoding/decoding, value parsing (browser + node) */
'use strict';
(function (PS) {
  /* ---------------- keccak-256 (BigInt lanes; small inputs, correctness first) ---------------- */
  const M64 = (1n << 64n) - 1n;
  const RC = ['0x1', '0x8082', '0x800000000000808a', '0x8000000080008000', '0x808b', '0x80000001', '0x8000000080008081', '0x8000000000008009', '0x8a', '0x88', '0x80008009', '0x8000000a', '0x8000808b', '0x800000000000008b', '0x8000000000008089', '0x8000000000008003', '0x8000000000008002', '0x8000000000000080', '0x800a', '0x800000008000000a', '0x8000000080008081', '0x8000000000008080', '0x80000001', '0x8000000080008008'].map(BigInt);
  const R = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]];
  const ROT = new Array(25); for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) ROT[x + 5 * y] = BigInt(R[x][y]);
  const rotl = (v, n) => (n === 0n ? v : ((v << n) | (v >> (64n - n))) & M64);
  function f1600(A) {
    const C = new Array(5), B = new Array(25);
    for (let r = 0; r < 24; r++) {
      for (let x = 0; x < 5; x++) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
      for (let x = 0; x < 5; x++) { const D = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1n); for (let y = 0; y < 25; y += 5) A[x + y] ^= D; }
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(A[x + 5 * y], ROT[x + 5 * y]);
      for (let y = 0; y < 25; y += 5) for (let x = 0; x < 5; x++) A[x + y] = B[x + y] ^ ((~B[((x + 1) % 5) + y] & M64) & B[((x + 2) % 5) + y]);
      A[0] ^= RC[r];
    }
  }
  const cache = new Map();
  function keccak(bytes) {
    if (typeof bytes === 'string') bytes = new TextEncoder().encode(bytes);
    const key = bytes.length <= 96 ? PS.hex(bytes) : null;
    if (key && cache.has(key)) return cache.get(key).slice();
    const rate = 136; const A = new Array(25).fill(0n);
    const padded = new Uint8Array(Math.ceil((bytes.length + 1) / rate) * rate);
    padded.set(bytes); padded[bytes.length] ^= 0x01; padded[padded.length - 1] ^= 0x80;
    for (let o = 0; o < padded.length; o += rate) {
      for (let i = 0; i < rate / 8; i++) {
        let lane = 0n; for (let b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(padded[o + i * 8 + b]);
        A[i] ^= lane;
      }
      f1600(A);
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 4; i++) { let lane = A[i]; for (let b = 0; b < 8; b++) { out[i * 8 + b] = Number(lane & 0xffn); lane >>= 8n; } }
    if (key) { if (cache.size > 4000) cache.clear(); cache.set(key, out.slice()); }
    return out;
  }

  /* ---------------- byte helpers ---------------- */
  PS.hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  PS.fromHex = (h) => { h = String(h).replace(/^0x/, ''); if (h.length % 2) h = '0' + h; const o = new Uint8Array(h.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; };
  PS.bytesToBig = (b) => { let v = 0n; for (const x of b) v = (v << 8n) | BigInt(x); return v; };
  PS.bigToBytes = (v, n = 32) => { const o = new Uint8Array(n); for (let i = n - 1; i >= 0; i--) { o[i] = Number(v & 0xffn); v >>= 8n; } return o; };
  PS.concat = (...arrs) => { const n = arrs.reduce((a, b) => a + b.length, 0); const o = new Uint8Array(n); let p = 0; for (const a of arrs) { o.set(a, p); p += a.length; } return o; };
  PS.keccak = keccak;
  PS.keccakHex = (x) => '0x' + PS.hex(keccak(x));
  PS.toChecksum = (addr) => {
    const a = String(addr).toLowerCase().replace(/^0x/, '').padStart(40, '0');
    const h = PS.hex(keccak(a));
    return '0x' + [...a].map((c, i) => (parseInt(h[i], 16) >= 8 ? c.toUpperCase() : c)).join('');
  };

  /* ---------------- RLP (enough for CREATE addresses) ---------------- */
  const rlpBytes = (b) => (b.length === 1 && b[0] < 0x80 ? b : b.length < 56 ? PS.concat(Uint8Array.of(0x80 + b.length), b) : (() => { const l = PS.bigToBytes(BigInt(b.length), 8).filter((x, i, a) => i >= a.findIndex((y) => y)); return PS.concat(Uint8Array.of(0xb7 + l.length), l, b); })());
  const rlpList = (items) => { const body = PS.concat(...items); return body.length < 56 ? PS.concat(Uint8Array.of(0xc0 + body.length), body) : (() => { const l = PS.bigToBytes(BigInt(body.length), 8).filter((x, i, a) => i >= a.findIndex((y) => y)); return PS.concat(Uint8Array.of(0xf7 + l.length), l, body); })(); };
  const minBytes = (v) => { if (v === 0n) return new Uint8Array(0); const h = v.toString(16); return PS.fromHex(h.length % 2 ? '0' + h : h); };
  PS.createAddress = (sender, nonce) => '0x' + PS.hex(keccak(rlpList([rlpBytes(PS.fromHex(sender)), rlpBytes(minBytes(BigInt(nonce)))])).slice(12));

  /* ---------------- ABI ---------------- */
  const parseType = (t) => {
    const arr = t.match(/^(.*)\[(\d*)\]$/);
    if (arr) return { kind: 'array', base: arr[1], len: arr[2] === '' ? null : Number(arr[2]) };
    if (t === 'tuple') return { kind: 'tuple' };
    return { kind: 'basic', t };
  };
  const isDynamic = (p) => {
    const T = parseType(p.type);
    if (T.kind === 'array') return T.len === null || isDynamic({ type: T.base, components: p.components });
    if (T.kind === 'tuple') return (p.components || []).some(isDynamic);
    return p.type === 'bytes' || p.type === 'string';
  };
  const pad32 = (b) => { const n = Math.ceil(b.length / 32) * 32 || 0; const o = new Uint8Array(n); o.set(b); return o; };
  function encBasic(t, v) {
    if (/^uint/.test(t)) { let x = BigInt(v); if (x < 0n) throw new Error(`${t} kan niet negatief zijn`); return PS.bigToBytes(x); }
    if (/^int/.test(t)) { let x = BigInt(v); if (x < 0n) x += 1n << 256n; return PS.bigToBytes(x); }
    if (t === 'address') return PS.bigToBytes(BigInt(v));
    if (t === 'bool') return PS.bigToBytes(v === true || v === 'true' || v === 1n || v === 1 ? 1n : 0n);
    const bm = t.match(/^bytes(\d+)$/);
    if (bm) { const b = typeof v === 'string' ? PS.fromHex(v) : v; const o = new Uint8Array(32); o.set(b.slice(0, Number(bm[1]))); return o; }
    throw new Error(`Onbekend ABI-type ${t}`);
  }
  function encodeParams(params, values) {
    const heads = [], tails = []; let tailLen = 0;
    const headSize = params.reduce((a, p) => { const T = parseType(p.type); if (!isDynamic(p) && T.kind === 'array') return a + 32 * T.len * (T.base === 'tuple' ? (p.components || []).length : 1); if (!isDynamic(p) && T.kind === 'tuple') return a + 32 * (p.components || []).length; return a + 32; }, 0);
    params.forEach((p, i) => {
      const enc = encodeOne(p, values[i]);
      if (isDynamic(p)) { heads.push(PS.bigToBytes(BigInt(headSize + tailLen))); tails.push(enc); tailLen += enc.length; }
      else heads.push(enc);
    });
    return PS.concat(...heads, ...tails);
  }
  function encodeOne(p, v) {
    const T = parseType(p.type);
    if (T.kind === 'array') {
      const sub = { type: T.base, components: p.components };
      const list = Array.isArray(v) ? v : JSON.parse(v);
      const body = encodeParams(list.map(() => sub), list);
      return T.len === null ? PS.concat(PS.bigToBytes(BigInt(list.length)), body) : body;
    }
    if (T.kind === 'tuple') return encodeParams(p.components, Array.isArray(v) ? v : p.components.map((c) => v[c.name]));
    if (p.type === 'string' || p.type === 'bytes') {
      const b = p.type === 'string' ? new TextEncoder().encode(String(v)) : typeof v === 'string' ? PS.fromHex(v) : v;
      return PS.concat(PS.bigToBytes(BigInt(b.length)), pad32(b));
    }
    return encBasic(p.type, v);
  }
  function decodeParams(params, data, base = 0) {
    const out = []; let off = base;
    for (const p of params) {
      const T = parseType(p.type);
      if (isDynamic(p)) { const ptr = Number(PS.bytesToBig(data.slice(off, off + 32))); out.push(decodeOne(p, data, base + ptr)); off += 32; }
      else if (T.kind === 'array') { const sub = { type: T.base, components: p.components }; const r = decodeParams(Array(T.len).fill(sub), data, off); out.push(r); off += 32 * T.len * (T.base === 'tuple' ? (p.components || []).length : 1); }
      else if (T.kind === 'tuple') { out.push(decodeParams(p.components, data, off)); off += 32 * p.components.length; }
      else { out.push(decBasic(p.type, data.slice(off, off + 32))); off += 32; }
    }
    return out;
  }
  function decodeOne(p, data, at) {
    const T = parseType(p.type);
    if (T.kind === 'array') {
      const sub = { type: T.base, components: p.components };
      if (T.len === null) { const n = Number(PS.bytesToBig(data.slice(at, at + 32))); return decodeParams(Array(n).fill(sub), data, at + 32); }
      return decodeParams(Array(T.len).fill(sub), data, at);
    }
    if (T.kind === 'tuple') return decodeParams(p.components, data, at);
    const n = Number(PS.bytesToBig(data.slice(at, at + 32))); const b = data.slice(at + 32, at + 32 + n);
    return p.type === 'string' ? new TextDecoder().decode(b) : '0x' + PS.hex(b);
  }
  function decBasic(t, w) {
    const x = PS.bytesToBig(w);
    if (/^uint/.test(t)) return x;
    if (/^int/.test(t)) return x >= 1n << 255n ? x - (1n << 256n) : x;
    if (t === 'address') return PS.toChecksum(x.toString(16));
    if (t === 'bool') return x !== 0n;
    const bm = t.match(/^bytes(\d+)$/); if (bm) return '0x' + PS.hex(w.slice(0, Number(bm[1])));
    return x;
  }
  const canonType = (p) => (p.type.startsWith('tuple') ? `(${p.components.map(canonType).join(',')})${p.type.slice(5)}` : p.type);
  PS.abi = {
    sig: (f) => `${f.name}(${(f.inputs || []).map(canonType).join(',')})`,
    selector: (f) => keccak(PS.abi.sig(f)).slice(0, 4),
    topic: (ev) => keccak(PS.abi.sig(ev)),
    encodeCall: (f, args) => PS.concat(PS.abi.selector(f), encodeParams(f.inputs || [], args)),
    encodeParams, decodeParams, isDynamic,
    decodeOutputs: (f, data) => decodeParams(f.outputs || [], data),
    decodeError(abi, data) {
      if (!data || data.length < 4) return data && data.length ? { name: 'onbekend', args: [] } : null;
      const sel = PS.hex(data.slice(0, 4)); const body = data.slice(4);
      if (sel === '08c379a0') return { name: 'Error', args: decodeParams([{ type: 'string' }], body), message: decodeParams([{ type: 'string' }], body)[0] };
      if (sel === '4e487b71') {
        const code = Number(decodeParams([{ type: 'uint256' }], body)[0]);
        const why = { 0x01: 'assert() faalde', 0x11: 'overflow/underflow in rekenkunde', 0x12: 'deling door nul', 0x21: 'ongeldige enum-waarde', 0x22: 'ongeldige storage-byte-array', 0x31: 'pop() op lege array', 0x32: 'array-index buiten bereik', 0x41: 'te veel geheugen', 0x51: 'lege interne functie aangeroepen' }[code] || 'panic';
        return { name: 'Panic', args: [code], message: `Panic 0x${code.toString(16)}: ${why}` };
      }
      for (const e of (abi || []).filter((x) => x.type === 'error')) {
        if (PS.hex(keccak(PS.abi.sig(e)).slice(0, 4)) === sel) return { name: e.name, args: decodeParams(e.inputs || [], body), message: `${e.name}(${decodeParams(e.inputs || [], body).map(PS.fmtVal).join(', ')})` };
      }
      return { name: 'onbekend', args: [], message: `custom error 0x${sel}` };
    },
    decodeLog(abi, log) {
      for (const ev of (abi || []).filter((x) => x.type === 'event' && !x.anonymous)) {
        if (log.topics.length && PS.hex(PS.abi.topic(ev)) === PS.hex(log.topics[0])) {
          const idx = ev.inputs.filter((i) => i.indexed); const non = ev.inputs.filter((i) => !i.indexed);
          const nonVals = decodeParams(non, log.data);
          const args = {}; let ti = 1, ni = 0;
          ev.inputs.forEach((inp) => { if (inp.indexed) { args[inp.name] = isDynamic(inp) ? '0x' + PS.hex(log.topics[ti++]) : decBasic(inp.type, log.topics[ti++]); } else args[inp.name] = nonVals[ni++]; });
          return { name: ev.name, args, sig: PS.abi.sig(ev) };
        }
      }
      return null;
    },
  };

  /* ---------------- value formatting & parsing ---------------- */
  PS.fmtVal = (v) => {
    if (typeof v === 'bigint') { const s = v.toString(); return v >= 10n ** 15n && v % 10n ** 12n === 0n ? `${s} (${PS.fmtEther(v)} ETH)` : s; }
    if (Array.isArray(v)) return `[${v.map(PS.fmtVal).join(', ')}]`;
    if (typeof v === 'string') return /^0x[0-9a-fA-F]{40}$/.test(v) ? PS.accountName(v) : JSON.stringify(v);
    return String(v);
  };
  PS.fmtEther = (wei) => { const w = BigInt(wei); const whole = w / 10n ** 18n; const frac = (w % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, ''); return frac ? `${whole}.${frac.slice(0, 6)}` : `${whole}`; };
  PS.ACCOUNTS = {
    deployer: '0x5B38Da6a701c568545dCfcB03FcB875f56beddC4',
    alice: '0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2',
    bob: '0x4B20993Bc481177ec7E8f571ceCaE8A9e22C02db',
    carol: '0x78731D3Ca6b7E34aC0F824c42a7cC18A495cabaB',
    attacker: '0x617F2E2fD72FD9D5503197092aC168c91465E7f2',
  };
  PS.accountName = (addr) => {
    const a = String(addr).toLowerCase();
    for (const [n, x] of Object.entries(PS.ACCOUNTS)) if (x.toLowerCase() === a) return `${n} (${x.slice(0, 6)}…${x.slice(-4)})`;
    if (PS.contractNames && PS.contractNames[a]) return `${PS.contractNames[a]} (${a.slice(0, 6)}…${a.slice(-4)})`;
    return a === '0x0000000000000000000000000000000000000000' ? 'address(0)' : `${a.slice(0, 6)}…${a.slice(-4)}`;
  };
  /* "1 ether", "2.5 gwei", "1e18", "alice", "$vault", "0x…", "[1,2]", "true" */
  PS.parseArg = (raw, type, refs = {}) => {
    let v = raw;
    if (typeof v === 'string') {
      const s = v.trim();
      if (type === 'string') return s;
      if (type === 'bool') return s === 'true' || s === '1';
      if (/\[\d*\]$/.test(type) || type.startsWith('tuple')) { const arr = JSON.parse(s); return arr.map((x) => PS.parseArg(typeof x === 'string' ? x : String(x), type.replace(/\[\d*\]$/, ''), refs)); }
      if (PS.ACCOUNTS[s.toLowerCase()]) return PS.ACCOUNTS[s.toLowerCase()];
      if (s.startsWith('$') && refs[s.slice(1)]) return refs[s.slice(1)];
      if (type === 'address') return s;
      if (/^bytes\d*$/.test(type)) return s;
      const m = s.match(/^(-?[\d.]+(?:e\d+)?)\s*(ether|eth|gwei|wei)?$/i);
      if (m) {
        const unit = (m[2] || 'wei').toLowerCase(); const mult = unit === 'ether' || unit === 'eth' ? 18 : unit === 'gwei' ? 9 : 0;
        if (/e/i.test(m[1])) { const [b, e] = m[1].toLowerCase().split('e'); return PS.decToBig(b, Number(e) + mult); }
        return PS.decToBig(m[1], mult);
      }
      return s;
    }
    if (typeof v === 'number') return type === 'bool' ? !!v : BigInt(Math.round(v));
    if (Array.isArray(v)) return v.map((x) => PS.parseArg(x, type.replace(/\[\d*\]$/, ''), refs));
    return v;
  };
  PS.decToBig = (dec, decimals) => {
    const neg = dec.startsWith('-'); if (neg) dec = dec.slice(1);
    const [w, f = ''] = dec.split('.');
    const v = BigInt(w || '0') * 10n ** BigInt(decimals) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals) || '0');
    return neg ? -v : v;
  };
})(typeof PS !== 'undefined' ? PS : (globalThis.PS = globalThis.PS || {}));
