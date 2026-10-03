#!/usr/bin/env python3
"""radar.py — 'Onder de motorkap': explainers of breakthroughs, papers, classics and Thibaud's own questions.

Every morning (called by daily.py, after the lessons):
  1. open questions: from the app (synced progress state) and studio/content/radar/requests.json
  2. candidates: Hugging Face Daily Papers, arXiv, Hacker News and official feeds (radar_sources.py)
  3. triage (fast model): 0–2 picks that are genuinely significant and match the interests
  4. per task: this script fetches the sources → the author model writes → the article is validated
     (quotes and links must come from the sources, markdown/KaTeX must render, quiz items must be valid)
     → up to 2 repair rounds → studio/content/radar/items/<id>.json
  5. no question and nothing significant → the next classic from canon.json

Antigravity never gets tools or internet here: it only sees the sources this script fetched.

  python3 radar.py --dry-run               # questions, candidates and what would happen (no model calls)
  python3 radar.py --triage                # also run the triage (fast model), write nothing
  python3 radar.py                         # full run (as in the morning)
  python3 radar.py --ask "Hoe werkt …?"    # queue a question in requests.json
  python3 radar.py --classic attention     # write one classic now
  python3 radar.py --only-questions        # answer the open questions, no news triage
  python3 radar.py --backfill [N]          # fact-check N hidden (never verified) articles
"""
import datetime as dt
import json
import math
import os
import re
import sys
import time
import unicodedata
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
STUDIO = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import antigravity as ag  # noqa: E402
import radar_sources as rs  # noqa: E402
import tracks as trk  # noqa: E402
from validate import check_item, schema_errors  # noqa: E402

RADAR = os.path.join(STUDIO, "content", "radar")
ITEMS = os.path.join(RADAR, "items")
PROMPTS = os.path.join(STUDIO, "prompts")
TOPICS = ("ai", "chips", "crypto", "systems", "automation")
TRACKS = tuple(trk.ids())
QUIZ_TYPES = {"mcq", "multi", "type", "numeric", "order"}
KIND_LABEL = {"news": "Doorbraak", "paper": "Paper", "classic": "Klassieker", "request": "Op jouw vraag"}


def load(path, default):
    try:
        return json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError):
        return default


def slug(s, n=48):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:n].strip("-") or "artikel"


def articles():
    out = []
    for f in sorted(os.listdir(ITEMS)) if os.path.isdir(ITEMS) else []:
        if f.endswith(".json"):
            A = load(os.path.join(ITEMS, f), None)
            if A:
                out.append(A)
    return out


# ------------------------------------------------------------------ what Thibaud asked and liked (app state)
def app_prefs(states):
    likes, reads, reqs = {}, {}, {}
    for s in states or []:
        r = (s or {}).get("radar") or {}
        for k, v in (r.get("likes") or {}).items():
            if isinstance(v, dict) and (k not in likes or v.get("at", 0) > likes[k].get("at", 0)):
                likes[k] = v
        for k, v in (r.get("read") or {}).items():
            reads[k] = min(v, reads.get(k, v))
        for q in r.get("requests") or []:
            if isinstance(q, dict) and q.get("id") and q.get("text"):
                cur = reqs.setdefault(q["id"], dict(q))
                if q.get("cancelled"):
                    cur["cancelled"] = q["cancelled"]
    return {"likes": {k: v.get("v", 0) for k, v in likes.items()}, "reads": reads, "requests": list(reqs.values())}


def open_requests(prefs, arts):
    done = {(A.get("meta") or {}).get("request") for A in arts}
    repo = load(os.path.join(RADAR, "requests.json"), [])
    out = [q for q in repo + prefs["requests"] if q.get("id") not in done and not q.get("cancelled")]
    seen, uniq = set(), []
    def at(q):  # app questions carry epoch ms, requests.json an ISO date
        v = q.get("at")
        if isinstance(v, (int, float)):
            return float(v)
        try:
            return dt.datetime.fromisoformat(str(v)).timestamp() * 1000
        except ValueError:
            return 0.0
    for q in sorted(out, key=at):
        if q["id"] not in seen:
            seen.add(q["id"])
            uniq.append(q)
    return uniq


# ------------------------------------------------------------------ candidates + triage
def gather_candidates(interests, log=print):
    cands, errors = [], []
    jobs = [("Hugging Face", lambda: rs.hf_daily(3)),
            ("arXiv", lambda: rs.arxiv_recent(interests.get("arxiv", []), 40)),
            ("Hacker News", lambda: rs.hn_top(36, int(interests.get("hn_min_points", 200))))]
    jobs += [(f["name"], (lambda f=f: rs.feed(f["url"], f["name"], f.get("topic"), days=4))) for f in interests.get("feeds", [])]
    for name, job in jobs:
        try:
            cands += job()
        except Exception as e:
            errors.append(f"{name}: {e}")
    uniq = {}
    for c in cands:
        key = c["cid"]
        if key not in uniq or c.get("score", 0) > uniq[key].get("score", 0):
            uniq[key] = c
    for c in uniq.values():  # which pond does it come from? (used for fair quotas in the triage)
        c["pond"] = c["source"] if c["source"] not in ("Hugging Face Daily Papers", "arXiv", "Hacker News") else c["source"].split()[0]
    if errors:
        log("    ⚠ bronnen: " + "; ".join(errors)[:300])
    return list(uniq.values())


def prescore(c, interests):
    text = f"{c['title']} {c.get('summary', '')}".lower()
    best = 0.0
    for t, spec in interests["topics"].items():
        hits = sum(1 for k in spec["keywords"] if k.lower() in text)
        best = max(best, hits * spec.get("weight", 1))
    return best + math.log1p(c.get("score", 0)) + (1.5 if c.get("signal", "").startswith("officieel") else 0)


