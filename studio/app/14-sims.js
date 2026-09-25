/* Polyglot Studio v2 — interactive simulators. Embed in lesson markdown with  :::sim name {json-options}  */
'use strict';
PS.sims = PS.sims || {};
const simFrame = (el, icon, title, body, sub = '') => { el.innerHTML = `<div class="sim-head"><div class="t">${PS.icon(icon, 'icon-s')} ${title}</div>${sub ? `<span class="tiny muted">${sub}</span>` : ''}</div><div class="sim-body">${body}</div>`; return PS.$('.sim-body', el); };
const fmtBig = (x) => { const a = Math.abs(x); if (a >= 1e12) return (x / 1e12).toFixed(2) + ' T'; if (a >= 1e9) return (x / 1e9).toFixed(2) + ' B'; if (a >= 1e6) return (x / 1e6).toFixed(2) + ' M'; if (a >= 1e3) return (x / 1e3).toFixed(1) + ' k'; return String(Math.round(x * 100) / 100); };
const gb = (bytes) => (bytes / 1024 ** 3).toFixed(bytes / 1024 ** 3 < 10 ? 2 : 1) + ' GB';
const heat = (p, hue = 'var(--accent)') => `background:color-mix(in srgb, ${hue} ${Math.round(8 + p * 82)}%, transparent);color:${p > 0.55 ? 'var(--bg)' : 'var(--ink)'}`;

