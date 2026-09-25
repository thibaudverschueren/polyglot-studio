"""cloud.py — access to the Polyglot tables (polyglot_*) for the morning run. Stdlib only.

Two backends, chosen by ~/scripts/polyglot.env:
  POLYGLOT_SSH=macbook2             self-hosted Supabase on the home server, read via SSH + psql
  POLYGLOT_DB_CONTAINER=supabase-db (no keys on this Mac: the existing SSH key is the only access)
or
  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY=…            Supabase cloud via REST (service key stays on this Mac)
  POLYGLOT_USER_ID=…                optional; otherwise the owner in polyglot_members
"""
import json
import os
import re
import secrets
import subprocess
import urllib.error
import urllib.parse
import urllib.request

ENV_PATH = os.path.expanduser("~/scripts/polyglot.env")


def load_env(path=ENV_PATH):
    env = {}
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    for k in list(env):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def connect(env=None):
    env = env or load_env()
    return SshDb(env) if env.get("POLYGLOT_SSH") else Cloud(env)


class SshDb:
    """Self-hosted Supabase on the home server: psql inside the database container, over SSH."""

    def __init__(self, env):
        self.host = env.get("POLYGLOT_SSH", "")
        self.container = env.get("POLYGLOT_DB_CONTAINER") or "supabase-db"
        uid = (env.get("POLYGLOT_USER_ID") or "").lower()
        self.user_id = uid if UUID.match(uid) else ""
        self.label = f"server {self.host}"

    @property
    def configured(self):
        return bool(self.host)

    def _sql(self, sql, timeout=180):
        cmd = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", self.host,
               f"docker exec -i {self.container} psql -U postgres -d postgres -At -v ON_ERROR_STOP=1"]
        r = subprocess.run(cmd, input=sql, capture_output=True, text=True, timeout=timeout)
        if r.returncode != 0:
            raise RuntimeError(f"database op {self.host}: {(r.stderr or r.stdout).strip()[:300]}")
        return r.stdout.strip()

    def _json(self, sql):
        out = self._sql(sql)
        return json.loads(out) if out else None

    def owner(self):
        if not self.user_id:
            ids = self._json("select coalesce(json_agg(user_id), '[]') from public.polyglot_members;") or []
            if len(ids) == 1 and UUID.match(ids[0]):
                self.user_id = ids[0]
        return self.user_id

    def progress(self):
        uid = self.owner()
        if not uid:
            return []
        return self._json("select coalesce(json_agg(json_build_object('user_id', user_id, 'device', device, 'state', state, 'updated_at', updated_at)), '[]') "
                          f"from public.polyglot_progress where user_id = '{uid}';") or []

    def events(self, since_ms=0):
        uid = self.owner()
        if not uid:
            return []
        rows = self._json("select coalesce(json_agg(json_build_object('id', id, 'device', device, 'ts', ts, 'data', data) order by ts), '[]') "
                          f"from public.polyglot_events where user_id = '{uid}' and ts > {int(since_ms)};") or []
        return [dict(r["data"], id=r["id"], ts=r["ts"], dev=r["device"]) for r in rows]

    def put_coach(self, date, pack):
        uid = self.owner()
        if not uid:
            raise RuntimeError("nog geen Polyglot-account op de server")
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
            raise ValueError(f"ongeldige datum {date}")
        tag = "pg" + secrets.token_hex(8)
        body = json.dumps(pack, ensure_ascii=False)
        self._sql(f"insert into public.polyglot_coach (user_id, date, pack) values ('{uid}', '{date}', ${tag}${body}${tag}$::jsonb) "
                  "on conflict (user_id, date) do update set pack = excluded.pack, created_at = now();")


class Cloud:
    """Supabase cloud via REST with the service key."""

    def __init__(self, env=None):
        env = env or load_env()
        self.url = (env.get("SUPABASE_URL") or "").rstrip("/")
        self.key = env.get("SUPABASE_SERVICE_KEY") or ""
        self.user_id = env.get("POLYGLOT_USER_ID") or ""
        self.label = "Supabase"

    @property
    def configured(self):
        return bool(self.url and self.key)

    def owner(self):
        if not self.user_id:
            ids = [r["user_id"] for r in self._req("GET", "/rest/v1/polyglot_members?select=user_id") or []]
            if len(ids) == 1:
                self.user_id = ids[0]
        return self.user_id

    def _req(self, method, path, body=None, headers=None, timeout=30):
        h = {"apikey": self.key, "Content-Type": "application/json"}
        if self.key.startswith("eyJ"):  # legacy service_role JWT; new sb_secret_… keys go in apikey only
            h["Authorization"] = f"Bearer {self.key}"
        h.update(headers or {})
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.url + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Supabase {method} {path.split('?')[0]} → {e.code}: {e.read().decode('utf-8', 'replace')[:300]}")

    def progress(self):
        uid = self.owner()
        if not uid:
            return []
        return self._req("GET", f"/rest/v1/polyglot_progress?select=user_id,device,state,updated_at&user_id=eq.{uid}") or []

    def events(self, since_ms=0, page=1000):
        out, offset = [], 0
        while True:
            q = f"/rest/v1/polyglot_events?select=id,device,ts,data&ts=gt.{int(since_ms)}&order=ts.asc&limit={page}&offset={offset}"
            if self.owner():
                q += f"&user_id=eq.{self.user_id}"
            rows = self._req("GET", q) or []
            out += rows
            if len(rows) < page:
                break
            offset += page
        return [dict(r["data"], id=r["id"], ts=r["ts"], dev=r["device"]) for r in out]

    def put_coach(self, date, pack):
        if not self.owner():
            raise RuntimeError("nog geen Polyglot-account (polyglot_members is leeg)")
        return self._req("POST", "/rest/v1/polyglot_coach", {"user_id": self.user_id, "date": date, "pack": pack},
                         headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
