"""
md.py — small, strict Markdown subset renderer for Polyglot Studio lessons.

Block syntax
  ## / ### / ####         headings (rendered one level lower: ## → h3)
  - item / 1. item        lists (nest with 2+ spaces)
  > [!rule] Title         callouts: rule, tip, warning, pitfall, example, mnemonic, note
  > text                  quote
  | a | b |               GFM tables (alignment with :---:)
  ```solidity title       fenced code (solidity, python, js, json, bash, text)
  $$ … $$                 display math (KaTeX, rendered at build time)
  :::sim name {json}      interactive simulator placeholder, closed by :::
  ---                     horizontal rule

Inline syntax
  **bold** *italic* ~~strike~~ ==mark== `code` [link](https://…)
  $x^2$                   inline math
  [[el:καλημέρα]]         speakable chip (el / fr); Greek text is made speakable automatically
  <br> <sup> <sub> <u> <kbd>  the only raw HTML allowed

Math is emitted as placeholders @@M<n>@@ and collected in MATH so the build can
render every formula in one KaTeX batch.
"""
import html as _html
import json
import re

from highlight import highlight

MATH = []          # list of (tex, display)
_MATH_INDEX = {}   # (tex, display) -> n


def math_placeholder(tex, display):
    key = (tex.strip(), bool(display))
    if key not in _MATH_INDEX:
        _MATH_INDEX[key] = len(MATH)
        MATH.append(key)
    return f"@@M{_MATH_INDEX[key]}@@"


CALLOUTS = {
    "rule": ("Regel", "target"),
    "tip": ("Tip", "bulb"),
    "warning": ("Let op", "alert"),
    "pitfall": ("Valkuil", "alert"),
    "example": ("Voorbeeld", "list"),
    "mnemonic": ("Ezelsbruggetje", "sparkles"),
    "note": ("Achtergrond", "info"),
}
ICON_PATHS = {
    "target": '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    "bulb": '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"/>',
    "alert": '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    "list": '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    "sparkles": '<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/>',
    "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
}


def _icon(name):
    return f'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">{ICON_PATHS[name]}</svg>'


GREEK_RUN = re.compile(r"[Ͱ-Ͽἀ-῿]+(?:[  ,·'’\-]+[Ͱ-Ͽἀ-῿]+)*")
ALLOWED_TAGS = re.compile(r"</?(?:br|sup|sub|u|kbd)\s*/?>", re.I)


class MdError(ValueError):
    pass


# ---------------------------------------------------------------- inline
def inline(text, greek_say=True):
    """Render inline markdown to HTML."""
    if not text:
        return ""
    stash = []

    def keep(s):
        stash.append(s)
        return f"\x00{len(stash) - 1}\x00"

    t = text.replace("\\$", keep("$"))
    # code spans
    t = re.sub(r"`([^`\n]+)`", lambda m: keep(f"<code>{_html.escape(m.group(1), quote=False)}</code>"), t)
    # display math inside a line
    t = re.sub(r"\$\$(.+?)\$\$", lambda m: keep(f'<span class="katex-block">{math_placeholder(m.group(1), True)}</span>'), t)
    # inline math: $…$ (no space after opening / before closing, not followed by a digit)
    t = re.sub(r"(?<![\\$\w])\$(?=\S)([^$\n]+?)(?<=\S)\$(?![\d$])", lambda m: keep(math_placeholder(m.group(1), False)), t)
    # speakable chips [[el:…]] [[fr:…]] [[say:el|…]]
    def say(m):
        lang, body = m.group(1), m.group(2)
        return keep(f'<span class="say" lang="{lang}" data-lang="{lang}">{_html.escape(body, quote=False)}</span>')
    t = re.sub(r"\[\[(el|fr)[:|]([^\]]+)\]\]", say, t)
    t = re.sub(r"\[\[say:(el|fr)\|([^\]]+)\]\]", say, t)
    # whitelisted raw tags
    t = ALLOWED_TAGS.sub(lambda m: keep(m.group(0).lower().replace(" ", "")), t)
    # escape the rest
    t = _html.escape(t, quote=False)
    # links
    t = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", lambda m: f'<a href="{m.group(2)}" target="_blank" rel="noopener">{m.group(1)}</a>', t)
    # emphasis
    t = re.sub(r"\*\*(?=\S)(.+?)(?<=\S)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])", r"<em>\1</em>", t)
    t = re.sub(r"(?<![\w])_(?=\S)(.+?)(?<=\S)_(?![\w])", r"<em>\1</em>", t)
    t = re.sub(r"~~(?=\S)(.+?)(?<=\S)~~", r"<del>\1</del>", t)
    t = re.sub(r"==(?=\S)(.+?)(?<=\S)==", r"<mark>\1</mark>", t)
    t = t.replace(" -- ", " – ")
    # make Greek runs speakable (only in text, never inside tags)
    if greek_say:
        parts = re.split(r"(<[^>]+>)", t)
        depth_a = 0
        for i, p in enumerate(parts):
            if p.startswith("<"):
                if re.match(r"<a\b", p):
                    depth_a += 1
                elif p.startswith("</a"):
                    depth_a -= 1
                continue
            if depth_a == 0 and "\x00" not in p:
                parts[i] = GREEK_RUN.sub(lambda m: f'<span class="say" lang="el">{m.group(0)}</span>', p)
            elif depth_a == 0:
                segs = re.split(r"(\x00\d+\x00)", p)
                parts[i] = "".join(s if s.startswith("\x00") else GREEK_RUN.sub(lambda m: f'<span class="say" lang="el">{m.group(0)}</span>', s) for s in segs)
        t = "".join(parts)
    # restore stash (repeat: stashed items may contain other placeholders)
    for _ in range(3):
        t = re.sub(r"\x00(\d+)\x00", lambda m: stash[int(m.group(1))], t)
    return t


