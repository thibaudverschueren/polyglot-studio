/* Polyglot Studio v2 — focus runner (practice, tests, reviews) */
'use strict';

/* Review cards as items */
PS.items.card = {
  render(v) {
    const lang = v.item.lang || 'nl';
    v.selfHand = PS.pen.greekHand(v, lang);
    if (v.selfHand) return PS.penPad.html();
    return `<input class="answer-input" data-ans${langAttrC(lang)} ${lang === 'el' ? 'data-kb="el"' : ''} autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="${PS.pen.active() && lang !== 'el' ? 'Schrijf of typ het antwoord…' : 'Typ het antwoord…'}"><div class="row" style="margin-top:8px">${lang === 'el' ? `<button type="button" class="kb-toggle" data-kb-toggle>${PS.icon('keyboard', 'icon-s')}<span>ΑΒΓ</span></button>` : ''}</div>`;
  },
  mount(v) { if (v.selfHand) PS.penPad.mount(v); else PS.items.type.mount(v); },
  answer(v) { return v.selfHand ? null : PS.$('[data-ans]', v.el).value; },
  check(v, a) { return PS.compare(a, v.item.answers, { lang: v.item.lang || 'nl', typos: v.item.typos }); },
  reveal(v, r) { PS.items.type.reveal(v, r); },
  correctText(v) { return v.item.back; },
  answerText(v, a) { return a; },
};
PS.items.flip = {
  render() { return ''; },
  mount(v) { v.ready(true); },
  answer() { return null; },
  selfGrade: true,
  reveal() {},
  correctText(v) { return v.item.back; },
  answerText() { return ''; },
};
function langAttrC(lang) { return lang === 'el' || lang === 'fr' ? ` lang="${lang}"` : ''; }

