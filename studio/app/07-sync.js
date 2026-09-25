/* Polyglot Studio v2 — account & cloud sync (Supabase, self-hosted on MacBook 2 or in the cloud).
   Login: e-mail + password (auth: 'password') or e-mail code (auth: 'otp', needs a real mail server).
   Tables (see studio/cloud/supabase.sql):
     polyglot_progress(user_id, device, state jsonb)  — one row per device: lessons, cards, days
     polyglot_events(user_id, id, device, ts, data)   — append-only learning log (what Antigravity reads)
     polyglot_coach(user_id, date, pack jsonb)        — daily coach packs written by the morning run
     polyglot_members(user_id)                        — the owner account; nobody else gets in
   The anon key is public by design; every row is protected by RLS (own rows, members only). */
'use strict';

const RANK = ['new', 'started', 'legacy', 'learned', 'mastered', 'anchored'];
const SESSION_KEY = 'polyglot_session';

PS.cloud = {
  cfg() {
    const b = (PS.C.data && PS.C.data.cloud) || {};
    const s = PS.S.s.settings.cloud || {};
    return { url: (s.url || b.url || '').replace(/\/+$/, ''), key: s.key || b.anonKey || '', auth: s.auth || b.auth || 'otp', label: b.label || '',
      google: !!(b.google || s.google), apple: !!(b.apple || s.apple) };
  },
  configured() { const c = this.cfg(); return !!(c.url && c.key); },
  session() { return PS.store.get(SESSION_KEY); },
  user() { const s = this.session(); return s && s.user; },
  signedIn() { return !!(this.configured() && this.session() && this.session().refresh_token); },
  table(name) { return `/rest/v1/polyglot_${name}`; },
  async req(path, opts = {}) {
    const c = this.cfg();
    const headers = Object.assign({ apikey: c.key, 'Content-Type': 'application/json' }, opts.headers || {});
    if (opts.auth !== false) {
      const tok = await this.token();
      if (tok) headers.Authorization = `Bearer ${tok}`;
    }
    try {
      return await fetch(`${c.url}${path}`, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store' });
    } catch (e) {
      throw new Error('Server niet bereikbaar — controleer je internetverbinding.');
    }
  },
  /* e-mail + password (self-hosted server without a mail server) */
  async signIn(email, password) {
    const r = await this.req('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email, password } });
    if (!r.ok) throw new Error(this.nl(await this.errText(r)));
    this.store(await r.json());
    await this.join();
    return this.user();
  },
  async signUp(email, password) {
    const r = await this.req('/auth/v1/signup', { method: 'POST', auth: false, body: { email, password } });
    if (!r.ok) throw new Error(this.nl(await this.errText(r)));
    const d = await r.json();
    if (!d.access_token) throw new Error('Account aangemaakt, maar het moet nog bevestigd worden via e-mail.');
    this.store(d);
    await this.join();
    return this.user();
  },
  /* Only the owner may use the Polyglot tables: the first account to join becomes the owner. */
  async join() {
    const r = await this.req('/rest/v1/rpc/polyglot_join', { method: 'POST', body: {} });
    const ok = r.ok && (await r.json()) === true;
    if (!ok) { this.signOut(true); throw new Error('Dit account heeft geen toegang tot deze Polyglot-server.'); }
    return true;
  },
  nl(t) {
    const m = String(t || '');
    if (/invalid login credentials|invalid_grant/i.test(m)) return 'E-mailadres of wachtwoord klopt niet.';
    if (/already (registered|exists)/i.test(m)) return 'Er bestaat al een account met dit e-mailadres — kies “Inloggen”.';
    const len = m.match(/at least (\d+) characters/i); if (len) return `Je wachtwoord moet minstens ${len[1]} tekens hebben.`;
    if (/signups? not allowed|signup.*disabled/i.test(m)) return 'Nieuwe accounts zijn uitgeschakeld op deze server.';
    if (/rate limit|too many/i.test(m)) return 'Te veel pogingen — wacht even en probeer opnieuw.';
    if (/email.*invalid|invalid.*email|unable to validate email/i.test(m)) return 'Dit e-mailadres is ongeldig.';
    return m;
  },
  async sendCode(email) {
    const r = await this.req('/auth/v1/otp', { method: 'POST', auth: false, body: { email, create_user: true } });
    if (!r.ok) throw new Error(await this.errText(r));
    return true;
  },
  async verify(email, code) {
    const r = await this.req('/auth/v1/verify', { method: 'POST', auth: false, body: { type: 'email', email, token: String(code).trim() } });
    if (!r.ok) throw new Error(await this.errText(r));
    this.store(await r.json());
    await this.join();
    return this.user();
  },
  oauth(provider) {
    const c = this.cfg();
    const back = location.origin + location.pathname;
    location.href = `${c.url}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(back)}`;
  },
  /* OAuth returns #access_token=…&refresh_token=… */
  captureRedirect() {
    const h = location.hash || '';
    if (!/access_token=/.test(h)) return false;
    const q = new URLSearchParams(h.slice(1));
    const s = { access_token: q.get('access_token'), refresh_token: q.get('refresh_token'), expires_in: Number(q.get('expires_in') || 3600) };
    try { s.user = JSON.parse(atob(s.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); s.user = { id: s.user.sub, email: s.user.email }; } catch (e) {}
    this.store(s);
    history.replaceState(null, '', location.pathname + '#/');
    return true;
  },
  store(d) {
    const s = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (Number(d.expires_in) || 3600) * 1000 - 60e3, user: d.user ? { id: d.user.id, email: d.user.email } : (this.user() || null) };
    PS.store.set(SESSION_KEY, s);
  },
  async token() {
    const s = this.session(); if (!s) return null;
    if (s.expires_at > Date.now()) return s.access_token;
    const c = this.cfg();
    const r = await fetch(`${c.url}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: c.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
    if (!r.ok) { if (r.status === 400 || r.status === 401) this.signOut(true); throw new Error('Sessie verlopen — log opnieuw in'); }
    this.store(await r.json());
    return this.session().access_token;
  },
  signOut(silent) {
    const s = this.session();
    if (s && !silent) this.req('/auth/v1/logout', { method: 'POST' }).catch(() => {});
    PS.store.del(SESSION_KEY);
  },
  async errText(r) {
    try { const j = await r.json(); return j.msg || j.error_description || j.message || j.error || `HTTP ${r.status}`; } catch (e) { return `HTTP ${r.status}`; }
  },
};

PS.sync = {
  busy: false,
  configured() { return PS.cloud.signedIn(); },
  soon: PS.debounce(() => { if (PS.sync.configured()) PS.sync.now(false); }, 15000),
  exportState() {
    const s = PS.S.s;
    return { v: 2, device: s.device, updated: Date.now(), lessons: s.lessons, cards: s.cards, days: s.days, drills: s.drills || {}, settings: { guided: s.settings.guided } };
  },
  async now(verbose) {
    if (!this.configured() || this.busy || !navigator.onLine) return false;
    this.busy = true;
    const st = PS.S.s.settings.sync; const me = PS.S.s.device; const uid = PS.cloud.user().id;
    try {
      /* 1. other devices' state */
      let changed = false;
      const pr = await PS.cloud.req(`${PS.cloud.table('progress')}?select=device,state,updated_at`);
      if (pr.status === 401) throw new Error('Niet ingelogd');
      if (!pr.ok) throw new Error(`progress: ${await PS.cloud.errText(pr)}`);
      for (const row of await pr.json()) if (row.device !== me) changed = this.merge(row.state) || changed;
      /* 2. new events from other devices — paged by server receive time, so late uploads are never missed */
      let since = st.pulled || 0;
      for (;;) {
        const er = await PS.cloud.req(`${PS.cloud.table('events')}?select=id,device,ts,data,received&received=gt.${since}&device=neq.${encodeURIComponent(me)}&order=received.asc&limit=1000`);
        if (!er.ok) throw new Error(`events: ${await PS.cloud.errText(er)}`);
        const rows = await er.json();
        if (rows.length) { changed = this.addEvents(rows.map((r) => Object.assign({}, r.data, { id: r.id, ts: r.ts, dev: r.device }))) || changed; since = rows[rows.length - 1].received; }
        if (rows.length < 1000) break;
      }
      st.pulled = since;
      /* 3. push own state */
      const up = await PS.cloud.req(PS.cloud.table('progress'), { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { user_id: uid, device: me, state: this.exportState(), updated_at: new Date().toISOString() } });
      if (!up.ok) throw new Error(`opslaan: ${await PS.cloud.errText(up)}`);
      /* 4. push own new events in batches (server lost our log, e.g. after a restore? then everything again) */
      if (st.pushed) {
        const chk = await PS.cloud.req(`${PS.cloud.table('events')}?select=id&device=eq.${encodeURIComponent(me)}&limit=1`);
        if (chk.ok && !(await chk.json()).length) st.pushed = 0;
      }
      const pushed = st.pushed || 0;
      const mine = PS.S.s.events.filter((e) => e.dev === me && e.ts > pushed);
      for (let i = 0; i < mine.length; i += 400) {
        const batch = mine.slice(i, i + 400).map((e) => { const { id, ts, dev, ...data } = e; return { user_id: uid, id, device: me, ts, data }; });
        const r = await PS.cloud.req(PS.cloud.table('events'), { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: batch });
        if (!r.ok) throw new Error(`events opslaan: ${await PS.cloud.errText(r)}`);
      }
      if (mine.length) st.pushed = mine[mine.length - 1].ts;
      /* 5. coach packs */
      const cr = await PS.cloud.req(`${PS.cloud.table('coach')}?select=date,pack&order=date.desc&limit=3`);
      if (cr.ok) { const packs = await cr.json(); if (packs.length) { PS.cloudPacks = packs.map((p) => p.pack); PS.store.set('polyglot_coach_cache', PS.cloudPacks); } }
      st.last = Date.now(); st.error = '';
      PS.S.flush();
      if (changed && !PS.runnerOpen) PS.render();
      if (verbose) PS.toast(`${PS.icon('cloud', 'icon-s')} Gesynchroniseerd`);
      if (PS.updateShell) PS.updateShell(location.hash || '#/');
      return true;
    } catch (e) {
      st.error = String(e.message || e); PS.S.flush();
      if (verbose) PS.toast(`Sync: ${PS.esc(st.error)}`, 4000);
      return false;
    } finally { this.busy = false; }
  },
  addEvents(list) {
    const s = PS.S.s; const ids = new Set(s.events.map((e) => e.id));
    const add = list.filter((e) => e && e.id && !ids.has(e.id));
    if (!add.length) return false;
    s.events = s.events.concat(add).sort((x, y) => x.ts - y.ts);
    return true;
  },
  /* Merge another device's state into ours (monotone: statuses only go up). */
  merge(o) {
    if (!o || o.v !== 2) return false;
    const s = PS.S.s; let changed = false;
    for (const [k, b] of Object.entries(o.lessons || {})) {
      const a = s.lessons[k];
      if (!a) { s.lessons[k] = JSON.parse(JSON.stringify(b)); changed = true; continue; }
      const before = JSON.stringify(a);
      const hi = RANK.indexOf(b.status) > RANK.indexOf(a.status) ? b : a;
      if (hi === b) { a.status = b.status; a.checks = b.checks || {}; a.needsReview = !!b.needsReview; }
      ['learnedAt', 'masteredAt', 'anchoredAt'].forEach((f) => { if (b[f] && (!a[f] || b[f] < a[f])) a[f] = b[f]; });
      a.best = Math.max(a.best || 0, b.best || 0);
      const seenT = new Set((a.tests || []).map((x) => `${x.ts}:${x.kind}`));
      a.tests = (a.tests || []).concat((b.tests || []).filter((x) => !seenT.has(`${x.ts}:${x.kind}`))).sort((x, y) => x.ts - y.ts);
      a.stepsDone = a.stepsDone || {}; for (const [st, ts] of Object.entries(b.stepsDone || {})) if (!a.stepsDone[st] || ts < a.stepsDone[st]) a.stepsDone[st] = ts;
      a.skills = a.skills || {}; for (const [sk, v] of Object.entries(b.skills || {})) if (!a.skills[sk] || v.n > a.skills[sk].n) a.skills[sk] = v;
      ['seen', 'testSeen'].forEach((f) => { a[f] = a[f] || {}; for (const [i, n] of Object.entries(b[f] || {})) a[f][i] = Math.max(a[f][i] || 0, n); });
      if (b.production && (!a.production || b.production.at > a.production.at)) a.production = b.production;
      if (b.diagnostic && (!a.diagnostic || b.diagnostic.at > a.diagnostic.at)) a.diagnostic = b.diagnostic;
      if (hi === a && b.gate != null) a.gate = Math.min(a.gate || 0, b.gate);
      if (JSON.stringify(a) !== before) changed = true;
    }
    for (const [k, c] of Object.entries(o.cards || {})) {
      const a = s.cards[k];
      if (!a || (c.last || 0) > (a.last || 0)) { s.cards[k] = c; changed = true; }
    }
    if (o.events) changed = this.addEvents(o.events) || changed;
    for (const [d, v] of Object.entries(o.days || {})) {
      const a = s.days[d];
      if (!a) s.days[d] = Object.assign({}, v);
      else { a.ms = Math.max(a.ms || 0, v.ms || 0); if ((v.n || 0) > (a.n || 0)) { a.n = v.n; a.sc = v.sc; } }
    }
    s.drills = Object.assign({}, o.drills || {}, s.drills || {});
    return changed;
  },
};
