/* Polyglot Studio v2 — state, events, content access, SRS */
'use strict';

/* ======================= Content ======================= */
PS.C = {
  data: null,
  load() {
    const el = document.getElementById('ps-content');
    this.data = el ? JSON.parse(el.textContent) : { tracks: {}, lessons: {}, syllabus: {}, daily: [] };
    this.data.order = ['greek', 'french', 'solidity', 'ai', 'automation', 'jev'].filter((t) => this.data.tracks[t]);
    return this.data;
  },
  tracks() { return this.data.order; },
  track(t) { return this.data.tracks[t]; },
  lessonIds(t) { return (this.data.tracks[t] && this.data.tracks[t].lessons) || []; },
  lesson(t, id) { return this.data.lessons[`${t}:${id}`] || null; },
  syllabus(t) { return (this.data.syllabus && this.data.syllabus[t]) || null; },
  item(t, id, itemId) {
    const L = this.lesson(t, id); if (!L) return null;
    for (const s of L.sections || []) for (const it of s.checks || []) if (it.id === itemId) return it;
    return (L.practice || []).find((x) => x.id === itemId) || (L.mastery || []).find((x) => x.id === itemId) || null;
  },
  /* Cards: explicit lesson cards + two directions per vocab entry */
  cardsOf(t, id) {
    const L = this.lesson(t, id); if (!L) return [];
    const out = [];
    (L.vocab || []).forEach((v, i) => {
      const lang = this.track(t).lang || 'nl';
      const meanings = String(v.meaning || '').split(/\s*[;/]\s*/).map((m) => m.replace(/\(.*?\)/g, '').trim()).filter(Boolean);
      out.push({ key: `${t}:${id}:v${i}`, kind: 'vocab', front: `<span class="muted small">Vertaal naar het ${t === 'greek' ? 'Grieks' : 'Frans'}</span><br>${PS.esc(v.meaning)}`, back: `<span lang="${lang.slice(0, 2)}">${PS.esc(v.term)}</span>${v.translit ? ` <span class="muted small">(${PS.esc(v.translit)})</span>` : ''}`, answers: [v.term].concat(v.alt || []), lang: lang.slice(0, 2), say: v.term, sayLang: lang });
      out.push({ key: `${t}:${id}:v${i}r`, kind: 'vocab', front: `<span lang="${lang.slice(0, 2)}">${PS.esc(v.term)}</span>`, back: PS.esc(v.meaning), answers: meanings.length ? meanings : [v.meaning], lang: 'nl', typos: true, say: v.term, sayLang: lang });
    });
    (L.cards || []).forEach((c) => {
      out.push({ key: `${t}:${id}:${c.id}`, kind: 'card', front: c.front, back: c.back, answers: c.answers, lang: c.lang || 'nl', skill: c.skill });
      if (c.reverse && c.reverse.answers) out.push({ key: `${t}:${id}:${c.id}r`, kind: 'card', front: c.back, back: c.front, answers: c.reverse.answers, lang: c.reverse.lang || 'nl' });
    });
    return out;
  },
  card(key) {
    if (!this._cards) {
      this._cards = new Map();
      Object.keys(this.data.lessons).forEach((lk) => { const [t, id] = lk.split(':'); this.cardsOf(t, Number(id)).forEach((c) => this._cards.set(c.key, c)); });
    }
    return this._cards.get(key) || null;
  },
};

/* ======================= State ======================= */
const STATE_KEY = 'polyglot_v2';
const ORDER = ['new', 'started', 'legacy', 'learned', 'mastered', 'anchored'];
PS.DONE = new Set(['legacy', 'learned', 'mastered', 'anchored']);

