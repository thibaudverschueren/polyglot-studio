/* n8n expression & Code-node sandbox — runs inside an opaque-origin iframe (and in node for content verification). */
const ext = (p, n, f) => { try { Object.defineProperty(p, n, { value: f, configurable: true, writable: true, enumerable: false }); } catch (e) {} };
ext(Array.prototype, 'first', function () { return this[0]; });
ext(Array.prototype, 'last', function () { return this[this.length - 1]; });
ext(Array.prototype, 'sum', function () { return this.reduce((a, b) => a + (Number(b) || 0), 0); });
ext(Array.prototype, 'average', function () { return this.length ? this.sum() / this.length : 0; });
ext(Array.prototype, 'max', function () { return Math.max(...this.map(Number)); });
ext(Array.prototype, 'min', function () { return Math.min(...this.map(Number)); });
ext(Array.prototype, 'unique', function (k) { const s = new Set(); return this.filter((x) => { const v = k ? x && x[k] : JSON.stringify(x); if (s.has(v)) return false; s.add(v); return true; }); });
ext(Array.prototype, 'compact', function () { return this.filter((x) => x !== null && x !== undefined && x !== ''); });
ext(Array.prototype, 'isEmpty', function () { return this.length === 0; });
ext(Array.prototype, 'isNotEmpty', function () { return this.length > 0; });
ext(Array.prototype, 'pluck', function (...keys) { return this.map((x) => (keys.length === 1 ? x && x[keys[0]] : Object.fromEntries(keys.map((k) => [k, x && x[k]])))); });
ext(Array.prototype, 'chunk', function (n) { const o = []; for (let i = 0; i < this.length; i += n) o.push(this.slice(i, i + n)); return o; });
ext(String.prototype, 'isEmpty', function () { return this.length === 0; });
ext(String.prototype, 'isNotEmpty', function () { return this.length > 0; });
ext(String.prototype, 'isEmail', function () { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this); });
ext(String.prototype, 'toNumber', function () { return Number(String(this).replace(/[^0-9.\-]/g, '')); });
ext(String.prototype, 'toTitleCase', function () { return this.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); });
ext(String.prototype, 'extractDomain', function () { const m = String(this).match(/@([^\s>]+)|https?:\/\/([^\/\s]+)/); return m ? (m[1] || m[2]).replace(/^www\./, '') : ''; });
ext(String.prototype, 'removeTags', function () { return this.replace(/<[^>]*>/g, ''); });
ext(Number.prototype, 'round', function (d = 0) { const f = 10 ** d; return Math.round(this * f) / f; });
ext(Number.prototype, 'format', function () { return this.toLocaleString('en-US'); });

/* --- minimal Luxon-like DateTime (fixed "now" for reproducible exercises) --- */
const pad = (n, w = 2) => String(n).padStart(w, '0');
class DT {
  constructor(ms) { this.ms = ms; this.d = new Date(ms); }
  static fromISO(s) { return new DT(Date.parse(s)); }
  static fromMillis(ms) { return new DT(ms); }
  toMillis() { return this.ms; }
  toISO() { return this.d.toISOString(); }
  toISODate() { return this.d.toISOString().slice(0, 10); }
  toString() { return this.toISO(); }
  toJSON() { return this.toISO(); }
  get year() { return this.d.getUTCFullYear(); } get month() { return this.d.getUTCMonth() + 1; } get day() { return this.d.getUTCDate(); }
  get hour() { return this.d.getUTCHours(); } get minute() { return this.d.getUTCMinutes(); } get weekday() { return ((this.d.getUTCDay() + 6) % 7) + 1; }
  plus(o) { return new DT(this.ms + DT.dur(o)); }
  minus(o) { return new DT(this.ms - DT.dur(o)); }
  static dur(o) { o = o || {}; return ((o.weeks || 0) * 7 * 864e5) + ((o.days || 0) * 864e5) + ((o.hours || 0) * 36e5) + ((o.minutes || 0) * 6e4) + ((o.seconds || 0) * 1e3) + (o.milliseconds || 0); }
  diff(other, unit = 'milliseconds') { const ms = this.ms - other.ms; const f = { milliseconds: 1, seconds: 1e3, minutes: 6e4, hours: 36e5, days: 864e5 }[unit] || 1; return { [unit]: ms / f, as: (u) => ms / ({ milliseconds: 1, seconds: 1e3, minutes: 6e4, hours: 36e5, days: 864e5 }[u] || 1) }; }
  startOf(u) { const d = new Date(this.ms); if (u === 'day') d.setUTCHours(0, 0, 0, 0); if (u === 'hour') d.setUTCMinutes(0, 0, 0); if (u === 'month') { d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); } return new DT(d.getTime()); }
  toFormat(f) { const d = this.d; return f.replace(/yyyy|MM|dd|HH|mm|ss/g, (t) => ({ yyyy: d.getUTCFullYear(), MM: pad(d.getUTCMonth() + 1), dd: pad(d.getUTCDate()), HH: pad(d.getUTCHours()), mm: pad(d.getUTCMinutes()), ss: pad(d.getUTCSeconds()) }[t])); }
}
const NOW = Date.parse('2026-09-24T09:00:00Z');
const DateTime = { now: () => new DT(NOW), fromISO: DT.fromISO, fromMillis: DT.fromMillis };

