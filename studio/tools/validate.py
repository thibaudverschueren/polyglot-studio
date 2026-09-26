#!/usr/bin/env python3
"""
validate.py — schema + didactic quality checks for Polyglot Studio content.

Usage:
  python3 validate.py                      # validate every lesson + daily pack
  python3 validate.py path/to/lesson.json  # validate specific files
Exit code 1 when any error is found (warnings never fail).
"""
import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
STUDIO = os.path.dirname(HERE)
SCHEMA_PATH = os.path.join(STUDIO, "schema", "lesson.schema.json")
DAILY_SCHEMA_PATH = os.path.join(STUDIO, "schema", "daily.schema.json")

AUTO_TYPES = {"mcq", "multi", "type", "cloze", "order", "match", "numeric", "dictation", "code", "jsexpr", "jscode"}
PRODUCTION_TYPES = {"type", "cloze", "order", "numeric", "dictation", "code", "jsexpr", "jscode"}
GREEK = re.compile(r"[Ͱ-Ͽἀ-῿]")


# ------------------------------------------------------------ mini JSON-schema validator
def _type_ok(v, t):
    if isinstance(t, list):
        return any(_type_ok(v, x) for x in t)
    return {
        "object": isinstance(v, dict),
        "array": isinstance(v, list),
        "string": isinstance(v, str),
        "integer": isinstance(v, int) and not isinstance(v, bool),
        "number": isinstance(v, (int, float)) and not isinstance(v, bool),
        "boolean": isinstance(v, bool),
        "null": v is None,
    }.get(t, True)


def schema_errors(value, schema, root, path="$"):
    errs = []
    if "$ref" in schema:
        ref = schema["$ref"]
        target = root
        for part in ref.lstrip("#/").split("/"):
            target = target[part]
        return schema_errors(value, target, root, path)
    if "type" in schema and not _type_ok(value, schema["type"]):
        return [f"{path}: expected {schema['type']}, got {type(value).__name__}"]
    if "const" in schema and value != schema["const"]:
        errs.append(f"{path}: must equal {schema['const']!r}")
    if "enum" in schema and value not in schema["enum"]:
        errs.append(f"{path}: {value!r} not in {schema['enum']}")
    if isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            errs.append(f"{path}: shorter than {schema['minLength']} chars")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            errs.append(f"{path}: longer than {schema['maxLength']} chars")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errs.append(f"{path}: {value!r} does not match {schema['pattern']}")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errs.append(f"{path}: < {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errs.append(f"{path}: > {schema['maximum']}")
    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errs.append(f"{path}: needs ≥ {schema['minItems']} items (has {len(value)})")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errs.append(f"{path}: allows ≤ {schema['maxItems']} items (has {len(value)})")
        if "items" in schema:
            for i, v in enumerate(value):
                errs += schema_errors(v, schema["items"], root, f"{path}[{i}]")
    if isinstance(value, dict):
        for req in schema.get("required", []):
            if req not in value:
                errs.append(f"{path}: missing required '{req}'")
        props = schema.get("properties", {})
        addl = schema.get("additionalProperties", True)
        for k, v in value.items():
            if k in props:
                errs += schema_errors(v, props[k], root, f"{path}.{k}")
            elif addl is False:
                errs.append(f"{path}: unknown property '{k}'")
            elif isinstance(addl, dict):
                errs += schema_errors(v, addl, root, f"{path}.{k}")
    return errs


# ------------------------------------------------------------ Greek accent linter
UNACCENTED_OK = set("""ο η το τον την τη του της των τους τις τα οι σε με να θα και δεν μην μη που πως αν ως σαν
μου σου μας σας τους γεια για πια μια δυο ποιος ποια ποιο ποιου ποιον ποιοι ποιες ποιων πιο εγω εσυ
ε ω α ας κι στο στη στην στον στα στις στους απ' σ' τ' μ' σ κ""".split())
VOWELS = set("αεηιουωάέήίόύώϊϋΐΰ")
ACCENTED = set("άέήίόύώΐΰ")
DIGRAPHS = ("αι", "ει", "οι", "ου", "υι", "αυ", "ευ", "ηυ")


def greek_syllables(word):
    """Vowel-group count; digraphs (αι ει οι ου υι αυ ευ ηυ) count once unless split by accent/diaeresis."""
    w = word.lower()
    n, i = 0, 0
    while i < len(w):
        if w[i] in VOWELS:
            n += 1
            if i + 1 < len(w) and _plain(w[i:i + 2]) in DIGRAPHS and w[i + 1] not in "ϊϋΐΰ" and w[i] not in ACCENTED:
                i += 2
                continue
        i += 1
    return n


def _plain(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def greek_accent_issues(text):
    issues = []
    for word in re.findall(r"[Ͱ-Ͽἀ-῿]+", text or ""):
        low = word.lower()
        if len(low) <= 1 or low in UNACCENTED_OK or word.isupper() and len(word) > 1:
            continue
        acc = sum(1 for c in low if c in ACCENTED)
        syl = greek_syllables(low)
        if acc == 0 and syl >= 2 and not re.match(r"^(μια|δυο|γεια|πια|για|ποι\w*|πιο|ια\w*)$", low):
            if not re.search(r"(ια|ιο|ιε|ιου|ιω)", low) or syl >= 3:
                issues.append(f"'{word}' mist een tonos")
        if acc >= 2:
            issues.append(f"'{word}' heeft {acc} accenten")
        if re.search(r"σ$", low):
            issues.append(f"'{word}' eindigt op σ (moet ς zijn)")
        if re.search(r"ς(?=[α-ω])", low):
            issues.append(f"'{word}' bevat ς midden in het woord")
    return issues


# ------------------------------------------------------------ lesson checks
def norm(s):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(s))).strip().lower()


