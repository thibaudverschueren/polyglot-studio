/* Polyglot Studio v2 — learning flows: practice, mastery ladder, reviews, drills */
'use strict';

const STEPS = [
  { id: 'opwarmen', label: 'Opwarmen', short: 'Opwarmen', icon: 'zap' },
  { id: 'leren', label: 'Leren', short: 'Leren', icon: 'bookOpen' },
  { id: 'oefenen', label: 'Oefenen', short: 'Oefenen', icon: 'dumbbell' },
  { id: 'productie', label: 'Schrijven', short: 'Schrijven', icon: 'pen' },
  { id: 'meesterproef', label: 'Meesterproef', short: 'Proef', icon: 'graduate' },
];
PS.STEPS = STEPS;
PS.stepLabel = (t, id) => (id === 'productie' ? (t === 'solidity' ? 'Bouwen' : t === 'ai' ? 'Toepassen' : 'Schrijven') : (STEPS.find((s) => s.id === id) || {}).label);

PS.learn = {
  ctx(t, id, mode) { return { track: t, lesson: id, mode }; },
  objectives(L) { return Object.fromEntries((L.objectives || []).map((o) => [o.id, o.text])); },
  /* fraction of the lesson's steps done */
  lessonProgress(t, id) {
    const p = PS.S.peek(t, id); if (!p) return 0;
    if (PS.DONE.has(p.status) && p.status !== 'legacy') return 1;
    const d = p.stepsDone || {};
    return (['leren', 'oefenen', 'productie'].filter((s) => d[s]).length + (PS.DONE.has(p.status) ? 1 : 0)) / 4;
  },
  markStep(t, id, step) {
    const p = PS.S.L(t, id); p.stepsDone = p.stepsDone || {};
    if (!p.stepsDone[step]) { p.stepsDone[step] = Date.now(); PS.S.log({ k: 's', t, l: id, step }); }
    if (p.status === 'new') p.status = 'started';
    PS.S.save();
  },
  skillState(t, id) {
    const L = PS.C.lesson(t, id); const p = PS.S.peek(t, id) || { skills: {} };
    return (L.objectives || []).map((o) => {
      const sk = p.skills[o.id]; const acc = sk && sk.last.length ? sk.last.reduce((a, b) => a + b, 0) / sk.last.length : null;
      return { id: o.id, text: o.text, acc, n: sk ? sk.n : 0 };
    });
  },

  /* ---------------- Adaptive practice ---------------- */
  practice(t, id, opts = {}) {
    const L = PS.C.lesson(t, id); const p = PS.S.L(t, id);
    const items = (L.practice || []).filter((i) => PS.items[i.type]);
    let skills = (L.objectives || []).map((o) => o.id).filter((s) => items.some((i) => i.skill === s));
    if (opts.focus && opts.focus.length) skills = skills.filter((s) => opts.focus.includes(s));
    const hasHigh = Object.fromEntries(skills.map((s) => [s, items.some((i) => i.skill === s && (i.level || 1) >= 2)]));
    const need = 2; const good = Object.fromEntries(skills.map((s) => [s, 0]));
    const seen = new Set(); const retry = []; let answered = 0; const MAX = opts.max || 36;
    const pickFor = (s) => {
      const pool = items.filter((i) => i.skill === s);
      const fresh = pool.filter((i) => !seen.has(i.id)).sort((a, b) => (a.level || 1) - (b.level || 1) || (p.seen[a.id] || 0) - (p.seen[b.id] || 0));
      if (fresh.length) return fresh[0];
      const pool2 = pool.slice().sort((a, b) => (p.seen[a.id] || 0) - (p.seen[b.id] || 0));
      return pool2[Math.floor(Math.random() * Math.min(3, pool2.length))] || null;
    };
    const next = () => {
      if (answered >= MAX) return null;
      const due = retry.findIndex((r) => r.after <= answered);
      if (due >= 0) { const r = retry.splice(due, 1)[0]; return { item: r.item, ctx: this.ctx(t, id, 'practice'), label: 'Nog eens' }; }
      const open = skills.filter((s) => good[s] < need).sort((a, b) => good[a] - good[b] || skills.indexOf(a) - skills.indexOf(b));
      if (!open.length) { if (retry.length) { const r = retry.shift(); return { item: r.item, ctx: this.ctx(t, id, 'practice'), label: 'Nog eens' }; } return null; }
      const pick = pickFor(open[answered % Math.min(open.length, 2)]) || pickFor(open[0]);
      if (!pick) return null;
      seen.add(pick.id);
      return { item: pick, ctx: this.ctx(t, id, 'practice') };
    };
    const onAnswer = (entry, res) => {
      answered++;
      const it = entry.item;
      if (res.score === 1 && (!hasHigh[it.skill] || (it.level || 1) >= 2)) good[it.skill] = (good[it.skill] || 0) + 1;
      if (res.score < 1) retry.push({ item: it, after: answered + 3 });
    };
    const progress = () => skills.reduce((a, s) => a + Math.min(good[s], need), 0) / Math.max(1, skills.length * need);
    return new PS.Runner({
      title: `${PS.icon('dumbbell', 'icon-s')} Oefenen · ${PS.C.track(t).short} ${id}`, track: t, mode: 'practice', next, progress, onAnswer, seed: Date.now(),
      onFinish: (s) => {
        const complete = skills.every((sk) => good[sk] >= need);
        if (complete && !opts.focus) this.markStep(t, id, 'oefenen');
        const objectives = this.objectives(L);
        return {
          title: complete ? 'Klaar voor de Meesterproef' : answered >= MAX ? 'Goed bezig — neem even pauze' : 'Oefenronde gestopt',
          text: complete ? 'Elk leerdoel heb je minstens twee keer correct geproduceerd. Test het nu onder examenvoorwaarden.' : 'Je voortgang is bewaard. Oefen later verder tot elk leerdoel twee keer volledig juist is.',
          objectives, passed: complete ? true : undefined,
          actions: [
            complete ? { label: `Start de Meesterproef ${PS.icon('arrowRight', 'icon-s')}`, primary: true, run: () => PS.go(`#/les/${t}/${id}/meesterproef`) } : { label: 'Verder oefenen', primary: true, run: () => this.practice(t, id, opts).open() },
            { label: 'Terug naar de les', run: () => PS.render() },
          ],
        };
      },
      onClose: () => PS.render(),
    });
  },

  /* ---------------- Test selection (held-out items) ---------------- */
  selectTest(t, id, n, kind) {
    const L = PS.C.lesson(t, id); const p = PS.S.L(t, id); p.testSeen = p.testSeen || {};
    const pool = (L.mastery || []).filter((i) => PS.items[i.type] && !PS.SELF_GRADED.has(i.type) && i.type !== 'speak' && !(i.type === 'code' && kind !== 'mastery'));
    const rnd = PS.rng(Date.now());
    const score = (i) => (p.testSeen[i.id] || 0) * 10 + (PS.PRODUCTION.has(i.type) ? 0 : 3) - (i.level || 1) + rnd() * 2.5;
    const chosen = []; const used = new Set();
    const objs = (L.objectives || []).map((o) => o.id);
    PS.shuffle(objs, rnd).forEach((o) => {
      if (chosen.length >= n) return;
      const c = pool.filter((i) => i.skill === o && !used.has(i.id)).sort((a, b) => score(a) - score(b))[0];
      if (c) { chosen.push(c); used.add(c.id); }
    });
    pool.filter((i) => !used.has(i.id)).sort((a, b) => score(a) - score(b)).forEach((i) => { if (chosen.length < n) { chosen.push(i); used.add(i.id); } });
    return PS.shuffle(chosen, rnd).sort((a, b) => (a.type === 'code') - (b.type === 'code'));
  },
  cumulative(t, id, k) {
    const ids = PS.C.lessonIds(t).filter((x) => x < id && PS.S.isDone(t, x)).slice(-3);
    const out = [];
    PS.shuffle(ids).forEach((pid) => {
      if (out.length >= k) return;
      const L = PS.C.lesson(t, pid);
      const c = PS.shuffle((L.mastery || []).filter((i) => ['type', 'cloze', 'mcq', 'numeric', 'order'].includes(i.type)))[0];
      if (c) out.push({ item: c, ctx: this.ctx(t, pid, 'mastery'), label: `Les ${pid}`, skillKey: `${t}:${pid}/${c.skill}` });
    });
    return out;
  },
  mastery(t, id) {
    const L = PS.C.lesson(t, id); const p = PS.S.L(t, id);
    const own = this.selectTest(t, id, 10, 'mastery');
    own.forEach((i) => { p.testSeen[i.id] = (p.testSeen[i.id] || 0) + 1; });
    const entries = own.map((item) => ({ item, ctx: this.ctx(t, id, 'mastery') })).concat(this.cumulative(t, id, 2));
    const ordered = PS.shuffle(entries).sort((a, b) => (a.item.type === 'code') - (b.item.type === 'code'));
    return new PS.Runner({
      title: `${PS.icon('graduate', 'icon-s')} Meesterproef · ${PS.C.track(t).short} ${id}`, track: t, mode: 'mastery', entries: ordered, feedback: 'end',
      onFinish: (s) => {
        const passed = PS.T.record(t, id, 'mastery', s);
        const objectives = this.objectives(L);
        const weak = Object.entries(s.perSkill).filter(([k, [got, n]]) => !k.includes('/') && got / n < 0.85).map(([k]) => k);
        const nextId = PS.C.lessonIds(t).find((x) => x > id);
        return passed ? {
          passed: true, objectives, title: 'Geleerd!',
          text: `Morgen volgt een korte <strong>retentiecheck</strong>: pas als je het dan nog kent, staat deze les op <em>Beheerst</em>. De kaarten van deze les zitten nu in je herhaalstapel.`,
          actions: [nextId ? { label: `Volgende les ${PS.icon('arrowRight', 'icon-s')}`, primary: true, run: () => PS.go(`#/les/${t}/${nextId}`) } : { label: 'Naar het leerpad', primary: true, run: () => PS.go(`#/pad/${t}`) }, { label: 'Vandaag', run: () => PS.go('#/') }],
        } : {
          passed: false, objectives, title: 'Nog niet',
          text: `Je hebt ${PS.pct(PS.T.PASS.mastery)}% nodig én elk leerdoel minstens één keer volledig juist. Oefen eerst gericht (6 juiste antwoorden) — daarna krijg je een nieuwe proef met andere vragen.`,
          actions: [{ label: 'Oefen gericht', primary: true, run: () => this.practice(t, id, { focus: weak.length ? weak : null }).open() }, { label: 'Terug naar de les', run: () => PS.render() }],
        };
      },
      onClose: () => PS.render(),
    });
  },
  check(t, id, kind) {
    const L = PS.C.lesson(t, id); const p = PS.S.L(t, id);
    const n = kind === 'placement' ? 8 : 6;
    const own = this.selectTest(t, id, n, kind);
    own.forEach((i) => { p.testSeen[i.id] = (p.testSeen[i.id] || 0) + 1; });
    return new PS.Runner({
      title: `${PS.icon('target', 'icon-s')} ${PS.CHECK_LABEL[kind]} · ${PS.C.track(t).short} ${id}`, track: t, mode: kind, entries: own.map((item) => ({ item, ctx: this.ctx(t, id, kind) })), feedback: 'end',
      onFinish: (s) => {
        const passed = PS.T.record(t, id, kind, s);
        const objectives = this.objectives(L);
        const lbl = { placement: ['Bevestigd: Beheerst', 'Je kent deze les nog na het oude systeem.'], retention: ['Beheerst', 'Je kent het nog een dag later. Over een week volgt de verankeringscheck.'], anchor: ['Verankerd', 'Na een week nog steeds paraat — dit zit in je lange-termijngeheugen.'] }[kind];
        return passed
          ? { passed: true, objectives, title: lbl[0], text: lbl[1], actions: [{ label: 'Verder', primary: true, run: () => (PS.session.active ? PS.session.next() : PS.render()) }] }
          : { passed: false, objectives, title: 'Nog niet stevig genoeg', text: 'Geen probleem: de kaarten van deze les komen vaker terug en je kunt gericht oefenen. Morgen probeer je de check opnieuw.', actions: [{ label: 'Oefen deze les', primary: true, run: () => this.practice(t, id, {}).open() }, { label: 'Verder', run: () => (PS.session.active ? PS.session.next() : PS.render()) }] };
      },
      onClose: (s) => { if (!s) { PS.session.active = false; PS.render(); } },
    });
  },
  /* Niveautest: calibrates the level; results go to Antigravity the next morning */
  diagnostic(t, id) {
    const L = PS.C.lesson(t, id); const D = L.diagnostic;
    const bands = D.bands || [...new Set(D.items.map((i) => i.band))];
    const entries = D.items.map((item) => ({ item, ctx: this.ctx(t, id, 'diagnostic'), skillKey: `band:${item.band}` }))
      .sort((a, b) => bands.indexOf(a.item.band) - bands.indexOf(b.item.band));
    return new PS.Runner({
      title: `${PS.icon('compass', 'icon-s')} Niveautest · ${PS.C.track(t).short}`, track: t, mode: 'diagnostic', entries, feedback: 'end',
      onFinish: (s) => {
        const per = {}; bands.forEach((b) => { per[b] = [0, 0]; });
        s.results.forEach(({ entry, res }) => { const b = entry.item.band; if (!per[b]) per[b] = [0, 0]; per[b][0] += res.score; per[b][1]++; });
        let level = null; let ok = true;
        bands.forEach((b) => { const [g, n] = per[b]; const acc = n ? g / n : 0; if (ok && acc >= 0.7) level = b; if (acc < 0.6) ok = false; });
        const p = PS.S.L(t, id);
        p.diagnostic = { at: Date.now(), score: +s.score.toFixed(3), level: level || `< ${bands[0]}`, bands: Object.fromEntries(Object.entries(per).map(([b, [g, n]]) => [b, [+g.toFixed(2), n]])) };
        PS.S.log({ k: 't', t, l: id, kind: 'diagnostic', sc: +s.score.toFixed(3), pass: true, n: s.n, level: p.diagnostic.level, sk: p.diagnostic.bands });
        this.markStep(t, id, 'opwarmen');
        return {
          title: `Geschat niveau: ${PS.esc(p.diagnostic.level)}`, hideScore: false,
          text: `Per niveau: ${Object.entries(per).map(([b, [g, n]]) => `<strong>${PS.esc(b)}</strong> ${n ? PS.pct(g / n) : 0}%`).join(' · ')}.<br>Je coach (Antigravity) gebruikt dit morgenochtend om de volgende lessen op jouw niveau af te stemmen — sneller door wat je al kent, extra aandacht voor wat wringt.`,
          objectives: Object.fromEntries(bands.map((b) => [`band:${b}`, `Niveau ${b}`])),
          actions: [{ label: `Start de les ${PS.icon('arrowRight', 'icon-s')}`, primary: true, run: () => PS.go(`#/les/${t}/${id}/leren`) }],
        };
      },
      onClose: () => PS.render(),
    });
  },
  warmup(t, id) {
    const due = PS.SRS.dueKeys(t).slice(0, 5).map((k) => ({ card: k }));
    const entries = due.map(({ card }) => this.cardEntry(card)).filter(Boolean);
    if (entries.length < 4) {
      const prev = PS.C.lessonIds(t).filter((x) => x < id).slice(-2);
      prev.forEach((pid) => {
        const L = PS.C.lesson(t, pid);
        PS.shuffle((L.practice || []).filter((i) => (i.level || 1) >= 2 && ['type', 'cloze', 'mcq', 'numeric', 'order'].includes(i.type))).slice(0, 3 - Math.floor(entries.length / 2)).forEach((item) => entries.push({ item, ctx: this.ctx(t, pid, 'warmup'), label: `Les ${pid}` }));
      });
    }
    return new PS.Runner({
      title: `${PS.icon('zap', 'icon-s')} Opwarmer`, track: t, mode: 'warmup', entries: entries.slice(0, 6),
      onAnswer: (e, res, v) => { if (e.cardKey) PS.SRS.grade(e.cardKey, res.q || this.q(res, v), 0); },
      onFinish: (s) => { this.markStep(t, id, 'opwarmen'); return { title: 'Opgewarmd', text: 'Je hoofd staat aan. Tijd voor nieuwe stof.', hideMistakes: false, actions: [{ label: `Naar Leren ${PS.icon('arrowRight', 'icon-s')}`, primary: true, run: () => PS.go(`#/les/${t}/${id}/leren`) }] }; },
      onClose: () => PS.render(),
    });
  },
  q(res, v) { if (res.score === 1) return (v && performance.now() - v.t0 < 6000) ? 5 : 4; return res.score > 0 ? 3 : 1; },
  cardEntry(key) {
    const c = PS.C.card(key); if (!c) return null;
    const [t, l] = key.split(':');
    const item = c.answers && c.answers.length
      ? { id: key, type: 'card', prompt: c.front, answers: c.answers, lang: c.lang, back: c.back, typos: c.typos, explain: c.back && c.kind !== 'vocab' ? c.back : '' }
      : { id: key, type: 'flip', prompt: c.front, back: c.back };
    return { item, ctx: { track: t, lesson: Number(l), mode: 'review' }, cardKey: key, label: `${PS.C.track(t).short} · Les ${l}` };
  },
  review(filter = null) {
    let keys = PS.SRS.dueKeys(filter);
    const byTrack = {}; keys.forEach((k) => { const t = k.split(':')[0]; (byTrack[t] = byTrack[t] || []).push(k); });
    const mixed = []; const tracks = Object.keys(byTrack);
    while (mixed.length < keys.length) tracks.forEach((t) => { const k = byTrack[t].shift(); if (k) mixed.push(k); });
    keys = mixed.slice(0, 60);
    const queue = keys.map((k) => this.cardEntry(k)).filter(Boolean);
    const again = new Set(); let done = 0; const total = queue.length;
    return new PS.Runner({
      title: `${PS.icon('repeat', 'icon-s')} Herhaling`, mode: 'review', track: filter,
      next: () => queue.shift() || null,
      progress: () => done / Math.max(1, total),
      onAnswer: (entry, res, v) => {
        const q = res.q || this.q(res, v);
        PS.SRS.grade(entry.cardKey, q, v ? performance.now() - v.t0 : 0);
        if (q < 3 && !again.has(entry.cardKey)) { again.add(entry.cardKey); const e2 = this.cardEntry(entry.cardKey); e2.label = 'Nog eens'; queue.splice(Math.min(queue.length, 4), 0, e2); }
        else done++;
      },
      onFinish: (s) => {
        const c = PS.SRS.counts();
        return { title: s.n ? 'Herhaling klaar' : 'Niets te herhalen', text: `${c.today ? `Nog ${c.today} kaarten vandaag. ` : ''}Morgen: ${c.tomorrow} kaarten.`, hideSkills: true, actions: [{ label: 'Verder', primary: true, run: () => (PS.session.active ? PS.session.next() : PS.render()) }] };
      },
      onClose: (s) => { if (!s) { PS.session.active = false; PS.render(); } },
    });
  },
  drill(pack) {
    const entries = [];
    (pack.drills || []).forEach((d) => (d.items || []).forEach((item) => {
      const m = String(item.skill || '').match(/^(\w+):(\d+)\/(.+)$/);
      const t = d.track; const l = m ? Number(m[2]) : 0;
      entries.push({ item, ctx: { track: t, lesson: l || null, mode: 'drill' }, label: PS.C.track(t) ? PS.C.track(t).short : '' });
    }));
    return new PS.Runner({
      title: `${PS.icon('sparkles', 'icon-s')} Coach-training`, mode: 'drill', entries,
      onFinish: (s) => {
        const st = PS.S.s; st.drills = st.drills || {}; st.drills[pack.date] = { score: s.score, at: Date.now() }; PS.S.save();
        return { title: 'Training afgerond', text: 'Je resultaten gaan morgen mee naar je coach.', hideSkills: true, actions: [{ label: 'Verder', primary: true, run: () => (PS.session.active ? PS.session.next() : PS.render()) }] };
      },
      onClose: (s) => { if (!s) { PS.session.active = false; PS.render(); } },
    });
  },
};

