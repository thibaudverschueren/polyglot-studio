/* Polyglot Studio v2 — lightweight code editor (textarea + highlighted overlay) and highlighter */
'use strict';

const HL = {
  sol: {
    kw: new Set('pragma solidity import contract interface library abstract is function modifier event error struct enum mapping returns return if else for while do break continue emit revert require assert new delete try catch using constructor receive fallback public private internal external view pure payable memory storage calldata constant immutable override virtual unchecked assembly indexed anonymous let switch case default this super type'.split(' ')),
    bi: new Set('msg block tx abi keccak256 sha256 ecrecover gasleft selfdestruct addmod mulmod blockhash wei gwei ether seconds minutes hours days weeks true false'.split(' ')),
    ty: /^(u?int\d*|address|bool|string|bytes\d*|fixed|ufixed)$/,
  },
  js: {
    kw: new Set('const let var function return if else for while do break continue new class extends import export from default async await try catch finally throw typeof instanceof in of switch case this null undefined true false'.split(' ')),
    bi: new Set('$json $input $node $items $now $today $itemIndex $runIndex $workflow $execution $ DateTime console JSON Math Object Array String Number Date Promise require Buffer items'.split(' ')),
    ty: /^$/,
  },
};
const TOKEN_RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\b0x[0-9a-fA-F_]+\b|\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([\s\S])/g;

PS.highlight = (code, lang = 'sol') => {
  const L = HL[lang === 'solidity' ? 'sol' : lang === 'json' ? 'js' : lang] || HL.js;
  let out = ''; let m; const src = String(code || '');
  TOKEN_RE.lastIndex = 0;
  const toks = [];
  while ((m = TOKEN_RE.exec(src))) toks.push(m);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]; const v = t[0]; const e = PS.esc(v);
    if (t[1]) out += `<span class="tok-com">${e}</span>`;
    else if (t[2]) out += `<span class="tok-str">${e}</span>`;
    else if (t[3]) out += `<span class="tok-num">${e}</span>`;
    else if (t[4]) {
      let j = i + 1; while (j < toks.length && toks[j][5]) j++;
      const next = toks[j] ? toks[j][0] : '';
      if (L.kw.has(v)) out += `<span class="tok-kw">${e}</span>`;
      else if (L.ty.test(v)) out += `<span class="tok-ty">${e}</span>`;
      else if (L.bi.has(v)) out += `<span class="tok-bi">${e}</span>`;
      else if (next === '(') out += `<span class="tok-fn">${e}</span>`;
      else if (/^[A-Z]/.test(v)) out += `<span class="tok-ty">${e}</span>`;
      else out += e;
    } else out += e;
  }
  return out;
};

PS.Editor = class {
  /* opts: { value, lang, key (draft storage), symbols: [...], minLines, onChange, single } */
  constructor(el, opts = {}) {
    this.el = el; this.o = opts;
    const draft = opts.key ? PS.store.get(`polyglot_draft_${opts.key}`) : null;
    const value = draft != null ? draft : opts.value || '';
    el.innerHTML = `<div class="editor${opts.single ? ' editor-single' : ''}" style="${opts.single ? 'max-height:none' : ''}"><div class="gutter" aria-hidden="true"></div><div class="ed"><pre aria-hidden="true"><code></code></pre><textarea spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="Code-editor"></textarea></div></div>${opts.symbols && opts.symbols.length ? `<div class="symbar">${opts.symbols.map((s) => `<button type="button" data-sym="${PS.attr(s)}">${PS.esc(s)}</button>`).join('')}</div>` : ''}`;
    this.ta = PS.$('textarea', el); this.pre = PS.$('pre code', el); this.gut = PS.$('.gutter', el);
    this.ta.value = value;
    this.ta.addEventListener('input', () => this.sync(true));
    this.ta.addEventListener('keydown', (e) => this.key(e));
    PS.$$('[data-sym]', el).forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.insert(b.dataset.sym); }));
    this.sync(false);
  }
  value() { return this.ta.value; }
  set(v) { this.ta.value = v; this.sync(true); }
  sync(changed) {
    const v = this.ta.value;
    this.pre.innerHTML = PS.highlight(v, this.o.lang) + '\n';
    const lines = Math.max(v.split('\n').length, this.o.minLines || (this.o.single ? 1 : 8));
    this.gut.textContent = this.o.single ? '' : Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    const ed = this.ta.parentElement;
    ed.style.height = 'auto';
    const h = Math.max(this.pre.parentElement.scrollHeight, (lines * 21.6) + 24);
    ed.style.height = h + 'px';
    this.ta.style.width = Math.max(this.pre.parentElement.scrollWidth, ed.clientWidth) + 'px';
    if (changed) {
      if (this.o.key) PS.store.set(`polyglot_draft_${this.o.key}`, v);
      if (this.o.onChange) this.o.onChange(v);
    }
  }
  insert(text) {
    const ta = this.ta; const s = ta.selectionStart, e = ta.selectionEnd;
    let ins = text, caret = null;
    if (text === '{ }') { const ind = this.indentAt(s); ins = `{\n${ind}    \n${ind}}`; caret = s + 2 + ind.length + 4; }
    else if (text === '( )') { ins = '()'; caret = s + 1; }
    else if (text === '[ ]') { ins = '[]'; caret = s + 1; }
    else if (text === '{{ }}') { ins = '{{  }}'; caret = s + 3; }
    else if (text === '⇥') ins = '    ';
    ta.setRangeText(ins, s, e, 'end');
    if (caret != null) ta.selectionStart = ta.selectionEnd = caret;
    ta.focus(); this.sync(true);
  }
  indentAt(pos) { const v = this.ta.value; const ls = v.lastIndexOf('\n', pos - 1) + 1; return (v.slice(ls).match(/^[ \t]*/) || [''])[0]; }
  key(e) {
    const ta = this.ta;
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd; const v = ta.value;
      if (s === en && !e.shiftKey) { ta.setRangeText('    ', s, en, 'end'); }
      else {
        const ls = v.lastIndexOf('\n', s - 1) + 1; const block = v.slice(ls, en);
        const out = e.shiftKey ? block.replace(/^ {1,4}/gm, '') : block.replace(/^/gm, '    ');
        ta.setRangeText(out, ls, en, 'select');
      }
      this.sync(true);
    } else if (e.key === 'Enter' && !this.o.single) {
      e.preventDefault();
      const s = ta.selectionStart; let ind = this.indentAt(s);
      const before = ta.value.slice(0, s).trimEnd();
      if (/[{(\[]$/.test(before)) ind += '    ';
      ta.setRangeText('\n' + ind, s, ta.selectionEnd, 'end');
      this.sync(true);
    } else if (e.key === 'Enter' && this.o.single) {
      e.preventDefault(); if (this.o.onEnter) this.o.onEnter();
    } else if (e.key === '}' ) {
      const s = ta.selectionStart; const v = ta.value; const ls = v.lastIndexOf('\n', s - 1) + 1;
      if (/^\s+$/.test(v.slice(ls, s)) && v.slice(ls, s).length >= 4) { e.preventDefault(); ta.setRangeText('}', s - 4, s, 'end'); this.sync(true); }
    }
  }
  focus() { this.ta.focus(); }
};
