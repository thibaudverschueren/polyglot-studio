"""
abbr.py — abbreviations in lessons are spelled out in parentheses where the learner first meets them.

The reader is a first-year business-engineering master: fluent in economics, statistics and management,
not necessarily in networking, ML or blockchain jargon. So the first time an abbreviation appears in the
running text of a lesson (summary → objectives → diagnostic → sections → practice → mastery → cards →
production; titles, subtitles and headings are labels and do not count) it must be followed by its full name:

    LPM (Longest Prefix Match)        KV-cache (KV = key-value)

Dictionary: studio/content/abbreviations.json
  terms    abbreviation → full name (string, or [name, other spellings that also count as 'explained'])
  common   known to the reader, never needs an explanation (KPI, CEO, GB …)
  ignore   uppercase words that are not abbreviations (NIET, NOTE, GET …)
  tracks   per-track overrides: {"routing": {"terms": {"L2": "…"}, "ignore": ["…"]}}

  python3 abbr.py                  report: missing explanations + unknown abbreviations
  python3 abbr.py --fix            write the explanations into the lesson files
  python3 abbr.py --diff           show every planned insertion without writing
  python3 abbr.py routing/03       limit to a lesson / a track
"""
import copy
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(os.path.dirname(HERE), "content")
DICT_PATH = os.path.join(CONTENT, "abbreviations.json")

FENCE = re.compile(r"```.*?```", re.S)
SIM = re.compile(r":::sim[^\n]*(?:\n.*?\n:::)?", re.S)
INLINE_CODE = re.compile(r"`[^`\n]*`")
DISPLAY_MATH = re.compile(r"\$\$.*?\$\$", re.S)
INLINE_MATH = re.compile(r"(?<![\\$\w])\$(?=\S)[^$\n]+?(?<=\S)\$(?![\d$])")
IMG = re.compile(r"!\[[^\]]*\]\([^)]*\)")
LINK_URL = re.compile(r"(?<=\])\([^)\s]*\)")
URL = re.compile(r"https?://[^\s)\]]+")
CHIP = re.compile(r"\[\[(?:el|fr|es|say)[:|][^\]]+\]\]")
HTML_TAG = re.compile(r"</?[a-zA-Z][^>]*>")
CLOZE_HOLE = re.compile(r"\{\{.*?\}\}")
HEADING = re.compile(r"^[ \t]*#{1,6}[ \t].*$", re.M)
CALLOUT_TAG = re.compile(r"^>\s*\[![a-z]+\]", re.M)
PROTECTED = (FENCE, SIM, INLINE_CODE, DISPLAY_MATH, INLINE_MATH, IMG, LINK_URL, URL, CHIP, HTML_TAG, CLOZE_HOLE, CALLOUT_TAG)

EXPLAINERS = re.compile(r"afkorting|afgekort|staat voor|stands for|oftewel|ofwel|kortweg|genaamd", re.I)
# shapes that look like an abbreviation but are not in the dictionary: ALL-CAPS ≥3 letters, or mixed-case acronyms
CANDIDATE = re.compile(r"(?<![\w/@.#'’-])([A-Z][A-Z0-9]{2,}|[A-Z][a-z]?[A-Z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*|[a-z]{1,2}[A-Z]{2,}[A-Za-z0-9]*)(?![\w])")
SUFFIX = r"(?:-[A-Za-z0-9][A-Za-z0-9]*)*"
PLURAL = r"(?:['’]?s)?"


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


class Dictionary:
    def __init__(self, path=DICT_PATH):
        raw = json.load(open(path, encoding="utf-8"))
        self.raw = raw
        self.ignore = set(raw.get("ignore", []))
        self.common = set(raw.get("common", []))
        self.terms = {k: (v if isinstance(v, list) else [v]) for k, v in raw.get("terms", {}).items()}
        self.tracks = raw.get("tracks", {})
        self._cache = {}

    def for_track(self, track):
        """(terms, skip-set, regex) for one track, with its overrides applied."""
        if track in self._cache:
            return self._cache[track]
        t = dict(self.terms)
        skip = set(self.ignore) | set(self.common)
        o = self.tracks.get(track, {})
        for k, v in o.get("terms", {}).items():
            t[k] = v if isinstance(v, list) else [v]
        for k in o.get("ignore", []):
            t.pop(k, None)
            skip.add(k)
        keys = sorted(t, key=len, reverse=True)
        rx = re.compile(r"(?<![\w'’])(" + "|".join(re.escape(k) for k in keys) + r")(" + SUFFIX + r")" + PLURAL + r"(?![\w])")
        self._cache[track] = (t, skip, rx)
        return self._cache[track]


