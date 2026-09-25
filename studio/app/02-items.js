/* Polyglot Studio v2 — exercise engine (item types, checking, feedback) */
'use strict';

PS.TYPE_LABEL = {
  mcq: 'Meerkeuze', multi: 'Meerdere antwoorden', type: 'Typ het antwoord', cloze: 'Vul aan', order: 'Zinsbouw',
  match: 'Koppel', numeric: 'Bereken', dictation: 'Dictee', speak: 'Uitspraak', code: 'Code', handwrite: 'Handschrift',
  explain: 'Leg uit', flip: 'Kaart', card: 'Herhaalkaart',
};
PS.PRODUCTION = new Set(['type', 'cloze', 'order', 'numeric', 'dictation', 'code', 'explain', 'handwrite', 'card']);
PS.SELF_GRADED = new Set(['explain', 'handwrite']);

const langAttr = (lang) => (lang === 'el' || lang === 'fr' ? ` lang="${lang}"` : '');
const kbToggle = (lang) => (lang === 'el' ? `<button type="button" class="kb-toggle" data-kb-toggle>${PS.icon('keyboard', 'icon-s')}<span>ΑΒΓ</span></button>` : '');

PS.items = {};

/* ---------- mcq ---------- */
PS.items.mcq = {
  render(v) {
    const it = v.item;
    v.order = v.ctx.noShuffle ? it.options.map((_, i) => i) : PS.shuffle(it.options.map((_, i) => i), v.rnd);
    return `<div class="options" role="radiogroup">${v.order.map((oi, k) => `<button type="button" class="option" data-opt="${oi}" aria-pressed="false"><span class="key">${k + 1}</span><span>${it.options[oi]}</span></button>`).join('')}</div>`;
  },
  mount(v) {
    v.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-opt]'); if (!b || v.done) return;
      PS.$$('[data-opt]', v.el).forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      v.ready(true);
      if (v.ctx.mode !== 'mastery' && v.opts.autoSubmitMcq) v.submit();
    });
  },
  key(v, k) { const b = PS.$$('[data-opt]', v.el)[k - 1]; if (b) b.click(); },
  answer(v) { const b = PS.$('[data-opt][aria-pressed="true"]', v.el); return b ? Number(b.dataset.opt) : null; },
  check(v, a) { return a === v.item.answer ? { score: 1, kind: 'exact' } : { score: 0, kind: 'wrong' }; },
  reveal(v, r, a) {
    PS.$$('[data-opt]', v.el).forEach((b) => {
      const oi = Number(b.dataset.opt); b.disabled = true;
      if (oi === v.item.answer) b.classList.add('correct');
      else if (oi === a) b.classList.add('wrong'); else b.classList.add('dim');
    });
  },
  correctText(v) { return v.item.options[v.item.answer]; },
  answerText(v, a) { return a == null ? '' : PS.plain(v.item.options[a]); },
};

/* ---------- multi (select all that apply) ---------- */
PS.items.multi = {
  render(v) {
    const it = v.item; v.order = PS.shuffle(it.options.map((_, i) => i), v.rnd);
    return `<p class="small muted" style="margin:-6px 0 10px">Duid <strong>alle</strong> juiste antwoorden aan.</p><div class="options">${v.order.map((oi, k) => `<button type="button" class="option" data-opt="${oi}" aria-pressed="false"><span class="key">${k + 1}</span><span>${it.options[oi]}</span></button>`).join('')}</div>`;
  },
  mount(v) {
    v.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-opt]'); if (!b || v.done) return;
      b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      v.ready(!!PS.$('[data-opt][aria-pressed="true"]', v.el));
    });
  },
  key(v, k) { const b = PS.$$('[data-opt]', v.el)[k - 1]; if (b) b.click(); },
  answer(v) { return PS.$$('[data-opt][aria-pressed="true"]', v.el).map((b) => Number(b.dataset.opt)).sort(); },
  check(v, a) {
    const right = new Set(v.item.answers); const got = new Set(a);
    let err = 0; right.forEach((x) => { if (!got.has(x)) err++; }); got.forEach((x) => { if (!right.has(x)) err++; });
    return err === 0 ? { score: 1, kind: 'exact' } : err === 1 && v.item.options.length >= 4 ? { score: 0.5, kind: 'partial' } : { score: 0, kind: 'wrong' };
  },
  reveal(v, r, a) {
    const right = new Set(v.item.answers);
    PS.$$('[data-opt]', v.el).forEach((b) => {
      const oi = Number(b.dataset.opt); b.disabled = true;
      if (right.has(oi)) b.classList.add('correct'); else if (a.includes(oi)) b.classList.add('wrong'); else b.classList.add('dim');
    });
  },
  correctText(v) { return v.item.answers.map((i) => v.item.options[i]).join(' · '); },
  answerText(v, a) { return (a || []).map((i) => PS.plain(v.item.options[i])).join(' | '); },
};

