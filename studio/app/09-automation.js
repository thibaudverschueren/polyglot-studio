/* Polyglot Studio v2 — Automation track: n8n expression & Code-node sandbox, JSON viewer, item types */
'use strict';

/* ======================= Sandbox (opaque-origin iframe: no access to storage or tokens) ======================= */
const BOX_SRC = PS.BOX_N8N || '';;

PS.jsbox = {
  frame: null, pending: new Map(), seq: 0, ready: null,
  ensure() {
    if (this.frame && this.frame.isConnected) return this.ready;
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts'); f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
    this.ready = new Promise((res) => { this._ready = res; });
    if (!this._bound) {
      this._bound = true;
      window.addEventListener('message', (e) => {
        if (!this.frame || e.source !== this.frame.contentWindow) return;
        const m = e.data || {};
        if (m.ready) { this._ready(); return; }
        const p = this.pending.get(m.id); if (!p) return;
        this.pending.delete(m.id); clearTimeout(p.timer); p.resolve(m);
      });
    }
    f.srcdoc = `<!doctype html><meta charset="utf-8"><script>${BOX_SRC.replace(/<\/script/gi, '<\\/script')}<\/script>`;
    document.body.appendChild(f); this.frame = f;
    return this.ready;
  },
  async run(msg, ms = 2500) {
    await this.ensure();
    const id = ++this.seq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        if (this.frame) { this.frame.remove(); this.frame = null; }
        resolve({ ok: false, error: 'Time-out: je code stopt niet (oneindige lus?)' });
      }, ms);
      this.pending.set(id, { resolve, timer });
      this.frame.contentWindow.postMessage(Object.assign({ id }, msg), '*');
    });
  },
};

/* ======================= JSON helpers ======================= */
PS.canon = (v) => {
  const walk = (x) => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') return Object.keys(x).sort().reduce((o, k) => { o[k] = walk(x[k]); return o; }, {});
    if (typeof x === 'number') return Math.round(x * 1e9) / 1e9;
    return x;
  };
  return JSON.stringify(walk(v));
};
PS.jsonHtml = (v, ind = 0) => {
  const pad = '  '.repeat(ind);
  if (v === null) return '<span class="tok-kw">null</span>';
  if (v === undefined || (v && v.__undef)) return '<span class="tok-kw">undefined</span>';
  if (typeof v === 'string') return `<span class="tok-str">"${PS.esc(v)}"</span>`;
  if (typeof v === 'number') return `<span class="tok-num">${v}</span>`;
  if (typeof v === 'boolean') return `<span class="tok-kw">${v}</span>`;
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return `[\n${v.map((x) => pad + '  ' + PS.jsonHtml(x, ind + 1)).join(',\n')}\n${pad}]`;
  }
  const ks = Object.keys(v); if (!ks.length) return '{}';
  return `{\n${ks.map((k) => `${pad}  <span class="tok-fn">"${PS.esc(k)}"</span>: ${PS.jsonHtml(v[k], ind + 1)}`).join(',\n')}\n${pad}}`;
};
PS.jsonBlock = (v, title = 'JSON', open = true) => `<details class="codeblock json-block" ${open ? 'open' : ''}><summary class="code-head" style="cursor:pointer;list-style:none"><span>${PS.esc(title)}</span><span>JSON</span></summary><pre><code>${PS.jsonHtml(v)}</code></pre></details>`;

const itemsOf = (it) => it.items || (it.input !== undefined ? [it.input] : [{}]);