def protected_spans(text):
    spans = []
    for rx in PROTECTED:
        spans.extend((m.start(), m.end()) for m in rx.finditer(text))
    return spans


def heading_spans(text):
    return [(m.start(), m.end()) for m in HEADING.finditer(text)]


ABBR_WORD = re.compile(r"(?:^|[\s(/*_])((?:[A-Z][A-Z0-9]+|[A-Za-z]*[A-Z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)(?:[-/][A-Za-z0-9]+)*(?:['’]s)?)$")


def in_expansion(text, pos, terms):
    """True when pos lies inside the '( … )' that explains the abbreviation just before it (ours or the author's:
    'PMTUD (Path MTU Discovery)', 'JSON-RPC (JSON-RPC = remote procedure call …)'). Words in there are no first use."""
    line_start = text.rfind("\n", 0, pos) + 1
    depth = 0
    i = pos - 1
    while i >= line_start:
        c = text[i]
        if c == ")":
            depth += 1
        elif c == "(":
            if depth == 0:
                w = ABBR_WORD.search(text[line_start:i].rstrip(" *_"))
                if not w:
                    return False
                d2, close = 0, len(text)
                for j in range(i + 1, len(text)):  # the matching ')' (our own text may nest parentheses)
                    if text[j] == "(":
                        d2 += 1
                    elif text[j] == ")":
                        if d2 == 0:
                            close = j
                            break
                        d2 -= 1
                inner = text[i + 1: close]
                word = w.group(1)
                if any(inner.lstrip("*_ ").startswith(x + " = ") for x in (word, word.split("/")[-1])):
                    return True
                for part in reversed(w.group(1).split("/")):
                    k = _key_of(part, terms)
                    if k:
                        return any(norm(n.split(",")[0]) and norm(n.split(",")[0]) in norm(inner) for n in terms[k])
                return False
            depth -= 1
        i -= 1
    return False


def inside(pos, end, spans):
    return any(a <= pos and end <= b or a < end and pos < b for a, b in spans)


# ------------------------------------------------------------------ the lesson's running text, in reading order
ITEM_TEXT_FIELDS = ("prompt", "explain", "hint")


def _item_fields(item, path):
    for k in ITEM_TEXT_FIELDS:
        if isinstance(item.get(k), str):
            yield path + (k,), item[k]
    if item.get("type") == "cloze" and isinstance(item.get("text"), str):
        yield path + ("text",), item["text"]


def running_text(d):
    """(path, text) in the order the learner meets them; titles, subtitles and headings are left out on purpose."""
    if isinstance(d.get("summary"), str):
        yield ("summary",), d["summary"]
    for i, o in enumerate(d.get("objectives", [])):
        if isinstance(o, dict) and isinstance(o.get("text"), str):
            yield ("objectives", i, "text"), o["text"]
    diag = d.get("diagnostic")
    if isinstance(diag, dict):
        if isinstance(diag.get("intro"), str):
            yield ("diagnostic", "intro"), diag["intro"]
        for i, it in enumerate(diag.get("items", [])):
            yield from _item_fields(it, ("diagnostic", "items", i))
    for si, s in enumerate(d.get("sections", [])):
        if isinstance(s.get("md"), str):
            yield ("sections", si, "md"), s["md"]
        for ci, c in enumerate(s.get("checks", [])):
            yield from _item_fields(c, ("sections", si, "checks", ci))
    for part in ("practice", "mastery"):
        for i, it in enumerate(d.get(part, [])):
            yield from _item_fields(it, (part, i))
    for i, c in enumerate(d.get("cards", [])):
        for k in ("front", "back"):
            if isinstance(c.get(k), str):
                yield ("cards", i, k), c[k]
    p = d.get("production")
    if isinstance(p, dict):
        for k in ("prompt", "model"):
            if isinstance(p.get(k), str):
                yield ("production", k), p[k]


def get_path(d, path):
    for k in path:
        d = d[k]
    return d


def set_path(d, path, value):
    for k in path[:-1]:
        d = d[k]
    d[path[-1]] = value


