/* Polyglot Studio v2 — Greek keyboard, speech, handwriting pad, Apple Pencil */
'use strict';

/* ======================= Greek keyboard ======================= */
const TONOS = { 'α': 'ά', 'ε': 'έ', 'η': 'ή', 'ι': 'ί', 'ο': 'ό', 'υ': 'ύ', 'ω': 'ώ', 'Α': 'Ά', 'Ε': 'Έ', 'Η': 'Ή', 'Ι': 'Ί', 'Ο': 'Ό', 'Υ': 'Ύ', 'Ω': 'Ώ' };
const DIAL = { 'ι': 'ϊ', 'υ': 'ϋ', 'Ι': 'Ϊ', 'Υ': 'Ϋ', 'ί': 'ΐ', 'ύ': 'ΰ' };
const LATIN_TO_GREEK = { q: ';', w: 'ς', e: 'ε', r: 'ρ', t: 'τ', y: 'υ', u: 'θ', i: 'ι', o: 'ο', p: 'π', a: 'α', s: 'σ', d: 'δ', f: 'φ', g: 'γ', h: 'η', j: 'ξ', k: 'κ', l: 'λ', z: 'ζ', x: 'χ', c: 'ψ', v: 'ω', b: 'β', n: 'ν', m: 'μ' };
const ROWS = [
  [';', 'ς', 'ε', 'ρ', 'τ', 'υ', 'θ', 'ι', 'ο', 'π'],
  ['α', 'σ', 'δ', 'φ', 'γ', 'η', 'ξ', 'κ', 'λ', '΄'],
  ['⇧', 'ζ', 'χ', 'ψ', 'ω', 'β', 'ν', 'μ', '⌫'],
];