/* ---------------- Greek alphabet explorer ---------------- */
const ALPHA = [
  ['Α', 'α', 'άλφα', 'alfa', 'a — zoals in “bad”', 'αγάπη', 'liefde'], ['Β', 'β', 'βήτα', 'vita', 'v — nooit b!', 'βιβλίο', 'boek'],
  ['Γ', 'γ', 'γάμμα', 'gamma', 'zachte g zoals Vlaams “gaan”; vóór e/i: j', 'γάλα', 'melk'], ['Δ', 'δ', 'δέλτα', 'delta', 'th zoals Engels “this”', 'δρόμος', 'straat'],
  ['Ε', 'ε', 'έψιλον', 'epsilon', 'e — zoals in “bed”', 'ένα', 'één'], ['Ζ', 'ζ', 'ζήτα', 'zita', 'z', 'ζωή', 'leven'],
  ['Η', 'η', 'ήτα', 'ita', 'ie', 'ημέρα', 'dag'], ['Θ', 'θ', 'θήτα', 'thita', 'th zoals Engels “think”', 'θάλασσα', 'zee'],
  ['Ι', 'ι', 'γιώτα', 'jota', 'ie', 'ιδέα', 'idee'], ['Κ', 'κ', 'κάπα', 'kapa', 'k (zonder aanblazing)', 'καφές', 'koffie'],
  ['Λ', 'λ', 'λάμδα', 'lamda', 'l', 'λεμόνι', 'citroen'], ['Μ', 'μ', 'μι', 'mi', 'm', 'μητέρα', 'moeder'],
  ['Ν', 'ν', 'νι', 'ni', 'n', 'νερό', 'water'], ['Ξ', 'ξ', 'ξι', 'ksi', 'ks', 'ξένος', 'vreemdeling'],
  ['Ο', 'ο', 'όμικρον', 'omikron', 'o — zoals in “pot”', 'όνομα', 'naam'], ['Π', 'π', 'πι', 'pi', 'p', 'πόλη', 'stad'],
  ['Ρ', 'ρ', 'ρο', 'ro', 'getikte/rollende r', 'ρόδι', 'granaatappel'], ['Σ', 'σ/ς', 'σίγμα', 'sigma', 's — ς alleen aan het woordeinde', 'σπίτι', 'huis'],
  ['Τ', 'τ', 'ταυ', 'taf', 't', 'τραπέζι', 'tafel'], ['Υ', 'υ', 'ύψιλον', 'ipsilon', 'ie', 'ύπνος', 'slaap'],
  ['Φ', 'φ', 'φι', 'fi', 'f', 'φίλος', 'vriend'], ['Χ', 'χ', 'χι', 'chi', 'ch zoals in “lachen”; vóór e/i zachter', 'χέρι', 'hand'],
  ['Ψ', 'ψ', 'ψι', 'psi', 'ps', 'ψάρι', 'vis'], ['Ω', 'ω', 'ωμέγα', 'omega', 'o — klinkt exact als ο', 'ώρα', 'uur'],
];
PS.sims['greek-alphabet'] = (el, opts) => {
  const b = simFrame(el, 'grid', 'Het Griekse alfabet', `<div class="row-wrap" style="margin-bottom:12px"><div class="seg" data-mode><button type="button" data-m="learn" aria-pressed="true">Verkennen</button><button type="button" data-m="quiz" aria-pressed="false">Test jezelf</button></div><span class="tiny muted" data-hint>Tik op een letter om naam, klank en voorbeeld te horen.</span></div><div class="alpha-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(74px,1fr));gap:6px"></div><div data-detail style="margin-top:14px"></div>`, '24 letters · 7 klinkers');
  const grid = PS.$('.alpha-grid', b); const detail = PS.$('[data-detail]', b); let mode = 'learn'; let target = null; let score = [0, 0];
  const draw = () => {
    grid.innerHTML = ALPHA.map((a, i) => `<button type="button" class="option" data-i="${i}" style="grid-template-columns:1fr;justify-items:center;padding:10px 4px;gap:2px"><span class="el" style="font-size:26px;line-height:1.1">${a[0]} ${a[1]}</span><span class="tiny muted">${mode === 'learn' ? a[3] : '?'}</span></button>`).join('');
  };
  const pick = () => { target = Math.floor(Math.random() * ALPHA.length); detail.innerHTML = `<div class="callout callout-rule"><div class="callout-title">${PS.icon('volume')} Welke letter hoor je?</div><button type="button" class="btn btn-soft btn-sm" data-replay>Opnieuw afspelen</button> <span class="tiny muted">Score: ${score[0]}/${score[1]}</span></div>`; PS.speech.say(ALPHA[target][2], 'el'); PS.$('[data-replay]', detail).onclick = () => PS.speech.say(ALPHA[target][2], 'el'); };
  PS.$('[data-mode]', b).addEventListener('click', (e) => { const x = e.target.closest('[data-m]'); if (!x) return; mode = x.dataset.m; PS.$$('[data-m]', b).forEach((y) => y.setAttribute('aria-pressed', y === x ? 'true' : 'false')); draw(); detail.innerHTML = ''; if (mode === 'quiz') pick(); });
  grid.addEventListener('click', (e) => {
    const x = e.target.closest('[data-i]'); if (!x) return; const i = Number(x.dataset.i); const a = ALPHA[i];
    if (mode === 'learn') {
      detail.innerHTML = `<div class="card card-pad" style="display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:center"><div class="el" style="font-size:56px;line-height:1">${a[0]}${a[1]}</div><div><div style="font-weight:700"><span class="el">${a[2]}</span> · ${a[3]}</div><div class="small">Klank: ${a[4]}</div><div class="small" style="margin-top:6px">Voorbeeld: <span class="say el" lang="el">${a[5]}</span> — ${a[6]}</div></div></div>`;
      PS.speech.say(`${a[2]}. ${a[5]}`, 'el');
    } else {
      score[1]++; if (i === target) { score[0]++; x.classList.add('correct'); PS.haptic('good'); } else { x.classList.add('wrong'); PS.$(`[data-i="${target}"]`, grid).classList.add('correct'); PS.haptic('bad'); }
      setTimeout(() => { draw(); pick(); }, 900);
    }
  });
  draw();
};