/* ---------- type (free recall) ---------- */
PS.items.type = {
  render(v) {
    const it = v.item; const lang = it.lang || 'nl';
    const input = it.long
      ? `<textarea class="answer-input" data-ans${langAttr(lang)} autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="${PS.attr(it.placeholder || 'Typ je antwoord…')}"></textarea>`
      : `<input class="answer-input" data-ans${langAttr(lang)} ${lang === 'el' ? 'data-kb="el"' : ''} autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="${PS.attr(it.placeholder || 'Typ je antwoord…')}">`;
    return `<div class="answer-row">${input}</div><div class="row" style="justify-content:space-between;margin-top:8px">${kbToggle(lang)}${it.hint ? `<button type="button" class="kb-toggle" data-hint>${PS.icon('bulb', 'icon-s')}<span>Hint</span></button>` : '<span></span>'}</div><div class="hint-box small muted" hidden>${it.hint || ''}</div>`;
  },
  mount(v) {
    const inp = PS.$('[data-ans]', v.el);
    inp.addEventListener('input', () => v.ready(inp.value.trim().length > 0));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !v.item.long && !v.done) { e.preventDefault(); v.submit(); } });
    const h = PS.$('[data-hint]', v.el); if (h) h.addEventListener('click', () => { PS.$('.hint-box', v.el).hidden = false; v.usedHint = true; });
    if (v.opts.autofocus !== false) setTimeout(() => inp.focus({ preventScroll: true }), 60);
  },
  answer(v) { return PS.$('[data-ans]', v.el).value; },
  check(v, a) {
    const it = v.item; const lang = it.lang || 'nl';
    const r = PS.compare(a, it.answers, { lang, errors: it.errors, caseSensitive: it.caseSensitive, accentsOptional: it.accentsOptional, typos: it.typos });
    if (v.usedHint && r.score === 1 && v.ctx.mode === 'mastery') r.score = 0.5;
    return r;
  },
  reveal(v, r) { const inp = PS.$('[data-ans]', v.el); inp.readOnly = true; inp.classList.add(r.score === 1 ? 'correct' : r.score > 0 ? 'partial' : 'wrong'); },
  correctText(v, r) { return PS.esc((r && r.answer) || v.item.answers[0]); },
  answerText(v, a) { return a; },
};

/* ---------- cloze ---------- */
PS.items.cloze = {
  render(v) {
    const lang = v.item.lang || 'nl';
    const html = v.item.html.replace(/<span data-blank="(\d+)"><\/span>/g, (_, i) => {
      const w = Math.max(3, ...v.item.blanks[i].map((x) => [...x].length)) + 1;
      return `<input data-blank="${i}"${langAttr(lang)} ${lang === 'el' ? 'data-kb="el"' : ''} style="width:${Math.min(w, 22) * 0.62 + 1.2}em" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="invulveld ${Number(i) + 1}">`;
    });
    return `<div class="cloze"${langAttr(lang)}>${html}</div><div class="row" style="margin-top:8px">${kbToggle(lang)}</div>`;
  },
  mount(v) {
    const ins = PS.$$('input[data-blank]', v.el);
    const upd = () => v.ready(ins.every((i) => i.value.trim()));
    ins.forEach((inp, k) => {
      inp.addEventListener('input', () => { upd(); inp.style.width = Math.max(inp.value.length * 0.62 + 1.4, parseFloat(inp.style.width)) + 'em'; });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !v.done) { e.preventDefault(); if (ins[k + 1] && !ins[k + 1].value) ins[k + 1].focus(); else v.submit(); } });
    });
    if (v.opts.autofocus !== false) setTimeout(() => ins[0] && ins[0].focus({ preventScroll: true }), 60);
  },
  answer(v) { return PS.$$('input[data-blank]', v.el).map((i) => i.value); },
  check(v, a) {
    const lang = v.item.lang || 'nl';
    v.parts = a.map((x, i) => PS.compare(x, v.item.blanks[i], { lang, errors: v.item.errors, accentsOptional: v.item.accentsOptional }));
    const mean = v.parts.reduce((s, r) => s + r.score, 0) / v.parts.length;
    const kinds = v.parts.filter((r) => r.score < 1).map((r) => r.kind);
    const err = v.parts.find((r) => r.error);
    return { score: mean > 0.99 ? 1 : mean >= 0.6 ? 0.5 : 0, kind: kinds.length ? kinds[0] : 'exact', error: err && err.error };
  },
  reveal(v) {
    PS.$$('input[data-blank]', v.el).forEach((inp, i) => {
      const r = v.parts[i]; inp.readOnly = true;
      inp.classList.add(r.score === 1 ? 'correct' : r.score > 0 ? 'partial' : 'wrong');
      if (r.score < 1) inp.title = `Juist: ${v.item.blanks[i][0]}`;
    });
  },
  correctText(v) { return PS.esc(v.item.blanks.map((b) => b[0]).join(' · ')); },
  answerText(v, a) { return (a || []).join(' | '); },
};

