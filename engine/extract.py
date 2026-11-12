"""Extract covenant terms from a facility-agreement PDF. V7 Go first (cached project ids in engine/cache/v7.json),
local pypdf + regex fallback. covenants() returns None only if both fail to find the core terms."""
import json
import os
import re
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
CACHE = ROOT / "engine" / "cache" / "v7.json"
BASE = "https://go.v7labs.com/api"
PROMPT = (
    "Read the facility agreement. Extract the financial covenant terms as JSON with exactly these keys: "
    "icr_min (number, the Default ICR minimum, e.g. 1.25), icr_cash_trap (number, Cash Trap ICR), "
    "ltv_max (number in percent, Default LTV maximum, e.g. 65.0), ltv_cash_trap (number in percent, Cash Trap LTV), "
    "test (string 'ICR' or 'DSCR', the primary income test). Numbers only, no units."
)
SCHEMA = {"type": "object", "additionalProperties": False,
          "properties": {"icr_min": {"type": "number"}, "icr_cash_trap": {"type": "number"}, "ltv_max": {"type": "number"},
                         "ltv_cash_trap": {"type": "number"}, "test": {"type": "string"}},
          "required": ["icr_min", "icr_cash_trap", "ltv_max", "ltv_cash_trap", "test"]}
KEYS = ("icr_min", "icr_cash_trap", "ltv_max", "ltv_cash_trap")


# ---------- local fallback ----------
def _local(path: str) -> dict | None:
    text = " ".join((p.extract_text() or "") for p in PdfReader(path).pages)
    text = re.sub(r"\s+", " ", text)

    def num(pat):
        m = re.search(pat, text, re.I)
        return float(m.group(1)) if m else None

    out = {
        "icr_min": num(r"not less than (?:<b>)?(\d+(?:\.\d+)?)\s*x\)? \(the Default ICR"),
        "icr_cash_trap": num(r"ICR is less than (\d+(?:\.\d+)?)\s*x \(the Cash Trap ICR"),
        "ltv_max": num(r"LTV does not at any time exceed (\d+(?:\.\d+)?)\s*%"),
        "ltv_cash_trap": num(r"LTV exceeds (\d+(?:\.\d+)?)\s*% \(the Cash Trap LTV"),
    }
    if any(out[k] is None for k in KEYS):
        return None
    t = re.search(r"primary income test under this Agreement is (ICR|DSCR)", text)
    out["test"] = t.group(1) if t else "ICR"
    return out


# ---------- V7 Go ----------
def _h():
    key = os.getenv("V7_API_KEY")
    if not key:
        raise RuntimeError("V7_API_KEY missing")
    return {"X-API-KEY": key, "accept": "application/json", "content-type": "application/json"}


def _req(method, path, **kw):
    r = httpx.request(method, BASE + path, headers=_h(), timeout=60, **kw)
    if r.status_code >= 400:
        raise RuntimeError(f"V7 {method} {path.split('?')[0][-40:]} -> {r.status_code} {r.text[:200]}")
    return r.json() if r.content else {}


def _setup() -> dict:
    try:
        c = json.loads(CACHE.read_text(encoding="utf-8"))
        if c.get("ws") and c.get("project") and c.get("file_prop") and c.get("terms_prop"):
            return c
    except Exception:
        c = {}
    ws = c.get("ws") or _req("GET", "/workspaces")["data"][0]["id"]
    c["ws"] = ws
    if not c.get("project"):
        c["project"] = _req("POST", f"/workspaces/{ws}/projects", json={"name": "Canary - covenant extraction"})["id"]
    base = f"/workspaces/{ws}/projects/{c['project']}/properties"
    if not c.get("file_prop"):
        p = _req("POST", base, json={"name": "Contract", "type": "file", "tool": "manual", "description": "Facility agreement PDF"})
        c["file_prop"] = p["id"]
    if not c.get("terms_prop"):
        p = _req("POST", base, json={"name": "Covenants", "type": "json", "tool": "auto_llm", "description": PROMPT,
                                     "config": {"json_schema": SCHEMA},
                                     "inputs": [{"property_id": c["file_prop"], "target": "value"}]})
        c["terms_prop"] = p["id"]
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(c), encoding="utf-8")
    return c


def _v7(path: str, wait_s: int = 120) -> dict:
    c = _setup()
    ws, pr = c["ws"], c["project"]
    ent = _req("POST", f"/workspaces/{ws}/projects/{pr}/entities", json={})["id"]
    up = _req("POST", f"/workspaces/{ws}/projects/{pr}/entities/{ent}/properties/{c['file_prop']}/start_file_upload",
              json={"filename": Path(path).name})
    with open(path, "rb") as f:
        r = httpx.put(up["file_upload_url"], content=f.read(), headers={"Content-Type": "application/pdf"}, timeout=60)
    r.raise_for_status()
    httpx.post(up["confirm_upload_url"], headers=_h(), json={"status": "complete", "error_message": None}, timeout=60).raise_for_status()
    deadline = time.time() + wait_s
    while time.time() < deadline:
        e = _req("GET", f"/workspaces/{ws}/projects/{pr}/entities/{ent}")
        # the entity may have been moved to a sub-project on upload; fields are keyed by property id or slug
        f = (e.get("fields") or {})
        fld = f.get(c["terms_prop"]) or f.get("covenants")
        if fld:
            if fld.get("status") == "error":
                raise RuntimeError(f"V7 extraction error: {fld.get('error_message')}")
            val = (fld.get("tool_value") or {}).get("value")
            if fld.get("status") == "complete" and val:
                return json.loads(val) if isinstance(val, str) else val
        time.sleep(4)
    raise TimeoutError("V7 extraction timed out")


def covenants(contract_path: str) -> dict | None:
    name = Path(contract_path).name
    try:
        t = _v7(contract_path)
        if all(isinstance(t.get(k), (int, float)) for k in KEYS):
            return {**{k: t[k] for k in KEYS}, "test": t.get("test") or "ICR", "source": {"tool": "V7 Go", "file": name}}
        raise ValueError(f"V7 returned incomplete terms: {sorted(t)}")
    except Exception as e:
        print(f"extract: V7 failed ({type(e).__name__}: {str(e)[:160]}); using local pypdf+regex")
    t = _local(contract_path)
    if t is None:
        return None
    return {**t, "source": {"tool": "pypdf+regex (V7 Go fallback)", "file": name}}


if __name__ == "__main__":
    import sys
    for p in sorted((ROOT / "engine" / "contracts").glob("*.pdf"))[: int(sys.argv[1]) if len(sys.argv) > 1 else 3]:
        print(p.name, covenants(str(p)))