def fair_top(cands, interests, n):
    """Best candidates per source first (so 100 papers cannot crowd out chip, crypto or systems news), then the rest by score."""
    ponds = {}
    for c in cands:
        ponds.setdefault(c["pond"], []).append(c)
    quota = {"Hugging": 28, "arXiv": 14, "Hacker": 20}
    chosen, seen = [], set()
    for pond, items in ponds.items():
        for c in sorted(items, key=lambda c: -prescore(c, interests))[:quota.get(pond, 6)]:
            chosen.append(c)
            seen.add(c["cid"])
    rest = sorted((c for c in cands if c["cid"] not in seen), key=lambda c: -prescore(c, interests))
    return (chosen + rest)[:n]


def triage(cands, interests, prefs, arts, cfg, max_picks, log=print):
    covered = {(A.get("meta") or {}).get("candidate") for A in arts}
    cands = [c for c in cands if c["cid"] not in covered]
    if not cands or max_picks <= 0:
        return [], "geen kandidaten"
    top = fair_top(cands, interests, 90)
    liked = [A["title"] for A in arts if prefs["likes"].get(A["id"]) == 1][-8:]
    disliked = [A["title"] for A in arts if prefs["likes"].get(A["id"]) == -1][-8:]
    recent = [f"{A.get('topic')}: {A['title']}" for A in sorted(arts, key=lambda a: a.get("date", ""))[-6:]]
    lines = [f"- `{c['cid']}` · {c['source']} · {c.get('date', '')} · {c.get('signal', '')}\n  **{c['title']}** — {c.get('summary', '')[:300]}" for c in top]
    prompt = (ag.read(os.path.join(PROMPTS, "RADAR_TRIAGE.md"))
              + "\n\n---\n\n## Interesses (gewicht)\n" + "\n".join(f"- `{t}` {s['label']} ({s['weight']}): {', '.join(s['keywords'])}" for t, s in interests["topics"].items())
              + "\n\n## Vond hij goed\n" + ("\n".join(f"- {x}" for x in liked) or "- (nog niets)")
              + "\n\n## Vond hij minder\n" + ("\n".join(f"- {x}" for x in disliked) or "- (nog niets)")
              + "\n\n## Eerder behandeld\n" + ("\n".join(f"- {A['title']}" for A in arts[-60:]) or "- (nog niets)")
              + "\n\n## De laatste artikels (onderwerp: titel)\n" + ("\n".join(f"- {x}" for x in recent) or "- (nog niets)")
              + f"\n\n## Spreiding\n{interests.get('diversity', '')}"
              + f"\n\n## Kandidaten ({len(top)})\n" + "\n".join(lines)
              + f"\n\nKies er maximaal {max_picks}.")
    out = ag.run_agy(prompt, cfg, model=cfg.get("AGY_MODEL_COACH", "gemini-3.8-flash-high"), timeout=600, log=log)
    try:
        R = ag.extract_json(out)
    except Exception as e:
        log(f"    ✗ triage gaf geen geldige JSON: {e}")
        return [], "triage mislukt"
    by = {c["cid"]: c for c in top}
    picks = []
    for p in R.get("picks") or []:
        c = by.get(p.get("candidate"))
        try:
            sig = int(p.get("significance", 0))
        except (TypeError, ValueError):
            sig = 0
        if c and sig >= 4 and p.get("topic") in TOPICS:
            picks.append(dict(p, significance=sig, cand=c))
    return picks[:max_picks], R.get("note", "")


# ------------------------------------------------------------------ sources per task
def _add(srcs, s, limit):
    if s and s.get("text") and all(x["url"] != s["url"] for x in srcs):
        s = dict(s, text=s["text"][:limit])
        s["n"] = len(srcs) + 1
        srcs.append(s)


def _wiki(title, srcs, limit=18000):
    try:
        w = rs.wiki(title)
        if not w:
            hits = rs.wiki_search(title, 1)
            w = rs.wiki(hits[0]) if hits else None
        _add(srcs, w, limit)
    except Exception:
        pass


def sources_for_pick(p):
    c, srcs = p["cand"], []
    aid = rs.arxiv_id(c["url"]) if "arxiv.org" in c["url"] or c["cid"].startswith("arxiv:") else None
    if aid:
        src = rs.arxiv_source(aid)
        if not src.get("full"):  # an article written from an abstract alone can only guess the details
            raise RuntimeError("volledige tekst van de paper niet beschikbaar (alleen de samenvatting): overgeslagen")
        _add(srcs, src, 70000)
    else:
        text = rs.page_text(c["url"], 45000)
        if len(text) < 1200:
            raise RuntimeError("te weinig tekst op de bronpagina")
        _add(srcs, {"title": c["title"], "url": c["url"], "kind": "article", "text": text}, 45000)
    for t in (p.get("background") or [])[:3]:
        _wiki(t, srcs)
    return srcs


def sources_for_classic(e):
    srcs = []
    if e.get("arxiv"):
        _add(srcs, rs.arxiv_source(e["arxiv"]), 70000)
    for u in e.get("urls", []):
        try:
            _add(srcs, {"title": e["title"], "url": u, "kind": "article", "text": rs.page_text(u, 45000)}, 45000)
        except Exception:
            pass
    for t in e.get("wiki", []):
        _wiki(t, srcs, 22000)
    return srcs