def check_item(it, where, obj_ids, track, errs, warns, drill=False):
    try:
        _check_item(it, where, obj_ids, track, errs, warns, drill)
    except Exception as e:  # malformed input must become a repairable error, never a crash
        errs.append(f"{where}:{it.get('id', '?') if isinstance(it, dict) else '?'}: ongeldig item ({type(e).__name__}: {e})")


def _check_item(it, where, obj_ids, track, errs, warns, drill=False):
    t = it.get("type")
    iid = it.get("id", "?")
    loc = f"{where}:{iid}"
    skill = it.get("skill", "")
    if drill:
        if not re.match(r"^(greek|french|solidity|ai|automation|jev):\d+/[a-z0-9-]+$", skill):
            errs.append(f"{loc}: drill skill must look like 'greek:5/objective-id'")
    elif skill not in obj_ids:
        errs.append(f"{loc}: skill '{skill}' is not an objective id ({sorted(obj_ids)})")
    lang = it.get("lang")
    if t == "mcq":
        opts = it.get("options", [])
        if len(opts) < 3:
            errs.append(f"{loc}: mcq needs ≥ 3 options (options: 3–5 unieke keuzes, answer: index van de juiste)")
        if not isinstance(it.get("answer"), int) or not (0 <= it["answer"] < len(opts)):
            errs.append(f"{loc}: mcq answer index out of range")
        if len({norm(o) for o in opts}) != len(opts):
            errs.append(f"{loc}: duplicate options")
        if any(re.search(r"(alle (bovenstaande|antwoorden)|geen van (de )?bovenstaande|all of the above)", norm(o)) for o in opts):
            warns.append(f"{loc}: avoid 'alle/geen van bovenstaande' options")
        lens = [len(o) for o in opts]
        if opts and isinstance(it.get("answer"), int) and 0 <= it["answer"] < len(opts) and len(opts) >= 3:
            longest = max(lens)
            if lens[it["answer"]] == longest and longest > 1.8 * sorted(lens)[-2]:
                warns.append(f"{loc}: correct option is conspicuously the longest")
    elif t == "multi":
        opts = it.get("options", [])
        ans = it.get("answers", [])
        if len(opts) < 4:
            errs.append(f"{loc}: multi needs ≥ 4 options")
        if not ans or not all(isinstance(a, int) and 0 <= a < len(opts) for a in ans) or len(ans) == len(opts):
            errs.append(f"{loc}: multi answers must be valid indices (not all options) — answers = lijst met indexen van de juiste opties, minstens 1 en niet allemaal; nu {it.get('answers')} bij {len(it.get('options') or [])} opties")
    elif t in ("type",):
        ans = it.get("answers", [])
        if not ans or not all(isinstance(a, str) and a.strip() for a in ans):
            errs.append(f"{loc}: type needs non-empty string answers (answers = lijst met strings)")
        if any(GREEK.search(a) for a in ans if isinstance(a, str)) and lang not in ("el", "code"):
            it["lang"] = "el"
            warns.append(f"{loc}: answers are Greek → lang set to 'el'")
        if track == "french" and not lang:
            warns.append(f"{loc}: French track type-item without lang (defaults to nl)")
    elif t == "cloze":
        text = it.get("text", "")
        blanks = re.findall(r"\{\{(.+?)\}\}", text)
        if not blanks:
            errs.append(f"{loc}: cloze text has no {{{{blank}}}} — zet elk invulgat als {{{{antwoord}}}} of {{{{antwoord|variant}}}} in 'text', bv. \"Il {{{{existe}}}} plusieurs solutions.\" (geen ___ of blanks-veld); nu: \"{text[:90]}\"")
        if any(not b.strip() for b in blanks):
            errs.append(f"{loc}: empty blank")
        if any(re.match(r"\s*\$|.*\$(json|input|node|now|today)\b|.*\$\(", b) for b in blanks):
            errs.append(f"{loc}: cloze blank looks like an n8n expression — {{{{ }}}} is voor invulgaten; vraag één woord of gebruik jsexpr")
        if any(GREEK.search(b) for b in blanks) and lang != "el":
            it["lang"] = "el"
    elif t == "order":
        if len(it.get("tiles", [])) < 3:
            errs.append(f"{loc}: order needs ≥ 3 tiles (tiles in de juiste volgorde)")
        if any(GREEK.search(x) for x in it.get("tiles", [])) and lang != "el":
            it["lang"] = "el"
    elif t == "match":
        pairs = it.get("pairs", [])
        if len(pairs) < 3:
            errs.append(f"{loc}: match needs ≥ 3 pairs (pairs = 3–6 paren [\"links\", \"rechts\"])")
        if len({norm(p[0]) for p in pairs}) != len(pairs) or len({norm(p[1]) for p in pairs}) != len(pairs):
            errs.append(f"{loc}: match sides must be unique (elke linker- en elke rechterwaarde maar één keer)")
    elif t == "numeric":
        if not isinstance(it.get("value"), (int, float)):
            errs.append(f"{loc}: numeric needs a numeric 'value'")
        if "tolerance" not in it and "abs" not in it:
            it["tolerance"] = 0.01
    elif t in ("dictation", "speak"):
        if not it.get("text"):
            errs.append(f"{loc}: {t} needs 'text'")
        if lang not in ("el", "fr"):
            errs.append(f"{loc}: {t} needs lang el|fr")
    elif t == "code":
        for k in ("starter", "solution", "tests", "contract"):
            if not it.get(k):
                errs.append(f"{loc}: code item needs '{k}'")
        if len(it.get("tests", [])) < 2:
            errs.append(f"{loc}: code item needs ≥ 2 tests (voeg testgevallen toe volgens de test-DSL)")
    elif t == "jsexpr":
        if "expected" not in it:
            errs.append(f"{loc}: jsexpr needs 'expected'")
        if not it.get("solution"):
            errs.append(f"{loc}: jsexpr needs 'solution' (the model expression)")
        if it.get("perItem") and not isinstance(it.get("expected"), list):
            errs.append(f"{loc}: perItem jsexpr needs an array 'expected'")
    elif t == "jscode":
        if not it.get("cases"):
            errs.append(f"{loc}: jscode needs ≥ 1 test case")
        for k in ("starter", "solution"):
            if not it.get(k):
                errs.append(f"{loc}: jscode needs '{k}'")
    elif t == "handwrite":
        if not it.get("target"):
            errs.append(f"{loc}: handwrite needs 'target'")
    elif t == "explain":
        if not it.get("model"):
            errs.append(f"{loc}: explain needs 'model'")
        if len(it.get("rubric", [])) < 2:
            warns.append(f"{loc}: explain should have ≥ 2 rubric criteria")
    if not str(it.get("explain", "")).strip():
        errs.append(f"{loc}: missing 'explain' (feedback after answering)")
    # Greek accent lint on everything the learner must produce
    if track == "greek" or lang == "el":
        texts = []
        if t in ("type",):
            texts += it.get("answers", [])
        if t == "cloze":
            texts += re.findall(r"\{\{(.+?)\}\}", it.get("text", ""))
        if t in ("order",):
            texts += it.get("tiles", [])
        if t in ("dictation", "speak"):
            texts.append(it.get("text", ""))
        if t == "handwrite":
            texts.append(it.get("target", ""))
        for s in texts:
            for p in str(s).split("|"):
                for issue in greek_accent_issues(p):
                    warns.append(f"{loc}: {issue}")