PS.Runner = class {
  /**
   * opts: { title, track, mode, entries:[{item, ctx}], next?:()=>entry|null, progress?:()=>0..1,
   *         feedback:'immediate'|'end', onAnswer?(entry,res), onFinish?(summary)=>verdict, onClose?() }
   */
  constructor(opts) {
    this.o = Object.assign({ feedback: 'immediate' }, opts);
    this.i = -1; this.results = []; this.queue = (opts.entries || []).slice();
    this.total = this.queue.length;
  }
  open() {
    const el = document.createElement('div');
    el.className = 'runner'; if (this.o.track) el.dataset.track = this.o.track;
    el.innerHTML = `<div class="runner-shell"><div class="runner-top"><div class="runner-top-inner"><button type="button" class="icon-btn" data-close aria-label="Sluiten">${PS.icon('x')}</button><div class="progress"><span style="width:0%"></span></div><div class="runner-count num"></div></div><div class="runner-title">${this.o.title || ''}</div></div>
      <div class="runner-body"><div class="runner-body-inner" data-body></div></div>
      <div class="runner-foot"><div class="runner-foot-inner" data-foot></div></div></div>`;
    document.body.appendChild(el); document.body.style.overflow = 'hidden';
    this.el = el; this.body = PS.$('[data-body]', el); this.foot = PS.$('[data-foot]', el);
    PS.$('[data-close]', el).addEventListener('click', () => this.requestClose());
    this.onKey = (e) => this.key(e); document.addEventListener('keydown', this.onKey);
    PS.runnerOpen = this;
    this.advance();
    return this;
  }
  requestClose() {
    const inTest = ['mastery', 'retention', 'anchor', 'placement'].includes(this.o.mode) && !this.finished && this.results.length > 0;
    if (inTest && !confirm('Test afbreken? Je voortgang in deze test gaat verloren.')) return;
    if (!this.finished && this.o.onAbort) this.o.onAbort(this.summary());
    this.close();
  }
  close() {
    document.removeEventListener('keydown', this.onKey);
    document.body.style.overflow = '';
    PS.kb.close();
    PS.speech.stop();
    if (this.el) this.el.remove();
    PS.runnerOpen = null;
    if (this.o.onClose) this.o.onClose(this.finished ? this.summary() : null);
  }
  key(e) {
    if (e.key === 'Escape') { e.preventDefault(); this.requestClose(); return; }
    if (e.key === 'Enter') {
      if (e.defaultPrevented) return;
      if (e.target && e.target.tagName === 'TEXTAREA' && !(e.metaKey || e.ctrlKey)) return;
      const primary = PS.$('[data-primary]:not([disabled])', this.foot);
      if (primary) { e.preventDefault(); primary.click(); }
      return;
    }
    if (/^[1-9]$/.test(e.key) && this.view && !(e.target && e.target.matches && e.target.matches('input,textarea'))) this.view.key(Number(e.key));
  }
  setProgress() {
    const frac = this.o.progress ? this.o.progress() : this.total ? (this.results.length / this.total) : 0;
    PS.$('.progress > span', this.el).style.width = `${Math.round(PS.clamp(frac, 0, 1) * 100)}%`;
    PS.$('.runner-count', this.el).textContent = this.total && !this.o.progress ? `${Math.min(this.results.length + 1, this.total)}/${this.total}` : `${this.results.length}`;
  }
  nextEntry() {
    if (this.o.next) return this.o.next(this);
    return this.queue.shift() || null;
  }
  advance() {
    const entry = this.nextEntry();
    if (!entry) return this.finish();
    this.entry = entry;
    this.setProgress();
    const ctx = Object.assign({ seed: this.o.seed || Date.now(), mode: this.o.mode, track: this.o.track }, entry.ctx);
    const v = (this.view = new PS.ItemView(entry.item, ctx, { autoSubmitMcq: false, kickerExtra: entry.label ? `<span class="chip chip-line" style="height:22px">${entry.label}</span>` : '' }));
    this.body.innerHTML = `<div class="item-card">${v.html()}</div>`;
    this.body.parentElement.scrollTop = 0;
    this.renderFoot('answer');
    v.opts.onReady = (x) => { const b = PS.$('[data-act="check"]', this.foot); if (b) b.disabled = !x; };
    v.opts.onSubmit = () => { if (!v.done && v.isReady) this.check(); };
    v.opts.onRerender = () => this.renderFoot('answer');
    v.mount(PS.$('.item-card', this.body));
  }
  renderFoot(stage) {
    const v = this.view; const T = v && v.T;
    if (stage === 'answer') {
      const flip = v.item.type === 'flip';
      const skip = `<button type="button" class="btn btn-ghost" data-act="skip">${flip ? '' : 'Weet ik niet'}</button>`;
      const check = T && T.noCheckButton ? '' : `<button type="button" class="btn btn-primary btn-lg" data-act="check" data-primary ${flip || v.item.type === 'handwrite' || v.item.type === 'code' ? '' : 'disabled'}>${flip ? 'Toon antwoord' : T && T.selfGrade ? 'Toon model' : v.selfHand ? 'Vergelijk' : v.item.type === 'code' ? 'Run tests' : 'Controleer'}</button>`;
      this.foot.innerHTML = (flip ? '' : skip) + check;
    } else if (stage === 'next') {
      const last = !this.o.next && this.queue.length === 0;
      this.foot.innerHTML = `<button type="button" class="btn btn-primary btn-lg" data-act="next" data-primary>${last ? 'Afronden' : 'Verder'} ${PS.icon('arrowRight', 'icon-s')}</button>`;
    } else if (stage === 'grade') {
      this.foot.innerHTML = '';
    }
    this.foot.onclick = (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'check') this.check();
      if (b.dataset.act === 'skip') this.handle(this.view.giveUp());
      if (b.dataset.act === 'next') this.advance();
    };
  }
  async check() {
    const v = this.view; if (v.done || this.busy) return;
    this.busy = true;
    const btn = PS.$('[data-act="check"]', this.foot); if (btn) { btn.disabled = true; btn.innerHTML = `<span class="loader"></span>`; }
    let r;
    try { r = await v.check(); } finally { this.busy = false; }
    if (r && r.needsGrade) {
      if (v.item.type === 'flip') return this.flipGrade();
      this.renderFoot('grade');
      v.bindSelfGrade((res) => this.handle(res, true));
      PS.$('.item-fb', this.body).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    this.handle(r);
  }
  flipGrade() {
    const v = this.view;
    const fb = PS.$('.item-fb', this.body);
    fb.innerHTML = `<div class="flash"><div class="back">${v.item.back}</div></div>`;
    this.foot.innerHTML = `<div class="grades">${[[1, 'Opnieuw', '<10 min'], [3, 'Moeilijk', ''], [4, 'Goed', ''], [5, 'Makkelijk', '']].map(([q, l, s]) => `<button type="button" class="grade g${q}" data-q="${q}">${l}<small>${s}</small></button>`).join('')}</div>`;
    this.foot.onclick = (e) => {
      const b = e.target.closest('[data-q]'); if (!b) return;
      const q = Number(b.dataset.q);
      v.done = true;
      this.handle({ score: q >= 4 ? 1 : q === 3 ? 0.5 : 0, kind: 'self', q }, true);
    };
  }
  handle(res, silentFeedback) {
    const v = this.view; const entry = this.entry;
    this.results.push({ entry, res, ans: v.ans, view: v });
    PS.haptic(res.score === 1 ? 'good' : res.score > 0 ? 'partial' : 'bad');
    if (this.o.onAnswer) this.o.onAnswer(entry, res, v);
    this.setProgress();
    const immediate = this.o.feedback === 'immediate' || v.item.type === 'code';
    if (immediate && !silentFeedback) {
      PS.$('.item-fb', this.body).innerHTML = v.feedbackHtml(res);
      if (res.score < 1) PS.$('.item-card', this.body).classList.add('shake');
      this.renderFoot('next');
      setTimeout(() => { const fb = PS.$('.feedback', this.body); if (fb) fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 60);
    } else if (immediate && silentFeedback && v.item.type !== 'flip' && v.item.explain) {
      PS.$('.item-fb', this.body).innerHTML = `<div class="feedback"><div class="fb-body">${v.item.explain}</div></div>`;
      this.renderFoot('next');
    } else {
      setTimeout(() => this.advance(), silentFeedback ? 0 : 180);
    }
  }
  summary() {
    const per = {}; let sum = 0;
    const counted = this.results.filter((r) => r.res.kind !== 'unavailable');
    counted.forEach(({ entry, res }) => {
      sum += res.score;
      const sk = entry.skillKey || entry.item.skill || '—';
      const p = (per[sk] = per[sk] || [0, 0, 0]); p[0] += res.score; p[1]++; if (res.score === 1) p[2]++;
    });
    const n = counted.length;
    const own = Object.entries(per).filter(([k]) => !k.includes('/'));
    return { n, score: n ? sum / n : 0, perSkill: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, [+v[0].toFixed(2), v[1]]])), allSkills: own.every(([, v]) => v[2] > 0), results: this.results };
  }
  finish() {
    this.finished = true;
    const s = this.summary();
    const verdict = this.o.onFinish ? this.o.onFinish(s) || {} : {};
    PS.$('.progress > span', this.el).style.width = '100%';
    PS.$('.runner-count', this.el).textContent = '';
    const mistakes = this.results.filter((r) => r.res.score < 1 && r.res.kind !== 'unavailable');
    const objectives = verdict.objectives || {};
    const skills = Object.entries(s.perSkill).map(([k, [got, n]]) => {
      const lbl = objectives[k] || (k.includes('/') ? 'Eerdere lessen' : k);
      const f = n ? got / n : 0;
      return `<div class="skill-bar"><div class="spread"><span>${PS.esc(lbl)}</span><span class="num muted">${PS.pct(f)}%</span></div><div class="progress"><span style="width:${PS.pct(f)}%;background:${f >= 0.85 ? 'var(--good)' : f >= 0.5 ? 'var(--warn)' : 'var(--bad)'}"></span></div></div>`;
    }).join('');
    const pctTxt = s.n ? `${PS.pct(s.score)}%` : '—';
    this.body.innerHTML = `<div class="result-hero">
        ${verdict.hideScore ? '' : `<div class="score num" style="color:${verdict.passed === false ? 'var(--bad)' : verdict.passed ? 'var(--good)' : 'var(--ink)'}">${pctTxt}</div>`}
        <div class="verdict">${verdict.title || 'Klaar'}</div>
        ${verdict.text ? `<p class="lede" style="max-width:520px;margin:0 auto">${verdict.text}</p>` : ''}
      </div>
      ${skills && !verdict.hideSkills ? `<div class="card card-pad" style="margin-top:22px"><div class="eyebrow" style="margin-bottom:12px">Per leerdoel</div><div class="skill-bars">${skills}</div></div>` : ''}
      ${mistakes.length && !verdict.hideMistakes ? `<div class="section-head"><span class="h3">Te herbekijken (${mistakes.length})</span></div><div class="stack">${mistakes.map(({ view, res }) => `<div class="mistake"><div class="q">${PS.plain(view.item.prompt).slice(0, 220) || PS.TYPE_LABEL[view.item.type]}</div>${view.ans != null && typeof view.ans === 'string' && view.ans.trim() ? `<div class="small">Jij: <span class="yours"${langAttrC(view.item.lang)}>${PS.esc(view.ans)}</span></div>` : ''}<div class="small">Juist: <span class="right">${view.item.type === 'mcq' ? view.item.options[view.item.answer] : view.T.correctText(view, res)}</span></div>${view.item.explain ? `<div class="small muted" style="margin-top:6px">${view.item.explain}</div>` : ''}</div>`).join('')}</div>` : ''}`;
    const acts = verdict.actions || [{ label: 'Sluiten', act: 'close', primary: true }];
    this.foot.innerHTML = acts.map((a, i) => `<button type="button" class="btn ${a.primary ? 'btn-primary btn-lg' : 'btn-line btn-lg'}" data-fin="${i}" ${a.primary ? 'data-primary' : ''}>${a.label}</button>`).join('');
    this.foot.onclick = (e) => {
      const b = e.target.closest('[data-fin]'); if (!b) return;
      const a = acts[Number(b.dataset.fin)];
      this.close();
      if (a.run) a.run();
    };
    if (verdict.passed) PS.confetti();
    this.body.parentElement.scrollTop = 0;
  }
};