/* ---------------- BPE tokenizer (real training) ---------------- */
PS.sims.bpe = (el, opts) => {
  const corpus0 = opts.corpus || 'lager lagere laagste langer langste lang lange lengte leren leerde geleerd leraar lerares leerling tokenizer tokenizers token tokens embedding embeddings';
  const b = simFrame(el, 'layers', 'Byte-Pair Encoding — train je eigen tokenizer', `<div class="sim-controls"><div class="ctl" style="grid-column:1/-1"><label>Trainingscorpus</label><textarea data-corpus>${PS.esc(corpus0)}</textarea></div><div class="ctl"><label>Aantal merges <span class="num" data-kv></span></label><input type="range" min="0" max="60" value="${opts.merges || 12}" data-k></div><div class="ctl"><label>Tekst om te tokeniseren</label><input type="text" data-text value="${PS.attr(opts.text || 'de langste leerlingen leren tokenizers')}"></div></div>
    <div class="sim-out" style="margin-bottom:14px"><div class="stat"><div class="v num" data-ntok></div><div class="k">tokens</div></div><div class="stat"><div class="v num" data-ratio></div><div class="k">tekens per token</div></div><div class="stat"><div class="v num" data-vocab></div><div class="k">vocabulaire</div></div></div>
    <div class="tokens" data-tokens style="margin-bottom:14px"></div><div class="eyebrow" style="margin-bottom:6px">Geleerde merges (in volgorde)</div><div class="merge-list" data-merges></div>`);
  const train = (text, k) => {
    const freq = {}; text.toLowerCase().split(/\s+/).filter(Boolean).forEach((w) => { freq[w] = (freq[w] || 0) + 1; });
    let words = Object.entries(freq).map(([w, f]) => ({ s: ['▁', ...w], f }));
    const merges = [];
    for (let m = 0; m < k; m++) {
      const pc = new Map();
      words.forEach(({ s, f }) => { for (let i = 0; i < s.length - 1; i++) { const p = s[i] + '\u0001' + s[i + 1]; pc.set(p, (pc.get(p) || 0) + f); } });
      let best = null, bf = 0; for (const [p, c] of pc) if (c > bf || (c === bf && p < best)) { best = p; bf = c; }
      if (!best || bf < 2) break;
      const [a, c] = best.split('\u0001'); merges.push([a, c, bf]);
      words = words.map(({ s, f }) => { const o = []; for (let i = 0; i < s.length; i++) { if (i < s.length - 1 && s[i] === a && s[i + 1] === c) { o.push(a + c); i++; } else o.push(s[i]); } return { s: o, f }; });
    }
    return merges;
  };
  const tokenize = (text, merges) => {
    const rank = new Map(merges.map(([a, c], i) => [a + '\u0001' + c, i]));
    const out = [];
    text.toLowerCase().split(/\s+/).filter(Boolean).forEach((w) => {
      let s = ['▁', ...w];
      for (;;) { let bi = -1, br = Infinity; for (let i = 0; i < s.length - 1; i++) { const r = rank.get(s[i] + '\u0001' + s[i + 1]); if (r != null && r < br) { br = r; bi = i; } } if (bi < 0) break; s = s.slice(0, bi).concat([s[bi] + s[bi + 1]], s.slice(bi + 2)); }
      out.push(...s);
    });
    return out;
  };
  const cols = ['--greek', '--french', '--solidity', '--ai', '--automation'];
  const upd = () => {
    const k = Number(PS.$('[data-k]', b).value); PS.$('[data-kv]', b).textContent = k;
    const corpus = PS.$('[data-corpus]', b).value; const text = PS.$('[data-text]', b).value;
    const merges = train(corpus, k); const toks = tokenize(text, merges);
    const base = new Set(['▁', ...corpus.toLowerCase().replace(/\s+/g, '')]);
    const vocab = [...base].concat(merges.map(([a, c]) => a + c));
    PS.$('[data-tokens]', b).innerHTML = toks.map((t, i) => `<span class="tok" style="background:color-mix(in srgb, var(${cols[i % 5]}) 18%, transparent)">${PS.esc(t)}<small>${vocab.indexOf(t)}</small></span>`).join('');
    PS.$('[data-ntok]', b).textContent = toks.length;
    PS.$('[data-ratio]', b).textContent = (text.replace(/\s+/g, '').length / Math.max(1, toks.length)).toFixed(2);
    PS.$('[data-vocab]', b).textContent = vocab.length;
    PS.$('[data-merges]', b).innerHTML = merges.length ? merges.map(([a, c, f], i) => `${i + 1}. “${PS.esc(a)}” + “${PS.esc(c)}” → “${PS.esc(a + c)}” <span class="muted">(${f}×)</span>`).join('<br>') : '<span class="muted">Nog geen merges: elk teken is een token.</span>';
  };
  PS.$$('input,textarea', b).forEach((x) => x.addEventListener('input', upd)); upd();
};