def plan_request(q, cfg, log=print):
    prompt = (ag.read(os.path.join(PROMPTS, "RADAR_PLANNER.md")) + f"\n\n---\n\nVandaag is het {dt.date.today().isoformat()}. "
              "Opvolgers van genummerde reeksen (bv. na \"Apple M4\" ook M5, M6) zoekt de pipeline zelf op.\n\n"
              f"## Vraag van Thibaud\n{q['text']}")
    out = ag.run_agy(prompt, cfg, model=cfg.get("AGY_MODEL_COACH", "gemini-3.8-flash-high"), timeout=600, log=log)
    P = ag.extract_json(out)
    return {"topic": P.get("topic") if P.get("topic") in TOPICS else "systems", "angle": P.get("angle", ""),
            "wikipedia": [str(x) for x in P.get("wikipedia") or []][:5], "arxiv": [str(x) for x in P.get("arxiv") or []][:2],
            "news": [str(x) for x in P.get("news") or []][:2]}


def _successors(title, limit=3):
    """'Apple M4' → the pages of Apple M5, M6 … that exist (models do not know what came after their training)."""
    m = re.match(r"^(.*?\D)(\d+)$", title.strip())
    out = []
    if m:
        for k in range(int(m.group(2)) + 1, int(m.group(2)) + 1 + limit):
            name = f"{m.group(1)}{k}"
            try:
                w = rs.wiki(name)
            except Exception:
                w = None
            if not w or w["title"] != f"Wikipedia — {name}":  # a redirect to something else is not a successor
                break
            out.append(w)
    return out


def sources_for_request(plan):
    srcs = []
    for t in plan["wikipedia"]:
        _wiki(t, srcs, 20000)
    series = [t for t in plan["wikipedia"] if re.search(r"\D\d+$", t)]
    if series:  # newest members of a numbered series first get a place in the source list
        for w in _successors(max(series, key=lambda t: int(re.search(r"(\d+)$", t).group(1))), 3):
            _add(srcs, w, 20000)
    for q in plan["arxiv"]:
        try:
            hits = rs.arxiv_query(f"all:{q}", 2, sort="relevance")
            if hits:
                _add(srcs, rs.arxiv_source(hits[0]["id"], 40000), 40000)
        except Exception:
            pass
    for q in plan["news"]:
        try:
            for h in rs.hn_search(q, 3)[:1]:
                _add(srcs, {"title": h["title"], "url": h["url"], "kind": "article", "text": rs.page_text(h["url"], 30000)}, 30000)
        except Exception:
            pass
    return srcs[:8]


# ------------------------------------------------------------------ validation
def _norm(s):
    s = unicodedata.normalize("NFKC", s or "").lower()
    for a, b in (("’", "'"), ("‘", "'"), ("“", '"'), ("”", '"'), ("–", "-"), ("—", "-"), ("−", "-"), (" ", " ")):
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s).strip()


def _loose(s):
    """Like _norm, but blind to LaTeX markup: arXiv sources say `$512$ weakest … $79.8\\%$`, a reader (and the model) writes `512 weakest … 79.8%`."""
    s = _norm(s).replace("\\%", "%").replace("\\,", " ").replace("\\ ", " ").replace("\\;", " ").replace("~", " ")
    s = re.sub(r"[$\\{}]", "", s)
    s = re.sub(r"\s+([,.;:%)])", r"\1", s)       # "79.8 %" and "512 ." (LaTeX spacing) read the same as "79.8%" and "512."
    return re.sub(r"\s+", " ", s).strip()


def _grounded(quote, corpus):
    frags = [f.strip(" \"'.,;:") for f in re.split(r"\.\.\.|…", _loose(quote))]
    frags = [f for f in frags if len(f) >= 12] or [_loose(quote).strip(" \"'.,;:")]
    return all(f in corpus for f in frags)


HYPE_ALWAYS = ["revolutionair", "geniaal", "geniale", "magisch", "gamechanger", "game changer", "ijzeren wet", "verbrijzel", "keihard", "keiharde",
               "krachtpatser", "spectaculair", "pertinent", "buitengewoon", "ultieme"]
HYPE_SOFT = ["uiterst", "razendsnel", "indrukwekkend", "overtuigend", "absoluut", "doorbreekt", "doorbraak", "bewijst", "bewezen", "elegant",
             "drastisch", "extreem", "enorm", "fundamenteel", "ongelooflijk", "briljant", "verbluffend"]


def style_problems(A):
    """Deterministic style rules (hype words, sentence length) → quality points for the repair round."""
    parts = [A.get("title", ""), A.get("subtitle", ""), A.get("plain", ""), A.get("why", ""), A.get("caveats", "")] + list(A.get("tldr") or []) \
        + [x.get("md", "") for x in A.get("sections") or [] if isinstance(x, dict)]
    text = " ".join(p for p in parts if isinstance(p, str)).lower()
    out = []
    always = sorted({w for w in HYPE_ALWAYS if w in text})
    if always:
        out.append(f"hypewoorden: {', '.join(always)} — schrijf neutraal en laat de cijfers spreken")
    soft = {w: len(re.findall(rf"\b{re.escape(w)}", text)) for w in HYPE_SOFT}
    soft = {w: n for w, n in soft.items() if n}
    if sum(soft.values()) >= 3:
        out.append(f"te veel versterkers/overdrijving ({', '.join(f'{w} ×{n}' for w, n in sorted(soft.items(), key=lambda x: -x[1])[:6])}) — gebruik toont/meet/suggereert in plaats van bewijst; schrap bijvoeglijke naamwoorden zonder cijfer")
    for i, t in enumerate(A.get("tldr") or []):
        n = len(str(t).split())
        if n > 26:
            out.append(f"tldr[{i}] telt {n} woorden (maximum 22): splits of vereenvoudig, in gewone taal")
    if len(str(A.get("why", "")).split()) > 130:
        out.append("why is te lang (maximum 90 woorden)")
    return out