/* ---------------- Daily session: checks → reviews → coach → lesson ---------------- */
PS.session = {
  active: false, steps: [],
  plan() {
    const steps = [];
    PS.C.tracks().forEach((t) => { const id = PS.S.active(t); const L = id && PS.C.lesson(t, id); const p = id && PS.S.peek(t, id); if (L && L.diagnostic && !(p && p.diagnostic)) steps.push({ kind: 'diagnostic', t, id }); });
    PS.T.dueChecks().forEach((c) => steps.push({ kind: 'check', t: c.t, id: c.id, checkKind: c.kind }));
    if (PS.SRS.counts().today) steps.push({ kind: 'review' });
    const pack = PS.coachPack();
    if (pack && !(PS.S.s.drills || {})[pack.date] && (pack.drills || []).some((d) => (d.items || []).length)) steps.push({ kind: 'drill', pack });
    return steps;
  },
  start() { this.steps = this.plan(); this.active = true; this.next(); },
  next() {
    const s = this.steps.shift();
    if (!s) {
      this.active = false;
      const t = PS.C.tracks().find((x) => PS.S.active(x));
      const id = t ? PS.S.active(t) : null;
      PS.render();
      if (id) { PS.toast('Herhaling klaar — tijd voor nieuwe stof'); PS.go(`#/les/${t}/${id}`); }
      return;
    }
    if (s.kind === 'review') return PS.learn.review().open();
    if (s.kind === 'drill') return PS.learn.drill(s.pack).open();
    if (s.kind === 'diagnostic') { const r = PS.learn.diagnostic(s.t, s.id); const oc = r.o.onClose; r.o.onClose = (sum) => { if (sum) { PS.session.next(); } else { PS.session.active = false; oc && oc(); } }; r.o.onFinish = ((f) => (sm) => { const v = f(sm); v.actions = [{ label: 'Verder', primary: true, run: () => {} }]; return v; })(r.o.onFinish); return r.open(); }
    return PS.learn.check(s.t, s.id, s.checkKind).open();
  },
};

/* The most recent coach pack (today or yesterday) */
PS.coachPack = () => {
  const cloud = PS.cloudPacks || PS.store.get('polyglot_coach_cache') || [];
  const packs = cloud.concat(PS.C.data.daily || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const p = packs[0];
  if (!p) return null;
  return PS.daysBetween(new Date(p.date + 'T12:00').getTime(), Date.now()) <= 2 ? p : null;
};
