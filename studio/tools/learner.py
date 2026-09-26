"""learner.py — turns synced device states + the learning log into a learner model for Antigravity.

The model answers, per track: where is Thibaud, what does he master (proven by tests on later days),
what goes wrong (skills, error patterns, literal wrong answers), what did he write, and how fast is he going.
"""
import datetime as dt
import glob
import json
import os
import re
from collections import Counter, defaultdict

TRACKS = ["greek", "french", "solidity", "ai", "automation", "jev"]
RANK = ["new", "started", "legacy", "learned", "mastered", "anchored"]
DONE = {"legacy", "learned", "mastered", "anchored"}
DAY_MS = 86400000


def _plain(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", str(html or ""))).strip()


# ------------------------------------------------------------------ content index
def content_index(studio_dir):
    idx = {t: {} for t in TRACKS}
    items = {}
    for t in TRACKS:
        for p in sorted(glob.glob(os.path.join(studio_dir, "content", "lessons", t, "*.json"))):
            try:
                L = json.load(open(p, encoding="utf-8"))
            except Exception:
                continue
            idx[t][L["id"]] = {
                "id": L["id"], "title": L["title"], "roadmap": L.get("roadmap", ""), "kind": L.get("kind", "core"),
                "level": L.get("level"), "objectives": {o["id"]: o["text"] for o in L.get("objectives", [])},
                "created": (L.get("meta") or {}).get("created", ""), "author": (L.get("meta") or {}).get("author", ""),
                "file": p,
            }
            pools = [it for s in L.get("sections", []) for it in s.get("checks", [])] + L.get("practice", []) + L.get("mastery", [])
            pools += (L.get("diagnostic") or {}).get("items", [])
            for it in pools:
                ans = it.get("answers") or ([it["options"][it["answer"]]] if it.get("type") == "mcq" and "options" in it else None) or it.get("text") or it.get("expected") or it.get("value")
                items[f"{t}:{L['id']}:{it['id']}"] = {"prompt": _plain(it.get("prompt"))[:220], "expected": ans if isinstance(ans, (str, int, float)) else (ans[:3] if isinstance(ans, list) else None), "skill": it.get("skill"), "type": it.get("type"), "band": it.get("band")}
    return idx, items


# ------------------------------------------------------------------ merge (mirror of app/07-sync.js)
def merge_states(states):
    lessons, cards, days, drills = {}, {}, {}, {}
    for s in states:
        for k, b in (s.get("lessons") or {}).items():
            a = lessons.get(k)
            if a is None:
                lessons[k] = json.loads(json.dumps(b))
                continue
            if RANK.index(b.get("status", "new")) > RANK.index(a.get("status", "new")):
                a["status"], a["checks"], a["needsReview"] = b["status"], b.get("checks", {}), b.get("needsReview", False)
            for f in ("learnedAt", "masteredAt", "anchoredAt"):
                if b.get(f) and (not a.get(f) or b[f] < a[f]):
                    a[f] = b[f]
            a["best"] = max(a.get("best") or 0, b.get("best") or 0)
            seen = {(x["ts"], x["kind"]) for x in a.get("tests", [])}
            a["tests"] = sorted(a.get("tests", []) + [x for x in b.get("tests", []) if (x["ts"], x["kind"]) not in seen], key=lambda x: x["ts"])
            sd = a.setdefault("stepsDone", {})
            for st, ts in (b.get("stepsDone") or {}).items():
                if st not in sd or ts < sd[st]:
                    sd[st] = ts
            for sk, v in (b.get("skills") or {}).items():
                if sk not in a.setdefault("skills", {}) or v.get("n", 0) > a["skills"][sk].get("n", 0):
                    a["skills"][sk] = v
            if b.get("production") and (not a.get("production") or b["production"]["at"] > a["production"]["at"]):
                a["production"] = b["production"]
            if b.get("diagnostic") and (not a.get("diagnostic") or b["diagnostic"]["at"] > a["diagnostic"]["at"]):
                a["diagnostic"] = b["diagnostic"]
        for k, c in (s.get("cards") or {}).items():
            if k not in cards or (c.get("last") or 0) > (cards[k].get("last") or 0):
                cards[k] = c
        for d, v in (s.get("days") or {}).items():
            a = days.setdefault(d, {"ms": 0, "n": 0, "sc": 0})
            a["ms"] = max(a["ms"], v.get("ms", 0))
            if v.get("n", 0) > a["n"]:
                a["n"], a["sc"] = v["n"], v.get("sc", 0)
        drills.update(s.get("drills") or {})
    return lessons, cards, days, drills


# ------------------------------------------------------------------ model
def build_model(states, events, idx, items, now_ms=None):
    now_ms = now_ms or int(dt.datetime.now().timestamp() * 1000)
    lessons, cards, days, drills = merge_states(states)
    events = sorted([e for e in events if e.get("ts")], key=lambda e: e["ts"])
    today = dt.date.fromtimestamp(now_ms / 1000)

    streak, d = 0, today
    if not (days.get(d.isoformat()) or {}).get("n"):
        d -= dt.timedelta(days=1)
    while (days.get(d.isoformat()) or {}).get("n"):
        streak += 1
        d -= dt.timedelta(days=1)
    minutes_7d = round(sum(v.get("ms", 0) for k, v in days.items() if (today - dt.date.fromisoformat(k)).days < 7) / 60000)
    last_active = max((e["ts"] for e in events), default=0)

    model = {
        "generated": dt.datetime.now().isoformat(timespec="minutes"),
        "today": today.isoformat(),
        "streak_days": streak,
        "minutes_last_7_days": minutes_7d,
        "last_active": dt.datetime.fromtimestamp(last_active / 1000).isoformat(timespec="minutes") if last_active else None,
        "events_total": len(events),
        "tracks": {},
    }
    for t in TRACKS:
        ids = sorted(idx[t])
        prog = {i: lessons.get(f"{t}:{i}") or {} for i in ids}
        status = {i: prog[i].get("status", "new") for i in ids}
        done = [i for i in ids if status[i] in DONE]
        last_done = max(done) if done else 0
        active = next((i for i in ids if status[i] not in DONE), None)
        frozen = [i for i in ids if status[i] != "new" or prog[i].get("stepsDone") or prog[i].get("tests")]
        tev = [e for e in events if e.get("t") == t]
        recent = [e for e in tev if e["ts"] > now_ms - 21 * DAY_MS]

        per_skill = defaultdict(list)
        for e in recent:
            if e.get("k") == "a" and e.get("sk") and e.get("l") and e.get("m") != "diagnostic":
                per_skill[(e["l"], e["sk"])].append(e.get("sc", 0))
        skills = []
        for (l, sk), sc in per_skill.items():
            obj = (idx[t].get(l) or {}).get("objectives", {}).get(sk, sk)
            last8 = sc[-8:]
            skills.append({"lesson": l, "skill": sk, "objective": obj, "attempts": len(sc), "accuracy_recent": round(sum(last8) / len(last8), 2)})
        weak = sorted([s for s in skills if s["attempts"] >= 3 and s["accuracy_recent"] < 0.8], key=lambda s: s["accuracy_recent"])[:6]
        strong = sorted([s for s in skills if s["attempts"] >= 4 and s["accuracy_recent"] >= 0.95], key=lambda s: -s["attempts"])[:6]

        errs = Counter()
        wrong = []
        for e in recent:
            if e.get("k") == "a" and e.get("sc", 1) < 1:
                errs[e.get("tag") or e.get("kind") or "wrong"] += 1
                if e["ts"] > now_ms - 7 * DAY_MS and e.get("ans"):
                    meta = items.get(f"{t}:{e.get('l')}:{e.get('i')}", {})
                    wrong.append({"lesson": e.get("l"), "item": e.get("i"), "skill": e.get("sk"), "prompt": meta.get("prompt"), "expected": meta.get("expected"), "answer": str(e["ans"])[:300], "kind": e.get("kind"), "mode": e.get("m")})
        tests = []
        for e in tev:
            if e.get("k") == "t":
                tests.append({"lesson": e.get("l"), "kind": e.get("kind"), "score": e.get("sc"), "passed": e.get("pass"), "level": e.get("level"), "bands": e.get("sk") if e.get("kind") == "diagnostic" else None, "date": dt.datetime.fromtimestamp(e["ts"] / 1000).date().isoformat()})
        diag = next((x for x in reversed(tests) if x["kind"] == "diagnostic"), None)
        writing = [{"lesson": e.get("l"), "type": e.get("ty"), "self_score": e.get("self"), "ok": e.get("ok"), "text": (e.get("text") or "")[:3000], "date": dt.datetime.fromtimestamp(e["ts"] / 1000).date().isoformat()}
                   for e in tev if e.get("k") == "p" and e["ts"] > now_ms - 4 * DAY_MS and (e.get("text") or "").strip()][-3:]
        open_answers = [{"lesson": e.get("l"), "item": e.get("i"), "prompt": items.get(f"{t}:{e.get('l')}:{e.get('i')}", {}).get("prompt"), "answer": str(e.get("ans"))[:1500], "self_score": e.get("sc")}
                        for e in recent if e.get("k") == "a" and e.get("ty") == "explain" and e.get("ans") and e["ts"] > now_ms - 4 * DAY_MS][-3:]
        rev = [e for e in tev if e.get("k") == "r"]
        rev30 = [e for e in rev if e["ts"] > now_ms - 30 * DAY_MS]
        tcards = {k: c for k, c in cards.items() if k.startswith(t + ":")}
        end_today = (dt.datetime.combine(today + dt.timedelta(days=1), dt.time()).timestamp() * 1000) - 1
        learned_ts = [p.get("learnedAt") for p in prog.values() if p.get("learnedAt")]

        model["tracks"][t] = {
            "lessons_available": ids,
            "last_completed_lesson": last_done,
            "active_lesson": active,
            "frozen_lessons": frozen,
            "lesson_status": {str(i): {"status": status[i], "needs_review": bool(prog[i].get("needsReview")), "steps_done": sorted((prog[i].get("stepsDone") or {}).keys()),
                                       "best_mastery": prog[i].get("best"), "tests": [{"kind": x["kind"], "score": x["score"], "passed": x["passed"]} for x in (prog[i].get("tests") or [])[-4:]]}
                              for i in ids if status[i] != "new" or prog[i].get("stepsDone")},
            "diagnostic": diag,
            "skills_recent": sorted(skills, key=lambda s: (s["lesson"], s["skill"])),
            "weak_skills": weak,
            "strong_skills": strong,
            "error_patterns_14d": dict(errs.most_common(8)),
            "recent_wrong_answers": wrong[-15:],
            "recent_tests": tests[-10:],
            "writing_recent": writing,
            "open_answers_recent": open_answers,
            "srs": {"cards": len(tcards), "due_today": sum(1 for c in tcards.values() if (c.get("due") or 0) <= end_today),
                    "lapses_7d": sum(1 for e in rev if e["ts"] > now_ms - 7 * DAY_MS and (e.get("q") or 0) < 3),
                    "retention_30d": round(sum(1 for e in rev30 if (e.get("q") or 0) >= 3) / len(rev30), 2) if rev30 else None},
            "pace": {"lessons_learned_7d": sum(1 for ts in learned_ts if ts > now_ms - 7 * DAY_MS), "lessons_learned_14d": sum(1 for ts in learned_ts if ts > now_ms - 14 * DAY_MS)},
            "attempts_7d": sum(1 for e in tev if e.get("k") in ("a", "r") and e["ts"] > now_ms - 7 * DAY_MS),
            "last_activity": dt.datetime.fromtimestamp(tev[-1]["ts"] / 1000).isoformat(timespec="minutes") if tev else None,
        }
    return model


def brief(model):
    """Short Dutch summary for Reminders and the log."""
    lines = [f"🔥 {model['streak_days']} dagen op rij · {model['minutes_last_7_days']} min deze week"]
    for t, tm in model["tracks"].items():
        name = {"greek": "Grieks", "french": "Frans", "solidity": "Solidity", "ai": "AI", "automation": "Automation", "jev": "Jev AI"}[t]
        bits = [f"les {tm['active_lesson'] or '—'}"]
        if tm["diagnostic"]:
            bits.append(f"niveau {tm['diagnostic'].get('level')}")
        if tm["weak_skills"]:
            bits.append("zwak: " + ", ".join(s["skill"] for s in tm["weak_skills"][:2]))
        if tm["srs"]["due_today"]:
            bits.append(f"{tm['srs']['due_today']} kaarten")
        lines.append(f"• {name}: " + " · ".join(bits))
    return "\n".join(lines)