UNITS = {  # unit in the article → how sources may write it
    "x": r"(?:x|×|times|-fold|fold|keer)", "×": r"(?:x|×|times|-fold|fold|keer)", "keer": r"(?:x|×|times|-fold|fold|keer)",
    "%": r"(?:%|percent|procent)", "procent": r"(?:%|percent|procent)",
    "miljard": r"(?:billion|miljard|bn|b\b)", "miljoen": r"(?:million|miljoen|m\b)",
    "gb/s": r"gb/s", "tb/s": r"tb/s", "gb": r"(?:gb|gigabyte)", "tb": r"(?:tb|terabyte)", "mb": r"(?:mb|megabyte)", "kb": r"(?:kb|kilobyte)",
    "nm": r"(?:nm|nanometer)", "ghz": r"ghz", "mhz": r"mhz", "w": r"(?:w|watt)", "watt": r"(?:w|watt)",
    "tops": r"tops", "tflops": r"tflops", "kernen": r"(?:cores?|kernen)", "cores": r"(?:cores?|kernen)", "core": r"(?:cores?|kernen)",
    "transistors": r"transistors?",
}
QTY = re.compile(r"(\d+(?:[.,]\d+)?)\s?(x|×|keer|%|procent|miljard|miljoen|gb/s|tb/s|gb|tb|mb|kb|nm|ghz|mhz|watt|w|tops|tflops|kernen|cores|core|transistors)(?![a-z])", re.I)


def ungrounded_quantities(A, corpus):
    """Numbers with a unit in the prose ('9x', '800 GB/s', '16 miljard') must occur in the sources."""
    text = " ".join([A.get("title", ""), A.get("subtitle", ""), A.get("why", ""), A.get("caveats", "")] + list(A.get("tldr") or [])
                    + [f"{x.get('title', '')} {x.get('md', '')}" for x in A.get("sections") or [] if isinstance(x, dict)])
    missing = []
    for m in QTY.finditer(text):
        num = re.escape(m.group(1)).replace(r"\,", "[.,]").replace(r"\.", "[.,]").replace(",", "[.,]")
        unit = UNITS.get(m.group(2).lower(), re.escape(m.group(2).lower()))
        if not re.search(rf"(?<![\d.,]){num}\s?-?{unit}", corpus):
            missing.append(m.group(0))
    return sorted(set(missing))[:8]


def _urls(text):
    return re.findall(r"https?://[^\s)\]>\"']+", text or "")


def validate_article(A, srcs, item_schema, schema):
    errs, warns = [], []
    allowed = {s["url"].rstrip("/") for s in srcs}
    corpus = _loose(" ".join(s["text"] for s in srcs))
    for k in ("title", "subtitle", "why", "caveats"):
        if not isinstance(A.get(k), str) or not A[k].strip():
            errs.append(f"'{k}' ontbreekt")
    if A.get("topic") not in TOPICS:
        errs.append(f"topic moet een van {TOPICS} zijn")
    if not isinstance(A.get("minutes"), int) or not 3 <= A["minutes"] <= 25:
        errs.append("minutes moet een geheel getal van 3 tot 25 zijn")
    tl = A.get("tldr")
    if not isinstance(tl, list) or not 3 <= len(tl) <= 5 or any(not isinstance(x, str) or not 20 <= len(x) <= 320 for x in tl):
        errs.append("tldr: 3–5 zinnen van 20–320 tekens")
    secs = A.get("sections")
    if not isinstance(secs, list) or not 3 <= len(secs) <= 7:
        errs.append("sections: 3–7 blokken")
        secs = []
    for i, s in enumerate(secs):
        if not isinstance(s, dict) or not s.get("title") or len(s.get("md", "")) < 250:
            errs.append(f"sections[{i}]: title + md van minstens 250 tekens")
    plain = A.get("plain")
    if not isinstance(plain, str) or not 50 <= len(plain.split()) <= 230:
        errs.append("plain: ‘In gewone woorden’ ontbreekt of is niet 80–160 woorden")
    elif "$" in plain:
        errs.append("plain: geen formules in ‘In gewone woorden’")
    words = len(re.findall(r"\w+", " ".join([A.get("why", ""), A.get("caveats", ""), plain if isinstance(plain, str) else ""] + [s.get("md", "") for s in secs if isinstance(s, dict)])))
    if words < 700:
        errs.append(f"te kort: {words} woorden in plain + why + sections + caveats (minstens 900)")
    elif words > 3200:
        errs.append(f"te lang: {words} woorden (maximaal 2200)")
    for i, n in enumerate(A.get("numbers") or []):
        if not isinstance(n, dict) or not all(isinstance(n.get(k), str) and n[k].strip() for k in ("value", "label", "quote")):
            errs.append(f"numbers[{i}]: value, label en quote zijn verplicht")
            continue
        if len(n["quote"]) > 300:
            errs.append(f"numbers[{i}]: citaat te lang (max. 250 tekens)")
        if not _grounded(n["quote"], corpus):
            errs.append(f"numbers[{i}]: citaat staat niet letterlijk in de bronnen: \"{n['quote'][:120]}\" — kopieer exact of laat dit cijfer weg")
        for d in re.findall(r"\d+(?:[.,]\d+)?", n["value"]):
            if d not in n["quote"] and d.replace(",", ".") not in n["quote"] and d.replace(".", ",") not in n["quote"]:
                errs.append(f"numbers[{i}]: het getal {d} uit value staat niet in het citaat")
                break
        if n.get("source") not in {s["n"] for s in srcs}:
            errs.append(f"numbers[{i}]: source moet een bronnummer zijn")
    gl = A.get("glossary")
    if not isinstance(gl, list) or not 3 <= len(gl) <= 12 or any(not isinstance(g, dict) or not g.get("term") or not g.get("def") for g in gl):
        errs.append("glossary: 3–12 begrippen met term en def")
    quiz = A.get("quiz")
    if not isinstance(quiz, list) or not 2 <= len(quiz) <= 4:
        errs.append("quiz: 3 vragen")
        quiz = []
    for i, it in enumerate(quiz):
        if not isinstance(it, dict):
            errs.append(f"quiz[{i}]: moet een object zijn")
            continue
        if it.get("type") not in QUIZ_TYPES:
            errs.append(f"quiz[{i}]: type moet een van {sorted(QUIZ_TYPES)} zijn")
            continue
        it.setdefault("skill", "begrip")
        it.setdefault("id", f"q{i + 1}")
        se = schema_errors(it, item_schema, schema, f"$.quiz[{i}]")
        if se:
            errs += se
            continue
        check_item(it, "quiz", {"begrip", it.get("skill")}, "radar", errs, warns)
    sources = A.get("sources")
    if not isinstance(sources, list) or not sources:
        errs.append("sources: minstens één bron")
        sources = []
    for s in sources:
        if not isinstance(s, dict) or (s.get("url") or "").rstrip("/") not in allowed:
            errs.append(f"sources: {str(s.get('url') if isinstance(s, dict) else s)[:90]} komt niet uit de aangeleverde bronnen")
    body = " ".join([A.get("why", ""), A.get("caveats", "")] + [s.get("md", "") for s in secs if isinstance(s, dict)])
    for u in _urls(body):
        if not any(u.rstrip("/.,").startswith(a) for a in allowed):
            errs.append(f"link naar {u[:90]} komt niet uit de bronnen")
    for r in A.get("related") or []:
        if not isinstance(r, dict) or r.get("track") not in TRACKS:
            errs.append(f"related: track moet een van {TRACKS} zijn")
    if not errs:
        import build
        errs += ag.render_math_errors(build.render_radar, A)
    for w in style_problems(A):
        warns.append(w)
    for q in ungrounded_quantities(A, corpus):
        warns.append(f"cijfer zonder bron: “{q}” staat niet in de bronnen — zet het met een letterlijk citaat in numbers, vermeld de juiste waarde uit de bron, of laat het weg")
    return errs, warns