/* ---------------- RoPE ---------------- */
PS.sims.rope = (el, opts) => {
  const d = opts.d || 64;
  const b = simFrame(el, 'compass', 'Rotary Position Embedding', `<div class="sim-controls"><div class="ctl"><label>Positie query m <span class="num" data-mv></span></label><input type="range" min="0" max="64" value="5" data-m></div><div class="ctl"><label>Positie key n <span class="num" data-nv></span></label><input type="range" min="0" max="64" value="2" data-n></div><div class="ctl"><label>Frequentiepaar i <span class="num" data-iv></span></label><input type="range" min="0" max="${d / 2 - 1}" value="0" data-i></div></div>
    <div class="row" style="gap:20px;flex-wrap:wrap;align-items:center"><svg viewBox="0 0 240 240" width="240" height="240" data-svg></svg><div class="stack" style="flex:1;min-width:220px"><div class="sim-out"><div class="stat"><div class="v num" data-theta></div><div class="k">θᵢ = 10000^(−2i/d)</div></div><div class="stat"><div class="v num" data-diff></div><div class="k">hoek (m−n)·θᵢ</div></div><div class="stat"><div class="v num" data-dot></div><div class="k">⟨Rₘq, Rₙk⟩</div></div></div><button type="button" class="btn btn-line btn-sm" data-shift>Verschuif m én n met +7</button><p class="small muted" style="margin:0">Het inproduct hangt alleen af van <strong>m − n</strong>: verschuif beide posities en het blijft gelijk.</p></div></div>`, `d = ${d}`);
  const q0 = [1, 0.35], k0 = [0.8, 0.6];
  const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const upd = () => {
    const m = +PS.$('[data-m]', b).value, n = +PS.$('[data-n]', b).value, i = +PS.$('[data-i]', b).value;
    const th = Math.pow(10000, (-2 * i) / d);
    const q = rot(q0, m * th), k = rot(k0, n * th);
    PS.$('[data-mv]', b).textContent = m; PS.$('[data-nv]', b).textContent = n; PS.$('[data-iv]', b).textContent = i;
    PS.$('[data-theta]', b).textContent = th.toPrecision(3); PS.$('[data-diff]', b).textContent = `${(((m - n) * th * 180) / Math.PI).toFixed(1)}°`;
    PS.$('[data-dot]', b).textContent = (q[0] * k[0] + q[1] * k[1]).toFixed(4);
    const S = (v, r = 90) => [120 + v[0] * r, 120 - v[1] * r];
    const [qx, qy] = S(q), [kx, ky] = S(k);
    PS.$('[data-svg]', b).innerHTML = `<circle cx="120" cy="120" r="95" fill="none" stroke="var(--line-2)"/><line x1="20" y1="120" x2="220" y2="120" class="plot-grid"/><line x1="120" y1="20" x2="120" y2="220" class="plot-grid"/>
      <line x1="120" y1="120" x2="${qx}" y2="${qy}" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/><circle cx="${qx}" cy="${qy}" r="5" fill="var(--accent)"/><text x="${qx + 6}" y="${qy - 6}" class="plot-label" style="fill:var(--accent);font-weight:700">q@m</text>
      <line x1="120" y1="120" x2="${kx}" y2="${ky}" stroke="var(--ink-2)" stroke-width="3" stroke-linecap="round"/><circle cx="${kx}" cy="${ky}" r="5" fill="var(--ink-2)"/><text x="${kx + 6}" y="${ky - 6}" class="plot-label" style="font-weight:700">k@n</text>`;
  };
  PS.$$('input', b).forEach((x) => x.addEventListener('input', upd));
  PS.$('[data-shift]', b).addEventListener('click', () => { const M = PS.$('[data-m]', b), N = PS.$('[data-n]', b); M.value = Math.min(64, +M.value + 7); N.value = Math.min(64, +N.value + 7); upd(); });
  upd();
};