/* --- sync SHA-256 / HMAC (for webhook-signature exercises) --- */
function sha256(bytes) {
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const l = bytes.length; const withPad = new Uint8Array(((l + 9 + 63) >> 6) << 6); withPad.set(bytes); withPad[l] = 0x80;
  const bits = l * 8; const dv = new DataView(withPad.buffer); dv.setUint32(withPad.length - 4, bits >>> 0); dv.setUint32(withPad.length - 8, Math.floor(bits / 2 ** 32));
  const W = new Uint32Array(64);
  for (let o = 0; o < withPad.length; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const a = W[i - 15], b = W[i - 2]; const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3); const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10); W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7)); const ch = (e & f) ^ (~e & g); const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10)); const mj = (a & b) ^ (a & c) ^ (b & c); const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H = [H[0] + a, H[1] + b, H[2] + c, H[3] + d, H[4] + e, H[5] + f, H[6] + g, H[7] + h].map((x) => x >>> 0);
  }
  const out = new Uint8Array(32); const odv = new DataView(out.buffer); H.forEach((x, i) => odv.setUint32(i * 4, x)); return out;
}
const enc = (s) => (s instanceof Uint8Array ? s : new TextEncoder().encode(String(s)));
function hmac(key, msg) { let k = enc(key); if (k.length > 64) k = sha256(k); const kp = new Uint8Array(64); kp.set(k); const ip = kp.map((x) => x ^ 0x36), op = kp.map((x) => x ^ 0x5c); const m = enc(msg); const inner = new Uint8Array(64 + m.length); inner.set(ip); inner.set(m, 64); const ih = sha256(inner); const outer = new Uint8Array(96); outer.set(op); outer.set(ih, 64); return sha256(outer); }
const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const toB64 = (b) => btoa(String.fromCharCode(...b));
const digestAs = (b, f) => (f === 'hex' ? toHex(b) : f === 'base64' ? toB64(b) : b);
const cryptoShim = {
  createHash: (alg) => { if (alg !== 'sha256') throw new Error('alleen sha256 beschikbaar'); let buf = ''; const o = { update: (d) => { buf += d; return o; }, digest: (f) => digestAs(sha256(enc(buf)), f) }; return o; },
  createHmac: (alg, key) => { if (alg !== 'sha256') throw new Error('alleen sha256 beschikbaar'); let buf = ''; const o = { update: (d) => { buf += d; return o; }, digest: (f) => digestAs(hmac(key, buf), f) }; return o; },
  timingSafeEqual: (a, b) => String(a) === String(b),
  randomUUID: () => '00000000-0000-4000-8000-000000000000',
};
const Buffer = { from: (x, e) => { const bytes = e === 'base64' ? Uint8Array.from(atob(x), (c) => c.charCodeAt(0)) : e === 'hex' ? new Uint8Array(String(x).match(/../g).map((h) => parseInt(h, 16))) : enc(x); return { bytes, toString: (f) => (f === 'base64' ? toB64(bytes) : f === 'hex' ? toHex(bytes) : new TextDecoder().decode(bytes)), length: bytes.length }; } };
const requireShim = (m) => { if (m === 'crypto') return cryptoShim; throw new Error('Module ' + m + ' is niet beschikbaar in deze sandbox'); };