# ------------------------------------------------------------------ writing
def _prompt(task, srcs, prefs, arts):
    head = ag.read(os.path.join(PROMPTS, "RADAR_EXPLAINER.md"))
    kind = task["kind"]
    if kind == "request":
        brief = f"Thibaud vroeg: “{task['request']['text']}”\n\nBeantwoord die vraag grondig en in lagen. Invalshoek: {task.get('angle', '')}"
    elif kind == "classic":
        e = task["canon"]
        brief = (f"Dit is een **klassieker**: *{e['title']}* ({e['by']}, {e['year']}). Invalshoek: {e['angle']}\n\n"
                 "Leg uit welk probleem ze oploste, het kernidee, hoe het werkt (met de kernformules of het schema) en wat er sindsdien mee gebeurde. "
                 "Dat laatste mag uit algemene kennis, maar zet het in een apart blok ‘Sindsdien’ en noem geen specifieke cijfers die niet in de bronnen staan.")
    else:
        c = task["cand"]
        brief = (f"Dit is **{'een nieuwe paper' if kind == 'paper' else 'nieuws'}** van de voorbije dagen ({c['source']}, {c.get('date', '')}; signaal: {c.get('signal', '')}).\n"
                 f"Invalshoek: {task.get('angle', '')}\nWaarom het ertoe doet: {task.get('reason', '')}\n\n"
                 "Leg uit wat er precies nieuw is, hoe het werkt en hoe het zich verhoudt tot wat er al bestond.")
    liked = [A["title"] for A in arts if prefs["likes"].get(A["id"]) == 1][-6:]
    good = [A for A in arts if prefs["likes"].get(A["id"]) == 1] or arts
    example = ""
    if good:  # style example: a liked (or the newest) article, without its quiz and sources
        ex = {k: v for k, v in good[-1].items() if k in ("title", "subtitle", "topic", "minutes", "tldr", "why", "sections", "numbers", "caveats", "glossary")}
        example = f"## Voorbeeld van een goed artikel (stijl, diepgang en opbouw — niet de inhoud)\n```json\n{json.dumps(ex, ensure_ascii=False)[:24000]}\n```"
    parts = [head, "---", f"# Opdracht ({KIND_LABEL[kind]})\n\n{brief}", example,
             "## Wat hij eerder goed vond\n" + ("\n".join(f"- {t}" for t in liked) or "- (nog niets)"),
             "## Bronnen (alleen deze mag je gebruiken en linken)"]
    for s in srcs:
        parts.append(f"### [{s['n']}] {s['title']}\nURL: {s['url']}\nSoort: {s['kind']}\n<<<\n{s['text']}\n>>>")
    return "\n\n".join(p for p in parts if p)


def _repair(base, problems, A, intro):
    return (base + f"\n\n## {intro}\n" + "\n".join(f"- {e}" for e in problems[:30])
            + f"\n\nVorige versie:\n```json\n{json.dumps(A, ensure_ascii=False)}\n```\n\nLever het **volledige** gecorrigeerde artikel; pas alleen aan wat hierboven staat en behoud al het overige.")


CHECK_FAILED = "de factcheck kon niet uitgevoerd worden"  # Antigravity itself failed: says nothing about the article