/* ---------------- Scaled dot-product attention ---------------- */
PS.sims.attention = (el, opts) => {
  const toks = opts.tokens || ['De', 'kat', 'zat', 'op', 'de', 'mat'];
  const Q = opts.Q || [[0.2, 0.1, 0.9, 0.1], [1.2, 0.3, 0.1, 0.8], [0.9, 1.4, 0.2, 0.3], [0.1, 0.9, 1.1, 0.2], [0.2, 0.1, 0.9, 0.2], [1.1, 0.2, 0.3, 1.2]];
  const K = opts.K || [[0.1, 0.2, 1.0, 0.1], [1.3, 0.2, 0.2, 0.9], [0.8, 1.2, 0.1, 0.2], [0.2, 1.0, 0.9, 0.1], [0.1, 0.2, 1.0, 0.1], [1.0, 0.3, 0.2, 1.3]];
  const dk = Q[0].length;
  const b = simFrame(el, 'grid', 'Attention: softmax(QKᵀ/√dₖ + M)·V', `<div class="sim-controls"><div class="ctl"><label>Temperatuur τ <span class="num" data-tv></span></label><input type="range" min="0.1" max="3" step="0.05" value="1" data-t></div><div class="ctl"><label style="justify-content:flex-start;gap:10px"><input type="checkbox" data-scale checked> Deel door √dₖ = ${Math.sqrt(dk)}</label><label style="justify-content:flex-start;gap:10px"><input type="checkbox" data-causal checked> Causaal masker</label></div></div><div style="overflow-x:auto"><div data-m></div></div><p class="small muted" style="margin:10px 0 0">Elke rij = één query-token; de kolommen tonen hoeveel aandacht het geeft aan elk key-token (rij telt op tot 100%).</p>`, `dₖ = ${dk}`);
  const upd = () => {
    const tau = +PS.$('[data-t]', b).value, scale = PS.$('[data-scale]', b).checked, causal = PS.$('[data-causal]', b).checked;
    PS.$('[data-tv]', b).textContent = tau.toFixed(2);
    const rows = Q.map((q, i) => {
      const s = K.map((k, j) => (causal && j > i ? -Infinity : q.reduce((a, x, z) => a + x * k[z], 0) / (scale ? Math.sqrt(dk) : 1) / tau));
      const mx = Math.max(...s.filter(isFinite)); const e = s.map((x) => (isFinite(x) ? Math.exp(x - mx) : 0)); const sum = e.reduce((a, x) => a + x, 0);
      return e.map((x) => x / sum);
    });
    PS.$('[data-m]', b).innerHTML = `<div class="matrix" style="grid-template-columns:auto repeat(${toks.length},minmax(48px,1fr))"><div class="cell hdr"></div>${toks.map((t) => `<div class="cell hdr">${PS.esc(t)}</div>`).join('')}${rows.map((r, i) => `<div class="cell hdr" style="justify-content:end">${PS.esc(toks[i])}</div>${r.map((p, j) => `<div class="cell" style="${causal && j > i ? 'background:var(--surface-2);color:var(--ink-4)' : heat(p)}">${causal && j > i ? '−∞' : (p * 100).toFixed(0) + '%'}</div>`).join('')}`).join('')}</div>`;
  };
  PS.$$('input', b).forEach((x) => x.addEventListener('input', upd)); upd();
};

/* ---------------- KV-cache & VRAM ---------------- */
PS.sims.kvcache = (el, opts) => {
  const M = { 'llama3-8b': ['Llama 3 8B', 8.03e9, 32, 32, 8, 128], 'llama3-70b': ['Llama 3 70B', 70.6e9, 80, 64, 8, 128], 'mistral-7b': ['Mistral 7B', 7.24e9, 32, 32, 8, 128], 'qwen25-72b': ['Qwen2.5 72B', 72.7e9, 80, 64, 8, 128], 'gpt3': ['GPT-3 175B (MHA)', 175e9, 96, 96, 96, 128] };
  const b = simFrame(el, 'database', 'KV-cache & VRAM-budget', `<div class="sim-controls"><div class="ctl"><label>Model</label><select data-model>${Object.entries(M).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></div><div class="ctl"><label>Contextlengte <span class="num" data-lv></span></label><input type="range" min="9" max="17" step="1" value="12" data-len></div><div class="ctl"><label>Gelijktijdige gebruikers <span class="num" data-bv></span></label><input type="range" min="1" max="64" value="8" data-batch></div><div class="ctl"><label>Precisie gewichten / KV</label><select data-prec><option value="2,2">FP16 / FP16</option><option value="1,1">FP8 / FP8</option><option value="0.5,2">INT4 gewichten / FP16 KV</option></select></div></div>
    <div class="sim-out" style="margin-bottom:14px"><div class="stat"><div class="v num" data-w></div><div class="k">gewichten</div></div><div class="stat"><div class="v num" data-kv></div><div class="k">KV-cache</div></div><div class="stat"><div class="v num" data-per></div><div class="k">KV per token</div></div><div class="stat"><div class="v num" data-gpu></div><div class="k">H100's (80 GB) nodig</div></div></div><div class="progress" style="height:14px;display:flex"><span data-bw style="background:var(--ink-3)"></span><span data-bk style="background:var(--accent)"></span></div><p class="small muted" style="margin:10px 0 0">KV = 2 · lagen · KV-heads · head-dim · tokens · gebruikers · bytes. GQA deelt KV-heads over query-heads.</p>`);
  const upd = () => {
    const m = M[PS.$('[data-model]', b).value]; const L = 2 ** +PS.$('[data-len]', b).value; const B = +PS.$('[data-batch]', b).value; const [pw, pk] = PS.$('[data-prec]', b).value.split(',').map(Number);
    const w = m[1] * pw; const per = 2 * m[2] * m[4] * m[5] * pk; const kv = per * L * B;
    PS.$('[data-lv]', b).textContent = L >= 1024 ? `${L / 1024}k` : L; PS.$('[data-bv]', b).textContent = B;
    PS.$('[data-w]', b).textContent = gb(w); PS.$('[data-kv]', b).textContent = gb(kv); PS.$('[data-per]', b).textContent = `${(per / 1024).toFixed(0)} KB`;
    PS.$('[data-gpu]', b).textContent = Math.ceil((w + kv) / (80 * 1024 ** 3) / 0.9);
    const tot = w + kv; PS.$('[data-bw]', b).style.width = `${(100 * w) / tot}%`; PS.$('[data-bk]', b).style.width = `${(100 * kv) / tot}%`;
  };
  PS.$$('input,select', b).forEach((x) => x.addEventListener('input', upd)); upd();
};

