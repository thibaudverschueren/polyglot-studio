/* Polyglot Studio v2 — core helpers (namespace, icons, text, answer checking) */
'use strict';
const PS = (window.PS = window.PS || {});

/* ---------- DOM & strings ---------- */
PS.$ = (sel, root = document) => root.querySelector(sel);
PS.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
PS.esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
PS.attr = PS.esc;
PS.clamp = (x, a, b) => Math.max(a, Math.min(b, x));
PS.pct = (x) => Math.round(100 * (x || 0));
PS.plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
PS.pad2 = (n) => String(n).padStart(2, '0');

/* ---------- Icons (24px line icons) ---------- */
const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  today: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2.5v3M16 2.5v3"/><path d="M8.5 14.5l2.3 2.2 4.7-4.7"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5z"/>',
  bookOpen: '<path d="M2 4h7a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H2z"/><path d="M22 4h-7a3 3 0 0 0-3 3v14a2 2 0 0 1 2-2h8z"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-6"/>',
  sliders: '<path d="M4 6h9M18 6h2M4 12h3M12 12h8M4 18h11M20 18h0"/><circle cx="15.5" cy="6" r="2.2"/><circle cx="9.5" cy="12" r="2.2"/><circle cx="17.5" cy="18" r="2.2"/>',
  flame: '<path d="M12 22c4 0 7-2.7 7-6.8 0-3.3-2-5.6-3.6-7.3-.5 1.8-1.5 3-2.9 3.4.4-3.4-1-6.6-3.9-9.3.2 3.7-1.8 5.9-3.4 7.8C3.8 11.5 5 12.8 5 15.2 5 19.3 8 22 12 22z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  xCircle: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  play: '<path d="M7 4.8v14.4a.8.8 0 0 0 1.2.7l11.4-7.2a.8.8 0 0 0 0-1.4L8.2 4.1A.8.8 0 0 0 7 4.8z"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  eraser: '<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21z"/><path d="M22 21H7M5 11l9 9"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  sparkles: '<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14 7 22l5-3 5 3-1.5-8"/>',
  graduate: '<path d="M22 9 12 4 2 9l10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/><path d="M22 9v6"/>',
  sync: '<path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 12a9 9 0 0 1 15.4-6.4L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  cloud: '<path d="M17.5 19H7a5 5 0 1 1 .9-9.9A6 6 0 0 1 19.4 11 4 4 0 0 1 17.5 19z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  beaker: '<path d="M9 3h6M10 3v6L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3"/><path d="M7 15h10"/>',
  terminal: '<path d="m4 17 6-5-6-5M12 19h8"/>',
  rocket: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M9 15l-3-3c1-3 4-8 12-9-1 8-6 11-9 12z"/><circle cx="15" cy="9" r="1.5"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  skip: '<path d="m5 4 10 8-10 8z"/><path d="M19 5v14"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  message: '<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6.2A8 8 0 1 1 21 12z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  feather: '<path d="M20.2 12.2A6 6 0 0 0 11.8 3.8L5 10.5V19h8.5z"/><path d="M16 8 2 22M17.5 15H9"/>',
};
PS.icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.info}</svg>`;

/* ---------- Storage (never throws) ---------- */
PS.store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { console.warn('storage full?', e); return false; }
  },
  raw(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  del(key) { try { localStorage.removeItem(key); } catch (e) {} },
};

/* ---------- Time ---------- */
PS.now = () => Date.now();
PS.dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${PS.pad2(d.getMonth() + 1)}-${PS.pad2(d.getDate())}`; };
PS.today = () => PS.dayKey();
PS.startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
PS.DAY = 86400000;
PS.daysBetween = (a, b) => Math.round((PS.startOfDay(b) - PS.startOfDay(a)) / PS.DAY);
PS.fmtDate = (t = Date.now(), opts = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(t).toLocaleDateString('nl-BE', opts);
PS.fmtRel = (t) => {
  const d = PS.daysBetween(Date.now(), t);
  if (d <= 0) return 'vandaag';
  if (d === 1) return 'morgen';
  if (d < 7) return `over ${d} dagen`;
  if (d < 30) return `over ${Math.round(d / 7)} wk`;
  return `over ${Math.round(d / 30)} mnd`;
};
PS.uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- Seeded randomness ---------- */
PS.rng = (seed) => {
  let a = typeof seed === 'number' ? seed : [...String(seed)].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0), 1779033703);
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};
PS.shuffle = (arr, rnd = Math.random) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
PS.pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];