def review(A, srcs, cfg, log=print):
    """Second opinion: a fact-checker compares the article (incl. quiz) with its sources.
    Returns [(blocking, text), …] (empty = nothing found), or None when the check itself failed."""
    prompt = (ag.read(os.path.join(PROMPTS, "RADAR_REVIEW.md")) + "\n\n---\n\n## Artikel\n```json\n"
              + json.dumps({k: v for k, v in A.items() if k not in ("schema", "id", "kind", "date", "meta")}, ensure_ascii=False) + "\n```\n\n## Bronnen\n"
              + "\n\n".join(f"### [{x['n']}] {x['title']}\nURL: {x['url']}\n<<<\n{x['text']}\n>>>" for x in srcs))
    for attempt in (1, 2):
        out = ag.run_agy(prompt, cfg, model=cfg.get("AGY_MODEL_COACH", "gemini-3.8-flash-high"), timeout=600, log=log)
        try:
            issues = ag.extract_json(out).get("issues")
            if isinstance(issues, list):
                res = []
                for i in issues:
                    if isinstance(i, dict) and i.get("problem"):
                        blocking = str(i.get("severity", "fout")).lower().startswith("fout")  # unknown severity counts as blocking
                        res.append((blocking, f"{i.get('where', '?')}: {i.get('problem', '')} → {i.get('fix', '')}"))
                return sorted(res, key=lambda x: not x[0])[:8]
        except Exception:
            pass
        log(f"    ⚠ factcheck gaf geen bruikbaar antwoord (poging {attempt})")
    return None


def verify(A, srcs, base, cfg, schema, item_schema, log=print, rounds=4):
    """Fact-check loop: review → repair → review … An article is returned only when no *blocking* finding (a factual error,
    a fabricated or out-of-context number/quote, an unsourced specific claim) remains; nuances are repaired but never block.
    If the check cannot run, or errors remain after the last round, nothing is returned: better no article than a wrong one."""
    author = cfg.get("AGY_MODEL_AUTHOR", "gemini-3.1-pro-high")
    cur, last = A, []
    for rnd in range(1, rounds + 1):
        found = review(cur, srcs, cfg, log)
        if found is None:
            return None, [CHECK_FAILED]
        blocking = [t for b, t in found if b]
        if not blocking:
            log(f"    ✓ factcheck{'' if rnd == 1 else f' (ronde {rnd})'}: geen fouten" + (f" ({len(found)} nuance(s) niet-blokkerend)" if found else ""))
            return cur, []
        last = blocking
        log(f"    factcheck ronde {rnd}: {len(blocking)} fout(en), {len(found) - len(blocking)} nuance(s): {[t[:140] for t in blocking[:2]]}")
        if rnd == rounds:
            break
        issues = [("[FOUT] " if b else "[nuance] ") + t for b, t in found]
        fixed = None
        for attempt in (1, 2):
            out = ag.run_agy(_repair(base, issues, cur, "Een factchecker legde je artikel naast de bronnen en vond deze punten ([FOUT] moet hersteld; [nuance] verbeter je waar het kan)"), cfg, model=author, log=log)
            try:
                B = ag._coerce(ag.extract_json(out))
                errs, _ = validate_article(B, srcs, item_schema, schema)
            except Exception as e:
                errs = [f"geen geldig JSON-antwoord: {e}"]
            if not errs:
                fixed = B
                break
            log(f"    ⚠ verbeterde versie ongeldig (poging {attempt}): {errs[:2]}")
            issues = issues + [f"[FOUT] (validatie van je vorige verbetering) {e}" for e in errs[:6]]
        if fixed is None:
            break
        cur = fixed
    return None, last


