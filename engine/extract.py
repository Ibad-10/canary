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


# ---------- sanity checks ----------
RANGES = {"icr_min": (1.0, 3.0), "icr_cash_trap": (1.0, 3.0), "ltv_max": (40.0, 90.0), "ltv_cash_trap": (40.0, 90.0),
          "rate_pct": (0.0, 15.0)}


def _norm(t: dict) -> dict:
    """LTV terms in percent (V7 sometimes returns 0.65 for 65%)."""
    out = dict(t)
    for k in ("ltv_max", "ltv_cash_trap"):
        v = out.get(k)
        if isinstance(v, (int, float)) and v <= 1.5:
            out[k] = round(v * 100, 4)
    return out


def _in_range(k: str, v) -> bool:
    lo, hi = RANGES[k]
    return isinstance(v, (int, float)) and lo <= v <= hi


def validate(t: dict) -> list[str]:
    """Problems with a set of (normalised) terms; empty list means they pass."""
    bad = [f"{k}={t.get(k)} outside {RANGES[k][0]:g}-{RANGES[k][1]:g}" for k in RANGES
           if (k in KEYS or t.get(k) is not None) and not _in_range(k, t.get(k))]
    if _in_range("icr_min", t.get("icr_min")) and _in_range("icr_cash_trap", t.get("icr_cash_trap")) \
            and not t["icr_cash_trap"] > t["icr_min"]:
        bad.append(f"icr_cash_trap {t['icr_cash_trap']} not above icr_min {t['icr_min']}")
    if _in_range("ltv_max", t.get("ltv_max")) and _in_range("ltv_cash_trap", t.get("ltv_cash_trap")) \
            and not t["ltv_cash_trap"] < t["ltv_max"]:
        bad.append(f"ltv_cash_trap {t['ltv_cash_trap']} not below ltv_max {t['ltv_max']}")
    return bad


def reconcile(v7: dict | None, local: dict | None) -> tuple[dict | None, str, list[str]]:
    """Pick terms from V7 and regex results. Returns (terms, tool, checks). V7 wins when valid; disagreements and
    out-of-range values are recorded in checks, and invalid V7 values fall back to valid regex values."""
    checks: list[str] = []
    v7 = _norm(v7) if v7 else None
    local = _norm(local) if local else None
    local_ok = local is not None and not validate(local)
    if local is not None and not local_ok:
        checks.append("regex: " + "; ".join(validate(local)))
    if v7 is None:
        return (local, "pypdf+regex (V7 Go fallback)", checks) if local_ok else (None, "", checks)
    terms, tool = dict(v7), "V7 Go"
    for k in KEYS:
        if not _in_range(k, v7.get(k)):
            checks.append(f"V7 {k}={v7.get(k)} out of range")
            if local_ok:
                terms[k], tool = local[k], "V7 Go + regex fallback"
                checks.append(f"{k} taken from regex ({local[k]})")
        elif local is not None and isinstance(local.get(k), (int, float)) and abs(local[k] - v7[k]) > 1e-6:
            checks.append(f"V7 and regex disagree on {k}: {v7[k]} vs {local[k]} (kept V7)")
    order = validate(terms)
    if order:
        checks += [f"V7: {p}" for p in order]
        if not local_ok:
            return None, "", checks
        terms, tool = dict(local), "pypdf+regex (V7 failed sanity checks)"
    terms["test"] = terms.get("test") or "ICR"
    return terms, tool, checks


def covenants(contract_path: str) -> dict | None:
    name = Path(contract_path).name
    v7 = None
    try:
        v7 = _v7(contract_path)
        if not all(isinstance(v7.get(k), (int, float)) for k in KEYS):
            print(f"extract: V7 returned incomplete terms: {sorted(v7)}")
            v7 = None
    except Exception as e:
        print(f"extract: V7 failed ({type(e).__name__}: {str(e)[:160]}); using local pypdf+regex")
    try:
        local = _local(contract_path)
    except Exception as e:
        print(f"extract: regex failed ({type(e).__name__}: {str(e)[:160]})")
        local = None
    terms, tool, checks = reconcile(v7, local)
    for c in checks:
        print(f"extract: {name}: {c}")
    if terms is None:
        if checks:
            raise ValueError(f"{name}: covenant terms failed sanity checks: {'; '.join(checks)[:240]}")
        return None
    return {**{k: terms[k] for k in KEYS}, "test": terms["test"], "checks": checks,
            "source": {"tool": tool, "file": name, "checks": checks}}


if __name__ == "__main__":
    import sys
    for p in sorted((ROOT / "engine" / "contracts").glob("*.pdf"))[: int(sys.argv[1]) if len(sys.argv) > 1 else 3]:
        print(p.name, covenants(str(p)))
