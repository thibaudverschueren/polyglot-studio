"""antigravity.py — asks Antigravity (agy CLI, headless, no tools) to write, revise or coach,
then validates everything before a single byte reaches the repository.

Safety: agy runs without --dangerously-skip-permissions, so it cannot run commands or touch files.
It only returns text; this module parses, validates (schema, didactics, Greek accents, KaTeX, and it
executes every code exercise) and writes files itself. Invalid output gets up to two repair rounds.
"""
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
STUDIO = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import md  # noqa: E402
import build  # noqa: E402
from validate import validate_lesson, validate_daily  # noqa: E402

PROMPTS = os.path.join(STUDIO, "prompts")
SCHEMA_PATH = os.path.join(STUDIO, "schema", "lesson.schema.json")
NODE = shutil.which("node") or "/opt/homebrew/bin/node"
TRACK_NAMES = {"greek": "Nieuwgrieks", "french": "Frans (C1→C2)", "solidity": "Solidity & de EVM", "ai": "AI & LLM's", "automation": "Workflow Automation & API Engineering (n8n)"}


def read(p):
    return open(p, encoding="utf-8").read()


# ------------------------------------------------------------------ agy
def run_agy(prompt, cfg, model=None, timeout=None, log=print):
    agy = cfg.get("AGY_BIN") or os.path.expanduser("~/.local/bin/agy")
    timeout = int(timeout or cfg.get("AGY_TIMEOUT", 900))
    work = tempfile.mkdtemp(prefix="polyglot-agy-")
    pfile = os.path.join(work, "prompt.md")
    open(pfile, "w", encoding="utf-8").write(prompt)
    cmd = [agy, "-p", prompt, "--output-format", "json", "--print-timeout", f"{timeout}s"]
    if model:
        cmd += ["--model", model]
    t0 = dt.datetime.now()
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 120, cwd=work)
    except subprocess.TimeoutExpired:
        log(f"    ⏱ agy time-out na {timeout}s")
        return None
    secs = (dt.datetime.now() - t0).seconds
    try:
        env = json.loads(r.stdout)
    except Exception:
        log(f"    ✗ agy gaf geen JSON-envelope (exit {r.returncode}): {r.stderr.strip()[:300]}")
        return None
    usage = env.get("usage") or {}
    log(f"    agy {env.get('status')} in {secs}s · {usage.get('input_tokens', '?')} in / {usage.get('output_tokens', '?')} out tokens")
    if env.get("structured_output"):
        return env["structured_output"]
    return env.get("response") or ""


def extract_json(text):
    if isinstance(text, dict):
        return text
    if not text:
        raise ValueError("leeg antwoord")
    m = re.search(r"```(?:json)?\s*(\{[\s\S]*\})\s*```", text)
    blob = m.group(1) if m else text[text.find("{"): text.rfind("}") + 1]
    obj = json.loads(blob)
    for k in ("toolAction", "toolSummary"):
        obj.pop(k, None)
    return obj


def _coerce(obj):
    """Fix harmless format slips before validation, so they don't cost a repair round:
    numbers in `answers` become strings and duplicate answers are dropped."""
    if isinstance(obj, dict):
        if isinstance(obj.get("answers"), list):
            out = []
            for a in obj["answers"]:
                if isinstance(a, (int, float)) and not isinstance(a, bool):
                    a = str(a)
                if a not in out:
                    out.append(a)
            obj["answers"] = out
        for v in obj.values():
            _coerce(v)
    elif isinstance(obj, list):
        for v in obj:
            _coerce(v)
    return obj