def write(task, srcs, prefs, arts, cfg, today, log=print):
    schema = json.load(open(os.path.join(STUDIO, "schema", "lesson.schema.json"), encoding="utf-8"))
    item_schema = schema["$defs"]["item"]
    author = cfg.get("AGY_MODEL_AUTHOR", "gemini-3.1-pro-high")
    base = _prompt(task, srcs, prefs, arts)
    prompt, last, good = base, None, None
    attempts = int(cfg.get("AGY_ATTEMPTS", 3))
    for attempt in range(1, attempts + 1):
        log(f"  → {KIND_LABEL[task['kind']].lower()}: {task['label'][:70]} (poging {attempt})")
        out = ag.run_agy(prompt, cfg, model=author, log=log)
        try:
            A = ag._coerce(ag.extract_json(out))
        except Exception as e:
            log(f"    ✗ geen geldige JSON: {e}")
            prompt = base + "\n\n## Vorige poging mislukte\nJe antwoord bevatte geen geldige JSON. Antwoord met één volledig JSON-object in een ```json-codeblok."
            continue
        errs, warns = validate_article(A, srcs, item_schema, schema)
        if not errs and (not warns or attempt == attempts):
            good = A
            break
        last = A
        problems = errs + [f"(kwaliteit) {w}" for w in warns]
        log(f"    ✗ {len(errs)} fout(en), {len(warns)} kwaliteitspunt(en): {problems[:3]}")
        prompt = _repair(base, problems, A, "Je vorige versie had problemen — herstel ze allemaal")
    if good is None:
        if last is not None:
            d = os.path.expanduser("~/scripts/polyglot-data/failed")
            os.makedirs(d, exist_ok=True)
            json.dump(last, open(os.path.join(d, f"{today}-radar-{slug(task['label'], 30)}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        return None
    if cfg.get("RADAR_REVIEW", "1") != "1":
        return good  # not verified: stays hidden (build only shows meta.verified articles)
    checked, issues = verify(good, srcs, base, cfg, schema, item_schema, log)
    if checked is not None:
        checked["_verified"] = True
        return checked
    d = os.path.expanduser("~/scripts/polyglot-data/failed")  # unresolved findings: keep the draft, publish nothing
    os.makedirs(d, exist_ok=True)
    json.dump({"article": good, "factcheck": issues}, open(os.path.join(d, f"{today}-radar-unverified-{slug(task['label'], 30)}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    log("    ✗ factcheck-punten niet verwerkt: dit artikel wordt NIET gepubliceerd (concept bewaard)")
    return None


def save(A, task, srcs, today):
    base = f"{today}-{slug(A['title'])}"
    aid, k = base, 2
    while os.path.exists(os.path.join(ITEMS, f"{aid}.json")):
        aid, k = f"{base}-{k}", k + 1
    meta = {"author": "antigravity", "created": today, "kind": task["kind"]}
    if A.pop("_verified", False):
        meta["verified"] = today  # passed the full fact-check loop: only then does the app show it
    if task["kind"] == "request":
        meta["request"] = task["request"]["id"]
    elif task["kind"] == "classic":
        meta["canon"] = task["canon"]["id"]
    else:
        meta.update(candidate=task["cand"]["cid"], signal=task["cand"].get("signal", ""), significance=task.get("significance"))
    A = {"schema": "polyglot.radar/v1", **A, "id": aid, "kind": task["kind"], "date": today, "meta": meta}
    os.makedirs(ITEMS, exist_ok=True)
    json.dump(A, open(os.path.join(ITEMS, f"{aid}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    private = os.path.expanduser("~/scripts/polyglot-data/radar-sources")  # full source texts stay on this Mac
    os.makedirs(private, exist_ok=True)
    json.dump(srcs, open(os.path.join(private, f"{aid}.json"), "w", encoding="utf-8"), ensure_ascii=False)
    return A


# ------------------------------------------------------------------ the morning step
def plan(states, cfg, log=print, triage_now=True):
    interests = load(os.path.join(RADAR, "interests.json"), {"topics": {}})
    arts = articles()
    prefs = app_prefs(states)
    max_day = int(cfg.get("RADAR_MAX_PER_DAY", interests.get("max_per_day", 2)))
    tasks = [{"kind": "request", "request": q, "label": q["text"]} for q in open_requests(prefs, arts)][:max(1, max_day - 1)]  # always room for news
    note = ""
    cands = gather_candidates(interests, log)
    log(f"    {len(cands)} kandidaten · {len(open_requests(prefs, arts))} open vraag/vragen · {len(arts)} artikels")
    if triage_now:
        picks, note = triage(cands, interests, prefs, arts, cfg, max_day - len(tasks), log)
        tasks += [dict(p, kind=p["cand"]["kind"], label=p["cand"]["title"]) for p in picks]
    if not tasks:
        done = {(A.get("meta") or {}).get("canon") for A in arts}
        nxt = next((e for e in load(os.path.join(RADAR, "canon.json"), []) if e["id"] not in done), None)
        if nxt:
            tasks.append({"kind": "classic", "canon": nxt, "label": nxt["title"]})
    return tasks, note, prefs, arts


def run(states, cfg, today, log=print, budget_s=1500, dry=False, only=None, triage=True):
    t0 = time.time()
    if only:
        tasks, note, prefs, arts = only, "", app_prefs(states), articles()
    else:
        tasks, note, prefs, arts = plan(states, cfg, log, triage_now=triage and not dry)
    if note:
        log(f"    triage: {note[:200]}")
    for tk in tasks:
        log(f"    • {KIND_LABEL[tk['kind']]}: {tk['label'][:80]}")
    if dry:
        return []
    made = []
    for tk in tasks:
        if time.time() - t0 > budget_s:
            log(f"    ⏭ tijdsbudget op: {tk['label'][:60]} volgt morgen")
            continue
        try:
            if tk["kind"] == "request":
                p = plan_request(tk["request"], cfg, log)
                tk["angle"] = p["angle"]
                srcs = sources_for_request(p)
            elif tk["kind"] == "classic":
                srcs = sources_for_classic(tk["canon"])
            else:
                srcs = sources_for_pick(tk)
            if not srcs:
                log(f"    ✗ geen bronnen gevonden voor {tk['label'][:60]}")
                continue
            A = write(tk, srcs, prefs, arts, cfg, today, log)
            if A:
                A = save(A, tk, srcs, today)
                arts.append(A)
                made.append({"id": A["id"], "kind": A["kind"], "title": A["title"]})
                log(f"    ✓ {A['id']}")
        except Exception as e:
            log(f"    ✗ {tk['label'][:60]}: {e}")
    return made


def _sources_for_article(A):
    """Stored source texts when complete; otherwise fetch the article's own sources again (numbering is kept)."""
    stored = []
    p = os.path.expanduser(f"~/scripts/polyglot-data/radar-sources/{A['id']}.json")
    try:
        stored = json.load(open(p, encoding="utf-8"))
    except (OSError, ValueError):
        pass
    by_url = {s["url"].rstrip("/"): s for s in stored}
    srcs = []
    for s in A.get("sources") or []:
        url = s.get("url", "")
        have = by_url.get(url.rstrip("/"))
        if have and len(have.get("text", "")) > 3500 or (have and "wikipedia.org" in url):
            srcs.append(dict(have, n=s["n"]))
            continue
        try:  # full text was not available when the article was written (e.g. a brand-new arXiv paper): fetch it again
            aid = rs.arxiv_id(url) if "arxiv.org" in url else None
            if aid:
                x = rs.arxiv_source(aid)
            elif "wikipedia.org/wiki/" in url:
                x = rs.wiki(urllib.parse.unquote(url.rsplit("/wiki/", 1)[1]).replace("_", " "))
            else:
                x = {"title": s.get("title", url), "url": url, "kind": "article", "text": rs.page_text(url, 45000)}
        except Exception:
            x = have
        if x and x.get("text"):
            srcs.append(dict(x, n=s["n"], url=url))
    return srcs


def backfill(cfg, today, log=print, limit=2, budget_s=1800, on_done=None):
    """Articles that never passed the full fact-check loop stay hidden; verify (and repair) them, a few per morning.
    After 3 failed attempts an article is dropped (draft kept in ~/scripts/polyglot-data/failed)."""
    t0, done, outages = time.time(), [], 0
    schema = json.load(open(os.path.join(STUDIO, "schema", "lesson.schema.json"), encoding="utf-8"))
    for A in [a for a in articles() if not (a.get("meta") or {}).get("verified")][:limit]:
        if time.time() - t0 > budget_s:
            break
        path = os.path.join(ITEMS, f"{A['id']}.json")
        log(f"    ⟳ factcheck van bestaand artikel: {A['title'][:70]}")
        srcs = _sources_for_article(A)
        body = {k: v for k, v in A.items() if k not in ("schema", "id", "kind", "date", "meta")}
        meta = dict(A.get("meta") or {})
        want = {s.get("url", "").rstrip("/") for s in A.get("sources") or []}
        if len(srcs) < 1 or any(s.get("full") is False for s in srcs) or len(srcs) < len(want) - 1:
            # a source is gone (404) or only the abstract exists: it cannot be checked, but it is not ours to delete
            log("      een bron is niet meer beschikbaar: het artikel blijft verborgen tot er een werkende bron is")
            continue
        task = {"kind": A["kind"], "label": A["title"], "angle": A.get("subtitle", ""), "reason": "",
                "cand": {"cid": meta.get("candidate", ""), "title": A["title"], "source": "bron", "date": A.get("date", ""), "signal": meta.get("signal", ""), "url": srcs[0]["url"]},
                "request": next((q for q in load(os.path.join(RADAR, "requests.json"), []) if q.get("id") == meta.get("request")), {"id": meta.get("request"), "text": A["title"]}),
                "canon": next((c for c in load(os.path.join(RADAR, "canon.json"), []) if c["id"] == meta.get("canon")), {"id": "?", "title": A["title"], "by": "", "year": "", "angle": A.get("subtitle", "")})}
        base = _prompt(task, srcs, {"likes": {}}, [a for a in articles() if a["id"] != A["id"]])
        good, issues = verify(body, srcs, base, cfg, schema, schema["$defs"]["item"], log)
        if good is not None:
            meta["verified"] = today
            meta.pop("verify_attempts", None)
            B = {"schema": "polyglot.radar/v1", **good, "id": A["id"], "kind": A["kind"], "date": A["date"], "meta": meta}
            json.dump(B, open(path + ".tmp", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            os.replace(path + ".tmp", path)
            private = os.path.expanduser("~/scripts/polyglot-data/radar-sources")
            os.makedirs(private, exist_ok=True)
            json.dump(srcs, open(os.path.join(private, f"{A['id']}.json"), "w", encoding="utf-8"), ensure_ascii=False)
            done.append(A["id"])
            log(f"    ✓ gecontroleerd en zichtbaar: {A['id']}")
            if on_done:
                on_done(A["id"])
        elif issues == [CHECK_FAILED]:  # an outage of the model service says nothing about the article: no attempt counted
            outages += 1
            log("      factcheck viel uit (storing bij Antigravity?): geen poging geteld")
            if outages >= 2:
                log("    ⏸ twee storingen op rij: het herstel stopt tot de volgende run")
                break
        else:
            outages = 0
            meta["verify_attempts"] = int(meta.get("verify_attempts", 0)) + 1
            if meta["verify_attempts"] >= 3:
                d = os.path.expanduser("~/scripts/polyglot-data/failed")
                os.makedirs(d, exist_ok=True)
                json.dump({"article": A, "factcheck": issues}, open(os.path.join(d, f"{today}-radar-dropped-{A['id'][:40]}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
                os.remove(path)
                log(f"    ✗ na 3 pogingen nog niet schoon: artikel verwijderd (concept bewaard)")
            else:
                A2 = dict(A, meta=meta)
                json.dump(A2, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
                log(f"    ✗ nog niet schoon (poging {meta['verify_attempts']}/3); blijft verborgen")
    return done


def main(argv):
    from cloud import connect, load_env
    cfg = load_env()
    today = dt.date.today().isoformat()
    if "--ask" in argv:
        text = argv[argv.index("--ask") + 1].strip()
        path = os.path.join(RADAR, "requests.json")
        reqs = load(path, [])
        reqs.append({"id": f"rq-{int(time.time())}", "text": text, "at": today})
        json.dump(reqs, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"vraag bewaard: {text}")
        return 0
    states = []
    try:
        db = connect(cfg)
        if db.configured:
            states = [r["state"] for r in db.progress()]
    except Exception as e:
        print(f"⚠ database: {e}")
    if "--classic" in argv:
        cid = argv[argv.index("--classic") + 1]
        e = next((x for x in load(os.path.join(RADAR, "canon.json"), []) if x["id"] == cid), None)
        if not e:
            print(f"onbekende klassieker: {cid}")
            return 1
        run(states, cfg, today, only=[{"kind": "classic", "canon": e, "label": e["title"]}])
        return 0
    if "--backfill" in argv:
        n = argv[argv.index("--backfill") + 1] if len(argv) > argv.index("--backfill") + 1 and argv[argv.index("--backfill") + 1].isdigit() else "2"
        print("gecontroleerd:", backfill(cfg, today, limit=int(n)))
        return 0
    if "--triage" in argv:
        tasks, note, _, _ = plan(states, cfg, triage_now=True)
        print("triage:", note)
        for t in tasks:
            print(f"• {KIND_LABEL[t['kind']]}: {t['label']}" + (f" (significance {t.get('significance')}): {t.get('angle', '')}" if t.get("significance") else ""))
        return 0
    run(states, cfg, today, dry="--dry-run" in argv, triage="--only-questions" not in argv)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
