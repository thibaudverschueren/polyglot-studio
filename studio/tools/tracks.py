"""tracks.py — the single source of truth for the tracks: studio/content/tracks.json.

Adding a track = add it to tracks.json (+ syllabus, lessons and the colour tokens in styles.css, which
`python3 studio/tools/validate.py` checks). Nothing else in the tools has a hard-coded list any more:
build, learner model, morning run, reminders, validator and the Antigravity prompts all read it from here.
"""
import copy
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
STUDIO = os.path.dirname(HERE)
PATH = os.path.join(STUDIO, "content", "tracks.json")

_cache = {}


def load():
    """tracks.json as an ordered dict (file order = menu order). Re-read when the file changes."""
    mtime = os.path.getmtime(PATH)
    if _cache.get("mtime") != mtime:
        _cache["data"] = json.load(open(PATH, encoding="utf-8"))
        _cache["mtime"] = mtime
    return _cache["data"]


def ids():
    return list(load())


def get(t):
    return load().get(t) or {}


def short(t):
    """Short Dutch name used in logs and reminders (Grieks, Frans, Jev AI …)."""
    return get(t).get("short") or t


def prefix(t):
    """Reminder prefix: '<emoji> <short>' (emoji falls back to the glyph)."""
    g = get(t)
    return f"{g.get('emoji') or g.get('glyph') or '•'} {short(t)}"


def prompt_name(t):
    """Name of the subject in prompts for Antigravity."""
    g = get(t)
    return g.get("promptName") or g.get("title") or t


def pattern():
    """Regex alternation of all track ids: 'greek|french|…'."""
    return "|".join(re.escape(t) for t in ids())


def patch_schema(schema):
    """The lesson schema with the track list taken from tracks.json (the file's own enum may be stale)."""
    s = copy.deepcopy(schema)
    props = s.get("properties", {})
    if "track" in props:
        props["track"]["enum"] = ids()
    pre = props.get("prerequisites", {}).get("items")
    if pre and "pattern" in pre:
        pre["pattern"] = f"^({pattern()}):[0-9]+$"
    return s


def check_consistency():
    """Problems that would otherwise surface as a crash or an unstyled track later."""
    problems = []
    css = open(os.path.join(STUDIO, "app", "styles.css"), encoding="utf-8").read()
    for t, g in load().items():
        for k in ("title", "short", "glyph", "goal", "subtitle", "levels", "lang"):
            if not g.get(k):
                problems.append(f"tracks.json: '{t}' mist '{k}'")
        if not os.path.exists(os.path.join(STUDIO, "content", "syllabus", f"{t}.json")):
            problems.append(f"'{t}': studio/content/syllabus/{t}.json ontbreekt")
        for var in (f"--{t}:", f"--{t}-soft:", f"--{t}-ink:"):
            if var not in css:
                problems.append(f"styles.css: kleurvariabele {var} voor '{t}' ontbreekt (licht én donker)")
        if f'[data-track="{t}"]' not in css:
            problems.append(f"styles.css: regel [data-track=\"{t}\"] ontbreekt")
    return problems


def table_md():
    """Markdown rows (| `id` | goal | levels |) for the overview table in the prompts."""
    rows = []
    for t, g in load().items():
        goal = re.sub(r"^Doel:\s*", "", g.get("goal", "")).strip()
        rows.append(f"| `{t}` | {goal} | {g.get('levels', '')} |")
    return "\n".join(rows)