/* ---------------- LoRA ---------------- */
PS.sims.lora = (el, opts) => {
  const N = 24;
  const b = simFrame(el, 'layers', 'LoRA: W = W₀ + (α/r)·B·A', `<div class="sim-controls"><div class="ctl"><label>Matrix d × k <span class="num" data-dv></span></label><input type="range" min="9" max="14" value="12" data-d></div><div class="ctl"><label>Rang r <span class="num" data-rv></span></label><input type="range" min="1" max="64" value="8" data-r></div></div>
    <div class="sim-out" style="margin-bottom:14px"><div class="stat"><div class="v num" data-full></div><div class="k">volledige ΔW</div></div><div class="stat"><div class="v num" data-lo></div><div class="k">B + A (trainbaar)</div></div><div class="stat"><div class="v num" data-pct></div><div class="k">van de parameters</div></div></div>
    <div class="eyebrow" style="margin:6px 0">Intuïtie: laag-rang benadering van een ${N}×${N} update (rang ≤ 12)</div><div class="row" style="gap:18px;flex-wrap:wrap"><div><div class="tiny muted">origineel ΔW</div><canvas data-c0 width="${N * 6}" height="${N * 6}" style="width:${N * 6}px;border-radius:8px"></canvas></div><div><div class="tiny muted">rang-r benadering</div><canvas data-c1 width="${N * 6}" height="${N * 6}" style="width:${N * 6}px;border-radius:8px"></canvas></div><div class="stat" style="align-self:center"><div class="v num" data-err></div><div class="k">relatieve fout</div></div></div>`);
  const rnd = PS.rng(7); const W = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let c = 0; c < 4; c++) { const u = Array.from({ length: N }, () => rnd() - 0.5), v = Array.from({ length: N }, () => rnd() - 0.5), s = [3, 1.6, 0.9, 0.5][c]; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) W[i][j] += s * u[i] * v[j]; }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) W[i][j] += (rnd() - 0.5) * 0.06;
  const approx = (r) => { const R = W.map((x) => x.slice()); const out = Array.from({ length: N }, () => new Array(N).fill(0)); for (let c = 0; c < r; c++) { let v = Array.from({ length: N }, (_, i) => Math.sin(i + c + 1)); for (let it = 0; it < 60; it++) { const u = R.map((row) => row.reduce((a, x, j) => a + x * v[j], 0)); const w = v.map((_, j) => R.reduce((a, row, i) => a + row[j] * u[i], 0)); const nv = Math.hypot(...w) || 1; v = w.map((x) => x / nv); } const u = R.map((row) => row.reduce((a, x, j) => a + x * v[j], 0)); for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { out[i][j] += u[i] * v[j]; R[i][j] -= u[i] * v[j]; } } return out; };
  const paint = (cv, M) => { const ctx = cv.getContext('2d'); const mx = Math.max(...W.flat().map(Math.abs)); for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const v = M[i][j] / mx; ctx.fillStyle = v >= 0 ? `rgba(106,63,212,${Math.min(1, v)})` : `rgba(217,72,15,${Math.min(1, -v)})`; ctx.clearRect(j * 6, i * 6, 6, 6); ctx.fillRect(j * 6, i * 6, 6, 6); } };
  paint(PS.$('[data-c0]', b), W);
  const upd = () => {
    const d = 2 ** +PS.$('[data-d]', b).value, r = +PS.$('[data-r]', b).value;
    PS.$('[data-dv]', b).textContent = `${d} × ${d}`; PS.$('[data-rv]', b).textContent = r;
    PS.$('[data-full]', b).textContent = fmtBig(d * d); PS.$('[data-lo]', b).textContent = fmtBig(r * (d + d)); PS.$('[data-pct]', b).textContent = `${((100 * r * 2 * d) / (d * d)).toFixed(2)}%`;
    const rr = Math.min(r, 12); const A = approx(rr); paint(PS.$('[data-c1]', b), A);
    let num = 0, den = 0; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { num += (W[i][j] - A[i][j]) ** 2; den += W[i][j] ** 2; }
    PS.$('[data-err]', b).textContent = `${(100 * Math.sqrt(num / den)).toFixed(1)}%`;
  };
  PS.$$('input', b).forEach((x) => x.addEventListener('input', upd)); upd();
};