def validate_lesson(L, schema, fname=""):
    errs, warns = [], []
    errs += schema_errors(L, schema, schema)
    if errs:
        return errs, warns
    track = L["track"]
    exp = f"{track}/{L['id']:02d}.json"
    if fname and not fname.replace(os.sep, "/").endswith(exp):
        warns.append(f"file name should end with {exp}")
    obj_ids = [o["id"] for o in L["objectives"]]
    if len(set(obj_ids)) != len(obj_ids):
        errs.append("duplicate objective ids")
    obj_set = set(obj_ids)
    ids = {}
    all_items = []
    for s in L["sections"]:
        for it in s.get("checks", []):
            all_items.append(("check", it))
    all_items += [("practice", it) for it in L["practice"]] + [("mastery", it) for it in L["mastery"]]
    for pool, it in all_items:
        if it["id"] in ids:
            errs.append(f"duplicate item id {it['id']} ({ids[it['id']]} & {pool})")
        ids[it["id"]] = pool
        check_item(it, pool, obj_set, track, errs, warns)
    D = L.get("diagnostic")
    if D:
        bands = D["bands"]
        for it in D["items"]:
            if it["id"] in ids:
                errs.append(f"duplicate item id {it['id']} (diagnostic)")
            ids[it["id"]] = "diagnostic"
            if it.get("band") not in bands:
                errs.append(f"diagnostic:{it['id']}: band '{it.get('band')}' not in {bands}")
            if it["type"] not in AUTO_TYPES - {"code"}:
                errs.append(f"diagnostic:{it['id']}: use auto-graded types only")
            check_item(it, "diagnostic", {it.get("skill", "")}, track, errs, warns)
        for b in bands:
            if sum(1 for it in D["items"] if it.get("band") == b) < 2:
                errs.append(f"diagnostic band '{b}' needs ≥ 2 items")
    card_ids = [c["id"] for c in L["cards"]]
    if len(set(card_ids)) != len(card_ids):
        errs.append("duplicate card ids")
    for c in L["cards"]:
        if c.get("answers") and any(GREEK.search(a) for a in c["answers"]) and c.get("lang") != "el":
            c["lang"] = "el"
        if c.get("skill") and c["skill"] not in obj_set:
            warns.append(f"card {c['id']}: skill not an objective")
    # coverage per objective
    for o in obj_ids:
        p = [it for it in L["practice"] if it["skill"] == o]
        m = [it for it in L["mastery"] if it["skill"] == o and it["type"] in AUTO_TYPES]
        mp = [it for it in m if it["type"] in PRODUCTION_TYPES]
        if len(p) < 2:
            errs.append(f"objective '{o}' has {len(p)} practice items (need ≥ 2)")
        if len(m) < 2:
            errs.append(f"objective '{o}' has {len(m)} auto-graded mastery items (need ≥ 2)")
        if not mp:
            warns.append(f"objective '{o}' has no production-type mastery item")
    auto = [it for it in L["mastery"] if it["type"] in AUTO_TYPES]
    prod = [it for it in auto if it["type"] in PRODUCTION_TYPES]
    if len(auto) < 14:
        errs.append(f"mastery pool has {len(auto)} auto-graded items (need ≥ 14 so retakes differ)")
    if auto and len(prod) / len(auto) < 0.5:
        errs.append(f"only {len(prod)}/{len(auto)} mastery items require production (need ≥ 50%)")
    # overlap between practice and mastery prompts (memorisation risk)
    pp = {norm(re.sub(r'[^\w ]', '', it['prompt']))[:120] for it in L["practice"]}
    dup = [it["id"] for it in L["mastery"] if norm(re.sub(r'[^\w ]', '', it['prompt']))[:120] in pp and it["type"] not in ("dictation",)]
    if dup:
        warns.append(f"mastery items identical to practice prompts: {dup[:6]}")
    words = sum(len(re.findall(r"\w+", s["md"])) for s in L["sections"])
    if words < 700:
        warns.append(f"theory is short ({words} words) — aim for 900–2500")
    if L["id"] == 1 and not L.get("diagnostic"):
        warns.append("lesson 1 should include a diagnostic (niveautest)")
    if track in ("greek", "french") and len(L.get("vocab", [])) < 6:
        warns.append("language lesson with < 6 vocab entries")
    if track == "greek":
        for v in L.get("vocab", []):
            for issue in greek_accent_issues(v["term"]):
                warns.append(f"vocab '{v['term']}': {issue}")
    P = L["production"]
    if P["type"] == "code":
        for k in ("starter", "solution", "tests", "contract"):
            if not P.get(k):
                errs.append(f"production code needs '{k}'")
    elif P["type"] == "jscode":
        for k in ("starter", "solution", "cases"):
            if not P.get(k):
                errs.append(f"production jscode needs '{k}'")
    elif len(P.get("rubric", [])) < 3:
        warns.append("production should have ≥ 3 rubric criteria")
    return errs, warns