# ------------------------------------------------------------------ is it explained already?
def explained(text, start, end, key, names):
    """True when the abbreviation at text[start:end] is (or is about to be) spelled out right there."""
    window = norm(text[max(0, start - 140): end + 140])
    if any(norm(n.split(",")[0]) and norm(n.split(",")[0]) in window for n in names):
        return True
    near = text[max(0, start - 100): end + 100]
    if EXPLAINERS.search(near):
        return True
    after = text[end:end + 400]
    m = re.match(r"[*_~=]*\s*\(([^()\n]{4,}(?:\([^()\n]*\)[^()\n]*)*)\)", after)
    if m:  # KEY (Something Written Out)
        inner = m.group(1)
        if not re.fullmatch(r"[\d\s.,%€$/+-]*", inner) and (" " in inner or inner[:1].isupper() or len(inner) > 12):
            return True
    before = text[max(0, start - 100):start]
    if re.search(r"[A-Za-zÀ-ÿ][^()\n]{3,}\(\s*[*_]*$", before) and re.match(r"[*_]*\s*[),;:–-]", after):
        return True  # Some Written Out Name (KEY)
    return False


def _close_markup(text, pos, line_start):
    """Move the insertion point past closing **/*/_ when the abbreviation sits inside an emphasised span."""
    line = text[line_start:pos]
    rest = text[pos:]
    m = re.match(r"[A-Za-z0-9'’-]{0,24}(\*\*|__|~~|==|\*|_)", rest)
    if m:
        mark = m.group(1)
        if line.count(mark) % 2 == 1:
            return pos + m.end()
    return pos


def _compound(text, start, end):
    """The slash-compound the match belongs to (TCP/UDP, RIB/FIB …) as (start, end), else None."""
    a, b = start, end
    while a > 1 and text[a - 1] == "/" and re.match(r"[A-Za-z0-9]", text[a - 2]):
        a -= 1
        while a > 0 and re.match(r"[A-Za-z0-9]", text[a - 1]):
            a -= 1
    while b < len(text) - 1 and text[b] == "/" and re.match(r"[A-Za-z0-9]", text[b + 1]):
        b += 1
        while b < len(text) and re.match(r"[A-Za-z0-9]", text[b]):
            b += 1
    return (a, b) if (a, b) != (start, end) else None


NUMBERED = {"RFC", "IEEE"}  # RFC 1918, IEEE 802.3: the explanation goes behind the number


def _key_of(part, terms):
    """Dictionary key a slash-part stands for (UDP-verkeer → UDP, ACKs → ACK), else None."""
    for k in sorted(terms, key=len, reverse=True):
        if part == k or part.startswith(k + "-") or (part.startswith(k) and re.fullmatch(r"['’]?s", part[len(k):])):
            return k
    return None


def _name(terms, key, short):
    n = terms[key][0]
    return n.split(",")[0] if short else n


def analyse(d, dic, track=None):
    """Planned insertions and unknown abbreviations for one lesson.

    Returns (fixes, unknown): fixes = [{path, pos, ins, key, context}], unknown = {token: (path, context)}.
    """
    track = track or d.get("track")
    terms, skip, rx = dic.for_track(track)
    seen = set()
    fixes = []
    unknown = {}
    for path, text in running_text(d):
        short = path[0] in ("summary", "objectives")  # a lede stays light: full name without the Dutch gloss
        prot = protected_spans(text)
        heads = heading_spans(text)
        known_spans = []
        done = set()
        for m in rx.finditer(text):
            key = m.group(1)
            s, e = m.start(), m.end()
            if inside(s, e, prot) or inside(s, e, heads) or in_expansion(text, s, terms):
                continue
            known_spans.append((s, e))
            comp = _compound(text, s, e) if "/" not in key else None
            if comp:
                if comp in done:
                    continue
                done.add(comp)
                known_spans.append(comp)
                keys = [_key_of(p, terms) for p in text[comp[0]:comp[1]].split("/")]
                keys = [k for k in keys if k]
                s, e = comp
            else:
                keys = [key]
            need = [k for k in dict.fromkeys(keys) if k not in seen]
            seen.update(keys)
            if "/" in key:  # an explicit slash-entry (TCP/IP) also covers its parts
                seen.update(k for k in (_key_of(p, terms) for p in key.split("/")) if k)
            if not need:
                continue
            names = [n for k in need for n in terms[k]]
            if all(explained(text, s, e, k, terms[k]) for k in need):
                continue
            end_pos = e
            suffix = "" if comp or "/" in key else m.group(2)
            body_eq = bool(suffix) and len(suffix) > 3 and not re.fullmatch(r"-[\d.]+[a-z]?", suffix)
            if key in NUMBERED and (n := re.match(r"\s+\d[\d.]*", text[end_pos:])):
                end_pos += n.end()
            elif text[end_pos:end_pos + 1] == "=" and (v := re.match(r"=[^\s,;)\]]+", text[end_pos:])):
                end_pos += v.end()
                body_eq = True
            line_start = text.rfind("\n", 0, s) + 1
            pos = _close_markup(text, end_pos, line_start)
            if len(need) == 1:
                body = f"{need[0]} = {_name(terms, need[0], short)}" if body_eq or (comp and len(keys) > 1) else _name(terms, need[0], short)
            elif len(need) == len(keys):
                body = " / ".join(_name(terms, k, short) for k in need)
            else:
                body = "; ".join(f"{k} = {_name(terms, k, short)}" for k in need)
            ins, at = f" ({body})", pos
            if len(need) == 1 and text[s - 1:s] == "(" and text[end_pos:end_pos + 1] == ")" and not comp:
                ins, at = f" = {_name(terms, need[0], short)}", end_pos  # the abbreviation is already between parentheses
            fixes.append({"path": path, "pos": at, "ins": ins, "key": "/".join(need), "context": text[max(0, s - 45): e + 45].replace("\n", " ")})
        for m in CANDIDATE.finditer(text):
            tok = m.group(1)
            if inside(m.start(), m.end(), prot) or inside(m.start(), m.end(), heads) or inside(m.start(), m.end(), known_spans) or in_expansion(text, m.start(), terms):
                continue
            base = tok[:-1] if tok.endswith("s") else tok
            if tok in terms or tok in skip or base in terms or base in skip or tok in unknown:
                continue
            unknown[tok] = (path, text[max(0, m.start() - 45): m.end() + 45].replace("\n", " "))
    return fixes, unknown