/* ---------------- Chinchilla ---------------- */
PS.sims.chinchilla = (el) => {
  const E = 1.69, A = 406.4, B = 410.7, a = 0.34, bb = 0.28;
  const b = simFrame(el, 'chart', 'Compute-optimaal trainen (Chinchilla)', `<div class="sim-controls"><div class="ctl"><label>Rekenbudget C <span class="num" data-cv></span></label><input type="range" min="20" max="26" step="0.1" value="23" data-c></div></div><div class="sim-out" style="margin-bottom:12px"><div class="stat"><div class="v num" data-n></div><div class="k">N* (20 tokens/param)</div></div><div class="stat"><div class="v num" data-d></div><div class="k">D* tokens</div></div><div class="stat"><div class="v num" data-h></div><div class="k">H100-dagen (40% MFU)</div></div></div><svg viewBox="0 0 520 200" width="100%" data-svg></svg><p class="small muted" style="margin:8px 0 0">Iso-FLOP-curve: bij vast C levert L(N, D=C/6N) = E + A/N^α + B/D^β een minimum op. Links: te klein model; rechts: te weinig data.</p>`);
  const upd = () => {
    const lc = +PS.$('[data-c]', b).value; const C = 10 ** lc; PS.$('[data-cv]', b).textContent = `10^${lc.toFixed(1)} FLOP`;
    const N = Math.sqrt(C / 120); PS.$('[data-n]', b).textContent = fmtBig(N); PS.$('[data-d]', b).textContent = fmtBig(20 * N);
    PS.$('[data-h]', b).textContent = fmtBig(C / (989e12 * 0.4 * 86400));
    const xs = []; for (let x = Math.log10(N) - 1.5; x <= Math.log10(N) + 1.5; x += 0.05) { const n = 10 ** x; const d = C / (6 * n); xs.push([x, E + A / n ** a + B / d ** bb]); }
    const ys = xs.map((p) => p[1]); const y0 = Math.min(...ys), y1 = Math.max(...ys); const X = (x) => 40 + ((x - xs[0][0]) / (xs[xs.length - 1][0] - xs[0][0])) * 460, Y = (y) => 180 - ((y - y0) / (y1 - y0 || 1)) * 160;
    const best = xs.reduce((m, p) => (p[1] < m[1] ? p : m));
    PS.$('[data-svg]', b).innerHTML = `<line x1="40" y1="180" x2="500" y2="180" class="plot-axis"/><line x1="40" y1="10" x2="40" y2="180" class="plot-axis"/><path class="plot-line" d="${xs.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('')}"/><circle cx="${X(best[0])}" cy="${Y(best[1])}" r="5" class="plot-dot"/><text x="${X(best[0]) + 8}" y="${Y(best[1]) - 8}" class="plot-label">optimum ≈ ${fmtBig(10 ** best[0])} params · loss ${best[1].toFixed(3)}</text><text x="44" y="196" class="plot-label">klein model</text><text x="430" y="196" class="plot-label">groot model</text>`;
  };
  PS.$('[data-c]', b).addEventListener('input', upd); upd();
};

