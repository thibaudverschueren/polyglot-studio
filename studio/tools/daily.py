#!/usr/bin/env python3
"""
daily.py — the 07:30 loop of Polyglot Studio (called by ~/scripts/daily_orchestrator.py via launchd).

 1. git pull
 2. read progress + learning log from Supabase → learner model (+ daily brief)
 3. plan per track: consolidation lesson (failed retention) · revision of the next unstarted lesson
    (new evidence since it was written) · new lessons until LOOKAHEAD lessons are ready
 4. Antigravity writes/revises (validated, code executed) · coach pack from yesterday's results
 5. build index.html · commit · push (GitHub Pages)
 6. Apple Reminders: 1 master + 1 subtask per track (today, all-day, no alarms)
 7. copy the server's nightly database backup to OneDrive (offsite_backup.py)
 + 'Onder de motorkap' (radar.py): explainers of breakthroughs, classics and Thibaud's questions, after the lessons

  python3 daily.py            # full run
  python3 daily.py --dry-run  # plan only, no agy calls, no push, no reminders
  python3 daily.py --no-agy   # everything except content generation
"""
import datetime as dt
import glob
import json
import os
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
STUDIO = os.path.dirname(HERE)
REPO = os.path.dirname(STUDIO)
sys.path.insert(0, HERE)

import learner  # noqa: E402
import tracks as trk  # noqa: E402
import antigravity as ag  # noqa: E402
from cloud import connect, load_env  # noqa: E402

DATA = os.path.expanduser("~/scripts/polyglot-data")
SWIFT = os.path.expanduser("~/scripts/sync_reminders.swift")
PROFILE = os.path.expanduser("~/scripts/student_profile.json")
SITE = "https://thibaudverschueren.github.io/polyglot-studio/"
TRACKS = learner.TRACKS


def log(*a):
    print(*a, flush=True)


def step(title):
    log(f"[{dt.datetime.now():%H:%M:%S}] {title}")


def reachable(host, port, timeout=5):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def wait_for_network(cfg):
    """Right after the Mac wakes up, Wi-Fi/Tailscale need a minute: wait for the internet, then for the server."""
    t0 = time.time()
    limit = float(cfg.get("NET_WAIT_MIN", 6)) * 60
    while not reachable("github.com", 443):
        if time.time() - t0 > limit:
            log(f"    ⚠ geen internet na {limit / 60:.0f} min: ik ga verder met wat lokaal kan")
            return False, False
        time.sleep(15)
    host, db_ok, t1 = cfg.get("POLYGLOT_SSH"), True, time.time()
    if host:
        db_ok = False
        while True:
            r = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", host, "true"], capture_output=True, timeout=40)
            if r.returncode == 0:
                db_ok = True
                break
            if time.time() - t1 > float(cfg.get("DB_WAIT_MIN", 3)) * 60:
                log(f"    ⚠ server {host} niet bereikbaar na {cfg.get('DB_WAIT_MIN', 3)} min")
                break
            time.sleep(15)
    waited = int(time.time() - t0)
    if waited > 20:
        log(f"    netwerk klaar na {waited} s")
    return True, db_ok


def notify(title, text):
    """macOS notification (best effort, never blocks the run)."""
    try:
        t, m = title.replace('"', "'"), text.replace('"', "'")[:200]
        subprocess.run(["osascript", "-e", f'display notification "{m}" with title "{t}"'], capture_output=True, timeout=10)
    except Exception:
        pass


def sh(cmd, cwd=REPO, check=False, timeout=300):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    if check and r.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)} → {r.stderr.strip()[:400]}")
    return r


def load_syllabus():
    out = {}
    for t in TRACKS:
        p = os.path.join(STUDIO, "content", "syllabus", f"{t}.json")
        if os.path.exists(p):
            out[t] = json.load(open(p, encoding="utf-8"))
    return out


def lesson_path(t, i):
    return os.path.join(STUDIO, "content", "lessons", t, f"{i:02d}.json")


