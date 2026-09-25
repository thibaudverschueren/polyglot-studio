#!/usr/bin/env python3
"""offsite_backup.py — copies the nightly database backups from the server (MacBook 2) to OneDrive.

The server keeps 30 days in ~/polyglot/backups (03:30, ~/polyglot/backup.sh). This copies every dump
that is not in OneDrive yet and keeps there the last 30 days plus the dump of the 1st of every month.
The morning run calls it last, in a child process with a time limit, because OneDrive can hang.

  python3 offsite_backup.py

~/scripts/polyglot.env: POLYGLOT_SSH=macbook2 · OFFSITE_BACKUP_DIR=… (default: OneDrive/Polyglot Studio/backups)
"""
import datetime as dt
import gzip
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from cloud import load_env  # noqa: E402

NAME = re.compile(r"^polyglot-(\d{4}-\d{2}-\d{2})\.sql\.gz$")
DEFAULT_DIR = "~/Library/CloudStorage/OneDrive-Personnel/Polyglot Studio/backups"
KEEP_DAYS = 30


def ssh(host, command, **kw):
    return subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", host, command], **kw)


def main():
    env = load_env()
    host = env.get("POLYGLOT_SSH")
    dest = os.path.expanduser(env.get("OFFSITE_BACKUP_DIR") or DEFAULT_DIR)
    if not host:
        print("geen server ingesteld (POLYGLOT_SSH)")
        return 0
    root = os.path.dirname(os.path.dirname(dest))
    if not os.path.isdir(root):
        print(f"OneDrive-map niet gevonden: {root}")
        return 1
    os.makedirs(dest, exist_ok=True)

    r = ssh(host, "ls -1 ~/polyglot/backups", capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        print(f"server {host}: {r.stderr.strip()[:200]}")
        return 1
    have = set(os.listdir(dest))
    copied, failed = 0, 0
    for name in sorted(n for n in r.stdout.split() if NAME.match(n)):
        if name in have:
            continue
        tmp = os.path.join(dest, f".{name}.part")
        with open(tmp, "wb") as f:
            c = ssh(host, f"cat ~/polyglot/backups/{name}", stdout=f, stderr=subprocess.PIPE, timeout=120)
        try:
            if c.returncode != 0:
                raise RuntimeError(c.stderr.decode("utf-8", "replace").strip()[:200])
            with gzip.open(tmp) as g:  # a truncated copy is worse than none
                g.read()
            os.replace(tmp, os.path.join(dest, name))
            copied += 1
        except Exception as e:
            os.remove(tmp)
            failed += 1
            print(f"✗ {name}: {e}")

    cutoff = (dt.date.today() - dt.timedelta(days=KEEP_DAYS)).isoformat()
    removed = 0
    for name in os.listdir(dest):
        m = NAME.match(name)
        if m and m.group(1) < cutoff and not m.group(1).endswith("-01"):
            os.remove(os.path.join(dest, name))
            removed += 1
    kept = sum(1 for n in os.listdir(dest) if NAME.match(n))
    print(f"{'✓' if not failed else '⚠'} OneDrive: {copied} nieuw, {removed} opgeruimd, {kept} bewaard")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