def validate_daily(D, schema=None):
    errs, warns = [], []
    schema = schema or json.load(open(SCHEMA_PATH, encoding="utf-8"))
    for k in ("schema", "date", "note", "drills"):
        if k not in D:
            errs.append(f"missing '{k}'")
    if D.get("schema") != "polyglot.daily/v2":
        errs.append("schema must be 'polyglot.daily/v2'")
    ids = set()
    if not isinstance(D.get("drills", []), list):
        return errs + ["'drills' must be a list"], warns
    for di, d in enumerate(D.get("drills", [])):
        if not isinstance(d, dict) or not isinstance(d.get("items", []), list):
            errs.append(f"drills[{di}]: must be {{track, focus, items: [...]}}")
            continue
        if d.get("track") not in ("greek", "french", "solidity", "ai", "automation", "jev"):
            errs.append(f"drill track invalid: {d.get('track')}")
        for ii, it in enumerate(d.get("items", [])):
            se = schema_errors(it, schema["$defs"]["item"], schema, f"$.drills[{di}].items[{ii}]")
            if se:
                errs += se
                continue
            if it.get("id") in ids:
                errs.append(f"duplicate drill item id {it.get('id')}")
            ids.add(it.get("id"))
            check_item(it, f"drill-{d.get('track')}", set(), d.get("track"), errs, warns, drill=True)
            if it.get("type") not in AUTO_TYPES - {"code"}:
                errs.append(f"drill item {it.get('id')}: use auto-graded types only (no code/explain/speak)")
    return errs, warns