/* ---------- order (sentence builder) ---------- */
PS.items.order = {
  render(v) {
    const it = v.item; const lang = it.lang || 'nl';
    const bank = PS.shuffle(it.tiles.concat(it.distractors || []).map((t, i) => ({ t, i })), v.rnd);
    v.picked = [];
    return `<div class="tiles-answer" data-answer${langAttr(lang)}></div><div class="tiles-bank">${bank.map((b) => `<button type="button" class="tile" data-tile="${b.i}"${langAttr(lang)}>${PS.esc(b.t)}</button>`).join('')}</div>`;
  },
  mount(v) {
    const all = v.item.tiles.concat(v.item.distractors || []);
    const ans = PS.$('[data-answer]', v.el); const lang = v.item.lang || 'nl';
    const draw = () => {
      ans.innerHTML = v.picked.map((i, k) => `<button type="button" class="tile" data-back="${k}"${langAttr(lang)}>${PS.esc(all[i])}</button>`).join('');
      PS.$$('[data-tile]', v.el).forEach((b) => b.classList.toggle('used', v.picked.includes(Number(b.dataset.tile))));
      v.ready(v.picked.length > 0);
    };
    v.el.addEventListener('click', (e) => {
      if (v.done) return;
      const t = e.target.closest('[data-tile]'); const b = e.target.closest('[data-back]');
      if (t && !t.classList.contains('used')) { v.picked.push(Number(t.dataset.tile)); draw(); }
      if (b) { v.picked.splice(Number(b.dataset.back), 1); draw(); }
    });
    draw();
  },
  answer(v) { const all = v.item.tiles.concat(v.item.distractors || []); return v.picked.map((i) => all[i]).join(v.item.join != null ? v.item.join : ' '); },
  check(v, a) {
    const lang = v.item.lang || 'nl';
    const answers = [v.item.tiles.join(v.item.join != null ? v.item.join : ' ')].concat(v.item.alts || []);
    const r = PS.compare(a, answers, { lang });
    return r.score === 1 ? r : { score: 0, kind: 'wrong', answer: answers[0] };
  },
  reveal(v, r) { PS.$('[data-answer]', v.el).classList.add(r.score === 1 ? 'correct' : 'wrong'); PS.$$('.tile', v.el).forEach((b) => (b.disabled = true)); },
  correctText(v) { return PS.esc(v.item.tiles.join(v.item.join != null ? v.item.join : ' ')); },
  answerText(v, a) { return a; },
};

