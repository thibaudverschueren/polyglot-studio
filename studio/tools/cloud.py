"""cloud.py — minimal Supabase REST client (stdlib only) for the Mac orchestrator.

Reads ~/scripts/polyglot.env:
  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY=eyJ…   (service-role key — stays on this Mac, never in the website)
  POLYGLOT_USER_ID=…          (optional; auto-detected when there is one user)
"""
import json
import os
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


class Cloud:
    def __init__(self, env=None):
        env = env or load_env()
        self.url = (env.get("SUPABASE_URL") or "").rstrip("/")
        self.key = env.get("SUPABASE_SERVICE_KEY") or ""
        self.user_id = env.get("POLYGLOT_USER_ID") or ""

    @property
    def configured(self):
        return bool(self.url and self.key)

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
        rows = self._req("GET", "/rest/v1/progress?select=user_id,device,state,updated_at") or []
        if not self.user_id and rows:
            ids = {r["user_id"] for r in rows}
            if len(ids) == 1:
                self.user_id = ids.pop()
        return [r for r in rows if not self.user_id or r["user_id"] == self.user_id]

    def events(self, since_ms=0, page=1000):
        out, offset = [], 0
        while True:
            q = f"/rest/v1/events?select=id,device,ts,data&ts=gt.{int(since_ms)}&order=ts.asc&limit={page}&offset={offset}"
            if self.user_id:
                q += f"&user_id=eq.{self.user_id}"
            rows = self._req("GET", q) or []
            out += rows
            if len(rows) < page:
                break
            offset += page
        return [dict(r["data"], id=r["id"], ts=r["ts"], dev=r["device"]) for r in out]

    def put_coach(self, date, pack):
        if not self.user_id:
            raise RuntimeError("POLYGLOT_USER_ID onbekend (nog geen voortgang gesynchroniseerd?)")
        return self._req("POST", "/rest/v1/coach", {"user_id": self.user_id, "date": date, "pack": pack},
                         headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