PS.S = {
  s: null,
  load() {
    let s = PS.store.get(STATE_KEY);
    if (!s || s.v !== 2) s = this.fresh();
    s.settings = Object.assign(this.fresh().settings, s.settings || {});
    s.settings.sync = Object.assign(this.fresh().settings.sync, s.settings.sync || {});
    s.settings.cloud = Object.assign(this.fresh().settings.cloud, s.settings.cloud || {});
    s.lessons = s.lessons || {}; s.cards = s.cards || {}; s.events = s.events || []; s.days = s.days || {};
    this.s = s;
    this.migrate();
    return s;
  },
  fresh() {
    const ua = navigator.userAgent || '';
    const kind = /iPhone/.test(ua) ? 'iphone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'ipad' : /Mac/.test(ua) ? 'mac' : 'web';
    return {
      v: 2,
      device: `${kind}-${Math.random().toString(36).slice(2, 8)}`,
      created: Date.now(),
      settings: { theme: 'auto', guided: true, greekKb: 'auto', pen: 'auto', ttsRate: 0.92, dailyGoal: 30, cloud: { url: '', key: '' }, sync: { last: 0, error: '', pulled: 0, pushed: 0 } },
      lessons: {}, cards: {}, events: [], days: {}, updated: Date.now(),
    };
  },
  save: PS.debounce(function () { PS.S.flush(); }, 250),
  flush() {
    const s = this.s; s.updated = Date.now();
    if (s.events.length > 16000) { const cut = Date.now() - 150 * PS.DAY; s.events = s.events.filter((e) => e.ts > cut).slice(-16000); }
    if (!PS.store.set(STATE_KEY, s)) { s.events = s.events.slice(-6000); PS.store.set(STATE_KEY, s); }
  },
  /* v2 is a fresh start: every track begins at lesson 1 (old v1 progress is intentionally not imported). */
  migrate() {
    if (!this.s.migrated) { this.s.migrated = Date.now(); this.save(); }
  },
  blankLesson() { return { status: 'new', step: 'learn', stepsDone: {}, tests: [], skills: {}, checks: {}, gate: 0, seen: {} }; },
  L(t, id) {
    const k = `${t}:${id}`;
    if (!this.s.lessons[k]) this.s.lessons[k] = this.blankLesson();
    return this.s.lessons[k];
  },
  peek(t, id) { return this.s.lessons[`${t}:${id}`] || null; },
  status(t, id) { const p = this.peek(t, id); return p ? p.status : 'new'; },
  setStatus(t, id, st) {
    const p = this.L(t, id);
    if (ORDER.indexOf(st) > ORDER.indexOf(p.status) || st === 'started' && p.status === 'new') p.status = st;
    this.save();
  },
  isDone(t, id) { return PS.DONE.has(this.status(t, id)); },
  isUnlocked(t, id) {
    if (!this.s.settings.guided) return true;
    const ids = PS.C.lessonIds(t);
    const idx = ids.indexOf(id);
    if (idx <= 0) return true;
    return this.isDone(t, ids[idx - 1]);
  },
  active(t) {
    const ids = PS.C.lessonIds(t);
    for (const id of ids) if (!this.isDone(t, id)) return id;
    return null;
  },
  /* ---------- events ---------- */
  log(e) {
    e.id = e.id || PS.uid('e'); e.ts = e.ts || Date.now(); e.dev = this.s.device;
    this.s.events.push(e);
    const d = PS.today();
    const day = (this.s.days[d] = this.s.days[d] || { ms: 0, n: 0, sc: 0 });
    if (e.k === 'a' || e.k === 'r') { day.n++; day.sc += e.sc != null ? e.sc : (e.q >= 3 ? 1 : 0); }
    this.save();
    if (PS.sync) PS.sync.soon();
    return e;
  },
  attempt(ctx, item, res, ms, ans) {
    const e = { k: 'a', t: ctx.track, l: ctx.lesson, i: item.id, ty: item.type, sk: item.skill, lv: item.level || 1, sc: res.score, kind: res.kind, ms: Math.round(ms || 0), m: ctx.mode };
    const long = item.type === 'explain' || item.type === 'code';
    if (ans != null && typeof ans !== 'object' && (res.score < 1 || long)) e.ans = String(ans).slice(0, long ? 2000 : 160);
    if (res.error && res.error.tag) e.tag = res.error.tag;
    if (ctx.lesson && ctx.track && ctx.mode !== 'review') {
      const p = this.L(ctx.track, ctx.lesson);
      if (item.skill) {
        const sk = (p.skills[item.skill] = p.skills[item.skill] || { n: 0, sum: 0, last: [] });
        sk.n++; sk.sum += res.score; sk.last = sk.last.concat(res.score).slice(-8);
      }
      p.seen[item.id] = (p.seen[item.id] || 0) + 1;
      if (p.gate > 0 && ctx.mode === 'practice' && res.score === 1) p.gate--;
    }
    return this.log(e);
  },
  tickTime(ms) {
    const d = PS.today();
    const day = (this.s.days[d] = this.s.days[d] || { ms: 0, n: 0, sc: 0 });
    day.ms += ms; this.save();
  },
  streak() {
    const days = this.s.days; let n = 0; let t = Date.now();
    if (!(days[PS.dayKey(t)] && days[PS.dayKey(t)].n > 0)) t -= PS.DAY;
    while (days[PS.dayKey(t)] && days[PS.dayKey(t)].n > 0) { n++; t -= PS.DAY; }
    return n;
  },
  skillAcc(t, id, skill) {
    const p = this.peek(t, id); const sk = p && p.skills[skill];
    if (!sk || !sk.last.length) return null;
    return sk.last.reduce((a, b) => a + b, 0) / sk.last.length;
  },
  lessonMastery(t, id) {
    const st = this.status(t, id);
    return { new: 0, started: 0.15, legacy: 0.5, learned: 0.7, mastered: 0.9, anchored: 1 }[st] || 0;
  },
  trackMastery(t) {
    const ids = PS.C.lessonIds(t); if (!ids.length) return 0;
    const syl = PS.C.syllabus(t); const total = Math.max(ids.length, syl ? syl.topics.length : 0);
    return ids.reduce((a, id) => a + this.lessonMastery(t, id), 0) / total;
  },
};