/* ---------- match (pairs) ---------- */
PS.items.match = {
  render(v) {
    const it = v.item; v.left = PS.shuffle(it.pairs.map((p, i) => i), v.rnd); v.right = PS.shuffle(it.pairs.map((p, i) => i), v.rnd);
    v.miss = 0; v.done_ = 0;
    const L = (s) => (/[Ͱ-Ͽἀ-῿]/.test(s) ? ' lang="el"' : '');
    return `<div class="match"><div class="stack" style="gap:8px">${v.left.map((i) => `<button type="button" class="option" data-l="${i}"${L(it.pairs[i][0])}><span>${PS.esc(it.pairs[i][0])}</span></button>`).join('')}</div><div class="stack" style="gap:8px">${v.right.map((i) => `<button type="button" class="option" data-r="${i}"${L(it.pairs[i][1])}><span>${PS.esc(it.pairs[i][1])}</span></button>`).join('')}</div></div>`;
  },
  mount(v) {
    let selL = null, selR = null;
    const tryPair = () => {
      if (selL == null || selR == null) return;
      const bl = PS.$(`[data-l="${selL}"]`, v.el), br = PS.$(`[data-r="${selR}"]`, v.el);
      if (selL === selR) {
        [bl, br].forEach((b) => { b.classList.add('correct', 'paired'); b.setAttribute('aria-pressed', 'false'); });
        v.done_++; PS.haptic('good');
        if (v.done_ === v.item.pairs.length) { v.ready(true); setTimeout(() => v.submit(), 250); }
      } else {
        v.miss++; PS.haptic('bad');
        [bl, br].forEach((b) => { b.classList.add('flash-bad'); b.setAttribute('aria-pressed', 'false'); setTimeout(() => b.classList.remove('flash-bad'), 400); });
      }
      selL = selR = null;
    };
    v.el.addEventListener('click', (e) => {
      const l = e.target.closest('[data-l]'), r = e.target.closest('[data-r]');
      if (l && !l.classList.contains('paired')) { PS.$$('[data-l]', v.el).forEach((b) => b.setAttribute('aria-pressed', 'false')); l.setAttribute('aria-pressed', 'true'); selL = Number(l.dataset.l); tryPair(); }
      if (r && !r.classList.contains('paired')) { PS.$$('[data-r]', v.el).forEach((b) => b.setAttribute('aria-pressed', 'false')); r.setAttribute('aria-pressed', 'true'); selR = Number(r.dataset.r); tryPair(); }
    });
  },
  answer(v) { return v.miss; },
  check(v, miss) { return miss === 0 ? { score: 1, kind: 'exact' } : miss === 1 ? { score: 0.5, kind: 'partial' } : { score: 0, kind: 'wrong' }; },
  reveal() {},
  correctText(v) { return v.item.pairs.map((p) => `${PS.esc(p[0])} → ${PS.esc(p[1])}`).join('<br>'); },
  answerText(v, m) { return `${m} fout(en) bij het koppelen`; },
  noCheckButton: true,
};

/* ---------- numeric ---------- */
PS.items.numeric = {
  render(v) {
    return `<div class="answer-row"><input class="answer-input num" data-ans inputmode="decimal" autocomplete="off" placeholder="${PS.attr(v.item.placeholder || 'Getal…')}">${v.item.unit ? `<span class="unit">${PS.esc(v.item.unit)}</span>` : ''}</div><p class="tiny muted" style="margin-top:8px">Wetenschappelijke notatie mag: <span class="mono">8.4e22</span> of <span class="mono">8,4×10^22</span>.${v.item.tolerance != null ? ` Marge: ±${+(v.item.tolerance * 100).toFixed(2)}%.` : ''}</p>`;
  },
  mount(v) { PS.items.type.mount(v); },
  answer(v) { return PS.$('[data-ans]', v.el).value; },
  check(v, a) { return PS.compareNumeric(a, v.item); },
  reveal(v, r) { PS.items.type.reveal(v, r); },
  correctText(v) { return `${PS.fmtNum(v.item.value)}${v.item.unit ? ' ' + PS.esc(v.item.unit) : ''}`; },
  answerText(v, a) { return a; },
};
PS.fmtNum = (x) => {
  const n = Number(x); if (!isFinite(n)) return String(x);
  if (Math.abs(n) >= 1e7 || (Math.abs(n) > 0 && Math.abs(n) < 1e-3)) { const e = Math.floor(Math.log10(Math.abs(n))); return `${+(n / 10 ** e).toFixed(3)}×10^${e}`; }
  return n.toLocaleString('nl-BE', { maximumFractionDigits: 4 });
};