# ------------------------------------------------------------------ validation of a candidate
def render_math_errors(obj_renderer, obj):
    """Render markdown + KaTeX for one object in isolation; return a list of errors."""
    md.MATH.clear()
    md._MATH_INDEX.clear()
    try:
        obj_renderer(obj)
    except md.MdError as e:
        return [f"markdown: {e}"]
    if not md.MATH:
        return []
    p = subprocess.run([NODE, os.path.join(HERE, "katex_render.js")], input=json.dumps(md.MATH), capture_output=True, text=True, timeout=120)
    if p.returncode != 0:
        return [f"KaTeX-renderer faalde: {p.stderr[:200]}"]
    return [f"KaTeX-fout in `{md.MATH[i][0][:80]}`: {o['error'][:160]}" for i, o in enumerate(json.loads(p.stdout)) if "error" in o]


def verify_code(obj):
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)
        path = f.name
    try:
        p = subprocess.run([NODE, os.path.join(HERE, "verify_code.js"), path], capture_output=True, text=True, timeout=300)
        return [ln.strip() for ln in p.stdout.splitlines() if ln.startswith("    ")]
    finally:
        os.unlink(path)


def check_lesson(L):
    schema = json.load(open(SCHEMA_PATH, encoding="utf-8"))
    errs, warns = validate_lesson(L, schema, "")
    if not errs:
        errs += render_math_errors(build.render_lesson, L)
    if not errs:
        errs += verify_code(L)
    serious_warns = [w for w in warns if any(k in w for k in ("tonos", "σ", "accenten", "production-type", "identical", "longest", "theory is short", "vocab entries", "diagnostic"))]
    return errs, serious_warns


def check_daily(D):
    errs, warns = validate_daily(D)
    if not errs:
        errs += render_math_errors(build.render_daily, D)
    if not errs:
        errs += verify_code(D)
    return errs, [w for w in warns if "tonos" in w or "σ" in w]


# ------------------------------------------------------------------ prompts
def _json(o, limit=None):
    s = json.dumps(o, ensure_ascii=False, indent=1)
    return s if not limit or len(s) <= limit else s[:limit] + "\n… (ingekort)"


def lesson_context(track, lesson_id, topic, model, idx, syllabus, instructions, today):
    syl = syllabus.get(track, {})
    topics = syl.get("topics", [])
    pos = next((i for i, x in enumerate(topics) if x["id"] == (topic or {}).get("id")), None)
    upcoming = topics[pos + 1: pos + 4] if pos is not None else []
    prev = [f"- Les {i}: {m['title']} (roadmap `{m['roadmap']}`, {m['kind']}) — leerdoelen: {'; '.join(m['objectives'].values())}" for i, m in sorted(idx[track].items()) if i < lesson_id]
    tm = (model or {}).get("tracks", {}).get(track, {})
    gold_id = min(idx[track]) if idx[track] else None
    gold = read(idx[track][gold_id]["file"]) if gold_id else "{}"
    parts = [
        f"# Opdracht\nVandaag is het {today}. Schrijf **les {lesson_id}** voor het vak **{TRACK_NAMES[track]}** (`track: \"{track}\"`, `id: {lesson_id}`).",
        f"## Doel van het vak\n{syl.get('goal', '')}\n\nPrincipes:\n" + "\n".join(f"- {p}" for p in syl.get("principles", [])),
        f"## Roadmap-onderwerp voor deze les\nGebruik `\"roadmap\": \"{(topic or {}).get('id', '')}\"`.\n```json\n{_json(topic)}\n```" if topic else "",
        ("## Daarna volgt (voor samenhang — niet behandelen)\n" + "\n".join(f"- `{x['id']}`: {x['title']}" for x in upcoming)) if upcoming else "",
        ("## Eerdere lessen in dit vak\n" + "\n".join(prev)) if prev else "## Eerdere lessen\nDit is de eerste les.",
        f"## Leerdersprofiel (dit vak)\n```json\n{_json(tm, 12000)}\n```",
        f"## Aanpassingsopdracht\n{instructions or 'Geen bijzonderheden: volg de roadmap op het geplande niveau.'}",
        f"## Voorbeeldles (goudstandaard voor stijl, diepgang en structuur — niet de inhoud kopiëren)\n```json\n{gold}\n```",
        f"## JSON-schema van een les\n```json\n{read(SCHEMA_PATH)}\n```",
    ]
    return "\n\n".join(p for p in parts if p)