PS.kb = {
  input: null, el: null, shift: false, dead: null,
  coarse() { return window.matchMedia && matchMedia('(pointer: coarse)').matches; },
  wanted() { const s = PS.S.s.settings.greekKb; return s === 'on' || (s === 'auto' && this.coarse()); },
  init() {
    document.addEventListener('focusin', (e) => {
      const t = e.target;
      if (!t || !t.matches || !t.matches('[data-kb="el"], textarea[lang="el"]')) return;
      if (t.dataset.kbMode === 'latin') return;
      if (this.wanted()) this.open(t);
    });
    document.addEventListener('focusout', () => {
      setTimeout(() => {
        const a = document.activeElement;
        if (this.el && !(a && a.matches && a.matches('[data-kb="el"], textarea[lang="el"]')) && !(this.el.contains(a))) this.close();
      }, 120);
    });
    /* Physical keyboard: type Greek with a Latin layout (standard Greek mapping, ; = tonos) */
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (!t || !t.matches || !t.matches('[data-kb="el"], textarea[lang="el"]') || t.readOnly) return;
      if (t.dataset.kbMode === 'latin' || e.metaKey || e.ctrlKey || e.altKey || PS.S.s.settings.greekKb === 'off') return;
      const k = e.key;
      if ((k === ';' || (e.code === 'Semicolon' && !/^[a-z]$/i.test(k))) && !e.shiftKey) { e.preventDefault(); this.dead = this.dead === 'tonos' ? null : 'tonos'; return; }
      if (k === ':' || (k === ';' && e.shiftKey)) { e.preventDefault(); this.dead = 'dial'; return; }
      const lower = k.toLowerCase();
      if (k.length === 1 && LATIN_TO_GREEK[lower]) {
        e.preventDefault();
        let ch = LATIN_TO_GREEK[lower];
        if (k !== lower && ch !== ';') ch = ch === 'ς' ? 'Σ' : ch.toUpperCase();
        this.insert(t, this.applyDead(ch));
      } else if (k.length === 1 && this.dead) {
        this.dead = null;
      }
    });
  },
  applyDead(ch) {
    let out = ch;
    if (this.dead === 'tonos' && TONOS[ch]) out = TONOS[ch];
    else if (this.dead === 'dial' && DIAL[ch]) out = DIAL[ch];
    this.dead = null;
    if (this.el) this.render();
    return out;
  },
  insert(inp, text) {
    const s = inp.selectionStart ?? inp.value.length, e = inp.selectionEnd ?? inp.value.length;
    inp.setRangeText(text, s, e, 'end');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  },
  backspace(inp) {
    const s = inp.selectionStart, e = inp.selectionEnd;
    if (s !== e) inp.setRangeText('', s, e, 'end');
    else if (s > 0) { const chars = [...inp.value.slice(0, s)]; const last = chars.pop() || ''; inp.setRangeText('', s - last.length, s, 'end'); }
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  },
  open(inp) {
    this.input = inp; inp.setAttribute('inputmode', 'none');
    if (!this.el) {
      this.el = document.createElement('div'); this.el.className = 'gkb'; this.el.setAttribute('role', 'group'); this.el.setAttribute('aria-label', 'Grieks toetsenbord');
      document.body.appendChild(this.el);
      this.el.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
      this.el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.press(b.dataset.k); });
    }
    const r = PS.runnerOpen; if (r && r.el) r.el.classList.add('kb-open');
    this.render();
    setTimeout(() => { const rect = inp.getBoundingClientRect(); const kbH = this.el.offsetHeight; if (rect.bottom > innerHeight - kbH - 12) inp.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 50);
  },
  render() {
    const cap = (c) => (this.shift && c.length === 1 && /[α-ως]/.test(c) ? (c === 'ς' ? 'Σ' : c.toUpperCase()) : c);
    const key = (c) => {
      if (c === '⇧') return `<button type="button" class="wide ${this.shift ? 'on' : ''}" data-k="shift" aria-label="Hoofdletter">⇧</button>`;
      if (c === '⌫') return `<button type="button" class="wide" data-k="bs" aria-label="Wissen">⌫</button>`;
      if (c === '΄') return `<button type="button" class="${this.dead === 'tonos' ? 'dead-on' : ''}" data-k="tonos" aria-label="Tonos (klemtoon)">΄</button>`;
      return `<button type="button" data-k="${c}">${cap(c)}</button>`;
    };
    this.el.innerHTML = `<div class="gkb-inner">${ROWS.map((r) => `<div class="gkb-row">${r.map(key).join('')}</div>`).join('')}
      <div class="gkb-row"><button type="button" class="wide" data-k="abc">ABC</button><button type="button" class="${this.dead === 'dial' ? 'dead-on' : ''}" data-k="dial" aria-label="Trema">¨</button><button type="button" data-k=",">,</button><button type="button" class="space" data-k="space">spatie</button><button type="button" data-k=".">.</button><button type="button" class="go" data-k="go">OK</button></div></div>`;
  },
  press(k) {
    const inp = this.input; if (!inp || inp.readOnly) return;
    if (k === 'shift') { this.shift = !this.shift; return this.render(); }
    if (k === 'bs') return this.backspace(inp);
    if (k === 'tonos') { this.dead = this.dead === 'tonos' ? null : 'tonos'; return this.render(); }
    if (k === 'dial') { this.dead = this.dead === 'dial' ? null : 'dial'; return this.render(); }
    if (k === 'space') return this.insert(inp, ' ');
    if (k === 'abc') return this.toggleFor(inp);
    if (k === 'go') {
      const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      inp.dispatchEvent(ev);
      return;
    }
    let ch = k;
    if (this.shift && /[α-ως]/.test(ch)) { ch = ch === 'ς' ? 'Σ' : ch.toUpperCase(); this.shift = false; }
    this.insert(inp, this.applyDead(ch));
    this.render();
  },
  toggleFor(inp) {
    if (inp.dataset.kbMode === 'latin') {
      inp.dataset.kbMode = 'el'; PS.toast('Grieks typen aan');
      if (this.wanted()) { inp.focus(); this.open(inp); }
    } else {
      inp.dataset.kbMode = 'latin'; inp.setAttribute('inputmode', 'text'); this.close();
      PS.toast('Latijnse letters (systeemtoetsenbord)');
      inp.blur(); setTimeout(() => inp.focus(), 60);
    }
  },
  close() {
    if (this.el) { this.el.remove(); this.el = null; }
    if (this.input && this.input.dataset.kbMode !== 'latin') this.input.removeAttribute('inputmode');
    this.input = null; this.dead = null; this.shift = false;
    const r = PS.runnerOpen; if (r && r.el) r.el.classList.remove('kb-open');
  },
};
PS.PS_KB_CLOSE = () => PS.kb.close();

