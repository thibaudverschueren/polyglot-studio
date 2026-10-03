"""radar_sources.py — fetches candidates and source texts for 'Onder de motorkap'. Stdlib only.

Everything fetched here is untrusted data: it is only ever handed to the model as source text, and the
article validator (radar.py) only accepts links and quotes that come from these sources.
"""
import datetime as dt
import email.utils
import gzip
import os
import html as _html
import json
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

UA = "PolyglotStudio/1.0 (personal learning app; +https://thibaudverschueren.github.io/polyglot-studio/)"
ATOM = "{http://www.w3.org/2005/Atom}"


_LAST = {}
SPACING = {"export.arxiv.org": 3.2, "arxiv.org": 1.2, "en.wikipedia.org": 0.3}  # seconds between two calls to the same host


def get(url, timeout=25, limit=4_000_000, raw=False, accept="*/*"):
    host = urllib.parse.urlparse(url).hostname or ""
    for attempt in range(4):
        wait = SPACING.get(host, 0) - (time.time() - _LAST.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        _LAST[host] = time.time()
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:  # follows redirects
                data = r.read(limit)
                charset = r.headers.get_content_charset() or "utf-8"
                if r.headers.get("Content-Encoding") == "gzip" or data[:2] == b"\x1f\x8b":
                    data = gzip.decompress(data)
            return data if raw else data.decode(charset, "replace")
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt < 3:  # rate limited: wait as asked, then try again
                ra = e.headers.get("Retry-After", "")
                time.sleep(min(float(ra) if ra.isdigit() else 6 * 3 ** attempt, 60))
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt < 2:
                time.sleep(3)
                continue
            raise


def get_json(url, **kw):
    return json.loads(get(url, accept="application/json", **kw))


def clean(s, n=None):
    s = _html.unescape(re.sub(r"<[^>]+>", " ", s or ""))
    s = re.sub(r"\s+", " ", s).strip()
    return s[:n] if n else s


# ---------------------------------------------------------------- readable text from HTML
class _Text(HTMLParser):
    SKIP = {"script", "style", "nav", "footer", "header", "aside", "form", "noscript", "svg", "button", "select"}
    BLOCK = {"p", "li", "pre", "blockquote", "tr", "figcaption", "dt", "dd", "table", "section", "div", "br", "caption"}
    HEAD = {"h1", "h2", "h3", "h4", "h5"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip, self.math = [], 0, 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip += 1
        elif tag == "math":
            alt = dict(attrs).get("alttext")
            if alt and not self.skip and not self.math:
                self.out.append(f" ${alt.strip()}$ ")
            self.math += 1
        elif tag in self.HEAD:
            self.out.append("\n\n## ")
        elif tag in self.BLOCK or tag in ("td", "th"):
            self.out.append("\n" if tag not in ("td", "th") else " | ")

    def handle_endtag(self, tag):
        if tag in self.SKIP:
            self.skip = max(0, self.skip - 1)
        elif tag == "math":
            self.math = max(0, self.math - 1)
        elif tag in self.HEAD or tag in self.BLOCK:
            self.out.append("\n")

    def handle_data(self, data):
        if not self.skip and not self.math:
            self.out.append(data)


def html_text(html, limit=60000):
    m = re.search(r"<article\b.*</article>", html, re.S | re.I)
    if m and len(m.group(0)) > 3000:
        html = m.group(0)
    p = _Text()
    p.feed(html)
    p.close()
    t = "".join(p.out)
    t = re.sub(r"[ \t \r]+", " ", t)
    t = re.sub(r" *\n *", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()[:limit]


def page_text(url, limit=60000):
    return html_text(get(url), limit)


# ---------------------------------------------------------------- arXiv
def arxiv_id(s):
    m = re.search(r"(\d{4}\.\d{4,5})", s or "")
    return m.group(1) if m else None


def _arxiv_parse(xml_bytes):
    root = ET.fromstring(xml_bytes)
    out = []
    for e in root.findall(ATOM + "entry"):
        aid = arxiv_id(e.findtext(ATOM + "id") or "")
        if not aid:
            continue
        out.append({"id": aid, "title": clean(e.findtext(ATOM + "title")), "summary": clean(e.findtext(ATOM + "summary")),
                    "published": (e.findtext(ATOM + "published") or "")[:10],
                    "authors": [a.findtext(ATOM + "name") for a in e.findall(ATOM + "author")]})
    return out


def arxiv_query(q, n=10, sort="submittedDate"):
    url = "https://export.arxiv.org/api/query?" + urllib.parse.urlencode({"search_query": q, "sortBy": sort, "sortOrder": "descending", "max_results": n})
    return _arxiv_parse(get(url, raw=True))


def arxiv_meta(aid):
    rows = _arxiv_parse(get("https://export.arxiv.org/api/query?" + urllib.parse.urlencode({"id_list": aid, "max_results": 1}), raw=True))
    return rows[0] if rows else None


def pdf_text(aid, limit=70000):
    """Text of an arXiv paper from its PDF (for papers without an HTML version). pdftotext first, pypdf as fallback."""
    import shutil
    import subprocess
    import tempfile
    data = get(f"https://arxiv.org/pdf/{aid}", raw=True, limit=25_000_000, timeout=90)
    if data[:4] != b"%PDF":
        return ""
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        f.write(data)
        f.flush()
        text = ""
        exe = shutil.which("pdftotext") or "/opt/homebrew/bin/pdftotext"
        if os.path.exists(exe):
            r = subprocess.run([exe, "-enc", "UTF-8", "-nopgbrk", f.name, "-"], capture_output=True, text=True, timeout=120)
            text = r.stdout if r.returncode == 0 else ""
        if len(text) < 3000:
            try:
                import pypdf
                text = "\n".join((pg.extract_text() or "") for pg in pypdf.PdfReader(f.name).pages)
            except Exception:
                pass
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)  # hyphenated line breaks
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()[:limit]


def arxiv_source(aid, limit=70000):
    """Full text of an arXiv paper: the HTML version, else the PDF; only the abstract when neither exists (full=False)."""
    meta = arxiv_meta(aid) or {"title": aid, "summary": "", "authors": [], "published": ""}
    body = ""
    try:
        body = page_text(f"https://arxiv.org/html/{aid}", limit)
    except Exception:
        body = ""
    if len(body) < 3000:
        try:
            body = pdf_text(aid, limit)
        except Exception:
            body = ""
    full = len(body) >= 3000
    if not full:
        body = "(Volledige tekst niet beschikbaar; alleen de samenvatting.)"
    authors = ", ".join(meta["authors"][:12]) + (" e.a." if len(meta["authors"]) > 12 else "")
    text = f"{meta['title']}\n{authors} ({meta['published']})\n\nAbstract: {meta['summary']}\n\n{body}"
    return {"title": f"{meta['title']} (arXiv {aid})", "url": f"https://arxiv.org/abs/{aid}", "kind": "paper", "text": text[:limit], "full": full}


# ---------------------------------------------------------------- candidates
def hf_daily(days=3):
    """Hugging Face Daily Papers: the papers the community upvotes most (signal for 'everyone talks about it')."""
    best = {}
    for d in range(days):
        day = (dt.date.today() - dt.timedelta(days=d)).isoformat()
        try:
            rows = get_json(f"https://huggingface.co/api/daily_papers?date={day}&limit=100")
        except Exception:
            continue
        for r in rows:
            p = r.get("paper") or {}
            aid = arxiv_id(p.get("id", ""))
            up = int(p.get("upvotes") or 0)
            if not aid or (aid in best and best[aid]["score"] >= up):
                continue
            best[aid] = {"cid": f"arxiv:{aid}", "kind": "paper", "source": "Hugging Face Daily Papers", "title": clean(p.get("title") or r.get("title")),
                         "summary": clean(p.get("summary") or r.get("summary"), 700), "url": f"https://arxiv.org/abs/{aid}", "score": up,
                         "signal": f"{up} upvotes op Hugging Face Daily Papers", "date": (p.get("publishedAt") or "")[:10]}
    return list(best.values())


def arxiv_recent(categories, n=40):
    q = " OR ".join(f"cat:{c}" for c in categories)
    return [{"cid": f"arxiv:{x['id']}", "kind": "paper", "source": "arXiv", "title": x["title"], "summary": x["summary"][:700],
             "url": f"https://arxiv.org/abs/{x['id']}", "score": 0, "signal": "nieuw op arXiv", "date": x["published"]} for x in arxiv_query(q, n)]


def hn_top(hours=36, min_points=200, n=60):
    since = int(time.time() - hours * 3600)
    url = "https://hn.algolia.com/api/v1/search?" + urllib.parse.urlencode({"tags": "story", "numericFilters": f"created_at_i>{since},points>{min_points}", "hitsPerPage": n})
    out = []
    for h in get_json(url).get("hits", []):
        hid = h.get("objectID")
        out.append({"cid": f"hn:{hid}", "kind": "news", "source": "Hacker News", "title": clean(h.get("title")), "summary": "",
                    "url": h.get("url") or f"https://news.ycombinator.com/item?id={hid}", "score": int(h.get("points") or 0),
                    "signal": f"{h.get('points', 0)} punten en {h.get('num_comments', 0)} reacties op Hacker News", "date": (h.get("created_at") or "")[:10]})
    return out


def _date(s):
    if not s:
        return None
    try:
        return email.utils.parsedate_to_datetime(s).date()
    except Exception:
        pass
    try:
        return dt.date.fromisoformat(s[:10])
    except Exception:
        return None


def feed(url, name, topic, days=4, n=15):
    """RSS 2.0 or Atom → candidates from the last `days` days."""
    try:
        root = ET.fromstring(get(url, raw=True))
    except ET.ParseError:  # feeds occasionally hiccup: one retry
        time.sleep(2)
        root = ET.fromstring(get(url, raw=True))
    rows = []
    for it in root.iter("item"):
        rows.append((it.findtext("title"), it.findtext("link"), it.findtext("description"), it.findtext("pubDate")))
    for e in root.iter(ATOM + "entry"):
        link = next((l.get("href") for l in e.findall(ATOM + "link") if l.get("rel") in (None, "alternate")), None)
        rows.append((e.findtext(ATOM + "title"), link, e.findtext(ATOM + "summary") or e.findtext(ATOM + "content"),
                     e.findtext(ATOM + "published") or e.findtext(ATOM + "updated")))
    cutoff = dt.date.today() - dt.timedelta(days=days)
    out = []
    for title, link, desc, date in rows:
        d = _date(date)
        if not link or not title or (d and d < cutoff):
            continue
        out.append({"cid": f"url:{link.strip()}", "kind": "news", "source": name, "topic": topic, "title": clean(title), "summary": clean(desc, 500),
                    "url": link.strip(), "score": 0, "signal": f"officieel bericht van {name}", "date": d.isoformat() if d else ""})
        if len(out) >= n:
            break
    return out


# ---------------------------------------------------------------- background & search
def wiki(title, limit=25000, lang="en"):
    url = f"https://{lang}.wikipedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "prop": "extracts", "explaintext": 1, "redirects": 1, "titles": title, "format": "json"})
    pages = get_json(url).get("query", {}).get("pages", {})
    p = next(iter(pages.values()), {})
    if not p or "missing" in p or not p.get("extract"):
        return None
    t = p["title"]
    return {"title": f"Wikipedia — {t}", "url": f"https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(t.replace(' ', '_'))}", "kind": "reference", "text": p["extract"][:limit]}


def wiki_search(q, n=3, lang="en"):
    url = f"https://{lang}.wikipedia.org/w/api.php?" + urllib.parse.urlencode({"action": "query", "list": "search", "srsearch": q, "srlimit": n, "format": "json"})
    return [x["title"] for x in get_json(url).get("query", {}).get("search", [])]


def hn_search(q, n=4, min_points=80):
    url = "https://hn.algolia.com/api/v1/search?" + urllib.parse.urlencode({"query": q, "tags": "story", "numericFilters": f"points>{min_points}", "hitsPerPage": n})
    return [{"title": clean(h.get("title")), "url": h.get("url"), "points": h.get("points", 0)} for h in get_json(url).get("hits", []) if h.get("url")]