/* ---------- dictation ---------- */
PS.items.dictation = {
  render(v) {
    const lang = v.item.lang || 'el';
    return `<div class="row" style="gap:16px;margin:4px 0 18px"><button type="button" class="big-play" data-play aria-label="Afspelen">${PS.icon('volume')}</button><div class="stack" style="gap:6px"><button type="button" class="btn btn-line btn-sm" data-slow>${PS.icon('clock', 'icon-s')} Traag</button><span class="tiny muted">Luister en schrijf exact wat je hoort.</span></div></div>
      <input class="answer-input" data-ans${langAttr(lang)} ${lang === 'el' ? 'data-kb="el"' : ''} autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Wat hoor je?"><div class="row" style="margin-top:8px">${kbToggle(lang)}</div>`;
  },
  mount(v) {
    const lang = v.item.lang || 'el';
    const play = (rate) => PS.speech.say(v.item.text, lang, { rate, audio: v.item.audio });
    PS.$('[data-play]', v.el).addEventListener('click', () => play());
    PS.$('[data-slow]', v.el).addEventListener('click', () => play(0.62));
    PS.items.type.mount(v);
    setTimeout(() => play(), 350);
  },
  answer(v) { return PS.$('[data-ans]', v.el).value; },
  check(v, a) { return PS.compare(a, [v.item.text].concat(v.item.answers || []), { lang: v.item.lang || 'el', errors: v.item.errors }); },
  reveal(v, r) { PS.items.type.reveal(v, r); },
  correctText(v) { return `<span${langAttr(v.item.lang)}>${PS.esc(v.item.text)}</span>`; },
  answerText(v, a) { return a; },
};

/* ---------- speak (pronunciation) ---------- */
PS.items.speak = {
  render(v) {
    const lang = v.item.lang || 'el';
    return `<div class="speak-target"${langAttr(lang)}>${PS.esc(v.item.text)}</div>${v.item.translit ? `<p class="muted" style="margin:-8px 0 14px">${PS.esc(v.item.translit)}</p>` : ''}
      <div class="row-wrap"><button type="button" class="btn btn-line" data-play>${PS.icon('volume', 'icon-s')} Luister</button><button type="button" class="btn btn-accent" data-rec>${PS.icon('mic', 'icon-s')} <span>Spreek in</span></button></div>
      <p class="small muted" data-heard style="margin-top:14px"></p>`;
  },
  mount(v) {
    const lang = v.item.lang || 'el';
    PS.$('[data-play]', v.el).addEventListener('click', () => PS.speech.say(v.item.text, lang));
    const heard = PS.$('[data-heard]', v.el);
    if (!PS.speech.canListen()) {
      PS.$('[data-rec]', v.el).disabled = true;
      heard.innerHTML = 'Spraakherkenning is niet beschikbaar in deze browser. Spreek de zin luidop uit en beoordeel jezelf.';
      v.selfFallback = true; v.ready(true); return;
    }
    PS.$('[data-rec]', v.el).addEventListener('click', async (e) => {
      const btn = e.currentTarget; btn.disabled = true; btn.querySelector('span').textContent = 'Luisteren…';
      try {
        const alts = await PS.speech.listen(lang);
        v.heard = alts; heard.innerHTML = `Gehoord: <strong${langAttr(lang)}>${PS.esc(alts[0] || '—')}</strong>`;
        v.ready(true);
      } catch (err) { heard.textContent = `Microfoon: ${err.message || err}`; }
      btn.disabled = false; btn.querySelector('span').textContent = 'Opnieuw';
    });
  },
  answer(v) { return v.heard || []; },
  check(v, alts) {
    if (v.selfFallback) return { score: 1, kind: 'self' };
    const target = PS.stripAccents(PS.norm(v.item.text, v.item.lang));
    let best = 0;
    (alts || []).forEach((a) => { const u = PS.stripAccents(PS.norm(a, v.item.lang)); const r = 1 - PS.dist(u, target) / Math.max(u.length, target.length, 1); best = Math.max(best, r); });
    return best >= 0.85 ? { score: 1, kind: 'exact', sim: best } : best >= 0.6 ? { score: 0.5, kind: 'close', sim: best } : { score: 0, kind: 'wrong', sim: best };
  },
  reveal() {},
  correctText(v) { return `<span${langAttr(v.item.lang)}>${PS.esc(v.item.text)}</span>`; },
  answerText(v, a) { return (a || [])[0] || ''; },
};