/* ======================= Speech ======================= */
PS.speech = {
  voices: [],
  init() {
    if (!('speechSynthesis' in window)) return;
    const load = () => { this.voices = speechSynthesis.getVoices() || []; };
    load(); speechSynthesis.onvoiceschanged = load;
  },
  full(lang) { return { el: 'el-GR', fr: 'fr-FR', nl: 'nl-BE', en: 'en-US' }[lang] || lang || 'el-GR'; },
  voice(lang) {
    const base = this.full(lang).slice(0, 2);
    const vs = this.voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(base));
    const pref = ['Premium', 'Enhanced', 'Siri', 'Natural', 'Melina', 'Amélie', 'Thomas', 'Audrey', 'Google'];
    for (const p of pref) { const v = vs.find((x) => x.name.includes(p)); if (v) return v; }
    return vs[0] || null;
  },
  say(text, lang = 'el', o = {}) {
    this.stop();
    if (o.audio) {
      const a = new Audio(`audio/${o.audio}`); this.audio = a;
      if (o.rate) a.playbackRate = o.rate;
      return a.play().catch(() => this.tts(text, lang, o));
    }
    return this.tts(text, lang, o);
  },
  tts(text, lang, o = {}) {
    if (!('speechSynthesis' in window) || !text) return;
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = this.full(lang); const v = this.voice(lang); if (v) u.voice = v;
    u.rate = o.rate || (PS.S.s ? PS.S.s.settings.ttsRate : 0.92);
    if (o.onend) u.onend = o.onend;
    speechSynthesis.speak(u);
  },
  stop() { try { if (this.audio) { this.audio.pause(); this.audio = null; } if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) {} },
  canListen() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); },
  listen(lang) {
    return new Promise((resolve, reject) => {
      const R = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!R) return reject(new Error('niet ondersteund'));
      const r = new R(); r.lang = this.full(lang); r.interimResults = false; r.maxAlternatives = 5; r.continuous = false;
      let done = false;
      r.onresult = (e) => { done = true; resolve(Array.from(e.results[0]).map((x) => x.transcript)); };
      r.onerror = (e) => { if (!done) reject(new Error(e.error || 'fout')); };
      r.onend = () => { if (!done) resolve([]); };
      r.start();
      setTimeout(() => { try { r.stop(); } catch (e) {} }, 9000);
    });
  },
  /* Tap-to-hear: [data-say] and Greek words in lesson text */
  bindSay(root) {
    if (!root || root.__sayBound) return; root.__sayBound = true;
    root.addEventListener('click', (e) => {
      const s = e.target.closest('[data-say], .say'); if (!s || !root.contains(s)) return;
      if (s.closest('button') && !s.matches('[data-say]')) return;
      const text = s.dataset.say || s.textContent;
      const lang = s.dataset.lang || s.getAttribute('lang') || (/[Ͱ-Ͽἀ-῿]/.test(text) ? 'el' : 'fr');
      PS.$$('.say.playing', root).forEach((x) => x.classList.remove('playing'));
      s.classList.add('playing');
      PS.speech.say(text, lang, { audio: s.dataset.audio, onend: () => s.classList.remove('playing') });
      setTimeout(() => s.classList.remove('playing'), 2500);
    });
  },
};

