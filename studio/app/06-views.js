/* Polyglot Studio v2 — views & routing */
'use strict';

PS.go = (hash) => { if (location.hash === hash) PS.render(); else location.hash = hash; };
const ES = PS.esc;
const glyph = (t, cls = 'glyph') => { const T = PS.C.track(t); return `<div class="${cls}${T.glyphMono ? ' mono' : ''}" aria-hidden="true">${T.glyph}</div>`; };
const ladder = (st, needs) => {
  const n = { legacy: 1, learned: 1, mastered: 2, anchored: 3 }[st] || 0;
  return `<span class="ladder" title="${PS.STATUS_LABEL[st] || ''}">${[1, 2, 3].map((k) => `<i class="${k <= n ? (st === 'legacy' || needs ? 'warn' : 'on') : ''}"></i>`).join('')}</span>`;
};
const statusChip = (t, id) => {
  const p = PS.S.peek(t, id); const st = p ? p.status : 'new';
  if (p && p.needsReview) return `<span class="chip chip-warn">${PS.icon('alert')} Herhalen nodig</span>`;
  const m = { new: ['chip', 'Nieuw'], started: ['chip chip-accent', `${PS.pct(PS.learn.lessonProgress(t, id))}% klaar`], legacy: ['chip chip-warn', 'Te bevestigen'], learned: ['chip chip-good', 'Geleerd'], mastered: ['chip chip-good', 'Beheerst'], anchored: ['chip chip-good', 'Verankerd'] }[st];
  return `<span class="${m[0]}">${m[1]}</span>`;
};

/* ======================= Shell ======================= */
PS.shell = () => {
  const app = document.getElementById('app');
  const nav = [['#/', 'today', 'Vandaag'], ['#/paden', 'book', 'Leerpaden'], ['#/herhalen', 'repeat', 'Herhalen'], ['#/voortgang', 'chart', 'Voortgang']];
  app.innerHTML = `<div class="shell">
    <aside class="sidebar">
      <a class="brand" href="#/"><span class="brand-mark">Π</span><span>Polyglot Studio<small>leren · oefenen · bewijzen</small></span></a>
      <nav class="nav" aria-label="Hoofdmenu">${nav.map(([h, i, l]) => `<a href="${h}" data-nav="${h}">${PS.icon(i)}<span>${l}</span>${h === '#/herhalen' ? '<span class="count" data-due></span>' : ''}</a>`).join('')}</nav>
      <nav class="nav" aria-label="Leerpaden"><div class="nav-label">Sporen</div>${PS.C.tracks().map((t) => { const T = PS.C.track(t); return `<a href="#/pad/${t}" data-nav="#/pad/${t}" class="nav-track" data-track="${t}"><span class="glyph-s${T.glyphMono ? ' mono' : ''}">${T.glyph}</span><span>${ES(T.short)}</span><span class="mini-ring" data-ring="${t}"></span></a>`; }).join('')}</nav>
      <div class="sidebar-foot">
        <a href="#/instellingen" class="btn btn-ghost btn-sm" style="justify-content:flex-start">${PS.icon('sliders', 'icon-s')} Instellingen</a>
        <button class="btn btn-ghost btn-sm" style="justify-content:flex-start" data-act="theme">${PS.icon('moon', 'icon-s')} Thema wisselen</button>
        <div class="tiny muted" data-syncstate style="padding:0 12px"></div>
      </div>
    </aside>
    <main class="main" id="main" tabindex="-1"></main>
    <nav class="tabbar" aria-label="Menu">${nav.map(([h, i, l]) => `<a href="${h}" data-nav="${h}">${PS.icon(i)}<span>${l}</span></a>`).join('')}</nav>
  </div>`;
  app.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    const fn = PS.actions[a.dataset.act]; if (fn) { e.preventDefault(); fn(a, e); }
  });
};

PS.updateShell = (route) => {
  const base = route.startsWith('#/pad') ? route.split('/').slice(0, 3).join('/') : route.startsWith('#/les') ? `#/pad/${route.split('/')[2]}` : '#/' + (route.split('/')[1] || '');
  PS.$$('[data-nav]').forEach((a) => a.setAttribute('aria-current', a.dataset.nav === base || (base === '#/' && a.dataset.nav === '#/') ? 'page' : 'false'));
  const due = PS.SRS.counts().today; PS.$$('[data-due]').forEach((x) => (x.textContent = due || ''));
  PS.C.tracks().forEach((t) => { const el = PS.$(`[data-ring="${t}"]`); if (el) el.innerHTML = PS.ring(PS.S.trackMastery(t), 22, 3); });
  const ss = PS.$('[data-syncstate]'); if (ss) ss.innerHTML = PS.sync && PS.sync.configured() ? `${PS.icon('cloud', 'icon-s')} Sync ${PS.S.s.settings.sync.last ? new Date(PS.S.s.settings.sync.last).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }) : '—'}` : '';
  const tabbar = PS.$('.tabbar'); if (tabbar) tabbar.hidden = route.startsWith('#/les/');
  document.documentElement.dataset.route = route.split('/')[1] || 'vandaag';
};

const mobileBar = (extra = '') => `<div class="mobilebar"><a class="brand" href="#/"><span class="brand-mark">Π</span><span>Polyglot</span></a><div class="row" style="gap:6px">${extra}<a class="icon-btn" href="#/instellingen" aria-label="Instellingen">${PS.icon('sliders')}</a></div></div>`;