/* ======================= Item: n8n expression ======================= */
PS.items.jsexpr = {
  render(v) {
    const it = v.item; const items = itemsOf(it);
    const nodes = it.nodes ? Object.entries(it.nodes).map(([n, arr]) => PS.jsonBlock(arr, `Node "${n}" — output`, false)).join('') : '';
    return `${PS.jsonBlock(items.length === 1 && !it.perItem ? { json: items[0] } : items.map((j) => ({ json: j })), it.perItem || items.length > 1 ? `Input — ${items.length} items` : 'Input — huidig item', true)}${nodes}
      <div class="eyebrow" style="margin:14px 0 6px">Expressie</div><div data-ed></div>
      <div class="row" style="margin-top:8px;gap:8px"><button type="button" class="btn btn-line btn-sm" data-preview>${PS.icon('play', 'icon-s')} Probeer uit</button><span class="tiny muted">Tip: n8n-expressies staan tussen <code>{{ }}</code>.</span></div>
      <div data-out></div>`;
  },
  mount(v) {
    v.ed = new PS.Editor(PS.$('[data-ed]', v.el), { lang: 'js', single: true, value: v.item.starter || '{{  }}', symbols: ['{{ }}', '$json.', '$input.all()', "$('", '.map(', '=>', '?.', '[0]'], onChange: () => v.ready(v.ed.value().trim().length > 4), onEnter: () => v.submit() });
    PS.$('[data-preview]', v.el).addEventListener('click', async () => { const r = await this.evaluate(v); this.showOut(v, r); });
    v.ready(false);
  },
  async evaluate(v) {
    const it = v.item;
    return PS.jsbox.run({ kind: 'expr', template: v.ed.value(), items: itemsOf(it), index: it.itemIndex || 0, nodes: it.nodes || null, perItem: !!it.perItem });
  },
  showOut(v, r) {
    const out = PS.$('[data-out]', v.el);
    out.innerHTML = r.ok ? PS.jsonBlock(r.value, 'Resultaat', true) : `<div class="callout callout-warning" style="margin-top:12px"><div class="callout-title">${PS.icon('alert')} Fout in je expressie</div><span class="mono small">${PS.esc(r.error)}</span></div>`;
  },
  async answer(v) { v.lastRun = await this.evaluate(v); return v.ed.value(); },
  check(v) {
    const r = v.lastRun; this.showOut(v, r);
    if (!r.ok) return { score: 0, kind: 'wrong', detail: r.error };
    const got = r.value && r.value.__undef ? undefined : r.value;
    if (PS.canon(got) === PS.canon(v.item.expected)) return { score: 1, kind: 'exact' };
    const exp = v.item.expected;
    if (typeof exp === 'number' && typeof got === 'string' && got.trim() !== '' && Number(got) === exp) return { score: 0.5, kind: 'partial', detail: 'Juiste waarde, maar als tekst (string) i.p.v. getal — toFixed() geeft een string terug; gebruik Math.round(x * 100) / 100 of .round(2).' };
    if (typeof exp === 'string' && typeof got === 'number' && String(got) === exp) return { score: 0.5, kind: 'partial', detail: 'Juiste waarde, maar als getal i.p.v. tekst (string).' };
    if (typeof got === 'string' && typeof v.item.expected === 'string' && got.trim().toLowerCase() === v.item.expected.trim().toLowerCase()) return { score: 0.5, kind: 'partial', detail: 'Hoofdletters/spaties wijken af' };
    return { score: 0, kind: 'wrong', detail: `Verwacht: ${JSON.stringify(v.item.expected)} — kreeg: ${JSON.stringify(got)}` };
  },
  reveal(v) { v.ed.ta.readOnly = true; },
  correctText(v) { return `<code>${PS.esc(v.item.solution || '')}</code>`; },
  answerText(v, a) { return a; },
};