/* ---------- Text normalisation & answer comparison ---------- */
const COMBINING = /[̀-ͯ]/g;
PS.stripAccents = (s) => String(s).normalize('NFD').replace(COMBINING, '').normalize('NFC');

PS.norm = (s, lang = 'nl', o = {}) => {
  let t = String(s == null ? '' : s).normalize('NFC');
  t = t.replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”«»„]/g, '"')
    .replace(/;/g, ';')
    .replace(/·/g, '·')
    .replace(/[   ​]/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (lang === 'code') {
    t = t.replace(/\s*([(){}\[\];,=<>+\-*/%!&|:.?^~])\s*/g, '$1').replace(/;+$/, '');
    return o.caseSensitive === false ? t.toLowerCase() : t;
  }
  if (lang === 'num') return t.replace(/\s/g, '').replace(',', '.');
  t = t.replace(/[,.!?;:«»"…¿¡·]/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^'+|'+$/g, '');
  if (!o.caseSensitive) t = t.toLocaleLowerCase(lang === 'el' ? 'el' : lang === 'fr' ? 'fr' : undefined);
  return t;
};

// Optimal string alignment distance (Damerau–Levenshtein, restricted)
PS.dist = (a, b) => {
  a = [...a]; b = [...b];
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => { const r = new Array(n + 1).fill(0); r[0] = i; return r; });
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[m][n];
};

const matchError = (user, errors, lang, o) => {
  if (!errors) return null;
  const u = PS.norm(user, lang, o);
  for (const e of errors) {
    const m = String(e.match || '');
    if (m.length > 2 && m.startsWith('/') && m.lastIndexOf('/') > 0) {
      const last = m.lastIndexOf('/');
      try { if (new RegExp(m.slice(1, last), m.slice(last + 1) || 'i').test(String(user).trim())) return e; } catch (err) {}
    } else if (PS.norm(m, lang, o) === u) return e;
  }
  return null;
};

/**
 * Compare a user answer with accepted answers.
 * Returns {score: 1 | 0.5 | 0, kind, answer, error?}
 * kinds: exact · accent (only diacritics differ) · sigma (σ/ς misuse) · typo · wrong · empty
 */
PS.compare = (user, answers, o = {}) => {
  const lang = o.lang || 'nl';
  const list = (Array.isArray(answers) ? answers : [answers]).filter((a) => a != null && String(a).trim() !== '');
  const u = PS.norm(user, lang, o);
  if (!u) return { score: 0, kind: 'empty', answer: list[0] };
  const normed = list.map((a) => PS.norm(a, lang, o));
  const i = normed.indexOf(u);
  if (i >= 0) return { score: 1, kind: 'exact', answer: list[i] };
  const err = matchError(user, o.errors, lang, o);
  if (err) return { score: 0, kind: 'wrong', answer: list[0], error: err };
  if (lang !== 'code' && lang !== 'num') {
    const us = u.replace(/ς/g, 'σ');
    for (let k = 0; k < normed.length; k++) {
      if (lang === 'el' && normed[k].replace(/ς/g, 'σ') === us) return { score: 0.5, kind: 'sigma', answer: list[k] };
    }
    const ua = PS.stripAccents(u);
    for (let k = 0; k < normed.length; k++) {
      if (PS.stripAccents(normed[k]) === ua) {
        if (o.accentsOptional) return { score: 1, kind: 'exact', answer: list[k] };
        return { score: 0.5, kind: 'accent', answer: list[k] };
      }
    }
    const typos = o.typos != null ? o.typos : (lang === 'nl' || lang === 'en');
    if (typos) {
      for (let k = 0; k < normed.length; k++) {
        const n = PS.stripAccents(normed[k]);
        const dd = PS.dist(ua, n);
        if ((n.length >= 7 && dd === 1) || (n.length >= 16 && dd <= 2)) return { score: 0.5, kind: 'typo', answer: list[k] };
      }
    }
  }
  let best = 0, bd = Infinity;
  normed.forEach((n, k) => { const dd = PS.dist(u, n); if (dd < bd) { bd = dd; best = k; } });
  return { score: 0, kind: 'wrong', answer: list[best] };
};

PS.compareNumeric = (user, item) => {
  const raw = String(user || '').trim().replace(/\s/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!raw) return { score: 0, kind: 'empty' };
  let v = Number(raw.replace(/[^0-9eE.+\-]/g, ''));
  const m = raw.match(/^([-+]?[\d.]+(?:e[-+]?\d+)?)\s*[x×*]\s*10\^?([-+]?\d+)$/i);
  if (m) v = Number(m[1]) * Math.pow(10, Number(m[2]));
  if (!isFinite(v)) return { score: 0, kind: 'wrong' };
  const target = Number(item.value);
  const tol = item.abs != null ? Number(item.abs) : Math.abs(target) * (item.tolerance != null ? Number(item.tolerance) : 0.01);
  if (Math.abs(v - target) <= tol + 1e-12) return { score: 1, kind: 'exact' };
  if (item.tolerance2 != null && Math.abs(v - target) <= Math.abs(target) * item.tolerance2) return { score: 0.5, kind: 'close' };
  return { score: 0, kind: 'wrong' };
};

/* Character-level diff (LCS) → {user, correct} as HTML with <del>/<ins> */
PS.diffHtml = (user, correct) => {
  const a = [...String(user || '').normalize('NFC')], b = [...String(correct || '').normalize('NFC')];
  if (a.length * b.length > 40000) return { user: PS.esc(user), correct: PS.esc(correct) };
  const m = a.length, n = b.length;
  const L = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) {
    L[i][j] = a[i].toLowerCase() === b[j].toLowerCase() ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  }
  let i = 0, j = 0, us = '', cs = '';
  while (i < m && j < n) {
    if (a[i].toLowerCase() === b[j].toLowerCase()) { us += PS.esc(a[i]); cs += PS.esc(b[j]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { us += `<del>${PS.esc(a[i])}</del>`; i++; }
    else { cs += `<ins>${PS.esc(b[j])}</ins>`; j++; }
  }
  while (i < m) us += `<del>${PS.esc(a[i++])}</del>`;
  while (j < n) cs += `<ins>${PS.esc(b[j++])}</ins>`;
  return { user: us.replace(/<\/del><del>/g, ''), correct: cs.replace(/<\/ins><ins>/g, '') };
};

/* ---------- Feedback helpers ---------- */
PS.toast = (msg, ms = 2400) => {
  let wrap = PS.$('.toast-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  const t = document.createElement('div');
  t.className = 'toast'; t.innerHTML = msg;
  wrap.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, ms);
};

PS.haptic = (kind) => { try { if (navigator.vibrate) navigator.vibrate(kind === 'bad' ? [30, 40, 30] : 12); } catch (e) {} };

PS.confetti = () => {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas'); c.className = 'confetti'; document.body.appendChild(c);
  const dpr = window.devicePixelRatio || 1; c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
  const cs = getComputedStyle(document.documentElement);
  const cols = ['--greek', '--french', '--solidity', '--ai', '--warn'].map((v) => cs.getPropertyValue(v).trim() || '#888');
  const P = Array.from({ length: 120 }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 11, vy: -Math.random() * 11 - 4, r: Math.random() * 6 + 3, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3, c: cols[Math.floor(Math.random() * cols.length)] }));
  let f = 0;
  const tick = () => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    P.forEach((p) => { p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); });
    if (++f < 150) requestAnimationFrame(tick); else c.remove();
  };
  requestAnimationFrame(tick);
};

PS.ring = (value, size = 44, stroke = 5, label = '') => {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r, off = C * (1 - PS.clamp(value || 0, 0, 1));
  return `<span class="ring-wrap" style="width:${size}px;height:${size}px"><svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/><circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/></svg>${label ? `<span class="ring-label">${label}</span>` : ''}</span>`;
};

PS.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