def instructions_for(track, model, kind="generate", extra=None):
    tm = (model or {}).get("tracks", {}).get(track, {})
    lines = []
    d = tm.get("diagnostic")
    if d:
        lines.append(f"- Niveautest ({d.get('date')}): geschat niveau **{d.get('level')}**, per band {json.dumps(d.get('bands'), ensure_ascii=False)}. Stem tempo en moeilijkheid hierop af.")
    if tm.get("weak_skills"):
        lines.append("- Zwakke leerdoelen: " + "; ".join(f"les {s['lesson']} `{s['skill']}` ({int(s['accuracy_recent'] * 100)}% over {s['attempts']} pogingen): {s['objective']}" for s in tm["weak_skills"]))
    if tm.get("error_patterns_14d"):
        lines.append(f"- Foutpatronen (14 d): {json.dumps(tm['error_patterns_14d'], ensure_ascii=False)}")
    if tm.get("strong_skills"):
        lines.append("- Sterk (niet opnieuw uitleggen): " + ", ".join(f"les {s['lesson']} `{s['skill']}`" for s in tm["strong_skills"]))
    if tm.get("pace"):
        lines.append(f"- Tempo: {tm['pace']['lessons_learned_7d']} lessen geleerd in 7 dagen; {tm.get('attempts_7d', 0)} oefenpogingen.")
    if extra:
        lines.append(extra)
    if not lines:
        lines.append("- Nog geen resultaten voor dit vak: schrijf op het geplande niveau en voorzie extra ruime oefenstof.")
    return "\n".join(lines)


# ------------------------------------------------------------------ tasks
def _normalize_lesson(L, track, lesson_id, roadmap, today, kind=None):
    L["schema"] = "polyglot.lesson/v2"
    L["track"] = track
    L["id"] = lesson_id
    if roadmap and not L.get("roadmap"):
        L["roadmap"] = roadmap
    if kind:
        L["kind"] = kind
    L.setdefault("kind", "core")
    meta = L.setdefault("meta", {})
    meta["author"] = "antigravity"
    meta["created"] = today
    return L


def _size(L):
    return sum(len(x.get("md", "")) for x in L.get("sections", [])), len(L.get("practice", [])) + len(L.get("mastery", [])) + len(L.get("cards", []))


def _shrunk(prev, L):
    """A repair round must fix problems, not delete content."""
    (m0, n0), (m1, n1) = _size(prev), _size(L)
    if m1 < 0.85 * m0 or n1 < n0:
        return f"de herstelde versie is korter dan de vorige ({m1} vs {m0} tekens theorie, {n1} vs {n0} items/kaarten): herstel de fouten zonder inhoud te schrappen"
    return None