/* ======================= Router ======================= */
PS.render = () => {
  const main = document.getElementById('main'); if (!main) return;
  let h = location.hash || '#/';
  const parts = h.replace(/^#\/?/, '').split('/').filter(Boolean);
  let html = ''; let after = null; let track = null;
  try {
    if (!parts.length) ({ html, after } = PS.views.today());
    else if (parts[0] === 'paden') ({ html } = PS.views.tracks());
    else if (parts[0] === 'pad' && PS.C.track(parts[1])) { track = parts[1]; ({ html } = PS.views.track(parts[1])); }
    else if (parts[0] === 'les' && PS.C.lesson(parts[1], Number(parts[2]))) { track = parts[1]; ({ html, after } = PS.views.lesson(parts[1], Number(parts[2]), parts[3])); }
    else if (parts[0] === 'herhalen') ({ html } = PS.views.review());
    else if (parts[0] === 'voortgang') ({ html, after } = PS.views.progress());
    else if (parts[0] === 'instellingen') ({ html, after } = PS.views.settings());
    else if (parts[0] === 'coach') ({ html } = PS.views.coach());
    else { h = '#/'; ({ html, after } = PS.views.today()); }
  } catch (err) {
    console.error(err);
    html = `<div class="page"><div class="empty">${PS.icon('alert')}<p>Er ging iets mis bij het tonen van deze pagina.</p><p class="small mono">${ES(err.message)}</p><a class="btn btn-line" href="#/">Naar Vandaag</a></div></div>`;
  }
  main.dataset.track = track || '';
  if (track) main.setAttribute('data-track', track); else main.removeAttribute('data-track');
  main.innerHTML = html;
  PS.updateShell(h);
  if (after) after(main);
  PS.speech.bindSay(main);
  if (PS._lastRoute !== h) { window.scrollTo(0, 0); PS._lastRoute = h; }
};

PS.actions = {
  theme() { PS.setTheme(PS.effectiveTheme() === 'dark' ? 'light' : 'dark', true); },
  session() { PS.session.start(); },
  review(a) { PS.learn.review(a.dataset.track || null).open(); },
  check(a) { PS.learn.check(a.dataset.t, Number(a.dataset.id), a.dataset.kind).open(); },
  practice(a) { PS.learn.practice(a.dataset.t, Number(a.dataset.id), a.dataset.focus ? { focus: a.dataset.focus.split(',') } : {}).open(); },
  mastery(a) { PS.learn.mastery(a.dataset.t, Number(a.dataset.id)).open(); },
  warmup(a) { PS.learn.warmup(a.dataset.t, Number(a.dataset.id)).open(); },
  step(a) { PS.learn.markStep(a.dataset.t, Number(a.dataset.id), a.dataset.step); PS.go(a.dataset.next); },
  drill() { const p = PS.coachPack(); if (p) PS.learn.drill(p).open(); },
  sync() { PS.sync.now(true); },
  diagnostic(a) { PS.learn.diagnostic(a.dataset.t, Number(a.dataset.id)).open(); },
};

/* ======================= Views ======================= */
PS.views = {};

/* ---------- Today ---------- */
PS.views.today = () => {
  const hr = new Date().getHours();
  const hello = hr < 6 ? 'Goedenacht' : hr < 12 ? 'Goedemorgen' : hr < 18 ? 'Goedemiddag' : 'Goedenavond';
  const name = (PS.C.data.profile && PS.C.data.profile.name) || 'Thibaud';
  const checks = PS.T.dueChecks(); const counts = PS.SRS.counts(); const pack = PS.coachPack();
  const drillOpen = pack && !(PS.S.s.drills || {})[pack.date] && (pack.drills || []).some((d) => (d.items || []).length);
  const drillN = pack ? (pack.drills || []).reduce((a, d) => a + (d.items || []).length, 0) : 0;
  const today = PS.S.s.days[PS.today()] || { n: 0, ms: 0 };
  const lessons = PS.C.tracks().map((t) => ({ t, id: PS.S.active(t) })).filter((x) => x.id);
  const mins = Math.round(checks.length * 3 + counts.today * 0.35 + (drillOpen ? drillN * 0.6 : 0) + Math.min(2, lessons.length) * 25);
  const steps = [];
  PS.C.tracks().forEach((t) => { const id = PS.S.active(t); const L = id && PS.C.lesson(t, id); const p = id && PS.S.peek(t, id); if (L && L.diagnostic && !(p && p.diagnostic)) steps.push({ icon: 'compass', t: `Niveautest · ${PS.C.track(t).short}`, s: `${L.diagnostic.items.length} vragen · bepaalt het niveau van je volgende lessen`, act: `data-act="diagnostic" data-t="${t}" data-id="${id}"`, track: t }); });
  checks.forEach((c) => steps.push({ icon: 'target', t: `${PS.CHECK_LABEL[c.kind]} · ${PS.C.track(c.t).short} ${c.id}`, s: c.kind === 'placement' ? 'Bevestig wat je in het oude systeem leerde (8 vragen)' : c.kind === 'retention' ? 'Ken je het een dag later nog? (6 vragen)' : 'Na een week nog paraat? (6 vragen)', act: `data-act="check" data-t="${c.t}" data-id="${c.id}" data-kind="${c.kind}"`, track: c.t }));
  steps.push(counts.today ? { icon: 'repeat', t: `Herhaling · ${counts.today} kaarten`, s: `± ${Math.max(2, Math.round(counts.today * 0.35))} min · alle sporen door elkaar`, act: 'data-act="review"' } : { icon: 'repeat', t: 'Herhaling', s: today.n ? 'Alles herhaald voor vandaag' : 'Geen kaarten vandaag', done: true });
  if (pack) steps.push({ icon: 'sparkles', t: `Coach-training · ${drillN} oefeningen`, s: drillOpen ? 'Gericht op je fouten van de vorige dagen' : 'Afgerond', act: drillOpen ? 'data-act="drill"' : '', done: !drillOpen });
  lessons.slice(0, 4).forEach(({ t, id }) => { const L = PS.C.lesson(t, id); steps.push({ icon: 'bookOpen', t: `${PS.C.track(t).short} · Les ${id}`, s: ES(L.title), href: `#/les/${t}/${id}`, track: t }); });
  const plan = `<section class="card plan">
      <div class="plan-head spread"><div><div class="eyebrow">Dagplan · ± ${mins} min</div><div class="h2" style="margin-top:4px">${checks.length || counts.today ? 'Eerst ophalen, dan nieuwe stof' : 'Tijd voor nieuwe stof'}</div></div><span class="streak" title="Dagen op rij">${PS.icon('flame')} ${PS.S.streak()}</span></div>
      <ol class="plan-steps">${steps.map((st) => `<li>${st.href ? `<a class="plan-step" href="${st.href}"${st.track ? ` data-track="${st.track}"` : ''}>` : `<button type="button" class="plan-step${st.done ? ' done' : ''}" style="width:100%;text-align:left" ${st.act || 'disabled'}${st.track ? ` data-track="${st.track}"` : ''}>`}<span class="dot">${PS.icon(st.done ? 'check' : st.icon)}</span><span><div class="t">${st.t}</div><div class="s">${st.s}</div></span>${st.done ? '' : PS.icon('chevronRight', 'icon-s')}${st.href ? '</a>' : '</button>'}</li>`).join('')}</ol>
      <div class="plan-foot">${PS.session.plan().length ? `<button class="btn btn-primary btn-lg btn-block" data-act="session">${PS.icon('play', 'icon-s')} Start je sessie</button>` : lessons.length ? `<a class="btn btn-primary btn-lg btn-block" href="#/les/${lessons[0].t}/${lessons[0].id}">${PS.icon('play', 'icon-s')} Ga verder met ${PS.C.track(lessons[0].t).short} ${lessons[0].id}</a>` : ''}</div>
    </section>`;
  const coach = pack && pack.note ? `<section class="card card-pad" style="margin-top:14px"><div class="row" style="gap:10px;margin-bottom:8px"><span class="dot" style="width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:var(--ai-soft);color:var(--ai)">${PS.icon('message', 'icon-s')}</span><div><div class="eyebrow">Van je coach</div><div class="tiny muted">${PS.fmtDate(new Date(pack.date + 'T12:00'), { day: 'numeric', month: 'long' })}</div></div></div><div class="prose" style="font-size:15.5px">${pack.note}</div>${(pack.feedback || []).length ? `<a class="btn btn-line btn-sm" href="#/coach" style="margin-top:10px">Feedback op je schrijfwerk ${PS.icon('arrowRight', 'icon-s')}</a>` : ''}</section>` : '';
  const cards = PS.C.tracks().map((t) => {
    const T = PS.C.track(t); const id = PS.S.active(t); const L = id ? PS.C.lesson(t, id) : null;
    const prog = id ? PS.learn.lessonProgress(t, id) : 1;
    return `<a class="card card-hover track-card" data-track="${t}" href="${id ? `#/les/${t}/${id}` : `#/pad/${t}`}">${glyph(t)}<div class="kicker">${ES(T.short)} ${id ? `· Les ${id}` : ''}</div><div class="title">${L ? ES(L.title) : 'Alle lessen afgerond — nieuwe les onderweg'}</div><div class="small muted">${L ? ES(L.subtitle || '') : ''}</div><div class="meta">${id ? statusChip(t, id) : ''}<div class="progress progress-thin"><span style="width:${PS.pct(prog)}%"></span></div>${PS.icon('arrowRight', 'icon-s')}</div></a>`;
  }).join('');
  const html = `<div class="page">${mobileBar(`<span class="streak" style="height:32px">${PS.icon('flame')} ${PS.S.streak()}</span>`)}
    <header class="hello"><div class="date">${PS.fmtDate()}</div><h1 class="display">${hello}, ${ES(name)}.</h1><p class="lede">${today.n ? `Vandaag al ${today.n} oefeningen gedaan${today.ms ? ` in ${Math.round(today.ms / 60000)} min` : ''}. Blijf gaan.` : 'Eerst ophalen wat je al kent, dan iets nieuws bouwen. Kleine stappen, elke dag.'}</p></header>
    <div style="margin-top:20px">${plan}</div>${coach}
    <div class="section-head"><span class="h3">Je lessen</span><a href="#/paden">Alle leerpaden</a></div>
    <div class="grid-2">${cards}</div>
    <div class="section-head"><span class="h3">Ritme</span><a href="#/voortgang">Voortgang</a></div>
    ${PS.views.rhythmCard()}
  </div>`;
  return { html };
};

PS.views.rhythmCard = () => {
  const days = PS.S.s.days; const weeks = 16; const cells = [];
  const end = new Date(); const dow = (end.getDay() + 6) % 7;
  const start = PS.startOfDay(Date.now()) - (weeks * 7 - 7 + dow) * PS.DAY;
  for (let i = 0; i < weeks * 7; i++) {
    const t = start + i * PS.DAY; const k = PS.dayKey(t); const d = days[k];
    const m = d ? Math.max(d.ms / 60000, d.n * 0.5) : 0;
    const l = m <= 0 ? '' : m < 10 ? 'l1' : m < 20 ? 'l2' : m < 40 ? 'l3' : 'l4';
    cells.push(t > Date.now() ? '<i style="visibility:hidden"></i>' : `<i class="${l}${k === PS.today() ? ' today' : ''}" title="${k}: ${Math.round(m)} min"></i>`);
  }
  const ret = PS.SRS.retention(30); const c = PS.SRS.counts();
  const week = Object.entries(days).filter(([k]) => PS.daysBetween(new Date(k + 'T12:00').getTime(), Date.now()) < 7).reduce((a, [, d]) => a + d.ms, 0);
  return `<div class="card card-pad"><div class="row" style="gap:28px;flex-wrap:wrap;align-items:flex-start"><div class="heatmap" aria-label="Studietijd per dag">${cells.join('')}</div>
    <div class="grid-4" style="flex:1;min-width:240px"><div class="stat"><div class="v num">${PS.S.streak()}</div><div class="k">dagen op rij</div></div><div class="stat"><div class="v num">${Math.round(week / 60000)}<span class="small muted"> min</span></div><div class="k">deze week</div></div><div class="stat"><div class="v num">${ret == null ? '—' : PS.pct(ret) + '%'}</div><div class="k">onthouden (30 d)</div></div><div class="stat"><div class="v num">${c.total}</div><div class="k">kaarten in je geheugen</div></div></div></div></div>`;
};

/* ---------- Tracks overview ---------- */
PS.views.tracks = () => {
  const cards = PS.C.tracks().map((t) => {
    const T = PS.C.track(t); const ids = PS.C.lessonIds(t); const syl = PS.C.syllabus(t);
    const done = ids.filter((id) => PS.S.isDone(t, id)).length; const act = PS.S.active(t);
    return `<a class="card card-hover track-card" data-track="${t}" href="#/pad/${t}" style="padding:22px">${glyph(t)}<div class="kicker">${ES(T.levels || '')}</div><div class="title" style="font-size:26px">${ES(T.title)}</div><p class="small muted" style="margin:4px 0 0;max-width:88%">${ES(T.subtitle)}</p>
      <div class="meta"><span class="chip">${done}/${ids.length} lessen</span>${syl ? `<span class="chip chip-line">${syl.topics.length} op de roadmap</span>` : ''}<span style="flex:1"></span>${PS.ring(PS.S.trackMastery(t), 40, 4, `${PS.pct(PS.S.trackMastery(t))}`)}</div>
      ${act ? `<div class="small" style="margin-top:12px"><strong>Volgende:</strong> Les ${act} — ${ES(PS.C.lesson(t, act).title)}</div>` : ''}</a>`;
  }).join('');
  return { html: `<div class="page">${mobileBar()}<div class="eyebrow">Leerpaden</div><h1 class="display">Vier sporen, één methode.</h1><p class="lede">Elke les volgt hetzelfde ritme: kort <strong>ophalen</strong>, <strong>leren</strong> met tussentijdse checks, <strong>oefenen</strong> tot je het twee keer foutloos produceert, zelf iets <strong>maken</strong>, en een <strong>meesterproef</strong> met nieuwe vragen.</p>
    <div class="grid-2" style="margin-top:22px">${cards}</div>
    <div class="section-head"><span class="h3">Wanneer ken je iets?</span></div>
    <div class="card card-pad"><div class="grid-4">${[['Geleerd', 'Meesterproef ≥ 85% én elk leerdoel minstens één keer foutloos — met vragen die je nog niet zag.', 1], ['Beheerst', 'Een dag later slaag je nog voor een retentiecheck (≥ 80%).', 2], ['Verankerd', 'Na een week ken je het nog steeds. Dan zit het in je langetermijngeheugen.', 3]].map(([t, d, n]) => `<div><div class="row" style="gap:8px;margin-bottom:6px"><span class="ladder">${[1, 2, 3].map((k) => `<i class="${k <= n ? 'on' : ''}" style="background:${k <= n ? 'var(--good)' : ''}"></i>`).join('')}</span><strong>${t}</strong></div><div class="small muted">${d}</div></div>`).join('')}</div></div>
  </div>` };
};

/* ---------- Track ---------- */
PS.views.track = (t) => {
  const T = PS.C.track(t); const ids = PS.C.lessonIds(t); const syl = PS.C.syllabus(t);
  const done = ids.filter((id) => PS.S.isDone(t, id)).length;
  const mastered = ids.filter((id) => ['mastered', 'anchored'].includes(PS.S.status(t, id))).length;
  const act = PS.S.active(t);
  const covered = new Set(ids.flatMap((id) => String(PS.C.lesson(t, id).roadmap || '').split('+')));
  const items = ids.map((id) => {
    const L = PS.C.lesson(t, id); const p = PS.S.peek(t, id); const st = p ? p.status : 'new';
    const unlocked = PS.S.isUnlocked(t, id);
    const cls = [st, id === act ? 'active' : '', unlocked ? '' : 'locked'].join(' ');
    const sub = st === 'new' ? `${L.level || ''} · ${L.minutes || 30} min` : PS.STATUS_LABEL[st] + (p && p.needsReview ? ' · herhalen nodig' : '');
    return `<li class="path-item ${cls}"><span class="path-node">${PS.DONE.has(st) && st !== 'legacy' ? PS.icon('check') : unlocked ? id : PS.icon('lock', 'icon-s')}</span><a class="path-card" href="#/les/${t}/${id}"><div class="t">${ES(L.title)}</div><div class="s">Les ${id} · ${ES(sub)}</div></a><span>${ladder(st, p && p.needsReview)}</span></li>`;
  });
  const planned = syl ? syl.topics.filter((x) => !covered.has(x.id)).slice(0, 60) : [];
  planned.forEach((x, i) => items.push(`<li class="path-item planned"><span class="path-node">${ids.length + i + 1}</span><div class="path-card"><div class="t">${ES(x.title)}</div><div class="s">${ES(x.level || '')} · gepland — wordt gegenereerd zodra je eraan toe bent</div></div><span></span></li>`));
  const total = Math.max(ids.length, syl ? syl.topics.length : 0);
  return { html: `<div class="page"><div class="lesson-top"><a class="back" href="#/paden">${PS.icon('chevronLeft')} Leerpaden</a></div>
    <section class="hero">${glyph(t)}<div class="eyebrow" style="color:var(--accent)">${ES(T.levels || 'Leerpad')}</div><h1 class="display">${ES(T.title)}</h1><p class="lede">${ES(T.subtitle)}</p>
      <div class="hero-stats"><div><div class="v num">${done}<span class="muted small">/${total}</span></div><div class="k">lessen afgerond</div></div><div><div class="v num">${mastered}</div><div class="k">beheerst</div></div><div><div class="v num">${PS.SRS.dueKeys(t).length}</div><div class="k">kaarten te herhalen</div></div></div>
      ${act ? `<a class="btn btn-accent btn-lg" style="margin-top:20px" href="#/les/${t}/${act}">${PS.icon('play', 'icon-s')} Les ${act}: ${ES(PS.C.lesson(t, act).title)}</a>` : ''}
    </section>
    ${T.goal ? `<p class="small muted" style="margin:16px 4px 0">${ES(T.goal)}</p>` : ''}
    <div class="section-head"><span class="h3">Roadmap</span><span class="small muted">${ids.length} lessen klaar · ${planned.length} gepland</span></div>
    <ol class="path">${items.join('')}</ol></div>` };
};

/* ---------- Lesson ---------- */
PS.views.lesson = (t, id, step) => {
  const L = PS.C.lesson(t, id); const T = PS.C.track(t); const p = PS.S.L(t, id);
  if (!PS.S.isUnlocked(t, id)) {
    const prev = PS.C.lessonIds(t).filter((x) => x < id).pop();
    return { html: `<div class="page"><div class="lesson-top"><a class="back" href="#/pad/${t}">${PS.icon('chevronLeft')} ${ES(T.short)}</a></div><div class="empty">${PS.icon('lock')}<h2 class="h2">Nog vergrendeld</h2><p>Haal eerst de meesterproef van Les ${prev}. Liever vrij rondkijken? Zet <em>Geleid leren</em> uit in de instellingen.</p><a class="btn btn-primary" href="#/les/${t}/${prev}">Naar Les ${prev}</a></div></div>` };
  }
  const hasWarm = !!L.diagnostic || id > 1 || PS.SRS.dueKeys(t).length > 0;
  const steps = PS.STEPS.filter((s) => s.id !== 'opwarmen' || hasWarm);
  if (!step || !steps.some((s) => s.id === step)) {
    const d = p.stepsDone || {};
    step = PS.DONE.has(p.status) && p.status !== 'legacy' ? 'leren' : (steps.find((s) => !d[s.id] && s.id !== 'meesterproef') || { id: 'meesterproef' }).id;
    if (L.diagnostic && !p.diagnostic) step = 'opwarmen';
    if (p.status === 'legacy') step = 'meesterproef';
  }
  const doneMap = Object.assign({}, p.stepsDone || {}, PS.DONE.has(p.status) && p.status !== 'legacy' ? { meesterproef: 1 } : {});
  const stepper = `<nav class="stepper" aria-label="Lesstappen">${steps.map((s, i) => `<a href="#/les/${t}/${id}/${s.id}" ${s.id === step ? 'aria-current="step"' : ''} class="${doneMap[s.id] ? 'done' : ''}"><span class="n">${doneMap[s.id] ? '✓' : i + 1}</span><span class="label-long">${s.id === 'opwarmen' && L.diagnostic ? 'Niveautest' : PS.stepLabel(t, s.id)}</span></a>`).join('')}</nav>`;
  const head = `<div class="lesson-top"><a class="back" href="#/pad/${t}">${PS.icon('chevronLeft')} ${ES(T.short)}</a><span class="row" style="gap:8px">${statusChip(t, id)}</span></div>
    <header class="lesson-head"><div class="eyebrow" style="color:var(--accent)">Les ${PS.pad2(id)} · ${ES(L.level || '')} · ± ${L.minutes || 30} min${L.kind === 'consolidation' ? ' · Consolidatie' : ''}</div><h1 class="display">${ES(L.title)}</h1>${L.subtitle ? `<p class="lede">${ES(L.subtitle)}</p>` : ''}</header>`;
  const body = PS.lessonStep[step](t, id, L, p);
  return { html: `<div class="page">${head}${stepper}<div data-step="${step}">${body.html}</div></div>`, after: body.after };
};

PS.lessonStep = {};
PS.lessonStep.opwarmen = (t, id, L, p) => {
  if (L.diagnostic) {
    const D = L.diagnostic; const done = p.diagnostic;
    return { html: `<div class="step-intro">${PS.icon('compass')}<p><strong>Niveautest.</strong> ${D.intro || 'Een korte toets over verschillende niveaus. Je krijgt pas feedback op het einde — raad niet, kies “Weet ik niet” als je het echt niet weet.'}</p></div>
      <div class="card card-pad stack"><div class="spread"><div class="h3">${D.items.length} vragen · ± ${Math.round(D.items.length * 0.6)} min</div>${done ? `<span class="chip chip-good">${PS.icon('check')} Geschat: ${PS.esc(done.level)}</span>` : ''}</div>
      ${done ? `<div class="skill-bars">${Object.entries(done.bands).map(([b, [g, n]]) => `<div class="skill-bar"><div class="spread"><span class="small">Niveau ${PS.esc(b)}</span><span class="num small muted">${n ? PS.pct(g / n) : 0}%</span></div><div class="progress"><span style="width:${n ? PS.pct(g / n) : 0}%;background:${n && g / n >= 0.7 ? 'var(--good)' : 'var(--warn)'}"></span></div></div>`).join('')}</div><p class="small muted" style="margin:0">Antigravity leest dit morgenochtend in en stemt de volgende lessen erop af.</p>` : '<p class="small muted" style="margin:0">De vragen gaan van makkelijk naar moeilijk. Daarna start de les.</p>'}
      <div class="row-wrap"><button class="btn ${done ? 'btn-line' : 'btn-primary'}" data-act="diagnostic" data-t="${t}" data-id="${id}">${PS.icon('play', 'icon-s')} ${done ? 'Opnieuw afleggen' : 'Start de niveautest'}</button>${done ? `<a class="btn btn-primary" href="#/les/${t}/${id}/leren">Naar Leren ${PS.icon('arrowRight', 'icon-s')}</a>` : `<button class="btn btn-ghost" data-act="step" data-t="${t}" data-id="${id}" data-step="opwarmen" data-next="#/les/${t}/${id}/leren">Overslaan</button>`}</div></div>` };
  }
  return { html: `<div class="step-intro">${PS.icon('zap')}<p><strong>Ophalen vóór je begint.</strong> Vijf snelle vragen uit eerdere lessen activeren je voorkennis — dat maakt nieuwe stof beter hechtend (het <em>testing effect</em>).</p></div>
    <div class="card card-pad stack"><div class="h3">Opwarmer · ± 3 min</div><p class="small muted" style="margin:0">Kaarten die vandaag vervallen in dit spoor, aangevuld met vragen uit de vorige lessen.</p><div class="row-wrap"><button class="btn btn-primary" data-act="warmup" data-t="${t}" data-id="${id}">${PS.icon('play', 'icon-s')} Start opwarmer</button><button class="btn btn-ghost" data-act="step" data-t="${t}" data-id="${id}" data-step="opwarmen" data-next="#/les/${t}/${id}/leren">Overslaan</button></div></div>` };
};

PS.lessonStep.leren = (t, id, L, p) => {
  const skills = PS.learn.skillState(t, id);
  const obj = `<div class="card card-pad"><div class="eyebrow" style="margin-bottom:12px">Na deze les kun je</div><ul class="objectives">${skills.map((s) => `<li><span class="tick ${s.acc == null ? '' : s.acc >= 0.85 ? 'on' : 'half'}">${PS.icon('check', 'icon-s')}</span><span>${ES(s.text)}</span><span class="pct">${s.acc == null ? '' : PS.pct(s.acc) + '%'}</span></li>`).join('')}</ul></div>`;
  const lang = PS.C.track(t).lang;
  const vocab = (L.vocab || []).length ? `<div class="section-head"><span class="h3">Woordenschat</span><span class="small muted">Tik om te horen</span></div><div class="vocab">${L.vocab.map((v) => `<button type="button" class="vocab-item" data-say="${PS.attr(v.term)}" data-lang="${lang}" ${v.audio ? `data-audio="${PS.attr(v.audio)}"` : ''}><span><div class="term"${lang && lang.startsWith('el') ? ' lang="el"' : ''}>${ES(v.term)}</div>${v.translit ? `<div class="tr">${ES(v.translit)}</div>` : ''}<div class="m">${ES(v.meaning)}</div></span>${PS.icon('volume', 'icon-s')}</button>`).join('')}</div>` : '';
  const sections = (L.sections || []).map((s, i) => `<section class="section" id="sec-${s.id}"><div class="section-num">${PS.pad2(i + 1)}</div><h2 class="h2" style="margin:4px 0 10px">${ES(s.title)}</h2><div class="prose">${s.html}</div>${(s.checks || []).map((c) => `<div data-inline="${PS.attr(c.id)}"></div>`).join('')}</section>`).join('');
  const html = `${L.summary ? `<div class="prose" style="margin-bottom:18px"><p class="lede">${L.summary}</p></div>` : ''}${obj}${vocab}<div class="card card-pad" style="margin-top:22px">${sections}</div>
    <div class="next-bar"><button class="btn btn-primary btn-lg" data-act="step" data-t="${t}" data-id="${id}" data-step="leren" data-next="#/les/${t}/${id}/oefenen">Klaar met leren ${PS.icon('arrowRight', 'icon-s')}</button></div>`;
  const after = (root) => {
    PS.$$('[data-inline]', root).forEach((el) => {
      const item = PS.C.item(t, id, el.dataset.inline);
      if (item) PS.inlineItem(el, item, { track: t, lesson: id, mode: 'check' });
    });
    PS.mountSims(root, t);
    if (PS.sol) PS.$$('[data-studio-demo]', root).forEach((el) => PS.sol.mountDemo(el));
  };
  return { html, after };
};

PS.lessonStep.oefenen = (t, id, L, p) => {
  const skills = PS.learn.skillState(t, id);
  const weak = skills.filter((s) => s.acc != null && s.acc < 0.85).map((s) => s.id);
  const html = `<div class="step-intro">${PS.icon('dumbbell')}<p><strong>Adaptief oefenen.</strong> Je krijgt steeds het leerdoel waar je het zwakst op staat. Fout? Die vraag komt een paar beurten later terug. Klaar zodra je elk leerdoel <strong>twee keer foutloos</strong> produceert — meestal 15–25 vragen.</p></div>
    ${p.gate > 0 ? `<div class="callout callout-warning"><div class="callout-title">${PS.icon('alert')} Eerst gericht oefenen</div>Nog <strong>${p.gate}</strong> juiste antwoorden nodig voor je de meesterproef opnieuw mag afleggen.</div>` : ''}
    <div class="card card-pad"><div class="eyebrow" style="margin-bottom:14px">Beheersing per leerdoel</div><div class="skill-bars">${skills.map((s) => `<div class="skill-bar"><div class="spread"><span class="small">${ES(s.text)}</span><span class="num small muted">${s.acc == null ? '—' : PS.pct(s.acc) + '%'}</span></div><div class="progress"><span style="width:${s.acc == null ? 0 : PS.pct(s.acc)}%;background:${s.acc == null ? 'transparent' : s.acc >= 0.85 ? 'var(--good)' : s.acc >= 0.5 ? 'var(--warn)' : 'var(--bad)'}"></span></div></div>`).join('')}</div>
      <div class="row-wrap" style="margin-top:18px"><button class="btn btn-primary btn-lg" data-act="practice" data-t="${t}" data-id="${id}">${PS.icon('play', 'icon-s')} ${p.stepsDone && p.stepsDone.oefenen ? 'Nog een ronde' : 'Start oefenen'}</button>${weak.length ? `<button class="btn btn-line btn-lg" data-act="practice" data-t="${t}" data-id="${id}" data-focus="${weak.join(',')}">Alleen zwakke doelen (${weak.length})</button>` : ''}</div></div>
    <div class="next-bar"><a class="btn btn-ghost" href="#/les/${t}/${id}/leren">${PS.icon('chevronLeft', 'icon-s')} Theorie</a><a class="btn btn-line" href="#/les/${t}/${id}/productie">${PS.stepLabel(t, 'productie')} ${PS.icon('arrowRight', 'icon-s')}</a></div>`;
  return { html };
};

PS.lessonStep.productie = (t, id, L, p) => {
  const P = L.production;
  if (!P) return { html: `<div class="empty"><p>Geen productie-opdracht in deze les.</p><a class="btn btn-primary" href="#/les/${t}/${id}/meesterproef">Naar de meesterproef</a></div>` };
  const saved = p.production || null;
  const intro = { write: 'Actief produceren is de sterkste test van begrip: schrijf zelf, vergelijk daarna met het model en beoordeel eerlijk met de checklist. Je tekst gaat mee naar je coach, die morgen feedback geeft.', code: 'Bouw het zelf. Je code wordt écht gecompileerd (solc 0.8) en getest op een virtuele EVM — alle tests groen = geslaagd.', explain: 'Leg het uit in je eigen woorden of reken het volledig uit. Vergelijk daarna met het model en de checklist. Je antwoord gaat mee naar je coach.' }[P.type] || '';
  if (P.type === 'code' || P.type === 'jscode') {
    const html = `<div class="step-intro">${PS.icon('code')}<p><strong>${PS.stepLabel(t, 'productie')}.</strong> ${P.type === 'code' ? intro : 'Bouw het zelf in een echte JavaScript-omgeving die zich gedraagt als de n8n Code-node. Alle testgevallen groen = geslaagd.'}</p></div><div data-prod-item></div>
      <div class="next-bar"><a class="btn btn-line" href="#/les/${t}/${id}/meesterproef">Naar de meesterproef ${PS.icon('arrowRight', 'icon-s')}</a></div>`;
    const after = (root) => {
      const item = Object.assign({ id: 'production', skill: '', level: 3, explain: P.model || '' }, P);
      PS.inlineItem(PS.$('[data-prod-item]', root), item, { track: t, lesson: id, mode: 'production', onResult: (res) => {
        PS.S.log({ k: 'p', t, l: id, ty: P.type, ok: res.score === 1, sc: res.score });
        if (res.score === 1) { PS.learn.markStep(t, id, 'productie'); PS.toast(`${PS.icon('checkCircle', 'icon-s')} Geslaagd`); PS.confetti(); }
      } });
    };
    return { html, after };
  }
  const lang = P.lang || (t === 'greek' ? 'el' : t === 'french' ? 'fr' : 'nl');
  const html = `<div class="step-intro">${PS.icon(P.type === 'write' ? 'feather' : 'bulb')}<p><strong>${PS.stepLabel(t, 'productie')}.</strong> ${intro}</p></div>
    <div class="card card-pad"><div class="prose">${P.prompt}</div>
      <textarea class="answer-input" data-prod lang="${lang}" rows="7" style="margin-top:12px" placeholder="${lang === 'el' ? 'Γράψε εδώ…' : lang === 'fr' ? 'Rédigez ici…' : 'Schrijf hier…'}">${saved ? ES(saved.text) : ''}</textarea>
      <div class="spread" style="margin-top:8px">${lang === 'el' ? `<button type="button" class="kb-toggle" data-kb-toggle-prod>${PS.icon('keyboard', 'icon-s')}<span>ΑΒΓ</span></button>` : '<span></span>'}<span class="tiny muted" data-wc></span></div>
      <div class="row-wrap" style="margin-top:14px"><button class="btn btn-primary" data-prod-reveal>${PS.icon('eye', 'icon-s')} Vergelijk met het model</button></div>
      <div data-prod-model ${saved ? '' : 'hidden'}><hr class="divider"><div class="eyebrow" style="margin-bottom:8px">Modelantwoord</div><div class="prose">${P.model}</div>
        ${(P.rubric || []).length ? `<div class="eyebrow" style="margin:18px 0 6px">Checklist — wat zit in jouw versie?</div>${P.rubric.map((r, i) => `<label class="row" style="align-items:flex-start;gap:10px;margin:8px 0"><input type="checkbox" data-rub="${i}" ${saved && saved.rub && saved.rub.includes(i) ? 'checked' : ''} style="margin-top:4px;width:18px;height:18px;accent-color:var(--good)"><span>${r}</span></label>`).join('')}` : ''}
        <div class="row-wrap" style="margin-top:14px"><button class="btn btn-good" data-prod-save>${PS.icon('check', 'icon-s')} Bewaar & rond af</button>${saved ? `<span class="small muted">Bewaard ${new Date(saved.at).toLocaleDateString('nl-BE')} · zelfscore ${PS.pct(saved.self)}%</span>` : ''}</div></div>
    </div>
    <div class="next-bar"><a class="btn btn-line" href="#/les/${t}/${id}/meesterproef">Naar de meesterproef ${PS.icon('arrowRight', 'icon-s')}</a></div>`;
  const after = (root) => {
    const ta = PS.$('[data-prod]', root); const wc = PS.$('[data-wc]', root);
    const upd = () => { const n = (ta.value.trim().match(/\S+/g) || []).length; wc.textContent = `${n} woorden${P.minWords ? ` · minimum ${P.minWords}` : ''}`; };
    ta.addEventListener('input', upd); upd();
    const kbt = PS.$('[data-kb-toggle-prod]', root); if (kbt) kbt.addEventListener('click', () => PS.kb.toggleFor(ta));
    PS.$('[data-prod-reveal]', root).addEventListener('click', () => {
      if (P.minWords && (ta.value.trim().match(/\S+/g) || []).length < P.minWords * 0.6) { PS.toast('Schrijf eerst zelf een volwaardige versie'); ta.focus(); return; }
      PS.$('[data-prod-model]', root).hidden = false; PS.$('[data-prod-model]', root).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    PS.$('[data-prod-save]', root).addEventListener('click', () => {
      const boxes = PS.$$('[data-rub]', root); const rub = boxes.filter((b) => b.checked).map((b) => Number(b.dataset.rub));
      const self = boxes.length ? rub.length / boxes.length : 1;
      p.production = { text: ta.value, self, rub, at: Date.now() };
      PS.S.log({ k: 'p', t, l: id, ty: P.type, self: +self.toFixed(2), text: ta.value.slice(0, 4000) });
      PS.learn.markStep(t, id, 'productie');
      PS.toast(`${PS.icon('checkCircle', 'icon-s')} Bewaard — je coach kijkt mee`);
      PS.go(`#/les/${t}/${id}/meesterproef`);
    });
  };
  return { html, after };
};

PS.lessonStep.meesterproef = (t, id, L, p) => {
  const tests = (p.tests || []).slice().reverse();
  const st = p.status; const d = p.stepsDone || {};
  const ready = d.oefenen || !PS.S.s.settings.guided || st === 'legacy';
  const gate = p.gate > 0 && PS.S.s.settings.guided;
  const checks = Object.entries(p.checks || {}).map(([k, c]) => `<div class="row" style="gap:10px"><span class="chip ${c.due <= Date.now() ? 'chip-warn' : 'chip-line'}">${PS.icon('target')} ${PS.CHECK_LABEL[k]}</span><span class="small muted">${c.due <= Date.now() ? 'nu beschikbaar' : PS.fmtRel(c.due)}</span>${c.due <= Date.now() ? `<button class="btn btn-soft btn-sm" data-act="check" data-t="${t}" data-id="${id}" data-kind="${k}">Start</button>` : ''}</div>`).join('');
  const legacy = st === 'legacy' ? `<div class="callout callout-rule"><div class="callout-title">${PS.icon('info')} Afgerond in het oude systeem</div>Bevestig je kennis met de <strong>instapcheck</strong> (8 vragen, ≥ 80%). Lukt dat, dan staat de les meteen op <em>Beheerst</em>. Zo niet, dan weet je precies wat je moet herhalen.</div>` : '';
  const html = `${legacy}<div class="card card-pad">
      <div class="row" style="gap:14px;align-items:flex-start"><span style="width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);flex:none">${PS.icon('graduate', 'icon-l')}</span><div><div class="h2">Meesterproef</div><p class="small muted" style="margin:4px 0 0">Bewijs dat je het kán — niet dat je het herkent.</p></div></div>
      <ul class="small" style="margin:18px 0 0;padding-left:1.2em;line-height:1.8"><li><strong>10 vragen</strong> uit een aparte vragenbank die je bij het oefenen nooit zag, plus <strong>2 vragen uit eerdere lessen</strong>.</li><li>Vooral <strong>zelf produceren</strong>: typen, invullen, zinnen bouwen, rekenen${t === 'solidity' ? ', code die écht getest wordt' : ''}.</li><li>Geslaagd bij <strong>≥ 85%</strong> én <strong>elk leerdoel minstens één keer foutloos</strong>. Accentfouten tellen voor de helft.</li><li>Feedback krijg je pas op het einde. Gezakt? Eerst 6 juiste antwoorden in gericht oefenen, dan een nieuwe proef met andere vragen.</li></ul>
      <div class="row-wrap" style="margin-top:20px">${st === 'legacy' ? `<button class="btn btn-primary btn-lg" data-act="check" data-t="${t}" data-id="${id}" data-kind="placement">${PS.icon('target', 'icon-s')} Start instapcheck</button><button class="btn btn-line btn-lg" data-act="mastery" data-t="${t}" data-id="${id}">Volledige meesterproef</button>` : `<button class="btn btn-primary btn-lg" data-act="mastery" data-t="${t}" data-id="${id}" ${gate ? 'disabled' : ''}>${PS.icon('play', 'icon-s')} ${PS.DONE.has(st) ? 'Opnieuw afleggen' : 'Start de meesterproef'}</button>`}
      ${!ready && !gate ? `<span class="small muted">Tip: oefen eerst — ${PS.pct(PS.learn.lessonProgress(t, id))}% van de les gedaan.</span>` : ''}${gate ? `<button class="btn btn-soft btn-lg" data-act="practice" data-t="${t}" data-id="${id}">Eerst gericht oefenen (nog ${p.gate})</button>` : ''}</div>
      ${checks ? `<hr class="divider"><div class="eyebrow" style="margin-bottom:10px">Volgende checks</div><div class="stack">${checks}</div>` : ''}
    </div>
    ${tests.length ? `<div class="section-head"><span class="h3">Geschiedenis</span></div><div class="card card-pad stack">${tests.slice(0, 8).map((x) => `<div class="spread"><span class="row" style="gap:10px"><span class="chip ${x.passed ? 'chip-good' : 'chip-bad'}">${x.passed ? PS.icon('check') : PS.icon('x')} ${PS.CHECK_LABEL[x.kind]}</span><span class="small muted">${new Date(x.ts).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })}</span></span><span class="num" style="font-weight:700">${PS.pct(x.score)}%</span></div>`).join('')}</div>` : ''}`;
  return { html };
};

/* ---------- Review ---------- */
PS.views.review = () => {
  const c = PS.SRS.counts();
  const per = PS.C.tracks().map((t) => ({ t, n: PS.SRS.dueKeys(t).length, total: Object.keys(PS.S.s.cards).filter((k) => k.startsWith(t + ':')).length }));
  const days = [];
  for (let i = 0; i < 7; i++) { const endD = PS.startOfDay(Date.now() + (i + 1) * PS.DAY) - 1; const startD = i === 0 ? 0 : PS.startOfDay(Date.now() + i * PS.DAY); days.push(Object.values(PS.S.s.cards).filter((x) => x.due <= endD && x.due >= startD).length); }
  const max = Math.max(1, ...days);
  const ret = PS.SRS.retention(30);
  return { html: `<div class="page">${mobileBar()}<div class="eyebrow">Herhalen</div><h1 class="display">Ophalen, net op tijd.</h1><p class="lede">Elke kaart komt terug vlak voor je hem zou vergeten. Je typt het antwoord zelf — herkennen telt niet.</p>
    <section class="card card-pad" style="margin-top:22px"><div class="spread" style="align-items:flex-end"><div><div class="num" style="font-size:54px;font-weight:800;letter-spacing:-0.03em;line-height:1">${c.today}</div><div class="muted small">kaarten vandaag · ${c.tomorrow} morgen</div></div>${c.today ? `<button class="btn btn-primary btn-lg" data-act="review">${PS.icon('play', 'icon-s')} Start herhaling</button>` : `<span class="chip chip-good">${PS.icon('check')} Alles bij</span>`}</div>
      <hr class="divider"><div class="stack">${per.map((x) => `<div class="spread" data-track="${x.t}"><span class="row" style="gap:10px"><span class="glyph-s nav-track" style="display:contents"></span><span style="width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);font-family:${PS.C.track(x.t).glyphMono ? 'var(--font-mono);font-size:11px;font-weight:700' : 'var(--font-display)'}">${PS.C.track(x.t).glyph}</span><span><div style="font-weight:650">${ES(PS.C.track(x.t).short)}</div><div class="tiny muted">${x.total} kaarten</div></div></span><span class="row" style="gap:10px"><span class="num" style="font-weight:700">${x.n}</span>${x.n ? `<button class="btn btn-soft btn-sm" data-act="review" data-track="${x.t}">Herhaal</button>` : ''}</span></div>`).join('')}</div></section>
    <div class="section-head"><span class="h3">Komende 7 dagen</span></div>
    <div class="card card-pad"><div class="row" style="align-items:flex-end;gap:10px;height:120px">${days.map((n, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end"><span class="tiny num muted">${n}</span><div style="width:100%;max-width:38px;border-radius:8px 8px 3px 3px;background:${i === 0 ? 'var(--ink)' : 'var(--surface-3)'};height:${Math.max(4, (n / max) * 80)}px"></div><span class="tiny muted">${i === 0 ? 'vand.' : new Date(Date.now() + i * PS.DAY).toLocaleDateString('nl-BE', { weekday: 'short' })}</span></div>`).join('')}</div></div>
    <div class="grid-4" style="margin-top:14px"><div class="stat"><div class="v num">${c.total}</div><div class="k">kaarten</div></div><div class="stat"><div class="v num">${c.mature}</div><div class="k">stevig (≥ 21 d)</div></div><div class="stat"><div class="v num">${ret == null ? '—' : PS.pct(ret) + '%'}</div><div class="k">onthouden (30 d)</div></div></div>
  </div>` };
};

/* ---------- Progress ---------- */
PS.views.progress = () => {
  const ev = PS.S.s.events; const cut = Date.now() - 30 * PS.DAY;
  const tags = {}; const skillAgg = {};
  ev.forEach((e) => {
    if (e.k !== 'a' || e.ts < cut) return;
    if (e.sc < 1) { const k = e.tag || e.kind; if (k && k !== 'wrong' && k !== 'skip') tags[k] = (tags[k] || 0) + 1; }
    if (e.t && e.l && e.sk) { const k = `${e.t}:${e.l}:${e.sk}`; const a = (skillAgg[k] = skillAgg[k] || [0, 0]); a[0] += e.sc; a[1]++; }
  });
  const weak = Object.entries(skillAgg).filter(([, [s, n]]) => n >= 3 && s / n < 0.75).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]).slice(0, 8);
  const TAGL = { accent: 'Accenten / tonos', sigma: 'Slot-sigma (ς)', typo: 'Typfouten', partial: 'Gedeeltelijk juist', close: 'Net ernaast' };
  const rings = PS.C.tracks().map((t) => `<a class="card card-hover card-pad" data-track="${t}" href="#/pad/${t}" style="text-align:center">${PS.ring(PS.S.trackMastery(t), 76, 7, `${PS.pct(PS.S.trackMastery(t))}%`)}<div style="font-weight:700;margin-top:10px">${ES(PS.C.track(t).short)}</div><div class="tiny muted">${PS.C.lessonIds(t).filter((id) => PS.S.isDone(t, id)).length} lessen · ${PS.C.lessonIds(t).filter((id) => ['mastered', 'anchored'].includes(PS.S.status(t, id))).length} beheerst</div></a>`).join('');
  const tests = ev.filter((e) => e.k === 't').slice(-10).reverse();
  const html = `<div class="page">${mobileBar()}<div class="eyebrow">Voortgang</div><h1 class="display">Wat zit er echt in?</h1><p class="lede">Beheersing telt alleen wat je bewezen hebt: geslaagde proeven én checks op latere dagen.</p>
    <div class="grid-4" style="margin-top:22px">${rings}</div>
    <div class="section-head"><span class="h3">Ritme</span></div>${PS.views.rhythmCard()}
    <div class="section-head"><span class="h3">Zwakke plekken · 30 dagen</span></div>
    <div class="card card-pad">${weak.length ? `<div class="stack">${weak.map(([k, [s, n]]) => { const [t, l, sk] = k.split(':'); const L = PS.C.lesson(t, Number(l)); const o = L && (L.objectives || []).find((x) => x.id === sk); return `<div class="spread" data-track="${t}"><div><div style="font-weight:600">${ES(o ? o.text : sk)}</div><div class="tiny muted">${ES(PS.C.track(t).short)} · Les ${l} · ${PS.pct(s / n)}% over ${n} pogingen</div></div><button class="btn btn-soft btn-sm" data-act="practice" data-t="${t}" data-id="${l}" data-focus="${PS.attr(sk)}">Oefen</button></div>`; }).join('')}</div>` : '<p class="muted small" style="margin:0">Nog geen duidelijke zwakke plekken. Die verschijnen hier zodra er genoeg data is.</p>'}
      ${Object.keys(tags).length ? `<hr class="divider"><div class="eyebrow" style="margin-bottom:10px">Foutpatronen</div><div class="row-wrap">${Object.entries(tags).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span class="chip chip-warn">${ES(TAGL[k] || k)} · ${n}</span>`).join('')}</div>` : ''}</div>
    <div class="section-head"><span class="h3">Recente proeven</span></div>
    <div class="card card-pad">${tests.length ? `<div class="stack">${tests.map((x) => `<div class="spread" data-track="${x.t}"><span><strong>${PS.CHECK_LABEL[x.kind]}</strong> <span class="muted small">· ${ES(PS.C.track(x.t) ? PS.C.track(x.t).short : x.t)} ${x.l} · ${new Date(x.ts).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })}</span></span><span class="chip ${x.pass ? 'chip-good' : 'chip-bad'} num">${PS.pct(x.sc)}%</span></div>`).join('')}</div>` : '<p class="muted small" style="margin:0">Nog geen proeven afgelegd.</p>'}</div>
    <div class="section-head"><span class="h3">Gegevens</span></div>
    <div class="card card-pad"><div class="row-wrap"><button class="btn btn-line btn-sm" data-export>${PS.icon('download', 'icon-s')} Exporteer</button><label class="btn btn-line btn-sm">${PS.icon('upload', 'icon-s')} Importeer<input type="file" accept="application/json" data-import hidden></label>${PS.sync.configured() ? `<button class="btn btn-line btn-sm" data-act="sync">${PS.icon('sync', 'icon-s')} Synchroniseer nu</button>` : `<a class="btn btn-soft btn-sm" href="#/instellingen">${PS.icon('cloud', 'icon-s')} Sync instellen</a>`}</div><p class="tiny muted" style="margin:12px 0 0">Toestel: <span class="mono">${ES(PS.S.s.device)}</span> · ${ev.length} gebeurtenissen lokaal bewaard.</p></div>
  </div>`;
  const after = (root) => {
    PS.$('[data-export]', root).addEventListener('click', () => {
      PS.S.flush();
      const blob = new Blob([JSON.stringify(PS.S.s, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `polyglot-voortgang-${PS.today()}.json`; a.click();
    });
    PS.$('[data-import]', root).addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { const other = JSON.parse(await f.text()); PS.sync.merge(other); PS.S.flush(); PS.toast('Geïmporteerd en samengevoegd'); PS.render(); } catch (err) { PS.toast('Ongeldig bestand'); }
    });
  };
  return { html, after };
};

/* ---------- Coach ---------- */
PS.views.coach = () => {
  const pack = PS.coachPack();
  if (!pack) return { html: `<div class="page"><div class="lesson-top"><a class="back" href="#/">${PS.icon('chevronLeft')} Vandaag</a></div><div class="empty">${PS.icon('message')}<p>Nog geen coach-pakket. Je coach (Antigravity) maakt er elke ochtend één op basis van je resultaten.</p></div></div>` };
  return { html: `<div class="page"><div class="lesson-top"><a class="back" href="#/">${PS.icon('chevronLeft')} Vandaag</a></div><div class="eyebrow">Coach · ${PS.fmtDate(new Date(pack.date + 'T12:00'))}</div><h1 class="display">Feedback op maat.</h1><div class="card card-pad prose">${pack.note || ''}</div>
    ${(pack.feedback || []).map((f) => `<div class="card card-pad" data-track="${f.track}" style="margin-top:14px"><div class="eyebrow" style="color:var(--accent);margin-bottom:8px">${ES(PS.C.track(f.track) ? PS.C.track(f.track).short : f.track)} · Les ${f.lesson}</div><div class="prose">${f.html || ''}</div></div>`).join('')}
    ${(pack.drills || []).some((d) => (d.items || []).length) ? `<div class="next-bar"><button class="btn btn-primary btn-lg" data-act="drill">${PS.icon('sparkles', 'icon-s')} Start de coach-training</button></div>` : ''}</div>` };
};

/* ---------- Settings ---------- */
PS.views.settings = () => {
  const st = PS.S.s.settings;
  const html = `<div class="page">${mobileBar()}<div class="eyebrow">Instellingen</div><h1 class="display">Jouw studio.</h1>
    <div class="card card-pad" style="margin-top:18px">
      <div class="setting"><div><div class="t">Thema</div><div class="s">Automatisch volgt je toestel.</div></div><div class="seg" data-theme-seg>${[['auto', 'Auto'], ['light', 'Licht'], ['dark', 'Donker']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${st.theme === v}">${l}</button>`).join('')}</div></div>
      <div class="setting"><div><div class="t">Geleid leren</div><div class="s">Lessen openen pas na de meesterproef van de vorige les.</div></div><label class="switch"><input type="checkbox" data-set="guided" ${st.guided ? 'checked' : ''}><span></span></label></div>
      <div class="setting"><div><div class="t">Grieks toetsenbord</div><div class="s">Ingebouwd toetsenbord met tonos-toets. Op de Mac typ je Grieks via je gewone toetsen (; = tonos).</div></div><div class="seg" data-kb-seg>${[['auto', 'Auto'], ['on', 'Aan'], ['off', 'Uit']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${st.greekKb === v}">${l}</button>`).join('')}</div></div>
      <div class="setting"><div><div class="t">Spreektempo</div><div class="s">Voor Grieks en Frans voorlezen.</div></div><input type="range" min="0.6" max="1.1" step="0.02" value="${st.ttsRate}" data-set="ttsRate" style="width:140px;accent-color:var(--ink)"></div>
    </div>
    <div class="section-head"><span class="h3">Account & synchronisatie</span>${PS.cloud.signedIn() ? `<span class="chip chip-good">${PS.icon('cloud')} verbonden</span>` : ''}</div>
    <div class="card card-pad" data-account>${PS.views.accountBox()}</div>
    <div class="section-head"><span class="h3">Over</span></div>
    <div class="card card-pad small muted">Versie ${ES(PS.C.data.version || 'dev')} · gebouwd ${ES((PS.C.data.built || '').slice(0, 16).replace('T', ' '))} · ${Object.keys(PS.C.data.lessons).length} lessen. <button class="btn btn-ghost btn-sm" data-reset style="color:var(--bad)">Wis alle lokale gegevens</button></div>
  </div>`;
  const after = (root) => {
    PS.$('[data-theme-seg]', root).addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; PS.setTheme(b.dataset.v, true); PS.render(); });
    PS.$('[data-kb-seg]', root).addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; PS.S.s.settings.greekKb = b.dataset.v; PS.S.save(); PS.render(); });
    PS.$$('[data-set]', root).forEach((inp) => inp.addEventListener('change', () => { PS.S.s.settings[inp.dataset.set] = inp.type === 'checkbox' ? inp.checked : Number(inp.value); PS.S.save(); if (inp.dataset.set === 'ttsRate') PS.speech.say('Καλημέρα', 'el'); }));
    PS.views.bindAccount(PS.$('[data-account]', root));
    PS.$('[data-reset]', root).addEventListener('click', () => { if (confirm('Alle lokale voortgang op dit toestel wissen? (Gesynchroniseerde gegevens blijven in je repository.)')) { PS.store.del('polyglot_v2'); location.reload(); } });
  };
  return { html, after };
};


/* ---------- Account (Supabase: e-mail + password, or e-mail code) ---------- */
PS.views.accountBox = () => {
  const c = PS.cloud; const sy = PS.S.s.settings.sync;
  if (!c.configured()) return `<p class="small" style="margin-top:0">Synchronisatie is nog niet ingesteld. Tot dan blijft je voortgang op dit toestel (maak af en toe een export bij <a href="#/voortgang">Voortgang</a>).</p><p class="small muted">Instellen: zie <span class="mono">studio/cloud/SETUP.md</span>. Daarna log je op elk toestel in.</p>
    <details><summary class="small" style="cursor:pointer;font-weight:650">Geavanceerd: Supabase-gegevens handmatig invullen</summary><div class="form-row"><label>Project-URL</label><input data-cfg="url" placeholder="https://xxxx.supabase.co" value="${PS.attr(PS.S.s.settings.cloud.url)}"></div><div class="form-row"><label>Anon (publieke) key</label><input data-cfg="key" placeholder="eyJ…" value="${PS.attr(PS.S.s.settings.cloud.key)}"></div><button class="btn btn-line btn-sm" data-cfg-save>Bewaar</button></details>`;
  if (c.signedIn()) return `<div class="spread"><div><div style="font-weight:700">${PS.esc((c.user() || {}).email || 'Ingelogd')}</div><div class="tiny muted">${sy.last ? `Laatste sync ${new Date(sy.last).toLocaleString('nl-BE')}` : 'Nog niet gesynchroniseerd'}${sy.error ? ` · <span style="color:var(--bad)">${PS.esc(sy.error)}</span>` : ''}</div></div><span class="chip chip-good">${PS.icon('cloud')} actief</span></div>
    <p class="small muted">Je voortgang, herhaalkaarten en leerlog staan in ${PS.esc(c.cfg().label || 'je eigen Supabase-database')}, afgeschermd zodat alleen jouw account erbij kan. Elke ochtend om 07:30 leest Antigravity ze in om je volgende lessen bij te sturen.</p>
    <div class="row-wrap"><button class="btn btn-primary btn-sm" data-act="sync">${PS.icon('sync', 'icon-s')} Nu synchroniseren</button><button class="btn btn-ghost btn-sm" data-signout>Uitloggen</button></div>`;
  return PS.views.loginForm();
};
PS.views.loginForm = () => {
  const c = PS.cloud.cfg();
  if (c.auth === 'password') return `<form data-login data-mode="in" novalidate>
    <p class="small" style="margin-top:0" data-intro>Log in met je e-mailadres en wachtwoord. Je blijft ingelogd op dit toestel, ook in de app op je beginscherm.</p>
    <div class="form-row"><label for="pw-email">E-mailadres</label><input id="pw-email" type="email" data-email autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="jij@voorbeeld.be" value="${PS.attr(PS.store.get('polyglot_login_email') || '')}"></div>
    <div class="form-row"><label for="pw-pass">Wachtwoord</label><input id="pw-pass" type="password" data-pass autocomplete="current-password"></div>
    <div class="form-row" data-pass2-row hidden><label for="pw-pass2">Herhaal wachtwoord</label><input id="pw-pass2" type="password" data-pass2 autocomplete="new-password"></div>
    <div class="row-wrap"><button class="btn btn-primary" type="submit" data-submit>${PS.icon('check', 'icon-s')} <span>Log in</span></button><button class="btn btn-line" type="button" data-mode-toggle>Account aanmaken</button></div>
    <p class="tiny muted" data-msg style="margin:10px 0 0"></p></form>`;
  return `<div data-login><p class="small" style="margin-top:0">Log in met je e-mailadres: je krijgt een code van 6 cijfers. Werkt ook in de app op je beginscherm.</p>
    <div class="form-row"><label>E-mailadres</label><input type="email" data-email autocomplete="email" inputmode="email" placeholder="jij@voorbeeld.be" value="${PS.attr(PS.store.get('polyglot_login_email') || '')}"></div>
    <div class="form-row" data-code-row hidden><label>Code uit je mail</label><input data-code inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456" style="letter-spacing:0.3em;font-family:var(--font-rounded);font-size:20px"></div>
    <div class="row-wrap"><button class="btn btn-primary" data-send>${PS.icon('message', 'icon-s')} Stuur code</button><button class="btn btn-primary" data-verify hidden>${PS.icon('check', 'icon-s')} Log in</button>${c.google ? `<button class="btn btn-line" data-google>Log in met Google</button>` : ''}${c.apple ? `<button class="btn btn-line" data-apple>Log in met Apple</button>` : ''}</div>
    <p class="tiny muted" data-msg style="margin:10px 0 0"></p></div>`;
};
PS.views.bindAccount = (box, onDone) => {
  if (!box) return;
  const q = (s) => PS.$(s, box); const msg = (t, bad) => { const m = q('[data-msg]'); if (m) { m.textContent = t; m.style.color = bad ? 'var(--bad)' : ''; } };
  const save = q('[data-cfg-save]'); if (save) save.onclick = () => { PS.S.s.settings.cloud = { url: q('[data-cfg="url"]').value.trim(), key: q('[data-cfg="key"]').value.trim() }; PS.S.flush(); PS.render(); };
  const out = q('[data-signout]'); if (out) out.onclick = () => { if (confirm('Uitloggen op dit toestel? Je lokale voortgang blijft bewaard.')) { PS.cloud.signOut(); PS.render(); } };
  const send = q('[data-send]');
  if (send) send.onclick = async () => {
    const email = q('[data-email]').value.trim(); if (!/^\S+@\S+\.\S+$/.test(email)) return msg('Vul een geldig e-mailadres in.', true);
    PS.store.set('polyglot_login_email', email);
    send.disabled = true; msg('Code versturen…');
    try { await PS.cloud.sendCode(email); msg('Check je mailbox (ook spam). De code is 1 uur geldig.'); q('[data-code-row]').hidden = false; q('[data-verify]').hidden = false; send.textContent = 'Opnieuw sturen'; q('[data-code]').focus(); }
    catch (e) { msg(e.message, true); }
    send.disabled = false;
  };
  const verify = q('[data-verify]');
  const go = async () => {
    const email = q('[data-email]').value.trim(), code = q('[data-code]').value.replace(/\s/g, '');
    if (code.length < 6) return msg('De code heeft 6 cijfers.', true);
    verify.disabled = true; msg('Inloggen…');
    try { await PS.cloud.verify(email, code); msg('Ingelogd — synchroniseren…'); await PS.sync.now(true); if (onDone) onDone(); else PS.render(); }
    catch (e) { msg(e.message, true); verify.disabled = false; }
  };
  if (verify) { verify.onclick = go; q('[data-code]').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }); }
  const form = q('form[data-login]');
  if (form) {
    const intro = q('[data-intro]'), pass = q('[data-pass]'), row2 = q('[data-pass2-row]'), submit = q('[data-submit]'), toggle = q('[data-mode-toggle]');
    const setMode = (mode) => {
      form.dataset.mode = mode; const up = mode === 'up';
      row2.hidden = !up; pass.autocomplete = up ? 'new-password' : 'current-password';
      intro.textContent = up ? 'Kies een wachtwoord van minstens 8 tekens. Dit doe je maar één keer: op je andere toestellen log je gewoon in.' : 'Log in met je e-mailadres en wachtwoord. Je blijft ingelogd op dit toestel, ook in de app op je beginscherm.';
      submit.querySelector('span').textContent = up ? 'Account aanmaken' : 'Log in';
      toggle.textContent = up ? 'Ik heb al een account' : 'Account aanmaken';
      msg('');
    };
    toggle.onclick = () => setMode(form.dataset.mode === 'up' ? 'in' : 'up');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = q('[data-email]').value.trim(), pw = pass.value, up = form.dataset.mode === 'up';
      if (!/^\S+@\S+\.\S+$/.test(email)) return msg('Vul een geldig e-mailadres in.', true);
      if (!pw) return msg('Vul je wachtwoord in.', true);
      if (up && pw.length < 8) return msg('Kies een wachtwoord van minstens 8 tekens.', true);
      if (up && pw !== q('[data-pass2]').value) return msg('De twee wachtwoorden zijn niet gelijk.', true);
      PS.store.set('polyglot_login_email', email);
      submit.disabled = true; msg(up ? 'Account aanmaken…' : 'Inloggen…');
      try {
        await (up ? PS.cloud.signUp(email, pw) : PS.cloud.signIn(email, pw));
        msg('Ingelogd — synchroniseren…'); await PS.sync.now(true);
        if (onDone) onDone(); else PS.render();
      } catch (err) { msg(err.message, true); submit.disabled = false; }
    });
  }
  const g = q('[data-google]'); if (g) g.onclick = () => PS.cloud.oauth('google');
  const a = q('[data-apple]'); if (a) a.onclick = () => PS.cloud.oauth('apple');
};

/* ---------- Login gate (shown when cloud sync is configured but you are not signed in) ---------- */
PS.needsGate = () => PS.cloud.configured() && !PS.cloud.signedIn() && !PS.store.get('polyglot_local_only');
PS.renderGate = () => {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="gate"><div class="gate-orbs" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span></div>
    <div class="gate-card"><div class="gate-glyphs" aria-hidden="true"><span style="color:var(--greek)">Ω</span><span style="color:var(--french)">É</span><span class="mono" style="color:var(--solidity)">0x</span><span style="color:var(--ai)">∇</span><span class="mono" style="color:var(--automation)">{ }</span><span class="mono" style="color:var(--jev)">⑂</span></div>
      <h1 class="display" style="font-size:34px;text-align:center;margin:10px 0 4px">Polyglot Studio</h1><p class="lede" style="text-align:center;font-size:15.5px;margin-bottom:18px">Log in om je voortgang veilig te bewaren en tussen iPhone, iPad en Mac te synchroniseren.</p>
      <div data-gate-login>${PS.views.loginForm()}</div>
      <button class="btn btn-ghost btn-sm btn-block" data-local style="margin-top:10px">Verder zonder account (alleen dit toestel)</button></div></div>`;
  PS.views.bindAccount(PS.$('[data-gate-login]', app), () => { PS.shell(); PS.render(); });
  PS.$('[data-local]', app).onclick = () => { PS.store.set('polyglot_local_only', true); PS.shell(); PS.render(); };
};

/* ---------- Theme ---------- */
PS.effectiveTheme = () => { const t = PS.S.s.settings.theme; return t === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t; };
PS.setTheme = (t, animate) => {
  if (t) { PS.S.s.settings.theme = t; PS.S.save(); }
  const root = document.documentElement;
  if (animate) { root.classList.add('theme-fade'); setTimeout(() => root.classList.remove('theme-fade'), 400); }
  root.dataset.theme = PS.effectiveTheme();
  PS.store.set('polyglot_theme_v2', PS.S.s.settings.theme);
  const meta = PS.$('meta[name="theme-color"]'); if (meta) meta.content = PS.effectiveTheme() === 'dark' ? '#0c0d10' : '#f6f5f1';
};
