"""Push engine/out/<run_id>/*.json to Supabase over REST (service-role key, server side only).
Signals/evidence/steps/drafts have bigserial ids: the local id is dropped on insert and the new ids are
mapped back into forecasts.drivers (signal_ids, evidence_ids) so citations keep pointing at the right rows."""
import json
import math
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
CHUNK = 400
CHILD = ("signals", "evidence", "steps", "drafts", "forecasts")  # delete order; forecasts re-inserted after remap


def _clean(o):
    if isinstance(o, float) and not math.isfinite(o):
        return None
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_clean(v) for v in o]
    return o


def _load(run_dir: Path, name: str) -> list:
    p = run_dir / f"{name}.json"
    return _clean(json.loads(p.read_text(encoding="utf-8"))) if p.exists() else []


def _headers(key: str, extra: str = "") -> dict:
    h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if extra:
        h["Prefer"] = extra
    return h


def _call(method: str, url: str, **kw):
    r = httpx.request(method, url, timeout=60, **kw)
    if r.status_code >= 400:
        raise RuntimeError(f"Supabase {method} {url.rsplit('/', 1)[-1].split('?')[0]} -> {r.status_code}: {r.text[:300]}")
    return r.json() if r.content else None


def prepare(run_dir: Path) -> dict:
    """Read JSON tables, return {table: rows} ready for insert, with ids dropped (id maps recorded for remap)."""
    t = {n: _load(run_dir, n) for n in ("runs", "loans", "signals", "forecasts", "evidence", "steps", "drafts")}
    t["_old_ids"] = {n: [r.get("id") for r in t[n]] for n in ("signals", "evidence")}
    for n in ("signals", "evidence", "steps", "drafts"):
        t[n] = [{k: v for k, v in r.items() if k != "id"} for r in t[n]]
    return t


def remap_forecasts(forecasts: list, old: dict, new: dict) -> list:
    """old/new: {'signals': [ids], 'evidence': [ids]} in identical order."""
    maps = {n: dict(zip(old[n], new[n])) for n in ("signals", "evidence")}
    out = []
    for f in forecasts:
        f = json.loads(json.dumps(f))
        for d in f.get("drivers") or []:
            for key, tbl in (("signal_ids", "signals"), ("evidence_ids", "evidence")):
                if isinstance(d.get(key), list):
                    d[key] = [maps[tbl].get(i, i) for i in d[key]]
        out.append(f)
    return out


def push(run_dir: str) -> None:
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY missing")
    if not url:
        raise RuntimeError("SUPABASE_URL missing")
    rest = url.rstrip("/") + "/rest/v1"
    t = prepare(Path(run_dir))
    run_ids = sorted({r["run_id"] for n in CHILD for r in t.get(n, []) if r.get("run_id")} | {r["id"] for r in t["runs"]})

    def post(table, rows, upsert_on=None, ret=False):
        out = []
        pref = ("resolution=merge-duplicates," if upsert_on else "") + ("return=representation" if ret else "return=minimal")
        q = f"?on_conflict={upsert_on}" if upsert_on else ""
        for i in range(0, len(rows), CHUNK):
            res = _call("POST", f"{rest}/{table}{q}", headers=_headers(key, pref), json=rows[i:i + CHUNK])
            if ret:
                out += res
        return out

    # parents first (upsert), then replace children for these run ids
    post("runs", t["runs"], upsert_on="id")
    post("loans", t["loans"], upsert_on="id")
    for rid in run_ids:
        for n in CHILD:
            _call("DELETE", f"{rest}/{n}?run_id=eq.{rid}", headers=_headers(key))
    new = {}
    for n in ("signals", "evidence"):
        res = post(n, t[n], ret=True)
        if len(res) != len(t[n]):
            raise RuntimeError(f"{n}: inserted {len(res)} of {len(t[n])} rows")
        new[n] = [r["id"] for r in res]
    post("steps", t["steps"])
    post("drafts", t["drafts"])
    post("forecasts", remap_forecasts(t["forecasts"], t["_old_ids"], new))


if __name__ == "__main__":
    import sys
    rd = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / "out" / "latest"
    t = prepare(rd)
    print("prepared:", {k: len(v) for k, v in t.items() if not k.startswith("_")})
    # offline remap check
    old = t["_old_ids"]
    fake_new = {n: [i * 10 if isinstance(i, int) else i for i in old[n]] for n in old}
    rf = remap_forecasts(t["forecasts"], old, fake_new)
    changed = sum(1 for a, b in zip(t["forecasts"], rf) if a != b)
    print("forecasts with remapped citation ids:", changed)
    if os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
        push(str(rd))
        print("pushed")
    else:
        print("SUPABASE_SERVICE_ROLE_KEY missing - push skipped")