/* ---------------- n8n: items flow through a node ---------------- */
PS.sims['n8n-items'] = (el, opts) => {
  const items = opts.items || [{ name: 'Sofie', company: 'Acme BV', revenue: 120000 }, { name: 'Jonas', company: 'Beta NV', revenue: 45000 }, { name: 'Lotte', company: 'Gamma', revenue: 310000 }];
  const b = simFrame(el, 'zap', 'Zo verwerkt n8n items', `<p class="small" style="margin-top:0">Een node krijgt een <strong>lijst items</strong> binnen en voert zijn parameters <strong>één keer per item</strong> uit. Typ een expressie en kijk wat elk item oplevert.</p>
    <div class="ctl"><label>Expressie</label><input type="text" data-expr value="${PS.attr(opts.expr || '{{ $json.company }} — {{ $json.revenue > 100000 ? "enterprise" : "smb" }}')}" style="font-family:var(--font-mono)"></div>
    <div style="overflow-x:auto;margin-top:14px"><table class="n8n-table" style="width:100%;border-collapse:collapse;font-size:14px" data-table></table></div>${PS.jsonBlock(items.map((j) => ({ json: j })), `Input: ${items.length} items (zoals n8n het intern bewaart)`, false)}`);
  const upd = PS.debounce(async () => {
    const expr = PS.$('[data-expr]', b).value;
    const r = await PS.jsbox.run({ kind: 'expr', template: expr, items, perItem: true });
    const keys = Object.keys(items[0]);
    PS.$('[data-table]', b).innerHTML = `<thead><tr><th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)">#</th>${keys.map((k) => `<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)">${PS.esc(k)}</th>`).join('')}<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);color:var(--accent)">resultaat</th></tr></thead><tbody>${items.map((it, i) => `<tr><td style="padding:6px 8px;color:var(--ink-3)">${i}</td>${keys.map((k) => `<td style="padding:6px 8px">${PS.esc(JSON.stringify(it[k]))}</td>`).join('')}<td style="padding:6px 8px;font-family:var(--font-mono);color:var(--accent)">${r.ok ? PS.esc(typeof r.value[i] === 'string' ? r.value[i] : JSON.stringify(r.value[i])) : `<span style="color:var(--bad)">${PS.esc(r.error)}</span>`}</td></tr>`).join('')}</tbody>`;
  }, 200);
  PS.$('[data-expr]', b).addEventListener('input', upd); upd();
};

/* ---------------- Retry with exponential backoff ---------------- */
PS.sims.backoff = (el) => {
  const b = simFrame(el, 'repeat', 'Retry-schema met exponential backoff', `<div class="sim-controls"><div class="ctl"><label>Basisvertraging <span class="num" data-bv></span></label><input type="range" min="0.5" max="10" step="0.5" value="1" data-base></div><div class="ctl"><label>Factor <span class="num" data-fv></span></label><input type="range" min="1.5" max="4" step="0.5" value="2" data-f></div><div class="ctl"><label>Max. pogingen <span class="num" data-nv></span></label><input type="range" min="1" max="10" value="6" data-n></div><div class="ctl"><label>Plafond per wachttijd <span class="num" data-cv></span></label><input type="range" min="5" max="300" step="5" value="60" data-cap></div><div class="ctl"><label>Jitter</label><select data-j><option value="none">geen</option><option value="full" selected>full jitter</option><option value="equal">equal jitter</option></select></div></div><div data-out></div>`);
  const upd = () => {
    const base = +PS.$('[data-base]', b).value, f = +PS.$('[data-f]', b).value, n = +PS.$('[data-n]', b).value, cap = +PS.$('[data-cap]', b).value, j = PS.$('[data-j]', b).value;
    PS.$('[data-bv]', b).textContent = `${base} s`; PS.$('[data-fv]', b).textContent = `×${f}`; PS.$('[data-nv]', b).textContent = n; PS.$('[data-cv]', b).textContent = `${cap} s`;
    let cum = 0; const rows = [];
    for (let k = 0; k < n; k++) { const raw = Math.min(cap, base * f ** k); const lo = j === 'full' ? 0 : j === 'equal' ? raw / 2 : raw; const hi = raw; cum += (lo + hi) / 2; rows.push([k + 1, raw, lo, hi, cum]); }
    PS.$('[data-out]', b).innerHTML = `<div class="table-wrap" style="border:1px solid var(--line);border-radius:12px;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr>${['Retry', 'min(cap, base·fᵏ)', 'Wachttijd (bereik)', 'Gem. cumulatief'].map((h) => `<th style="text-align:left;padding:8px 10px;background:var(--surface-2);font-size:12px">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr><td style="padding:6px 10px">${r[0]}</td><td style="padding:6px 10px" class="num">${r[1].toFixed(1)} s</td><td style="padding:6px 10px" class="num">${r[2] === r[3] ? r[3].toFixed(1) + ' s' : `${r[2].toFixed(1)} – ${r[3].toFixed(1)} s`}</td><td style="padding:6px 10px" class="num">${r[4].toFixed(1)} s</td></tr>`).join('')}</tbody></table></div><p class="small muted" style="margin:8px 0 0">Jitter spreidt de retries van veel clients zodat ze niet tegelijk opnieuw aankloppen (thundering herd).</p>`;
  };
  PS.$$('input,select', b).forEach((x) => x.addEventListener('input', upd)); upd();
};

/* ---------------- Solidity demo studio ---------------- */
PS.sims.solidity = (el, opts) => { el.classList.remove('sim'); el.style.margin = '1.4em 0'; PS.sol.mountDemo(el, opts); };