/* ======================= Item: Code node ======================= */
PS.items.jscode = {
  render(v) {
    const it = v.item; const first = (it.cases || [])[0] || { items: [] };
    return `<div class="row-wrap" style="margin-bottom:8px"><span class="chip chip-accent">${PS.icon('code')} Code-node · ${it.mode === 'each' ? 'Run Once for Each Item' : 'Run Once for All Items'}</span><span class="chip">${(it.cases || []).length} testgeval(len)</span></div>
      ${PS.jsonBlock(first.items.map((j) => ({ json: j })), `Input (testgeval 1) — ${first.items.length} items`, false)}
      <div class="studio" style="margin-top:12px"><div class="studio-bar"><div class="studio-file"><span class="dot" style="background:var(--automation)"></span>Code in JavaScript</div><div class="studio-actions"><button type="button" class="sbtn" data-run>${PS.icon('play')} Uitvoeren</button><button type="button" class="sbtn" data-reset>${PS.icon('undo')} Reset</button></div></div><div data-ed></div><div class="studio-panel" data-out><span class="log-dim">// Output verschijnt hier (zoals het output-paneel in n8n)</span></div></div>`;
  },
  mount(v) {
    const it = v.item;
    v.ed = new PS.Editor(PS.$('[data-ed]', v.el), { lang: 'js', value: it.starter || '', key: `${v.ctx.track}:${v.ctx.lesson}:${it.id}`, minLines: 8, symbols: ['{ }', '( )', '[ ]', '=>', '$input.all()', '.json', 'return ', '.map(', '.filter(', "require('crypto')", '⇥'], onChange: () => v.ready(true) });
    PS.$('[data-run]', v.el).addEventListener('click', () => this.runCases(v, true));
    PS.$('[data-reset]', v.el).addEventListener('click', () => { if (confirm('Terug naar de startcode?')) v.ed.set(it.starter || ''); });
    v.ready(true);
  },
  async runCases(v, show) {
    const it = v.item; const res = [];
    for (const [i, c] of (it.cases || []).entries()) {
      const r = await PS.jsbox.run({ kind: 'code', code: v.ed.value(), mode: it.mode || 'all', items: c.items || [], nodes: c.nodes || null }, 3000);
      let ok = false;
      if (r.ok) {
        const got = r.value; const exp = c.expected;
        ok = it.unordered ? PS.canon(got.map(PS.canon).sort()) === PS.canon(exp.map(PS.canon).sort()) : PS.canon(got) === PS.canon(exp);
      }
      res.push({ i, ok, r, c });
    }
    if (show) {
      const out = PS.$('[data-out]', v.el);
      out.innerHTML = res.map(({ i, ok, r, c }) => `<div class="test-row"><span class="${ok ? 'log-ok' : 'log-err'}">${ok ? '✓' : '✗'}</span><div><div>Testgeval ${i + 1}${c.name ? ` — ${PS.esc(c.name)}` : ''}</div>${r.ok ? '' : `<div class="d log-err">${PS.esc(r.error)}</div>`}${(r.logs || []).length ? `<div class="d">console: ${PS.esc(r.logs.join(' | '))}</div>` : ''}${r.ok && !ok ? `<div class="d">kreeg: ${PS.esc(JSON.stringify(r.value).slice(0, 400))}</div><div class="d">verwacht: ${PS.esc(JSON.stringify(c.expected).slice(0, 400))}</div>` : ''}</div></div>`).join('')
        + (res[0] && res[0].r.ok ? `<div style="margin-top:10px">${PS.jsonBlock(res[0].r.value.map((j) => ({ json: j })), 'Output (testgeval 1)', false)}</div>` : '');
    }
    return res;
  },
  async answer(v) { v.lastRes = await this.runCases(v, true); return v.ed.value(); },
  check(v) {
    const res = v.lastRes || []; const pass = res.filter((x) => x.ok).length;
    const frac = res.length ? pass / res.length : 0;
    return frac === 1 ? { score: 1, kind: 'exact', detail: `${pass}/${res.length} testgevallen geslaagd` } : { score: frac >= 0.75 ? 0.5 : 0, kind: 'wrong', detail: `${pass}/${res.length} testgevallen geslaagd` };
  },
  reveal(v) { v.ed.ta.readOnly = true; },
  correctText(v) { return `<div class="codeblock"><pre><code>${PS.highlight(v.item.solution || '', 'js')}</code></pre></div>`; },
  answerText(v, a) { return a; },
};
PS.TYPE_LABEL.jsexpr = 'n8n-expressie';
PS.TYPE_LABEL.jscode = 'Code-node';
PS.PRODUCTION.add('jsexpr'); PS.PRODUCTION.add('jscode');