# ---------------------------------------------------------------- blocks
LIST_RE = re.compile(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$")
FENCE_RE = re.compile(r"^\s*```\s*([\w+-]*)\s*(.*)$")


def _table(lines):
    def cells(line):
        line = line.strip()
        if line.startswith("|"):
            line = line[1:]
        if line.endswith("|"):
            line = line[:-1]
        out, cur, esc = [], "", False
        for ch in line:
            if ch == "\\" and not esc:
                esc = True
                continue
            if ch == "|" and not esc:
                out.append(cur.strip())
                cur = ""
            else:
                cur += ("\\" + ch if esc and ch != "|" else ch)
            esc = False
        out.append(cur.strip())
        return out

    head = cells(lines[0])
    aligns = []
    for c in cells(lines[1]):
        c = c.strip()
        aligns.append("c" if c.startswith(":") and c.endswith(":") else "r" if c.endswith(":") else "")
    rows = [cells(l) for l in lines[2:]]
    def cls(i):
        a = aligns[i] if i < len(aligns) else ""
        return f' class="{a}"' if a else ""
    h = "".join(f"<th{cls(i)}>{inline(c)}</th>" for i, c in enumerate(head))
    b = "".join("<tr>" + "".join(f"<td{cls(i)}>{inline(c)}</td>" for i, c in enumerate(r)) + "</tr>" for r in rows)
    return f'<div class="table-wrap"><table><thead><tr>{h}</tr></thead><tbody>{b}</tbody></table></div>'


def _list(lines):
    """lines: list of (indent, marker, text) plus continuation strings; returns html."""
    html_out = []

    def render(items, start_indent):
        if not items:
            return ""
        ordered = items[0][1][0].isdigit()
        tag = "ol" if ordered else "ul"
        out = [f"<{tag}>"]
        i = 0
        while i < len(items):
            ind, mark, text = items[i]
            children = []
            j = i + 1
            while j < len(items) and items[j][0] > ind:
                children.append(items[j])
                j += 1
            out.append(f"<li>{inline(text)}{render(children, ind + 1) if children else ''}</li>")
            i = j
        out.append(f"</{tag}>")
        return "".join(out)

    items = []
    for ln in lines:
        m = LIST_RE.match(ln)
        if m:
            items.append([len(m.group(1).replace("\t", "    ")), m.group(2), m.group(3)])
        elif items:
            items[-1][2] += " " + ln.strip()
    html_out.append(render(items, 0))
    return "".join(html_out)


def render(md, _depth=0):
    """Render a markdown document (block level) to HTML."""
    if md is None:
        return ""
    lines = str(md).replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out = []
    i = 0
    para = []

    def flush_para():
        if para:
            text = "\n".join(para)
            # hard breaks: trailing two spaces or backslash
            text = re.sub(r"( {2,}|\\)\n", "<br>", text).replace("\n", " ")
            out.append(f"<p>{inline(text)}</p>")
            para.clear()

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            flush_para()
            i += 1
            continue

        m = FENCE_RE.match(line)
        if m:
            flush_para()
            lang, title = m.group(1) or "text", m.group(2).strip()
            title = re.sub(r'^title=["\']?|["\']$', "", title)
            body = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                body.append(lines[i])
                i += 1
            if i >= len(lines):
                raise MdError(f"Unclosed code fence ({lang})")
            i += 1
            code = "\n".join(body)
            head = f'<div class="code-head"><span>{_html.escape(title or lang)}</span><span>{_html.escape(lang)}</span></div>' if (title or lang not in ("text", "")) else ""
            out.append(f'<div class="codeblock">{head}<pre><code>{highlight(code, lang)}</code></pre></div>')
            continue

        if stripped.startswith("$$"):
            flush_para()
            buf = stripped[2:]
            if buf.endswith("$$") and len(buf) >= 2:
                tex = buf[:-2]
                i += 1
            else:
                parts = [buf]
                i += 1
                while i < len(lines) and not lines[i].strip().endswith("$$"):
                    parts.append(lines[i])
                    i += 1
                if i >= len(lines):
                    raise MdError("Unclosed $$ display math")
                parts.append(lines[i].strip()[:-2])
                i += 1
                tex = "\n".join(parts)
            out.append(f'<div class="katex-display-wrap">{math_placeholder(tex, True)}</div>')
            continue

        if stripped.startswith(":::sim") or re.match(r"^\[\[sim:", stripped):
            flush_para()
            m2 = re.match(r"^(?::::sim\s+|\[\[sim:)([\w-]+)\s*(\{.*\})?\s*(?:\]\])?$", stripped)
            if not m2:
                raise MdError(f"Bad sim block: {stripped}")
            name, opts = m2.group(1), m2.group(2) or "{}"
            try:
                json.loads(opts)
            except Exception as e:
                raise MdError(f"Bad sim options JSON for {name}: {e}")
            i += 1
            if stripped.startswith(":::"):
                while i < len(lines) and lines[i].strip() != ":::":
                    i += 1
                i += 1
            out.append(f'<div class="sim" data-sim="{name}" data-opts=\'{_html.escape(opts, quote=True)}\'></div>')
            continue

        hm = re.match(r"^(#{1,4})\s+(.*)$", stripped)
        if hm:
            flush_para()
            level = min(4, len(hm.group(1)) + 1)
            out.append(f"<h{level}>{inline(hm.group(2))}</h{level}>")
            i += 1
            continue

        if re.match(r"^(-{3,}|\*{3,})$", stripped):
            flush_para()
            out.append("<hr>")
            i += 1
            continue

        if stripped.startswith(">"):
            flush_para()
            block = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                block.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            cm = re.match(r"^\[!(\w+)\]\s*(.*)$", block[0].strip())
            if cm and cm.group(1).lower() in CALLOUTS:
                kind = cm.group(1).lower()
                label, icon = CALLOUTS[kind]
                title = cm.group(2).strip() or label
                inner = render("\n".join(block[1:]), _depth + 1)
                out.append(f'<div class="callout callout-{kind}"><div class="callout-title">{_icon(icon)}<span>{inline(title, greek_say=False)}</span></div>{inner}</div>')
            else:
                out.append(f"<blockquote>{render(chr(10).join(block), _depth + 1)}</blockquote>")
            continue

        if "|" in stripped and i + 1 < len(lines) and re.match(r"^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$", lines[i + 1]):
            flush_para()
            tbl = [lines[i], lines[i + 1]]
            i += 2
            while i < len(lines) and "|" in lines[i] and lines[i].strip():
                tbl.append(lines[i])
                i += 1
            out.append(_table(tbl))
            continue

        if LIST_RE.match(line):
            flush_para()
            block = []
            while i < len(lines):
                ln = lines[i]
                if not ln.strip():
                    # a blank line ends the list unless the next line continues it
                    if i + 1 < len(lines) and (LIST_RE.match(lines[i + 1]) or lines[i + 1].startswith("  ")):
                        i += 1
                        continue
                    break
                if LIST_RE.match(ln) or (block and ln.startswith((" ", "\t"))):
                    block.append(ln)
                    i += 1
                else:
                    break
            out.append(_list(block))
            continue

        para.append(line)
        i += 1

    flush_para()
    return "".join(out)


def cloze(text):
    """{{answer|alt}} blanks → (html, blanks)."""
    blanks = []

    def rep(m):
        opts = [o.strip() for o in m.group(1).split("|") if o.strip()]
        blanks.append(opts)
        return f"\x01{len(blanks) - 1}\x01"

    t = re.sub(r"\{\{(.+?)\}\}", rep, text)
    html_ = inline(t, greek_say=False)
    html_ = re.sub(r"\x01(\d+)\x01", lambda m: f'<span data-blank="{m.group(1)}"></span>', html_)
    return html_, blanks


if __name__ == "__main__":
    demo = """Het lidwoord **τον** blijft *altijd* met ν. Zie $a^2+b^2=c^2$ en `x = 1`.

> [!rule] De ν-regel
> - τον: altijd
> - τη(ν): alleen voor klinker of κ, π, τ

| Geslacht | Nominatief | Accusatief |
|---|:---:|---:|
| m | ο φίλος | τον φίλο |

$$\\text{softmax}(z)_i = \\frac{e^{z_i}}{\\sum_j e^{z_j}}$$

```solidity Bank.sol
function deposit() external payable { balances[msg.sender] += msg.value; }
```

1. een
2. twee
   - genest
"""
    print(render(demo))
    print(MATH)
    print(cloze("Θα ήθελα {{έναν}} καφέ, {{παρακαλώ|παρακαλω}}."))
