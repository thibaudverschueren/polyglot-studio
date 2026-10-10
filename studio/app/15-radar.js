/* Polyglot Studio v2 — ‘Onder de motorkap’: breakthroughs, papers, classics and your own questions, explained.
   Written each morning by studio/tools/radar.py (the pipeline fetches the sources, Antigravity explains, the
   validator checks quotes and links) and published as radar/index.json + radar/<id>.json.
   What you read, like, save and ask is part of your progress state, so it syncs and steers the next picks. */
'use strict';

PS.radar = {
  TOPIC: { ai: 'AI', chips: 'Chips & hardware', crypto: 'Blockchain & Crypto', systems: 'Systemen', automation: 'Automation', routing: 'Routing & Netwerken' },
  KIND: { news: 'Doorbraak', paper: 'Paper', classic: 'Klassieker', request: 'Op jouw vraag' },
  tab: 'nieuw', topic: 'alle', sort: 'date-desc', year: 'alle', query: '', index: null, _loading: null,

  st() {
    const s = PS.S.s; const r = (s.radar = s.radar || {});
    r.read = r.read || {}; r.likes = r.likes || {}; r.saved = r.saved || {}; r.requests = r.requests || [];
    return r;
  },
  changed() { PS.S.save(); if (PS.sync && PS.sync.soon) PS.sync.soon(); },
  load(force) {
    if (this.index && !force) return Promise.resolve(this.index);
    if (!this._loading) {
      this._loading = fetch('radar/index.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        .then((x) => { this.index = x || this.index || PS.C.data.radar || []; this._loading = null; return this.index; });
    }
    return this._loading;
  },
  async article(id) {
    const m = ((await this.load()) || []).find((x) => x.id === id);
    const r = await fetch(`radar/${encodeURIComponent(id)}.json${m ? `?v=${m.v}` : ''}`);
    if (!r.ok) throw new Error('Dit artikel is niet (meer) beschikbaar');
    return r.json();
  },
  isRead(id) { return !!this.st().read[id]; },
  markRead(id) { const st = this.st(); if (!st.read[id]) { st.read[id] = Date.now(); this.changed(); } },
  liked(id) { const l = this.st().likes[id]; return l ? l.v : 0; },
  like(id, v) { const st = this.st(); st.likes[id] = { v: this.liked(id) === v ? 0 : v, at: Date.now() }; this.changed(); return st.likes[id].v; },
  saved(id) { const x = this.st().saved[id]; return !!(x && x.on); },
  toggleSave(id) { const st = this.st(); st.saved[id] = { on: !this.saved(id), at: Date.now() }; this.changed(); return st.saved[id].on; },
  ask(text) { const q = { id: `rq-${Date.now().toString(36)}`, text: text.trim().slice(0, 600), at: Date.now() }; this.st().requests.push(q); this.changed(); return q; },
  cancel(id) { const q = this.st().requests.find((x) => x.id === id); if (q) { q.cancelled = Date.now(); this.changed(); } },
  unread() { return (PS.C.data.radar || []).filter((x) => !this.isRead(x.id)).length; },
  date(d, month = 'short') { return d ? PS.fmtDate(new Date(`${d}T12:00`), { day: 'numeric', month }) : ''; },
  host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } },

  share(a) {
    const url = `${location.origin}${location.pathname}#/lezen/${encodeURIComponent(a.id)}`;
    const title = a.title;
    const text = `${a.title} — ${a.subtitle ? a.subtitle.replace(/<[^>]+>/g, '') : 'Onder de motorkap in Polyglot Studio'}`;
    if (navigator.share) {
      navigator.share({ title, text, url }).catch((err) => {
        if (err.name !== 'AbortError' && navigator.clipboard) {
          navigator.clipboard.writeText(url).then(() => PS.toast(`${PS.icon('check', 'icon-s')} Link gekopieerd naar klembord!`));
        }
      });
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        PS.toast(`${PS.icon('check', 'icon-s')} Link gekopieerd naar klembord!`);
      }).catch(() => {
        prompt('Kopieer deze link:', url);
      });
    } else {
      prompt('Kopieer deze link:', url);
    }
  },

  /* ---------- list ---------- */
  card(x) {
    const read = this.isRead(x.id);
    const scoreBadge = x.score >= 500
      ? `<span class="chip chip-signal chip-signal-classic" title="Fundamentele klassieker">⭐ Klassieker</span>`
      : (x.score >= 100
        ? `<span class="chip chip-signal" title="${PS.attr(x.signal || '')}">🔥 ${x.score} pnt</span>`
        : (x.score > 50 ? `<span class="chip chip-signal" title="${PS.attr(x.signal || '')}">⚡ ${x.score} pnt</span>` : ''));
    const yearBadge = x.year ? `<span class="chip chip-line chip-year" title="Geschreven / gepubliceerd in ${x.year}">${PS.icon('calendar', 'icon-s')} ${x.year}</span>` : '';
    const signalTooltip = x.signal ? ` title="${PS.attr(x.signal)}"` : '';

    return `<div class="card card-hover radar-card${read ? ' is-read' : ''}" data-topic="${PS.attr(x.topic)}">
      <div class="radar-meta">
        <span class="chip chip-topic">${PS.esc(this.TOPIC[x.topic] || x.topic)}</span>
        <span class="chip chip-line">${this.KIND[x.kind] || ''}</span>
        ${yearBadge}
        ${scoreBadge}
        ${this.saved(x.id) ? `<span class="chip chip-line">${PS.icon('star', 'icon-s')} Bewaard</span>` : ''}
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
          <span class="tiny muted"${signalTooltip}>Toegevoegd: ${this.date(x.date)} · ± ${x.minutes} min${read ? ' · gelezen' : ''}</span>
          <button type="button" class="btn btn-ghost btn-sm" data-card-share="${PS.attr(x.id)}" title="Deel artikel" style="padding:2px 6px;height:24px;border-radius:6px">${PS.icon('share', 'icon-s')}</button>
        </div>
      </div>
      <a href="#/lezen/${encodeURIComponent(x.id)}" style="text-decoration:none;color:inherit;display:block">
        <div class="title" style="margin-top:6px">${PS.esc(x.title)}</div><div class="small muted">${x.subtitle || ''}</div>${x.tldr ? `<p class="small radar-tldr">${x.tldr}</p>` : ''}
      </a>
    </div>`;
  },
  fillList(root) {
    const box = PS.$('[data-rlist]', root); if (!box) return;
    if (this.tab === 'vragen') return this.fillQuestions(box);

    let list = (this.index || []).slice();

    // 1. Kind / Tab filter
    if (this.tab === 'klassiek' || this.tab === 'classic') list = list.filter((x) => x.kind === 'classic');
    else if (this.tab === 'paper') list = list.filter((x) => x.kind === 'paper');
    else if (this.tab === 'news') list = list.filter((x) => x.kind === 'news');
    else if (this.tab === 'request') list = list.filter((x) => x.kind === 'request');
    else if (this.tab === 'bewaard') list = list.filter((x) => this.saved(x.id));

    // 2. Topic filter
    if (this.topic && this.topic !== 'alle') {
      list = list.filter((x) => x.topic === this.topic);
    }

    // 3. Year filter
    if (this.year && this.year !== 'alle') {
      if (this.year === '2026') list = list.filter((x) => x.year === 2026);
      else if (this.year === '2025') list = list.filter((x) => x.year === 2025);
      else if (this.year === '2020-2024') list = list.filter((x) => x.year >= 2020 && x.year <= 2024);
      else if (this.year === 'classic') list = list.filter((x) => (x.year || 9999) < 2020);
    }

    // 4. Text search query
    if (this.query && this.query.trim()) {
      const q = this.query.trim().toLowerCase();
      list = list.filter((x) =>
        (x.title && x.title.toLowerCase().includes(q)) ||
        (x.subtitle && x.subtitle.toLowerCase().includes(q)) ||
        (x.tldr && x.tldr.toLowerCase().includes(q)) ||
        (x.signal && x.signal.toLowerCase().includes(q)) ||
        (x.topic && (this.TOPIC[x.topic] || '').toLowerCase().includes(q)) ||
        (String(x.year || '').includes(q))
      );
    }

    // 5. Sorting
    if (this.sort === 'date-desc') {
      list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id.localeCompare(a.id));
    } else if (this.sort === 'date-asc') {
      list.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.id.localeCompare(b.id));
    } else if (this.sort === 'popular') {
      list.sort((a, b) => (b.score || 0) - (a.score || 0) || (b.date || '').localeCompare(a.date || ''));
    } else if (this.sort === 'year-desc') {
      list.sort((a, b) => (b.year || 0) - (a.year || 0) || (b.date || '').localeCompare(a.date || ''));
    } else if (this.sort === 'year-asc') {
      list.sort((a, b) => (a.year || 9999) - (b.year || 9999) || (a.date || '').localeCompare(b.date || ''));
    } else if (this.sort === 'minutes-asc') {
      list.sort((a, b) => (a.minutes || 0) - (b.minutes || 0));
    }

    // Update count in header if present
    const countEl = PS.$('[data-rcount]', root);
    if (countEl) {
      countEl.textContent = `${list.length} van ${(this.index || []).length} artikels`;
    }

    box.innerHTML = list.length ? `<div class="stack">${list.map((x) => this.card(x)).join('')}</div>`
      : `<div class="empty">${PS.icon('bookOpen')}<p>${this.tab === 'bewaard' ? 'Nog niets bewaard: tik op “Bewaren” onderaan een artikel.' : 'Geen artikels gevonden voor deze zoekopdracht of filter.'}</p></div>`;
    box.onclick = (e) => {
      const btn = e.target.closest('[data-card-share]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const it = (this.index || []).find((x) => x.id === btn.dataset.cardShare);
      if (it) this.share(it);
    };
  },
  fillQuestions(box) {
    const done = Object.fromEntries((this.index || []).filter((x) => x.request).map((x) => [x.request, x]));
    const qs = this.st().requests.filter((q) => !q.cancelled).slice().reverse();
    box.innerHTML = `<div class="card card-pad"><div class="eyebrow" style="margin-bottom:8px">Vraag een uitleg aan</div>
      <textarea class="answer-input" data-rq rows="3" maxlength="600" placeholder="Wat wil je begrijpen? Bv. Hoe werkt de Neural Engine in een M-chip? Wat is er echt nieuw aan …?"></textarea>
      <div class="row-wrap" style="margin-top:10px;align-items:center"><button class="btn btn-primary btn-sm" data-rq-send>${PS.icon('message', 'icon-s')} Vraag aan</button><span class="tiny muted">De volgende ochtend staat je uitleg klaar, met bronnen. Eén vraag per ochtend, in volgorde.</span></div></div>
      ${qs.length ? `<div class="section-head"><span class="h3">Jouw vragen</span></div><div class="stack">${qs.map((q) => {
        const a = done[q.id];
        return `<div class="card card-pad radar-q"><div style="flex:1"><div class="small" style="font-weight:650">${PS.esc(q.text)}</div><div class="tiny muted" style="margin-top:4px">${a ? `Klaar: <a href="#/lezen/${encodeURIComponent(a.id)}">${PS.esc(a.title)}</a>` : 'In de wachtrij voor de volgende ochtend.'}</div></div>${a ? '' : `<button class="icon-btn" data-rq-cancel="${PS.attr(q.id)}" title="Vraag schrappen" aria-label="Vraag schrappen">${PS.icon('x')}</button>`}</div>`;
      }).join('')}</div>` : ''}`;
    const ta = PS.$('[data-rq]', box);
    PS.$('[data-rq-send]', box).onclick = () => {
      if (ta.value.trim().length < 8) { PS.toast('Beschrijf wat je wil begrijpen (minstens een paar woorden).'); return; }
      this.ask(ta.value); PS.toast(`${PS.icon('check', 'icon-s')} Genoteerd — morgenochtend staat je uitleg klaar.`); this.fillQuestions(box);
    };
    PS.$$('[data-rq-cancel]', box).forEach((b) => (b.onclick = () => { this.cancel(b.dataset.rqCancel); this.fillQuestions(box); }));
  },

  /* ---------- article ---------- */
  renderArticle(box, a) {
    const R = this;
    box.dataset.topic = a.topic;
    const numbers = (a.numbers || []).length ? `<h2>Kerncijfers</h2><div class="table-wrap"><table><thead><tr><th>Cijfer</th><th>Wat</th><th>Bron</th></tr></thead><tbody>${a.numbers.map((n) => `<tr><td><strong>${n.value}</strong></td><td>${n.label}</td><td><details class="quote"><summary>[${PS.esc(String(n.source))}]</summary><q>${PS.esc(n.quote)}</q></details></td></tr>`).join('')}</tbody></table></div>` : '';
    const glossary = (a.glossary || []).length ? `<h2>Begrippen</h2><dl class="glossary">${a.glossary.map((g) => `<dt>${g.term}</dt><dd>${g.def}</dd>`).join('')}</dl>` : '';
    const related = (a.related || []).filter((r) => PS.C.track(r.track));
    box.innerHTML = `
      <div class="eyebrow radar-eyebrow">${PS.esc(R.TOPIC[a.topic] || a.topic)} · ${R.KIND[a.kind] || ''} · ${R.date(a.date, 'long')} · ± ${a.minutes} min</div>
      <h1 class="display radar-title">${PS.esc(a.title)}</h1><p class="lede">${a.subtitle}</p>
      ${a.meta && a.meta.signal ? `<p class="tiny muted">${PS.esc(a.meta.signal)}</p>` : ''}
      <section class="card card-pad tldr"><div class="eyebrow">In 60 seconden</div><ul>${(a.tldr || []).map((t) => `<li>${t}</li>`).join('')}</ul></section>
      ${a.plain ? `<section class="card card-pad plain-words"><div class="eyebrow">In gewone woorden</div><div class="prose">${a.plain}</div></section>` : ''}
      <div class="prose article-body"><h2>Waarom dit ertoe doet</h2>${a.why}${(a.sections || []).map((s) => `<h2>${s.title}</h2>${s.html}`).join('')}${numbers}<h2>Kanttekeningen</h2>${a.caveats}${glossary}</div>
      ${related.length ? `<div class="card card-pad radar-related"><div class="eyebrow" style="margin-bottom:6px">Sluit aan bij je vakken</div>${related.map((r) => `<a class="small" href="#/pad/${r.track}" data-track="${r.track}"><strong>${PS.esc(PS.C.track(r.track).short)}</strong> — ${r.why}</a>`).join('<br>')}</div>` : ''}
      ${(a.quiz || []).length ? `<div class="section-head"><span class="h3">Test je begrip</span></div><div class="stack" data-quiz></div>` : ''}
      <div class="section-head"><span class="h3">Bronnen</span></div>
      <ol class="sources" data-sources>${(a.sources || []).map((s) => `<li><a href="${PS.attr(s.url)}" target="_blank" rel="noopener noreferrer">${PS.esc(s.title)}</a> <span class="tiny muted">${PS.esc(R.host(s.url))}</span></li>`).join('')}</ol>
      <div class="read-actions" data-actions></div>`;
    const qbox = PS.$('[data-quiz]', box);
    (a.quiz || []).forEach((it) => { const c = document.createElement('div'); qbox.appendChild(c); PS.inlineItem(c, it, { track: 'radar', mode: 'read', noLog: true, seed: a.id }); });
    PS.mountSims(box, null);
    PS.speech.bindSay(box);
    const acts = PS.$('[data-actions]', box);
    const paint = () => {
      const isGuest = PS.isGuestArticle && PS.isGuestArticle();
      if (isGuest) {
        acts.innerHTML = `<button class="btn btn-primary btn-sm" data-ra="share" style="padding:8px 18px">${PS.icon('share', 'icon-s')} Deel artikel</button>
          <button class="btn btn-line btn-sm" data-ra="login">${PS.icon('lock', 'icon-s')} Inloggen om te bewaren</button>`;
      } else {
        const lk = R.liked(a.id);
        acts.innerHTML = `<button class="btn btn-line btn-sm${R.isRead(a.id) ? ' on' : ''}" data-ra="read">${PS.icon('check', 'icon-s')} ${R.isRead(a.id) ? 'Gelezen' : 'Markeer als gelezen'}</button>
          <button class="btn btn-line btn-sm${lk === 1 ? ' on' : ''}" data-ra="up">${PS.icon('thumbUp', 'icon-s')} Meer hierover</button>
          <button class="btn btn-line btn-sm${lk === -1 ? ' on' : ''}" data-ra="down">${PS.icon('thumbDown', 'icon-s')} Minder hierover</button>
          <button class="btn btn-line btn-sm${R.saved(a.id) ? ' on' : ''}" data-ra="save">${PS.icon('star', 'icon-s')} ${R.saved(a.id) ? 'Bewaard' : 'Bewaren'}</button>
          <button class="btn btn-line btn-sm" data-ra="share">${PS.icon('share', 'icon-s')} Deel artikel</button>`;
      }
    };
    paint();
    acts.onclick = (e) => {
      const b = e.target.closest('[data-ra]'); if (!b) return;
      const k = b.dataset.ra;
      if (k === 'share') { R.share(a); return; }
      if (k === 'login') { PS.renderGate(); return; }
      if (PS.isGuestArticle && PS.isGuestArticle()) {
        PS.toast('Log in om artikels te bewaren of je voorkeuren op te slaan.');
        setTimeout(() => PS.renderGate(), 400);
        return;
      }
      if (k === 'read') R.markRead(a.id);
      if (k === 'up' || k === 'down') { const v = R.like(a.id, k === 'up' ? 1 : -1); if (v) PS.toast(v === 1 ? 'Genoteerd: meer over dit soort onderwerpen.' : 'Genoteerd: minder over dit soort onderwerpen.'); }
      if (k === 'save') R.toggleSave(a.id);
      paint(); if (PS.updateShell) PS.updateShell(location.hash);
    };
    if (PS.isGuestArticle && PS.isGuestArticle()) {
      box.querySelectorAll('.radar-related a').forEach((link) => {
        link.onclick = (e) => {
          e.preventDefault();
          PS.toast('Log in om dit vak en de lessen te volgen.');
          setTimeout(() => PS.renderGate(), 400);
        };
      });
    }
    const end = PS.$('[data-sources]', box);
    if (end && 'IntersectionObserver' in window && !(PS.isGuestArticle && PS.isGuestArticle())) {
      const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { R.markRead(a.id); paint(); io.disconnect(); if (PS.updateShell) PS.updateShell(location.hash); } });
      io.observe(end);
    }
  },

  /* ---------- Today card ---------- */
  todayCard(root) {
    const slot = PS.$('[data-radar-today]', root); if (!slot) return;
    const x = (PS.C.data.radar || []).find((i) => !this.isRead(i.id));
    if (!x) { slot.innerHTML = ''; return; }
    slot.innerHTML = `<div class="section-head"><span class="h3">Onder de motorkap</span><a href="#/lezen">Alles lezen</a></div>${this.card(x)}`;
    slot.onclick = (e) => {
      const btn = e.target.closest('[data-card-share]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      this.share(x);
    };
  },
};