def apply_fixes(d, fixes):
    """Insert the explanations (later positions first, so earlier ones stay valid); returns a new lesson."""
    out = copy.deepcopy(d)
    by_path = {}
    for f in fixes:
        by_path.setdefault(tuple(f["path"]), []).append(f)
    for path, fs in by_path.items():
        text = get_path(out, path)
        for f in sorted(fs, key=lambda f: -f["pos"]):
            text = text[:f["pos"]] + f["ins"] + text[f["pos"]:]
        set_path(out, path, text)
    return out


def fix_lesson(d, dic=None):
    """Spell out the dictionary abbreviations at first use. Returns (lesson, number of insertions)."""
    dic = dic or Dictionary()
    fixes, _ = analyse(d, dic)
    return (apply_fixes(d, fixes), len(fixes)) if fixes else (d, 0)


def lint(d, dic=None):
    """Messages for validate.py: (warnings). Dictionary abbreviations are fixable automatically, unknown ones are not."""
    dic = dic or Dictionary()
    fixes, unknown = analyse(d, dic)
    msgs = [f"afkorting {f['key']} niet uitgelegd bij eerste gebruik ({'.'.join(map(str, f['path']))}): …{f['context']}…" for f in fixes]
    msgs += [f"onbekende afkorting {t} ({'.'.join(map(str, p))}): schrijf ze voluit of voeg ze toe aan content/abbreviations.json — …{c}…" for t, (p, c) in sorted(unknown.items())]
    return msgs


# ------------------------------------------------------------------ CLI
def main(argv):
    dic = Dictionary()
    write = "--fix" in argv
    show = "--diff" in argv or not write
    sel = [a for a in argv if not a.startswith("--")]
    files = sorted(glob.glob(os.path.join(CONTENT, "lessons", "*", "*.json")))
    total = 0
    unknown_all = {}
    for f in files:
        tag = os.path.relpath(f, os.path.join(CONTENT, "lessons")).replace(".json", "")
        if sel and not any(tag.startswith(s) for s in sel):
            continue
        raw = open(f, encoding="utf-8").read()
        d = json.loads(raw)
        fixes, unknown = analyse(d, dic)
        for t, (p, c) in unknown.items():
            unknown_all.setdefault(t, []).append((tag, p, c))
        if not fixes:
            continue
        total += len(fixes)
        if show:
            print(f"\n== {tag}  ({len(fixes)})")
            for x in fixes:
                print(f"   {x['key']:14} {'.'.join(map(str, x['path'])):26} …{x['context']}…  +{x['ins']}")
        if write:
            new = apply_fixes(d, fixes)
            with open(f, "w", encoding="utf-8") as fh:  # same layout as the other tools write (indent 1)
                fh.write(json.dumps(new, ensure_ascii=False, indent=1) + ("\n" if raw.endswith("\n") else ""))
    print(f"\n{total} explanation(s) {'written' if write else 'planned'}.")
    if unknown_all and not write:
        print(f"{len(unknown_all)} unknown abbreviation(s):")
        for t, locs in sorted(unknown_all.items(), key=lambda kv: -len(kv[1])):
            tag, p, c = locs[0]
            print(f"   {t:16} x{len(locs):<3} {tag} …{c}…")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
