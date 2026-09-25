#!/usr/bin/env python3
"""
build.py — assembles Polyglot Studio v2 into a single self-contained index.html
(+ sw.js for offline use). Zero runtime dependencies; KaTeX is rendered at build time.

  python3 studio/tools/build.py            # strict: any invalid lesson aborts the build
  python3 studio/tools/build.py --lenient  # skip invalid lessons (used by the daily orchestrator)
"""
import datetime
import glob
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
STUDIO = os.path.dirname(HERE)
REPO = os.path.dirname(STUDIO)
sys.path.insert(0, HERE)

import md  # noqa: E402
from validate import validate_lesson, validate_daily  # noqa: E402

CONTENT = os.path.join(STUDIO, "content")
APP = os.path.join(STUDIO, "app")
PROFILE = os.path.expanduser("~/scripts/student_profile.json")
NODE = shutil.which("node") or "/opt/homebrew/bin/node"
TRACKS = ["greek", "french", "solidity", "ai", "automation"]


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ------------------------------------------------------------------ rendering
def rich(s):
    """Block markdown when the text needs it, inline otherwise."""
    s = s or ""
    if "\n" in s.strip() or s.lstrip().startswith(("-", "|", ">", "```", "$$", "#", "1.")):
        return md.render(s)
    return md.inline(s)


def render_item(it):
    it = dict(it)
    for k in ("prompt", "explain", "model"):
        if isinstance(it.get(k), str):
            it[k] = rich(it[k])
    if isinstance(it.get("hint"), str):
        it["hint"] = md.inline(it["hint"])
    if "options" in it:
        it["options"] = [md.inline(o) for o in it["options"]]
    if "rubric" in it:
        it["rubric"] = [md.inline(r) for r in it["rubric"]]
    if "errors" in it:
        it["errors"] = [dict(e, feedback=md.inline(e["feedback"])) for e in it["errors"]]
    if it.get("type") == "cloze":
        it["html"], it["blanks"] = md.cloze(it["text"])
        del it["text"]
    return it


def render_lesson(L):
    R = dict(L)
    R["summary"] = md.inline(L.get("summary", ""))
    R["sections"] = []
    for s in L["sections"]:
        R["sections"].append({"id": s["id"], "title": s["title"], "html": md.render(s["md"]), "checks": [render_item(c) for c in s.get("checks", [])]})
    if L.get("diagnostic"):
        D = L["diagnostic"]
        R["diagnostic"] = {"intro": md.inline(D["intro"]), "bands": D["bands"], "items": [render_item(i) for i in D["items"]]}
    R["practice"] = [render_item(i) for i in L["practice"]]
    R["mastery"] = [render_item(i) for i in L["mastery"]]
    P = dict(L["production"])
    P["prompt"] = md.render(P["prompt"])
    P["model"] = md.render(P.get("model", ""))
    P["rubric"] = [md.inline(r) for r in P.get("rubric", [])]
    R["production"] = P
    R["cards"] = [dict(c, front=rich(c["front"]), back=rich(c["back"])) for c in L["cards"]]
    R.pop("meta", None)
    return R


def render_daily(D):
    R = dict(D)
    R["note"] = md.render(D.get("note", ""))
    R["feedback"] = [dict(f, html=md.render(f.get("md", ""))) for f in D.get("feedback", [])]
    for f in R["feedback"]:
        f.pop("md", None)
    R["drills"] = [dict(d, items=[render_item(i) for i in d.get("items", [])]) for d in D.get("drills", [])]
    return R


