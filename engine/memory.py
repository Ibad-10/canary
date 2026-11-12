"""cognee cloud memory for analyst corrections. Endpoints (from /openapi.json):
POST /api/v1/add_text, POST /api/v1/cognify, POST /api/v1/search (CHUNKS). Raises on failure."""
import os
import re
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
DATASET = "canary_corrections"
PAT = re.compile(r"Analyst correction for loan (\S+): ignore (\S+) signal - ([^\n]*?)(?: \(by [^)]*\))?(?:\n|$)")


def _cog():
    url, key, tenant = (os.getenv(k) for k in ("COGNEE_API_URL", "COGNEE_API_KEY", "COGNEE_TENANT_ID"))
    if not (url and key and tenant):
        raise RuntimeError("COGNEE_API_URL / COGNEE_API_KEY / COGNEE_TENANT_ID missing")
    return url.rstrip("/"), {"X-Api-Key": key, "X-Tenant-Id": tenant}


def remember(correction: dict) -> None:
    """correction: {loan_id, signal_kind, note, author?}. Stores text in cognee and starts cognify in background."""
    url, h = _cog()
    text = (f"Analyst correction for loan {correction['loan_id']}: ignore {correction['signal_kind']} signal - "
            f"{correction.get('note', '').strip() or 'no note'} (by {correction.get('author') or 'analyst'})\n")
    r = httpx.post(f"{url}/api/v1/add_text", headers=h, json={"textData": [text], "datasetName": DATASET}, timeout=60)
    r.raise_for_status()
    r = httpx.post(f"{url}/api/v1/cognify", headers=h, json={"datasets": [DATASET], "runInBackground": True}, timeout=60)
    r.raise_for_status()


def _strings(o):
    if isinstance(o, str):
        yield o
    elif isinstance(o, dict):
        for v in o.values():
            yield from _strings(v)
    elif isinstance(o, list):
        for v in o:
            yield from _strings(v)


def _from_cognee(loan_ids: list[str]) -> list[dict]:
    url, h = _cog()
    r = httpx.post(f"{url}/api/v1/search", headers=h, timeout=60, json={
        "searchType": "CHUNKS", "datasets": [DATASET], "topK": 100,
        "query": "Analyst correction for loan " + " ".join(loan_ids)})
    if r.status_code == 404:  # dataset empty / not cognified yet -> no memories, not an error
        return []
    r.raise_for_status()
    out = []
    for s in _strings(r.json()):
        for m in PAT.finditer(s):
            out.append({"loan_id": m.group(1), "signal_kind": m.group(2), "note": m.group(3).strip()})
    return out


def _from_supabase(loan_ids: list[str]) -> list[dict]:
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_ANON_KEY")
    if not (url and key):
        raise RuntimeError("SUPABASE_URL / SUPABASE_ANON_KEY missing")
    r = httpx.get(f"{url.rstrip('/')}/rest/v1/corrections", params={"select": "loan_id,signal_kind,note"},
                  headers={"apikey": key, "Authorization": f"Bearer {key}"}, timeout=20)
    r.raise_for_status()
    return [{"loan_id": x["loan_id"], "signal_kind": x["signal_kind"], "note": x.get("note") or ""} for x in r.json()]


def recall(loan_ids: list[str]) -> list[dict]:
    """-> [{'loan_id','signal_kind','note'}] for the given loans, deduped. Cognee first, Supabase corrections table second."""
    found, errs = [], []
    for fn in (_from_cognee, _from_supabase):
        try:
            found += fn(loan_ids)
        except Exception as e:
            errs.append(f"{fn.__name__}: {type(e).__name__}: {str(e)[:100]}")
    if len(errs) == 2:
        raise RuntimeError("memory unavailable: " + "; ".join(errs))
    seen, out = set(), []
    for c in found:
        k = (c["loan_id"], c["signal_kind"])
        if c["loan_id"] in loan_ids and k not in seen:
            seen.add(k)
            out.append(c)
    return out


if __name__ == "__main__":
    remember({"loan_id": "L99", "signal_kind": "arrears", "note": "disputed lease", "author": "smoke test"})
    print("remembered; recall:", recall(["L99"]))