/* ---------- handwrite (self-graded) ---------- */
PS.items.handwrite = {
  render(v) {
    return `<div class="pad-wrap" data-pad><div class="pad-lines"></div><div class="pad-guide el" data-guide hidden>${PS.esc(v.item.target)}</div><canvas></canvas></div>
      <div class="pad-tools"><div class="seg" data-mode><button type="button" data-m="free" aria-pressed="true">Uit het hoofd</button><button type="button" data-m="trace" aria-pressed="false">Overtrekken</button></div>
      <span style="flex:1"></span><button type="button" class="icon-btn" data-undo title="Ongedaan maken">${PS.icon('undo')}</button><button type="button" class="icon-btn" data-clear title="Wissen">${PS.icon('trash')}</button></div>`;
  },
  mount(v) {
    v.pad = new PS.Pad(PS.$('canvas', v.el));
    const guide = PS.$('[data-guide]', v.el);
    PS.$('[data-mode]', v.el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      PS.$$('[data-m]', v.el).forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      guide.hidden = b.dataset.m !== 'trace'; v.traced = v.traced || b.dataset.m === 'trace';
    });
    PS.$('[data-undo]', v.el).addEventListener('click', () => v.pad.undo());
    PS.$('[data-clear]', v.el).addEventListener('click', () => v.pad.clear());
    v.ready(true);
  },
  answer(v) { return v.pad.strokes.length; },
  reveal(v) { const g = PS.$('[data-guide]', v.el); g.hidden = false; g.classList.add('overlay'); },
  selfGrade: true,
  correctText(v) { return `<span lang="el">${PS.esc(v.item.target)}</span>`; },
  answerText() { return '(handgeschreven)'; },
};

/* ---------- explain (open answer, rubric) ---------- */
PS.items.explain = {
  render(v) {
    const lang = v.item.lang || 'nl';
    return `<textarea class="answer-input" data-ans${langAttr(lang)} rows="5" placeholder="${PS.attr(v.item.placeholder || 'Formuleer je antwoord in je eigen woorden…')}"></textarea>${lang === 'el' ? `<div class="row" style="margin-top:8px">${kbToggle(lang)}</div>` : ''}`;
  },
  mount(v) {
    const inp = PS.$('[data-ans]', v.el);
    inp.addEventListener('input', () => v.ready(inp.value.trim().length >= 3));
  },
  answer(v) { return PS.$('[data-ans]', v.el).value; },
  reveal(v) { PS.$('[data-ans]', v.el).readOnly = true; },
  selfGrade: true,
  correctText(v) { return v.item.model; },
  answerText(v, a) { return a; },
};

/* ---------- code (Solidity studio) ---------- */
PS.items.code = {
  render(v) { return `<div data-studio></div>`; },
  mount(v) {
    v.studio = PS.sol.mount(PS.$('[data-studio]', v.el), v.item, { key: `${v.ctx.track}:${v.ctx.lesson}:${v.item.id}`, mode: v.ctx.mode, onTests: (res) => { v.lastTests = res; v.ready(true); } });
    v.ready(true);
  },
  async answer(v) { return v.studio.code(); },
  async check(v) {
    const res = await v.studio.runTests();
    v.lastTests = res;
    if (!res || res.error === 'compiler-unavailable') return { score: 0, kind: 'unavailable', detail: res && res.message };
    const pass = res.tests.filter((t) => t.ok).length;
    return pass === res.tests.length && res.tests.length ? { score: 1, kind: 'exact', detail: `${pass}/${res.tests.length} tests geslaagd` } : { score: pass / Math.max(1, res.tests.length) >= 0.75 ? 0.5 : 0, kind: 'wrong', detail: `${pass}/${res.tests.length} tests geslaagd` };
  },
  reveal() {},
  correctText(v) { return `<div class="codeblock"><pre><code>${PS.sol.highlight(v.item.solution || '')}</code></pre></div>`; },
  answerText(v, a) { return a; },
};

/* =====================================================================
   ItemView — one exercise, usable inline (lesson page) or in the runner
   ===================================================================== */