PS.views.radar = () => {
  const R = PS.radar;
  const isFiltered = R.topic !== 'alle' || R.tab !== 'nieuw' || R.sort !== 'date-desc' || R.year !== 'alle' || !!R.query;
  const html = `<div class="page">${mobileBar()}
    <div class="hello">
      <div class="eyebrow">Onder de motorkap</div>
      <h1 class="display" style="margin:6px 0 6px">Begrijpen hoe het werkt</h1>
      <p class="lede">Doorbraken, papers en klassiekers, elke ochtend nieuw en uitgelegd tot op het mechanisme. Met handige filters op onderwerp, jaartal, populariteit en je eigen vragen erbij.</p>
    </div>

    <div class="radar-controls">
      <!-- Zoekbalk -->
      <div class="radar-search-wrap" ${R.tab === 'vragen' ? 'hidden' : ''} data-rsearchbar>
        <span class="radar-search-icon">${PS.icon('search', 'icon-s')}</span>
        <input type="search" class="radar-search-input" data-rsearch placeholder="Zoek artikels op titel, auteur, trefwoord of samenvatting…" value="${PS.attr(R.query)}">
        <button type="button" class="radar-search-clear" data-rsearch-clear style="${R.query ? '' : 'display:none'}" aria-label="Wissen">${PS.icon('x', 'icon-s')}</button>
      </div>

      <!-- Tabs (Soort) -->
      <div class="seg radar-tabs" data-rtab>
        ${[['nieuw', 'Alles'], ['paper', 'Papers'], ['news', 'Doorbraken'], ['classic', 'Klassiekers'], ['bewaard', 'Bewaard'], ['vragen', 'Jouw vragen']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${R.tab === v}">${l}</button>`).join('')}
      </div>

      <!-- Onderwerpen (Categorie) -->
      <div class="chips-row" data-rtopic ${R.tab === 'vragen' ? 'hidden' : ''}>
        ${[['alle', 'Alle onderwerpen'], ...Object.entries(R.TOPIC)].map(([v, l]) => `<button type="button" class="chip ${R.topic === v ? 'chip-on' : 'chip-line'}" data-v="${v}">${l}</button>`).join('')}
      </div>

      <!-- Filter- & Sorteerbalk -->
      <div class="radar-filter-bar" data-rfilterbar ${R.tab === 'vragen' ? 'hidden' : ''}>
        <div class="radar-control-group">
          <label class="tiny muted" for="radar-sort">Sorteer:</label>
          <select id="radar-sort" class="radar-select" data-rsort>
            <option value="date-desc"${R.sort === 'date-desc' ? ' selected' : ''}>Nieuwste toegevoegd</option>
            <option value="date-asc"${R.sort === 'date-asc' ? ' selected' : ''}>Oudste toegevoegd</option>
            <option value="popular"${R.sort === 'popular' ? ' selected' : ''}>Meest populair / impact</option>
            <option value="year-desc"${R.sort === 'year-desc' ? ' selected' : ''}>Geschreven: nieuwste eerst</option>
            <option value="year-asc"${R.sort === 'year-asc' ? ' selected' : ''}>Geschreven: oudste eerst</option>
            <option value="minutes-asc"${R.sort === 'minutes-asc' ? ' selected' : ''}>Leestijd: kortste eerst</option>
          </select>
        </div>

        <div class="radar-control-group">
          <label class="tiny muted" for="radar-year">Geschreven in:</label>
          <select id="radar-year" class="radar-select" data-ryear>
            <option value="alle"${R.year === 'alle' ? ' selected' : ''}>Alle jaren</option>
            <option value="2026"${R.year === '2026' ? ' selected' : ''}>2026</option>
            <option value="2025"${R.year === '2025' ? ' selected' : ''}>2025</option>
            <option value="2020-2024"${R.year === '2020-2024' ? ' selected' : ''}>2020–2024</option>
            <option value="classic"${R.year === 'classic' ? ' selected' : ''}>Klassiekers (< 2020)</option>
          </select>
        </div>

        <button type="button" class="btn btn-ghost btn-sm" data-rreset style="padding:2px 8px;font-size:12px;border-radius:6px;${isFiltered ? '' : 'display:none'}">
          ${PS.icon('undo', 'icon-s')} Herstel
        </button>

        <span class="tiny muted radar-count" data-rcount></span>
      </div>
    </div>

    <div data-rlist><div class="empty"><span class="loader"></span></div></div>
  </div>`;

  const after = (root) => {
    const searchInput = PS.$('[data-rsearch]', root);
    const clearBtn = PS.$('[data-rsearch-clear]', root);
    const sortSelect = PS.$('[data-rsort]', root);
    const yearSelect = PS.$('[data-ryear]', root);
    const resetBtn = PS.$('[data-rreset]', root);

    const checkResetVis = () => {
      const filtered = R.topic !== 'alle' || R.tab !== 'nieuw' || R.sort !== 'date-desc' || R.year !== 'alle' || !!R.query;
      if (resetBtn) resetBtn.style.display = filtered ? 'inline-flex' : 'none';
    };

    const update = () => {
      R.fillList(root);
      if (clearBtn) clearBtn.style.display = R.query ? 'inline-flex' : 'none';
      checkResetVis();
    };

    PS.$('[data-rtab]', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      R.tab = b.dataset.v;
      PS.$$('[data-rtab] button', root).forEach((btn) => btn.setAttribute('aria-pressed', btn.dataset.v === R.tab));
      const topicRow = PS.$('[data-rtopic]', root);
      const filterBar = PS.$('[data-rfilterbar]', root);
      const searchBar = PS.$('[data-rsearchbar]', root);
      if (topicRow) topicRow.hidden = (R.tab === 'vragen');
      if (filterBar) filterBar.hidden = (R.tab === 'vragen');
      if (searchBar) searchBar.hidden = (R.tab === 'vragen');
      update();
    });

    PS.$('[data-rtopic]', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      R.topic = b.dataset.v;
      PS.$$('[data-rtopic] button', root).forEach((btn) => {
        const on = btn.dataset.v === R.topic;
        btn.className = `chip ${on ? 'chip-on' : 'chip-line'}`;
      });
      update();
    });

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        R.query = e.target.value;
        update();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        R.query = '';
        if (searchInput) { searchInput.value = ''; searchInput.focus(); }
        update();
      });
    }

    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        R.sort = e.target.value;
        update();
      });
    }

    if (yearSelect) {
      yearSelect.addEventListener('change', (e) => {
        R.year = e.target.value;
        update();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        R.topic = 'alle';
        R.tab = 'nieuw';
        R.sort = 'date-desc';
        R.year = 'alle';
        R.query = '';
        if (searchInput) searchInput.value = '';
        if (sortSelect) sortSelect.value = 'date-desc';
        if (yearSelect) yearSelect.value = 'alle';
        PS.$$('[data-rtopic] button', root).forEach((btn) => {
          btn.className = `chip ${btn.dataset.v === 'alle' ? 'chip-on' : 'chip-line'}`;
        });
        PS.$$('[data-rtab] button', root).forEach((btn) => {
          btn.setAttribute('aria-pressed', btn.dataset.v === 'nieuw');
        });
        const topicRow = PS.$('[data-rtopic]', root);
        const filterBar = PS.$('[data-rfilterbar]', root);
        const searchBar = PS.$('[data-rsearchbar]', root);
        if (topicRow) topicRow.hidden = false;
        if (filterBar) filterBar.hidden = false;
        if (searchBar) searchBar.hidden = false;
        update();
      });
    }

    R.load().then(() => update());
  };
  return { html, after };
};

PS.views.radarArticle = (id) => {
  const isGuest = PS.isGuestArticle && PS.isGuestArticle();
  const backHtml = isGuest
    ? `<span class="eyebrow" style="display:inline-flex;align-items:center;gap:6px">${PS.icon('bookOpen', 'icon-s')} Onder de motorkap</span>`
    : `<a class="back" href="#/lezen">${PS.icon('chevronLeft')} Onder de motorkap</a>`;
  const html = `<div class="page page-article"><div class="lesson-top" style="display:flex;justify-content:space-between;align-items:center">${backHtml}<button type="button" class="btn btn-line btn-sm" data-share-top title="Deel artikel" style="display:none">${PS.icon('share', 'icon-s')} Deel</button></div><div data-article><div class="empty"><span class="loader"></span></div></div></div>`;
  const after = (root) => {
    const box = PS.$('[data-article]', root);
    const topShare = PS.$('[data-share-top]', root);
    PS.radar.article(id).then((a) => {
      if (box.isConnected) {
        document.title = `${a.title} · Polyglot Studio`;
        if (topShare) {
          topShare.style.display = 'inline-flex';
          topShare.onclick = () => PS.radar.share(a);
        }
        PS.radar.renderArticle(box, a);
      }
    })
      .catch((e) => {
        const backBtn = isGuest
          ? `<button class="btn btn-line" data-guest-retry>Opnieuw proberen</button>`
          : `<a class="btn btn-line" href="#/lezen">Terug naar het overzicht</a>`;
        box.innerHTML = `<div class="empty">${PS.icon('alert')}<p>${PS.esc(e.message)}. Ben je offline, open het artikel dan later opnieuw.</p>${backBtn}</div>`;
        const retry = PS.$('[data-guest-retry]', box);
        if (retry) retry.onclick = () => location.reload();
      });
  };
  return { html, after };
};
