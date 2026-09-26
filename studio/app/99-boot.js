/* Polyglot Studio v2 — boot */
'use strict';

PS.mountSims = (root, track) => {
  PS.$$('[data-sim]', root).forEach((el) => {
    if (el.__mounted) return; el.__mounted = true;
    const name = el.dataset.sim; let opts = {};
    try { opts = JSON.parse(el.dataset.opts || '{}'); } catch (e) {}
    const fn = PS.sims && PS.sims[name];
    if (!fn) { el.innerHTML = `<div class="sim-body small muted">Simulator “${PS.esc(name)}” niet gevonden.</div>`; return; }
    try { fn(el, opts, track); } catch (e) { console.error(e); el.innerHTML = `<div class="sim-body small muted">Simulator kon niet starten: ${PS.esc(e.message)}</div>`; }
  });
};

PS.boot = () => {
  PS.C.load();
  PS.S.load();
  PS.setTheme();
  PS.speech.init();
  PS.kb.init();
  PS.pen.init();

  /* Deep links from Apple Reminders: ?track=greek&lesson=5 */
  const q = new URLSearchParams(location.search);
  if (q.get('track') && q.get('lesson')) {
    history.replaceState(null, '', `${location.pathname}#/les/${q.get('track')}/${Number(q.get('lesson'))}`);
  }
  PS.cloud.captureRedirect();
  if (PS.needsGate()) PS.renderGate();
  else { PS.shell(); PS.render(); }
  window.addEventListener('hashchange', () => { if (!PS.runnerOpen && document.getElementById('main')) PS.render(); });
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => PS.setTheme()); } catch (e) {}

  /* Active study time: 15 s heartbeat while visible and recently used */
  let last = Date.now();
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((ev) => addEventListener(ev, () => { last = Date.now(); }, { passive: true }));
  setInterval(() => { if (document.visibilityState === 'visible' && Date.now() - last < 90000) PS.S.tickTime(15000); }, 15000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { PS.S.flush(); if (PS.sync.configured()) PS.sync.now(false); }
    else if (PS.sync.configured() && Date.now() - (PS.S.s.settings.sync.last || 0) > 10 * 60e3) PS.sync.now(false);
  });
  if (PS.sync.configured()) setTimeout(() => PS.sync.now(false), 1200);

  /* Offline support */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const notify = () => {
        if (PS.$('.update-banner')) return;
        const b = document.createElement('div'); b.className = 'update-banner';
        b.innerHTML = `${PS.icon('sparkles', 'icon-s')} Nieuwe versie klaar <button class="btn btn-sm" style="background:var(--bg);color:var(--ink)">Herladen</button>`;
        b.querySelector('button').onclick = () => { if (reg.waiting) reg.waiting.postMessage('skip'); setTimeout(() => location.reload(), 300); };
        document.body.appendChild(b);
      };
      if (reg.waiting && navigator.serviceWorker.controller) notify();
      reg.addEventListener('updatefound', () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) notify(); });
      });
      setInterval(() => reg.update().catch(() => {}), 60 * 60e3);
    }).catch((e) => console.warn('SW', e));
  }
  window.addEventListener('pagehide', () => PS.S.flush());
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', PS.boot); else PS.boot();