PS.ItemView = class {
  constructor(item, ctx, opts = {}) {
    this.item = item; this.ctx = ctx; this.opts = opts;
    this.T = PS.items[item.type];
    this.rnd = PS.rng(`${ctx.seed || Date.now()}:${item.id}`);
    this.done = false; this.result = null;
  }
  kicker() {
    const lv = this.item.level || 1;
    const dots = `<span class="ladder" title="Niveau ${lv}">${[1, 2, 3].map((k) => `<i class="${k <= lv ? 'on' : ''}"></i>`).join('')}</span>`;
    return `<div class="item-kicker">${PS.TYPE_LABEL[this.item.type] || this.item.type}${dots}${this.opts.kickerExtra || ''}</div>`;
  }
  html() {
    if (!this.T) return `<div class="item-card"><p class="muted">Onbekend oefentype: ${PS.esc(this.item.type)}</p></div>`;
    return `${this.kicker()}<div class="item-prompt">${this.item.prompt || ''}</div><div class="item-body">${this.T.render(this)}</div><div class="item-fb"></div>`;
  }
  mount(el) {
    this.el = el; this.t0 = performance.now();
    if (this.T && this.T.mount) this.T.mount(this);
    PS.$$('[data-kb-toggle]', el).forEach((b) => b.addEventListener('click', () => {
      const inp = PS.$('[data-kb="el"], textarea[lang="el"], input[lang="el"]', el);
      if (inp) PS.kb.toggleFor(inp);
    }));
    PS.speech.bindSay(el);
  }
  ready(v) { this.isReady = v; if (this.opts.onReady) this.opts.onReady(v); }
  submit() { if (this.opts.onSubmit) this.opts.onSubmit(); }
  key(k) { if (this.T && this.T.key && !this.done) this.T.key(this, k); }
  get selfGraded() { return !!(this.T && this.T.selfGrade) || this.selfFallback; }

  /* Auto-graded check. Self-graded types return {needsGrade:true}. */
  async check() {
    if (this.done) return this.result;
    const ans = await this.T.answer(this);
    this.ans = ans;
    if (this.T.selfGrade) { this.T.reveal && this.T.reveal(this); return { needsGrade: true }; }
    const res = await this.T.check(this, ans);
    return this.finish(res);
  }
  finish(res) {
    this.done = true; this.result = res;
    if (res.kind !== 'unavailable' && this.item.type !== 'card' && this.item.type !== 'flip') {
      let at = null;
      try { at = this.ans == null ? null : this.T.answerText ? this.T.answerText(this, this.ans) : this.ans; } catch (e) { at = null; }
      const long = this.item.type === 'explain' || this.item.type === 'code';
      PS.S.attempt(this.ctx, this.item, res, performance.now() - this.t0, long ? String(at || '').slice(0, 2000) : at);
    }
    if (this.T.reveal) this.T.reveal(this, res, this.ans);
    PS.PS_KB_CLOSE && PS.PS_KB_CLOSE();
    return res;
  }
  giveUp() {
    if (this.done) return this.result;
    this.ans = null;
    return this.finish({ score: 0, kind: 'skip', answer: null });
  }
  selfGradeHtml() {
    const it = this.item;
    const rub = (it.rubric || []).map((r, i) => `<label class="row" style="align-items:flex-start;gap:10px;margin:8px 0"><input type="checkbox" data-rub="${i}" style="margin-top:4px;width:18px;height:18px;accent-color:var(--good)"> <span>${r}</span></label>`).join('');
    return `<div class="feedback"><div class="fb-title">${PS.icon('eye', 'icon-s')} Vergelijk met het model</div><div class="fb-body">${this.T.correctText(this)}</div>${rub ? `<hr class="divider"><div class="small" style="font-weight:700">Vink aan wat in jouw antwoord zit:</div>${rub}` : ''}
      <div class="row-wrap" style="margin-top:12px"><button type="button" class="btn btn-line btn-sm" data-grade="0">${PS.icon('x', 'icon-s')} Niet gekend</button><button type="button" class="btn btn-line btn-sm" data-grade="0.5">Deels</button><button type="button" class="btn btn-good btn-sm" data-grade="1">${PS.icon('check', 'icon-s')} Goed</button></div></div>`;
  }
  bindSelfGrade(onDone) {
    const fb = PS.$('.item-fb', this.el); fb.innerHTML = this.selfGradeHtml();
    const boxes = PS.$$('[data-rub]', fb);
    if (boxes.length) {
      const sync = () => { const f = boxes.filter((b) => b.checked).length / boxes.length; PS.$$('[data-grade]', fb).forEach((b) => b.classList.toggle('btn-good', Number(b.dataset.grade) === (f >= 0.8 ? 1 : f >= 0.4 ? 0.5 : 0))); };
      boxes.forEach((b) => b.addEventListener('change', sync));
    }
    fb.addEventListener('click', (e) => {
      const g = e.target.closest('[data-grade]'); if (!g) return;
      const sc = Number(g.dataset.grade);
      const res = this.finish({ score: sc, kind: 'self' });
      fb.innerHTML = '';
      onDone(res);
    });
  }
  feedbackHtml(res) {
    const it = this.item;
    if (res.kind === 'unavailable') return `<div class="feedback partial"><div class="fb-title">${PS.icon('alert', 'icon-s')} Niet beoordeeld</div><div class="fb-body">${PS.esc(res.detail || 'De compiler kon niet geladen worden (offline?). Deze oefening telt niet mee.')}</div></div>`;
    const cls = res.score === 1 ? 'good' : res.score > 0 ? 'partial' : 'bad';
    const titles = {
      good: [PS.pick(['Juist!', 'Precies.', 'Correct.', 'Sterk.']), 'checkCircle'],
      partial: [{ accent: 'Bijna — let op de accenten', sigma: 'Bijna — let op de slot-sigma (ς)', typo: 'Bijna — kleine typfout', partial: 'Gedeeltelijk juist', close: 'Bijna' }[res.kind] || 'Gedeeltelijk juist', 'alert'],
      bad: [res.kind === 'skip' ? 'Zo zit het' : 'Niet juist', 'xCircle'],
    }[cls];
    let body = '';
    if (res.error && res.error.feedback) body += `<div style="margin-bottom:8px"><strong>${res.error.feedback}</strong></div>`;
    if (res.score < 1) {
      let text = ''; try { text = this.ans == null ? '' : this.T.answerText ? this.T.answerText(this, this.ans) : ''; } catch (e) { text = ''; }
      const typed = ['type', 'dictation', 'cloze'].includes(it.type) && typeof this.ans === 'string' && this.ans.trim();
      if (typed) {
        const d = PS.diffHtml(this.ans.trim(), (res.answer || (it.answers || [it.text])[0] || '').toString());
        body += `<div class="diff small muted">Jij: <span${langAttr(it.lang)}>${d.user}</span></div><div class="fb-answer diff"${langAttr(it.lang)}>${d.correct}</div>`;
      } else if (it.type !== 'mcq' && it.type !== 'multi' && it.type !== 'match') {
        body += `<div class="fb-answer">${this.T.correctText(this, res)}</div>`;
        if (text && !['code', 'jscode', 'jsexpr'].includes(it.type)) body += `<div class="small muted">Jouw antwoord: ${PS.esc(text)}</div>`;
      } else if (it.type === 'match' && res.score < 1) body += `<div class="fb-answer small">${this.T.correctText(this)}</div>`;
      if (res.detail) body += `<div class="small muted">${PS.esc(res.detail)}</div>`;
    } else if (res.detail) body += `<div class="small">${PS.esc(res.detail)}</div>`;
    if (res.score === 1 && (it.answers || []).length > 1 && it.type === 'type' && res.answer) {
      const others = it.answers.filter((a) => a !== res.answer).slice(0, 2);
      if (others.length) body += `<div class="small muted">Ook goed: ${others.map((o) => `<span${langAttr(it.lang)}>${PS.esc(o)}</span>`).join(' · ')}</div>`;
    }
    if (it.explain) body += `<div class="${res.score === 1 ? 'small muted' : ''}" style="margin-top:6px">${it.explain}</div>`;
    return `<div class="feedback ${cls}"><div class="fb-title">${PS.icon(titles[1], 'icon-s')} ${titles[0]}</div><div class="fb-body">${body}</div></div>`;
  }
};