/* ======================= SRS (SM-2 variant) ======================= */
PS.SRS = {
  NEW_PER_DAY: 30,
  addLesson(t, id, dueAt) {
    const cards = PS.C.cardsOf(t, id); const S = PS.S.s;
    const base = dueAt != null ? dueAt : PS.startOfDay(Date.now() + PS.DAY) + 4 * 3600e3;
    let added = 0;
    cards.forEach((c, i) => {
      if (S.cards[c.key]) return;
      S.cards[c.key] = { due: base + Math.floor(i / this.NEW_PER_DAY) * PS.DAY, ivl: 0, ef: 2.5, reps: 0, lapses: 0, last: 0, added: Date.now() };
      added++;
    });
    PS.S.save();
    return added;
  },
  dueKeys(filterTrack = null, until = PS.startOfDay(Date.now() + PS.DAY) - 1) {
    const S = PS.S.s; const out = [];
    for (const [k, c] of Object.entries(S.cards)) {
      if (c.suspended || c.due > until) continue;
      if (filterTrack && !k.startsWith(filterTrack + ':')) continue;
      if (!PS.C.card(k)) continue;
      out.push(k);
    }
    return out.sort((a, b) => S.cards[a].due - S.cards[b].due);
  },
  counts() {
    const now = Date.now(); const endToday = PS.startOfDay(now + PS.DAY) - 1; const endTomorrow = endToday + PS.DAY;
    let today = 0, tomorrow = 0, total = 0, mature = 0;
    for (const [k, c] of Object.entries(PS.S.s.cards)) {
      total++; if (c.ivl >= 21) mature++;
      if (c.due <= endToday) today++; else if (c.due <= endTomorrow) tomorrow++;
    }
    return { today, tomorrow, total, mature };
  },
  grade(key, q, ms) {
    const c = PS.S.s.cards[key]; if (!c) return;
    const now = Date.now();
    if (q < 3) {
      c.reps = 0; c.lapses++; c.ivl = 0; c.ef = Math.max(1.3, c.ef - 0.2);
      c.due = now + 10 * 60e3;
    } else {
      c.reps++;
      if (c.reps === 1) c.ivl = q === 5 ? 2 : 1;
      else if (c.reps === 2) c.ivl = q === 5 ? 5 : q === 3 ? 2 : 3;
      else c.ivl = Math.max(c.ivl + 1, Math.round(c.ivl * c.ef * (q === 3 ? 0.75 : q === 5 ? 1.3 : 1)));
      if (c.ivl > 4) c.ivl = Math.round(c.ivl * (0.95 + Math.random() * 0.1));
      c.ef = Math.max(1.3, c.ef + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
      c.due = PS.startOfDay(now) + c.ivl * PS.DAY + 4 * 3600e3;
    }
    c.last = now;
    const [t, l] = key.split(':');
    PS.S.log({ k: 'r', card: key, t, l: Number(l), q, ms: Math.round(ms || 0), ivl: c.ivl });
  },
  retention(days = 30) {
    const cut = Date.now() - days * PS.DAY; let n = 0, ok = 0;
    for (const e of PS.S.s.events) if (e.k === 'r' && e.ts > cut) { n++; if (e.q >= 3) ok++; }
    return n ? ok / n : null;
  },
};

/* ======================= Tests (mastery ladder) ======================= */
PS.T = {
  PASS: { mastery: 0.8, retention: 0.8, anchor: 0.8, placement: 0.8, diagnostic: 0 },
  record(t, id, kind, summary) {
    const p = PS.S.L(t, id);
    const passed = summary.score >= this.PASS[kind] && (kind !== 'mastery' || summary.allSkills);
    p.tests.push({ ts: Date.now(), kind, score: +summary.score.toFixed(3), passed, n: summary.n, skills: summary.perSkill });
    p.best = Math.max(p.best || 0, kind === 'mastery' ? summary.score : 0);
    const now = Date.now();
    const tomorrow = PS.startOfDay(now + PS.DAY) + 4 * 3600e3;
    p.checks = p.checks || {};
    if (kind === 'mastery') {
      if (passed) {
        if (!PS.DONE.has(p.status) || p.status === 'legacy') p.status = 'learned';
        p.learnedAt = now; p.needsReview = false;
        p.checks.retention = { due: tomorrow };
        PS.SRS.addLesson(t, id);
      } else { p.gate = 6; }
    } else if (kind === 'retention' || kind === 'placement') {
      delete p.checks[kind];
      if (passed) {
        p.status = 'mastered'; p.masteredAt = now; p.needsReview = false;
        p.checks.anchor = { due: PS.startOfDay(now + 7 * PS.DAY) + 4 * 3600e3 };
        if (kind === 'placement') PS.SRS.addLesson(t, id, tomorrow);
      } else {
        p.needsReview = true;
        p.checks[kind] = { due: tomorrow };
        PS.SRS.addLesson(t, id, Date.now());
      }
    } else if (kind === 'anchor') {
      delete p.checks.anchor;
      if (passed) { p.status = 'anchored'; p.anchoredAt = now; }
      else { p.needsReview = true; p.checks.anchor = { due: PS.startOfDay(now + 3 * PS.DAY) + 4 * 3600e3 }; }
    }
    PS.S.log({ k: 't', t, l: id, kind, sc: +summary.score.toFixed(3), pass: passed, n: summary.n, sk: summary.perSkill });
    PS.S.save();
    return passed;
  },
  dueChecks() {
    const out = []; const now = PS.startOfDay(Date.now() + PS.DAY) - 1;
    for (const [k, p] of Object.entries(PS.S.s.lessons)) {
      for (const [kind, c] of Object.entries(p.checks || {})) {
        if (c && c.due <= now) { const [t, id] = k.split(':'); if (PS.C.lesson(t, Number(id))) out.push({ t, id: Number(id), kind }); }
      }
    }
    const rank = { placement: 0, retention: 1, anchor: 2 };
    return out.sort((a, b) => rank[a.kind] - rank[b.kind] || PS.C.tracks().indexOf(a.t) - PS.C.tracks().indexOf(b.t) || a.id - b.id);
  },
};

PS.CHECK_LABEL = { placement: 'Instapcheck', retention: 'Retentiecheck', anchor: 'Verankeringscheck', mastery: 'Meesterproef', diagnostic: 'Niveautest' };
PS.STATUS_LABEL = { new: 'Nieuw', started: 'Bezig', legacy: 'Oud systeem — te bevestigen', learned: 'Geleerd', mastered: 'Beheerst', anchored: 'Verankerd' };