def main(paths):
    schema = json.load(open(SCHEMA_PATH, encoding="utf-8"))
    if not paths:
        base = os.path.join(STUDIO, "content")
        for root, _, files in os.walk(os.path.join(base, "lessons")):
            paths += [os.path.join(root, f) for f in sorted(files) if f.endswith(".json")]
        daily_dir = os.path.join(base, "daily")
        for f in sorted(os.listdir(daily_dir)) if os.path.isdir(daily_dir) else []:
            if f.endswith(".json"):
                paths.append(os.path.join(base, "daily", f))
    bad = 0
    for p in sorted(paths):
        try:
            data = json.load(open(p, encoding="utf-8"))
        except Exception as e:
            print(f"✗ {p}: invalid JSON: {e}")
            bad += 1
            continue
        if "/daily/" in p.replace(os.sep, "/"):
            errs, warns = validate_daily(data)
        else:
            errs, warns = validate_lesson(data, schema, p)
        rel = os.path.relpath(p, STUDIO)
        if errs:
            bad += 1
            print(f"✗ {rel}: {len(errs)} error(s), {len(warns)} warning(s)")
            for e in errs[:40]:
                print(f"    error: {e}")
        else:
            print(f"✓ {rel}" + (f" ({len(warns)} warning(s))" if warns else ""))
        for w in warns[:25]:
            print(f"    warn:  {w}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