/* ======================= Handwriting pad ======================= */
PS.Pad = class {
  constructor(canvas) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.strokes = []; this.cur = null;
    this.size(); this.bind();
    this.ro = new ResizeObserver(() => this.size()); this.ro.observe(canvas);
  }
  color() { return getComputedStyle(this.c).getPropertyValue('--accent').trim() || '#2459c9'; }
  size() {
    const r = this.c.getBoundingClientRect(); if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    this.c.width = Math.round(r.width * dpr); this.c.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.w = r.width; this.h = r.height; this.redraw();
  }
  pt(e) { const r = this.c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure && e.pressure > 0 ? e.pressure : 0.5 }; }
  bind() {
    const c = this.c;
    c.addEventListener('pointerdown', (e) => {
      if (this.locked) return;
      if (e.pointerType === 'touch' && (this.penSeen || PS.pen.seen())) return; /* palm rejection once a pencil was used */
      if (e.pointerType === 'pen') this.penSeen = true;
      c.setPointerCapture(e.pointerId); this.cur = { pts: [this.pt(e)], col: this.color() }; this.strokes.push(this.cur); this.redraw();
      if (this.onStroke) this.onStroke();
      e.preventDefault();
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.cur) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      (evs.length ? evs : [e]).forEach((x) => this.cur.pts.push(this.pt(x)));
      this.drawSeg(this.cur); e.preventDefault();
    });
    const end = () => { this.cur = null; };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  }
  drawSeg(s) {
    const p = s.pts; if (p.length < 2) return;
    const a = p[p.length - 2], b = p[p.length - 1];
    const ctx = this.ctx; ctx.strokeStyle = s.col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = 1.6 + ((a.p + b.p) / 2) * 3.2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  redraw() {
    const ctx = this.ctx; ctx.clearRect(0, 0, this.w || 0, this.h || 0);
    this.strokes.forEach((s) => {
      ctx.strokeStyle = s.col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (s.pts.length === 1) { ctx.fillStyle = s.col; ctx.beginPath(); ctx.arc(s.pts[0].x, s.pts[0].y, 2, 0, 7); ctx.fill(); return; }
      for (let i = 1; i < s.pts.length; i++) { const a = s.pts[i - 1], b = s.pts[i]; ctx.lineWidth = 1.6 + ((a.p + b.p) / 2) * 3.2; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    });
  }
  undo() { this.strokes.pop(); this.redraw(); }
  clear() { this.strokes = []; this.redraw(); }
};

/* ======================= Apple Pencil =======================
   iPadOS turns handwriting into text in normal fields (Scribble) for Dutch, French and English, so those
   answers are still checked automatically. Greek is not supported by Scribble: in practice you write on a
   pad and compare yourself; in tests (the proof) Greek is typed with the on-screen keyboard. */
PS.pen = {
  TESTS: new Set(['mastery', 'retention', 'anchor', 'placement', 'diagnostic']),
  seen() { return !!PS.store.get('polyglot_pen_seen'); },
  active() { const s = PS.S.s.settings.pen || 'auto'; return s === 'on' || (s === 'auto' && this.seen()); },
  test(v) { return this.TESTS.has(v.ctx && v.ctx.mode); },
  greekHand(v, lang) { return this.active() && lang === 'el' && !this.test(v) && !v.forceType; },
  apply() { document.documentElement.classList.toggle('pen-mode', this.active()); },
  init() {
    this.apply();
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'pen' || this.seen()) return;
      PS.store.set('polyglot_pen_seen', 1); this.apply();
      if ((PS.S.s.settings.pen || 'auto') === 'auto') PS.toast(`${PS.icon('pen', 'icon-s')} Apple Pencil herkend — schrijf je antwoorden gewoon in de vakken.`, 4000);
    }, { capture: true, passive: true });
  },
};