def write_lesson(L):
    p = lesson_path(L["track"], L["id"])
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + ".tmp"
    json.dump(L, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.replace(tmp, p)
    return p


def shift_lessons(t, from_id, frozen):
    """Make room at from_id by renumbering unstarted lessons ≥ from_id upwards."""
    ids = sorted(int(os.path.basename(p)[:2]) for p in glob.glob(os.path.join(STUDIO, "content", "lessons", t, "*.json")))
    movable = [i for i in ids if i >= from_id]
    if any(i in frozen for i in movable):
        return False
    for i in sorted(movable, reverse=True):
        L = json.load(open(lesson_path(t, i), encoding="utf-8"))
        L["id"] = i + 1
        L["prerequisites"] = [f"{t}:{int(x.split(':')[1]) + 1}" if x.startswith(t + ":") and int(x.split(":")[1]) >= from_id else x for x in L.get("prerequisites", [])]
        write_lesson(L)
        os.remove(lesson_path(t, i))
    return True


# ------------------------------------------------------------------ planning
UNCHANGED = os.path.join(DATA, "unchanged.json")


def unchanged_decisions():
    try:
        return json.load(open(UNCHANGED, encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def remember_unchanged(track, lesson_id, reason, today):
    d = unchanged_decisions()
    d[f"{track}:{lesson_id}"] = {"date": today, "reason": reason[:300]}
    os.makedirs(DATA, exist_ok=True)
    json.dump(d, open(UNCHANGED, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def evidence_since(tm, created):
    if not created:
        return True
    return any((x.get("date") or "") >= created for x in tm.get("recent_tests", [])) or (tm.get("diagnostic") or {}).get("date", "") >= created


def _revise_since(t, lesson_id, idx):
    """Evidence only counts if it is newer than the lesson and than the last 'leave it as is' decision."""
    since = idx[t][lesson_id]["created"] or ""
    d = unchanged_decisions().get(f"{t}:{lesson_id}")
    if d:
        since = max(since, (dt.date.fromisoformat(d["date"]) + dt.timedelta(days=1)).isoformat())
    return since


def plan(model, idx, syllabus, cfg):
    lookahead, max_new = int(cfg.get("LOOKAHEAD", 5)), int(cfg.get("MAX_NEW_PER_TRACK", 2))
    tasks = []
    today = model["today"]
    for t in TRACKS:
        tm = model["tracks"][t]
        ids = sorted(idx[t])
        frozen = set(tm["frozen_lessons"])
        last_done = tm["last_completed_lesson"]
        upcoming = [i for i in ids if i > last_done]
        unstarted = [i for i in upcoming if i not in frozen]
        covered = set()
        for i in ids:
            covered |= set(filter(None, idx[t][i]["roadmap"].split("+")))
        topics = [x for x in syllabus.get(t, {}).get("topics", []) if x["id"] not in covered]
        # 1. consolidation after a failed retention/anchor check (lesson already behind him)
        failed = [x for x in tm["recent_tests"] if x["kind"] in ("retention", "anchor") and x["passed"] is False and x["date"] >= (dt.date.fromisoformat(today) - dt.timedelta(days=3)).isoformat()]
        recent_consol = any(m["kind"] == "consolidation" and m["created"] >= (dt.date.fromisoformat(today) - dt.timedelta(days=4)).isoformat() for m in idx[t].values())
        if failed and not recent_consol:
            lessons = sorted({x["lesson"] for x in failed})
            weak = [s for s in tm["weak_skills"] if s["lesson"] in lessons]
            at = unstarted[0] if unstarted else (max(ids) + 1 if ids else 1)
            tasks.append({"kind": "consolidate", "track": t, "id": at, "lessons": lessons, "skills": weak, "round": 0,
                          "roadmap": "+".join(idx[t][i]["roadmap"] for i in lessons if i in idx[t])})
        # 2. revise the next unstarted lesson when new evidence arrived after it was written
        elif unstarted and tm.get("attempts_7d", 0) > 0 and evidence_since(tm, _revise_since(t, unstarted[0], idx)):
            tasks.append({"kind": "revise", "track": t, "id": unstarted[0], "round": 0})
        # 3. new lessons (lookahead)
        missing = max(0, lookahead - len(upcoming))
        nxt = (max(ids) if ids else 0) + 1 + (1 if tasks and tasks[-1]["kind"] == "consolidate" and tasks[-1]["track"] == t else 0)
        for k in range(min(missing, max_new, len(topics))):
            tasks.append({"kind": "generate", "track": t, "id": nxt + k, "topic": topics[k], "round": k})
    # round 0 = what he needs today (corrections + each track's next lesson); later rounds fill the lookahead
    return sorted(tasks, key=lambda x: x["round"])


# ------------------------------------------------------------------ reminders
def sync_reminders(model, idx):
    lessons = []
    for t in TRACKS:
        tm = model["tracks"][t]
        i = tm["active_lesson"] or (max(idx[t]) if idx[t] else None)
        if not i or i not in idx[t]:
            continue
        L = json.load(open(idx[t][i]["file"], encoding="utf-8"))
        focus = " · ".join(o["text"] for o in L["objectives"][:3])
        todo = []
        if L.get("diagnostic") and not tm["diagnostic"]:
            todo.append("eerst de niveautest")
        if tm["srs"]["due_today"]:
            todo.append(f"{tm['srs']['due_today']} herhaalkaarten")
        lessons.append({"track": t, "prefix": trk.prefix(t), "lessonNum": i, "title": L["title"], "url": f"{SITE}?track={t}&lesson={i}",
                        "focus": (("Vandaag: " + ", ".join(todo) + ".\n") if todo else "") + focus, "duration": f"± {L.get('minutes', 40)} min",
                        "highlights": [o["id"] for o in L["objectives"][:3]]})
    payload = {"masterTitle": "Polyglot", "masterUrl": SITE, "lessons": lessons}
    r = subprocess.run(["swift", SWIFT, "sync", json.dumps(payload, ensure_ascii=False)], capture_output=True, text=True, timeout=120)
    log("  " + (r.stdout.strip() or r.stderr.strip())[:300])


def write_profile_compat(model):
    prof = {"user_name": "Thibaud", "version": 2, "last_run_date": model["today"], "streak_days": model["streak_days"]}
    for t in TRACKS:
        tm = model["tracks"][t]
        prof[t] = {"last_completed_lesson": tm["last_completed_lesson"], "active_lesson": tm["active_lesson"],
                   "level": (tm["diagnostic"] or {}).get("level"), "weak_spots": [s["objective"] for s in tm["weak_skills"][:4]]}
    json.dump(prof, open(PROFILE, "w", encoding="utf-8"), ensure_ascii=False, indent=2)


# ------------------------------------------------------------------ tasks
def run_task(tk, model, syllabus, cfg, today, report):
    """One Antigravity task (consolidate / revise / generate). Returns True when a lesson was written."""
    t = tk["track"]
    idx, items = learner.content_index(STUDIO)
    if tk["kind"] == "consolidate":
        frozen = set(model["tracks"][t]["frozen_lessons"])
        if tk["id"] in idx[t] and not shift_lessons(t, tk["id"], frozen):
            log(f"    ⚠ kan niet invoegen in {t} vóór les {tk['id']} (gestarte lessen)")
            return False
        idx, items = learner.content_index(STUDIO)
        extra = (f"- **Maak een consolidatieles** voor les {', '.join(map(str, tk['lessons']))}: de retentiecheck faalde. "
                 f"Richt je op deze leerdoelen: {json.dumps(tk['skills'], ensure_ascii=False)}. Gebruik `\"roadmap\": \"{tk['roadmap']}\"`.")
        L = ag.author_lesson(t, tk["id"], {"id": tk["roadmap"], "title": "Consolidatie"}, model, idx, syllabus, cfg, today, mode="consolidate", extra=extra, log=log)
    elif tk["kind"] == "revise":
        cur = json.load(open(lesson_path(t, tk["id"]), encoding="utf-8"))
        topic = next((x for x in syllabus.get(t, {}).get("topics", []) if x["id"] == cur.get("roadmap")), None)
        L = ag.author_lesson(t, tk["id"], topic, model, idx, syllabus, cfg, today, mode="revise", current=cur, log=log)
        if L:
            L.setdefault("meta", {})["notes"] = f"herzien {today}; oorspronkelijk {cur.get('meta', {}).get('created', '?')} door {cur.get('meta', {}).get('author', '?')}"
    else:
        L = ag.author_lesson(t, tk["id"], tk["topic"], model, idx, syllabus, cfg, today, log=log)
    if isinstance(L, dict) and L.get("unchanged"):  # Antigravity looked at it and decided it is fine: not an error
        remember_unchanged(t, tk["id"], L.get("reason", ""), today)
        report.setdefault("unchanged", []).append(f"{t} {tk['id']}")
        return False
    if not L:
        report["errors"].append(f"{tk['kind']} {t} {tk['id']}: geen geldige les na alle pogingen")
        return False
    p = write_lesson(L)
    report["tasks"].append({"kind": tk["kind"], "track": t, "id": tk["id"], "file": os.path.relpath(p, REPO), "adaptedFor": L.get("meta", {}).get("adaptedFor")})
    log(f"    ✓ {os.path.relpath(p, REPO)}")
    return True


def coach(model, cloud, cfg, today, report):
    """Daily coach pack from yesterday's results: private via Supabase, else into content/daily."""
    try:
        D = ag.coach_pack(model, cfg, today, log=log)
        if not D:
            return
        if cloud.configured and cloud.owner():
            cloud.put_coach(today, standalone_render(D))
            log("    ✓ coach-pakket privé naar Supabase")
        else:
            os.makedirs(os.path.join(STUDIO, "content", "daily"), exist_ok=True)
            json.dump(D, open(os.path.join(STUDIO, "content", "daily", f"{today}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            log("    ✓ coach-pakket in content/daily")
        report["coach"] = True
    except Exception as e:
        report["errors"].append(f"coach: {e}")
        log(f"    ✗ coach: {e}")


def publish(report, today, push):
    """Build (lenient: invalid lessons are skipped) and, when allowed, commit + push to GitHub Pages."""
    import build as B
    res = B.build(lenient=True, out_dir=REPO)
    report["errors"] += [x for x in res["problems"] if x not in report["errors"]]
    if not push:
        return
    sh(["git", "add", "-A", "studio/content", "radar", "index.html", "sw.js", "manifest.webmanifest", "solc-worker.js"])
    new = [x for x in report["tasks"] if not x.get("published")]
    msg = f"Daily {today}: " + (", ".join(f"{x['kind']} {x['track']} {x['id']}" for x in new) or "rebuild")
    c = sh(["git", "commit", "-m", msg])
    if "nothing to commit" in (c.stdout + c.stderr):
        log("    niets gewijzigd")
        return
    p = sh(["git", "push", "origin", "main"], timeout=180)
    if p.returncode != 0:  # someone pushed in between: rebase once and retry
        sh(["git", "pull", "--rebase", "origin", "main"], timeout=180)
        p = sh(["git", "push", "origin", "main"], timeout=180)
    if p.returncode == 0:
        for x in new:
            x["published"] = True
        log("    ✓ gepusht")
    else:
        report["errors"].append(f"push: {p.stderr.strip()[:300]}")
        log(f"    ⚠ push: {p.stderr.strip()[:300]}")


# ------------------------------------------------------------------ main
def main(argv):
    dry = "--dry-run" in argv
    no_agy = "--no-agy" in argv or dry
    cfg = load_env()
    today = dt.date.today().isoformat()
    os.makedirs(os.path.join(DATA, "runs"), exist_ok=True)
    lock = os.path.join(DATA, "daily.lock")
    if os.path.exists(lock) and time.time() - os.path.getmtime(lock) < 3 * 3600:
        log("Er loopt al een run (lock). Stop.")
        return 1
    open(lock, "w").write(str(os.getpid()))
    report = {"date": today, "started": dt.datetime.now().isoformat(timespec="seconds"), "tasks": [], "postponed": [], "errors": [], "fatal": []}

    def phase(name, fn):
        """One failing step must never stop the others (publishing, reminders and backup do not depend on it)."""
        try:
            return fn()
        except Exception as e:
            import traceback
            report["fatal"].append(f"{name}: {type(e).__name__}: {e}")
            log(f"    ✗ {name} mislukt: {type(e).__name__}: {e}\n" + "".join("      " + ln for ln in traceback.format_exc().splitlines(True)[-6:]))
            return None

    ctx = {"states": [], "events": [], "model": None, "tasks": [], "syllabus": {}, "cloud": None, "db_ok": False, "push": not dry and cfg.get("PUSH", "1") == "1"}
    try:
        log("=" * 64 + f"\n🎓 Polyglot Studio · dagelijkse run {dt.datetime.now():%Y-%m-%d %H:%M}\n" + "=" * 64)

        def p1():
            step("[1] Netwerk en git")
            internet, ctx["db_ok"] = (True, True) if dry else wait_for_network(cfg)
            if not dry and internet:
                branch = sh(["git", "rev-parse", "--abbrev-ref", "HEAD"]).stdout.strip()
                if branch != "main":
                    log(f"    ⚠ de repo staat op branch '{branch}' in plaats van main: geen pull en geen push in deze run")
                    report["errors"].append(f"branch {branch} ≠ main")
                    ctx["push"] = False
                else:
                    r = sh(["git", "pull", "--rebase", "--autostash", "origin", "main"], timeout=240)
                    log(f"    git pull: {(r.stdout or r.stderr).strip().splitlines()[-1] if (r.stdout or r.stderr).strip() else 'ok'}")
            elif not dry:
                ctx["push"] = False
                report["errors"].append("geen internet: niets gepusht")
        phase("netwerk/git", p1)

        def p2():
            step("[2] Leerdersmodel opbouwen")
            cloud = ctx["cloud"] = connect(cfg)
            if cloud.configured and ctx["db_ok"] is not False:
                try:
                    rows = cloud.progress()
                    ctx["states"] = [r["state"] for r in rows]
                    ctx["events"] = cloud.events(since_ms=(time.time() - 60 * 86400) * 1000)
                    ctx["db_ok"] = True
                    log(f"    {cloud.label}: {len(rows)} toestel(len), {len(ctx['events'])} events (60 d)" + ("" if cloud.owner() else " — nog geen account aangemaakt in de app"))
                except Exception as e:
                    ctx["db_ok"] = False
                    report["errors"].append(f"database: {e}")
                    log(f"    ⚠ database ({cloud.label}): {e}")
            elif cloud.configured:
                report["errors"].append("database: server niet bereikbaar")
                log(f"    ⚠ database ({cloud.label}) niet bereikbaar: lessen volgen enkel de roadmap, geen aanpassing op je resultaten")
            else:
                ctx["db_ok"] = False
                log("    ⚠ geen database ingesteld (~/scripts/polyglot.env) — geen prestatiegegevens; genereren volgt enkel de roadmap.")
            idx, items = learner.content_index(STUDIO)
            model = ctx["model"] = learner.build_model(ctx["states"], ctx["events"], idx, items)
            ctx["idx"] = idx
            try:  # profile file and log summary are for humans and Antigravity: they must never stop the planning
                json.dump(model, open(os.path.join(DATA, "learner_profile.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
                summary = learner.brief(model)
                open(os.path.join(DATA, "daily_brief.md"), "w", encoding="utf-8").write(summary + "\n")
                log("    " + summary.replace("\n", "\n    "))
            except Exception as e:
                report["errors"].append(f"samenvatting: {type(e).__name__}: {e}")
                log(f"    ⚠ samenvatting mislukt (planning gaat door): {type(e).__name__}: {e}")
        phase("leerdersmodel", p2)

        def p3():
            step("[3] Plannen")
            ctx["syllabus"] = load_syllabus()
            tasks = ctx["tasks"] = plan(ctx["model"], ctx["idx"], ctx["syllabus"], cfg)
            for tk in tasks:
                log(f"    • {tk['kind']:11s} {tk['track']:10s} les {tk['id']}" + (f" — {tk['topic']['title']}" if tk.get("topic") else ""))
            if not tasks:
                log("    niets te doen: buffer vol")
        if ctx["model"] is not None:
            phase("plannen", p3)

        model, tasks, syllabus, cloud, states = ctx["model"], ctx["tasks"], ctx["syllabus"], ctx["cloud"], ctx["states"]
        push = ctx["push"]
        if not no_agy:
            step("[4] Antigravity")
            t0 = time.time()
            budget = float(cfg.get("RUN_BUDGET_MIN", 150)) * 60
            if model and cfg.get("COACH", "1") == "1" and any(tm.get("attempts_7d", 0) for tm in model["tracks"].values()):
                phase("coach", lambda: coach(model, cloud, cfg, today, report))
            rounds = sorted({tk["round"] for tk in tasks})
            for r in rounds:
                changed = False
                for tk in (x for x in tasks if x["round"] == r):
                    if time.time() - t0 > budget:
                        log(f"    ⏭ tijdsbudget op ({budget / 60:.0f} min): {tk['kind']} {tk['track']} les {tk['id']} volgt morgen")
                        report["postponed"].append(f"{tk['kind']} {tk['track']} {tk['id']}")
                        continue
                    try:
                        changed |= run_task(tk, model, syllabus, cfg, today, report)
                    except Exception as e:
                        report["errors"].append(f"{tk['kind']} {tk['track']} {tk['id']}: {e}")
                        log(f"    ✗ {tk['kind']} {tk['track']} {tk['id']}: {e}")
                if changed and push and r != rounds[-1]:
                    log("    ↑ tussentijds publiceren, zodat de lessen van vandaag al klaarstaan")
                    phase("publiceren", lambda: publish(report, today, push))

            if cfg.get("RADAR", "1") == "1":  # reading section; the lessons go out first so they never wait for it
                if push and report["tasks"]:
                    phase("publiceren", lambda: publish(report, today, push))
                step("[4b] Onder de motorkap")

                def radar_step():
                    import radar
                    report["radar"] = radar.run(states, cfg, today, log=log, budget_s=float(cfg.get("RADAR_BUDGET_MIN", 30)) * 60)
                phase("radar", radar_step)
        elif dry and cfg.get("RADAR", "1") == "1":
            step("[4b] Onder de motorkap (plan)")

            def radar_plan():
                import radar
                radar.run(states, cfg, today, log=log, dry=True)
            phase("radar", radar_plan)

        step("[5] Bouwen en publiceren")
        phase("publiceren", lambda: publish(report, today, push))

        if not dry and cfg.get("REMINDERS", "1") == "1":
            step("[6] Apple Herinneringen")

            def reminders():
                if not ctx["db_ok"] and cfg.get("POLYGLOT_SSH"):  # without progress data every track would show lesson 1
                    log("    overgeslagen: geen voortgangsdata (server onbereikbaar); de herinnering van gisteren blijft staan")
                    return
                idx, items = learner.content_index(STUDIO)
                model2 = learner.build_model(states, ctx["events"], idx, items)
                sync_reminders(model2, idx)
                write_profile_compat(model2)
            phase("herinneringen", reminders)

        if not dry and cfg.get("POLYGLOT_SSH") and cfg.get("OFFSITE_BACKUP", "1") == "1":
            step("[7] Back-up naar OneDrive")

            def backup():
                try:  # child process with a time limit: OneDrive can hang
                    r = subprocess.run([sys.executable, os.path.join(HERE, "offsite_backup.py")], capture_output=True, text=True, timeout=300)
                    log("    " + ((r.stdout or r.stderr).strip() or f"exit {r.returncode}")[:300])
                    if r.returncode != 0:
                        report["errors"].append("offsite backup: " + (r.stdout or r.stderr).strip()[:200])
                except subprocess.TimeoutExpired:
                    log("    ⚠ OneDrive reageerde niet binnen 5 minuten — morgen opnieuw")
                    report["errors"].append("offsite backup: timeout")
            phase("back-up", backup)

        if report["fatal"]:
            log(f"⚠ Klaar, maar {len(report['fatal'])} stap(pen) mislukten: {report['fatal']}")
            if not dry:
                notify("Polyglot: ochtendrun met fouten", "; ".join(report["fatal"])[:180])
            return 1
        log("✅ Klaar")
        return 0
    except BaseException as e:  # nothing above should get here, but a silent death is the worst outcome
        report["fatal"].append(f"onverwacht: {type(e).__name__}: {e}")
        if not dry:
            notify("Polyglot: ochtendrun gecrasht", f"{type(e).__name__}: {e}")
        raise
    finally:
        report["finished"] = dt.datetime.now().isoformat(timespec="seconds")
        path = os.path.join(DATA, "runs", f"{today}.json")
        if os.path.exists(path):  # a second run the same day must not overwrite the morning report
            path = os.path.join(DATA, "runs", f"{today}-{dt.datetime.now():%H%M}.json")
        json.dump(report, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        try:
            os.remove(lock)
        except OSError:
            pass


def standalone_render(D):
    """Render a coach pack (markdown + KaTeX) for private delivery via Supabase."""
    import md as M
    import build as B
    M.MATH.clear()
    M._MATH_INDEX.clear()
    R = B.render_daily(D)
    out, _ = B.render_math(R)
    return out


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