/* Plain text from an HTML fragment (for logging) */
PS.plain = (html) => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent.trim(); };

/* Inline item (inside lesson text) with its own check button */
PS.inlineItem = (container, item, ctx) => {
  const v = new PS.ItemView(item, ctx, { autofocus: false, autoSubmitMcq: false });
  container.classList.add('card', 'item-card', 'inline-check');
  container.innerHTML = `${v.html()}<div class="row" data-foot style="margin-top:14px;justify-content:flex-end;gap:8px"><button type="button" class="btn btn-ghost btn-sm" data-skip>Ik weet het niet</button>${PS.items[item.type] && PS.items[item.type].noCheckButton ? '' : `<button type="button" class="btn btn-primary btn-sm" data-check disabled>Controleer</button>`}</div>`;
  const foot = PS.$('[data-foot]', container); const btn = PS.$('[data-check]', container);
  const show = (res) => { PS.$('.item-fb', container).innerHTML = v.feedbackHtml(res); foot.remove(); PS.haptic(res.score === 1 ? 'good' : 'bad'); if (ctx.onResult) ctx.onResult(res); };
  const go = async () => {
    const r = await v.check();
    if (r.needsGrade) { foot.remove(); v.bindSelfGrade((res) => show(res)); return; }
    show(r);
  };
  v.opts.onReady = (x) => { if (btn) btn.disabled = !x; };
  v.opts.onSubmit = () => { if (!v.done && v.isReady) go(); };
  v.mount(container);
  if (btn) btn.addEventListener('click', go);
  PS.$('[data-skip]', container).addEventListener('click', () => show(v.giveUp()));
  return v;
};