function mkContext(items, idx, nodes) {
  const wrap = (arr) => (arr || []).map((j) => ({ json: j }));
  const all = wrap(items);
  const input = { all: () => all, first: () => all[0], last: () => all[all.length - 1], item: all[idx] || all[0] || { json: {} }, get json() { return (all[idx] || all[0] || { json: {} }).json; } };
  const node = (name) => { const arr = wrap(nodes && nodes[name]); if (!nodes || !(name in nodes)) throw new Error('Node "' + name + '" bestaat niet in deze workflow'); return { all: () => arr, first: () => arr[0], last: () => arr[arr.length - 1], item: arr[idx] || arr[0], json: (arr[idx] || arr[0] || { json: {} }).json }; };
  const nodeProxy = new Proxy({}, { get: (_, n) => ({ json: node(String(n)).item ? node(String(n)).item.json : {} }) });
  return { $json: (all[idx] || { json: {} }).json, $input: input, $: node, $node: nodeProxy, $items: (n) => (n ? node(n).all() : all), $itemIndex: idx, $runIndex: 0, $now: DateTime.now(), $today: DateTime.now().startOf('day'), $workflow: { id: 'wf_1', name: 'Oefenworkflow', active: true }, $execution: { id: '1042', mode: 'manual' }, DateTime };
}
const ARGS = ['$json', '$input', '$', '$node', '$items', '$itemIndex', '$runIndex', '$now', '$today', '$workflow', '$execution', 'DateTime'];
const argv = (c) => ARGS.map((k) => c[k]);

function evalExpr(template, items, idx, nodes) {
  const c = mkContext(items, idx, nodes);
  const t = String(template).trim();
  const segs = [...t.matchAll(/\{\{([\s\S]+?)\}\}/g)];
  const run = (code) => new Function(...ARGS, '"use strict"; return (' + code + ');')(...argv(c));
  if (!segs.length) return run(t);
  if (segs.length === 1 && segs[0][0] === t) return run(segs[0][1]);
  return t.replace(/\{\{([\s\S]+?)\}\}/g, (_, code) => { const v = run(code); return v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v); });
}
const normalizeItems = (out) => {
  if (out === undefined || out === null) throw new Error('De code geeft niets terug — vergeet je "return"?');
  const arr = Array.isArray(out) ? out : [out];
  return arr.map((x) => (x && typeof x === 'object' && 'json' in x && Object.keys(x).every((k) => ['json', 'binary', 'pairedItem'].includes(k)) ? x.json : x));
};
async function runCode(code, mode, items, nodes) {
  const logs = []; const cons = { log: (...a) => logs.push(a.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ')), warn: (...a) => cons.log(...a), error: (...a) => cons.log(...a) };
  const make = (c) => new Function(...ARGS, 'items', 'require', 'console', 'Buffer', '"use strict"; return (async () => {\n' + code + '\n})();');
  if (mode === 'each') {
    const out = [];
    for (let i = 0; i < items.length; i++) {
      const c = mkContext(items, i, nodes);
      const r = await make(c)(...argv(c), c.$input.all(), requireShim, cons, Buffer);
      out.push(...normalizeItems(r));
    }
    return { out, logs };
  }
  const c = mkContext(items, 0, nodes);
  const r = await make(c)(...argv(c), c.$input.all(), requireShim, cons, Buffer);
  return { out: normalizeItems(r), logs };
}
window.addEventListener('message', async (e) => {
  const m = e.data || {}; if (!m.id) return;
  try {
    let value, logs = [];
    if (m.kind === 'expr') {
      if (m.perItem) value = (m.items || [{}]).map((_, i) => evalExpr(m.template, m.items, i, m.nodes));
      else value = evalExpr(m.template, m.items || [{}], m.index || 0, m.nodes);
      if (value && typeof value === 'object') value = JSON.parse(JSON.stringify(value));
      if (typeof value === 'function') throw new Error('Het resultaat is een functie — vergeet je de haakjes ()?');
    } else {
      const r = await runCode(m.code, m.mode, m.items || [], m.nodes); value = JSON.parse(JSON.stringify(r.out)); logs = r.logs;
    }
    parent.postMessage({ id: m.id, ok: true, value: value === undefined ? { __undef: true } : value, logs }, '*');
  } catch (err) { parent.postMessage({ id: m.id, ok: false, error: String(err && err.message || err) }, '*'); }
});
parent.postMessage({ ready: true }, '*');