def author_lesson(track, lesson_id, topic, model, idx, syllabus, cfg, today, mode="generate", current=None, extra=None, log=print):
    base = read(os.path.join(PROMPTS, "LESSON_AUTHOR.md"))
    head = base if mode == "generate" else read(os.path.join(PROMPTS, "LESSON_REVISER.md")) + "\n\n---\n\n" + base
    ctx = lesson_context(track, lesson_id, topic, model, idx, syllabus, instructions_for(track, model, mode, extra), today)
    if current is not None:
        ctx += f"\n\n## Huidige versie van les {lesson_id} (bijsturen)\n```json\n{json.dumps(current, ensure_ascii=False)}\n```"
    prompt = head + "\n\n---\n\n" + ctx
    model_name = cfg.get("AGY_MODEL_AUTHOR", "gemini-3.1-pro-high")
    last = None
    attempts = int(cfg.get("AGY_ATTEMPTS", 3))
    for attempt in range(1, attempts + 1):
        log(f"  → {mode} {track} les {lesson_id} (poging {attempt})")
        out = run_agy(prompt, cfg, model=model_name, log=log)
        try:
            L = extract_json(out)
        except Exception as e:
            log(f"    ✗ geen geldige JSON: {e}")
            prompt = head + "\n\n---\n\n" + ctx + "\n\n## Vorige poging mislukte\nJe antwoord bevatte geen geldige JSON. Antwoord met één volledig JSON-object in een ```json-codeblok."
            continue
        if L.get("unchanged"):
            log(f"    = ongewijzigd: {L.get('reason', '')[:200]}")
            return None
        L = _coerce(_normalize_lesson(L, track, lesson_id, (topic or {}).get("id") or (current or {}).get("roadmap"), today, "consolidation" if mode == "consolidate" else None))
        errs, warns = check_lesson(L)
        if last is not None and not errs:
            shrunk = _shrunk(last, L)
            if shrunk:
                warns.append(shrunk)
        if not errs and (not warns or attempt == attempts):
            if warns:
                log(f"    ⚠ aanvaard met {len(warns)} waarschuwing(en): {warns[:3]}")
            return L
        last = L
        problems = errs + [f"(kwaliteit) {w}" for w in warns]
        log(f"    ✗ {len(errs)} fout(en), {len(warns)} kwaliteitspunt(en): {problems[:4]}")
        prompt = (head + "\n\n---\n\n" + ctx + "\n\n## Je vorige versie had problemen — herstel ze allemaal\n" + "\n".join(f"- {e}" for e in problems[:40])
                  + f"\n\nVorige versie:\n```json\n{json.dumps(L, ensure_ascii=False)}\n```\n\n"
                  "Lever de **volledige** gecorrigeerde les. Herstel alleen wat hierboven staat: behoud alle andere secties, items, "
                  "uitleg en voorbeelden woordelijk, en maak de les **niet korter**.")
    log(f"  ✗ {track} les {lesson_id}: na {attempt} pogingen nog ongeldig — overgeslagen")
    return None


def coach_pack(model, cfg, today, log=print):
    author = read(os.path.join(PROMPTS, "LESSON_AUTHOR.md"))
    rules = author[author.index("## 3. "):author.index("## 6. ")]  # item rules, markdown subset, per-track rules
    item_schema = json.load(open(SCHEMA_PATH, encoding="utf-8"))["$defs"]["item"]
    prompt = (read(os.path.join(PROMPTS, "DAILY_COACH.md"))
              + "\n\n---\n\n# Referentie: dezelfde regels als in de lessen\n\n" + rules
              + f"\n## JSON-schema van één item\n```json\n{json.dumps(item_schema, ensure_ascii=False)}\n```"
              + f"\n\n---\n\n# Vandaag: {today}\n\n## Leerdersprofiel\n```json\n{_json(model, 60000)}\n```")
    model_name = cfg.get("AGY_MODEL_COACH", "gemini-3.8-flash-high")
    for attempt in range(1, 3):
        log(f"  → coach-pakket (poging {attempt})")
        out = run_agy(prompt, cfg, model=model_name, timeout=600, log=log)
        try:
            D = extract_json(out)
        except Exception as e:
            log(f"    ✗ geen geldige JSON: {e}")
            continue
        D = _coerce(D)
        D["schema"], D["date"] = "polyglot.daily/v2", today
        D.setdefault("feedback", [])
        D.setdefault("drills", [])
        errs, warns = check_daily(D)
        if not errs:
            return D
        log(f"    ✗ {len(errs)} fout(en): {errs[:4]}")
        prompt += ("\n\n## Vorige versie had fouten — herstel ze\n" + "\n".join(f"- {e}" for e in errs[:30]) + f"\n```json\n{json.dumps(D, ensure_ascii=False)}\n```"
                   "\nHerstel alleen deze fouten en behoud al het overige woordelijk (niet inkorten).")
    return None