def render_math(obj):
    """Render all collected math with one KaTeX batch and substitute placeholders."""
    if not md.MATH:
        return obj, 0
    proc = subprocess.run([NODE, os.path.join(HERE, "katex_render.js")], input=json.dumps(md.MATH), capture_output=True, text=True, timeout=180)
    if proc.returncode != 0:
        raise SystemExit(f"KaTeX render failed: {proc.stderr[:800]}")
    out = json.loads(proc.stdout)
    errors = [(md.MATH[i][0], o["error"]) for i, o in enumerate(out) if "error" in o]
    if errors:
        msg = "\n".join(f"  {tex!r}: {err}" for tex, err in errors[:20])
        raise SystemExit(f"KaTeX errors:\n{msg}")
    htmls = [o["html"] for o in out]

    def sub(v):
        if isinstance(v, str):
            return re.sub(r"@@M(\d+)@@", lambda m: htmls[int(m.group(1))], v) if "@@M" in v else v
        if isinstance(v, list):
            return [sub(x) for x in v]
        if isinstance(v, dict):
            return {k: sub(x) for k, x in v.items()}
        return v

    return sub(obj), len(htmls)


# ------------------------------------------------------------------ build
def build(lenient=False, out_dir=REPO, today=None):
    schema = load(os.path.join(STUDIO, "schema", "lesson.schema.json"))
    tracks = load(os.path.join(CONTENT, "tracks.json"))
    syllabus = {}
    for t in TRACKS:
        p = os.path.join(CONTENT, "syllabus", f"{t}.json")
        if os.path.exists(p):
            syllabus[t] = load(p)

    lessons, problems = {}, []
    for t in TRACKS:
        for p in sorted(glob.glob(os.path.join(CONTENT, "lessons", t, "*.json"))):
            try:
                L = load(p)
            except Exception as e:
                problems.append(f"{p}: invalid JSON ({e})")
                continue
            errs, warns = validate_lesson(L, schema, p)
            if errs:
                problems.append(f"{os.path.relpath(p, STUDIO)}: " + "; ".join(errs[:6]))
                continue
            try:
                lessons[f"{t}:{L['id']}"] = render_lesson(L)
            except md.MdError as e:
                problems.append(f"{os.path.relpath(p, STUDIO)}: markdown: {e}")
    if problems:
        print("⚠️  Invalid content:\n  " + "\n  ".join(problems))
        if not lenient:
            raise SystemExit("Build aborted (use --lenient to skip invalid lessons).")

    today = today or datetime.date.today()
    daily = []
    for p in sorted(glob.glob(os.path.join(CONTENT, "daily", "*.json")))[-3:]:
        try:
            D = load(p)
            errs, _ = validate_daily(D)
            if errs:
                print(f"⚠️  daily {p}: {errs[:3]}")
                continue
            if (today - datetime.date.fromisoformat(D["date"])).days <= 3:
                daily.append(render_daily(D))
        except Exception as e:
            print(f"⚠️  daily {p}: {e}")

    for t in TRACKS:
        ids = sorted(int(k.split(":")[1]) for k in lessons if k.startswith(t + ":"))
        tracks[t]["lessons"] = ids

    profile = {"name": "Thibaud"}
    cloud_cfg = {}
    cp = os.path.join(STUDIO, "cloud", "config.json")
    if os.path.exists(cp):
        c = load(cp)
        if c.get("url") and c.get("anonKey"):
            cloud_cfg = {"url": c["url"], "anonKey": c["anonKey"], "auth": c.get("auth", "otp"), "label": c.get("label", ""),
                         "google": bool(c.get("google")), "apple": bool(c.get("apple"))}

    content = {"tracks": tracks, "syllabus": syllabus, "lessons": lessons, "daily": daily, "profile": profile, "cloud": cloud_cfg}
    content, n_math = render_math(content)

    css = open(os.path.join(APP, "styles.css"), encoding="utf-8").read()
    katex_css = open(os.path.join(HERE, "vendor", "katex.min.css"), encoding="utf-8").read()
    katex_css = re.sub(r"url\(fonts/([^)]+)\)", r"url(assets/katex/fonts/\1)", katex_css)
    katex_css = re.sub(r",url\(assets/katex/fonts/[^)]+\.(woff|ttf)\) format\(\"(woff|truetype)\"\)", "", katex_css)
    js_files = sorted(f for f in os.listdir(APP) if f.endswith(".js"))
    box = open(os.path.join(APP, "box", "n8n-box.src.js"), encoding="utf-8").read()
    js = f"window.PS = window.PS || {{}}; window.PS.BOX_N8N = {json.dumps(box)};\n" + "\n".join(open(os.path.join(APP, f), encoding="utf-8").read() for f in js_files)

    version = hashlib.sha256((css + js + json.dumps(content, ensure_ascii=False, sort_keys=True)).encode("utf-8")).hexdigest()[:10]
    content["version"] = version
    content["built"] = datetime.datetime.now().isoformat(timespec="seconds")
    prev = os.path.join(out_dir, "index.html")
    if os.path.exists(prev):  # same content → keep the old timestamp, so the output is identical (no empty daily commits)
        m = re.search(r'"version":"([0-9a-f]+)","built":"([^"]+)"', open(prev, encoding="utf-8").read())
        if m and m.group(1) == version:
            content["built"] = m.group(2)
    content_json = json.dumps(content, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

    theme_boot = """(function(){try{var t=JSON.parse(localStorage.getItem('polyglot_theme_v2')||'"auto"');if(t==='auto')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}})();"""
    page = f"""<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Polyglot Studio</title>
<meta name="description" content="Persoonlijke leerstudio: Nieuwgrieks, Frans C1–C2, Solidity en AI/LLM — met gespreide herhaling en meesterproeven.">
<meta name="theme-color" content="#f6f5f1">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Polyglot">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" href="icons/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="manifest.webmanifest">
<script>{theme_boot}</script>
<style>{katex_css}</style>
<style>{css}</style>
</head>
<body>
<div id="app"></div>
<noscript><p style="padding:24px">Polyglot Studio heeft JavaScript nodig.</p></noscript>
<script id="ps-content" type="application/json">{content_json}</script>
<script>
{js}
</script>
</body>
</html>
"""
    fonts = sorted(os.path.basename(f) for f in glob.glob(os.path.join(REPO, "assets", "katex", "fonts", "*.woff2")))
    sw = open(os.path.join(HERE, "sw.template.js"), encoding="utf-8").read()
    sw = sw.replace("__VERSION__", version).replace("__FONTS__", json.dumps([f"assets/katex/fonts/{f}" for f in fonts]))

    def write(path, data):
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(data)
        os.replace(tmp, path)

    os.makedirs(out_dir, exist_ok=True)
    write(os.path.join(out_dir, "index.html"), page)
    write(os.path.join(out_dir, "sw.js"), sw)
    write(os.path.join(out_dir, "manifest.webmanifest"), json.dumps({
        "name": "Polyglot Studio", "short_name": "Polyglot", "description": "Leren · oefenen · bewijzen · onthouden",
        "start_url": "./", "scope": "./", "display": "standalone", "background_color": "#f6f5f1", "theme_color": "#f6f5f1",
        "icons": [{"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}],
        "categories": ["education"]}, ensure_ascii=False, indent=2))
    worker = os.path.join(HERE, "solc-worker.js")
    if os.path.exists(worker):
        shutil.copy(worker, os.path.join(out_dir, "solc-worker.js"))
    size = os.path.getsize(os.path.join(out_dir, "index.html"))
    per = {t: len(tracks[t]["lessons"]) for t in TRACKS}
    print(f"✓ index.html {size / 1024:.0f} KB · version {version} · lessons {per} · {n_math} formulas · {len(daily)} daily pack(s)")
    return {"version": version, "lessons": per, "problems": problems, "size": size}


if __name__ == "__main__":
    out = REPO
    args = sys.argv[1:]
    if "--out" in args:
        out = args[args.index("--out") + 1]
    build(lenient="--lenient" in args, out_dir=out)
