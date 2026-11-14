"""Parallel web search + Grok classification -> news evidence rows. Raises on total failure."""
import json
import os
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from dotenv import load_dotenv

from . import llm

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
CACHE = ROOT / "engine" / "cache" / "news.json"
_lock = threading.Lock()
_cache: dict | None = None

LABELS = ("operator_distress", "tenant_loss", "refinancing_risk", "regulatory_action", "irrelevant")
SEVS = ("low", "medium", "high")
# label -> (metric, {severity: delta_pct}); fixed table, the LLM never picks numbers
EFFECTS = {
    "operator_distress": ("occupancy", {"low": -2, "medium": -5, "high": -10}),
    "tenant_loss": ("rent", {"low": -3, "medium": -7, "high": -15}),
    "regulatory_action": ("value", {"low": -1, "medium": -3, "high": -6}),
    "refinancing_risk": ("value", {"low": -1, "medium": -2, "high": -4}),
}
NICE = {
    "operator_distress": "Operator distress",
    "tenant_loss": "Tenant loss",
    "regulatory_action": "Regulatory action",
    "refinancing_risk": "Refinancing risk",
}
SECTOR_WORDS = {
    "BTR": "build to rent", "PBSA": "student accommodation", "BTL": "buy to let landlord",
    "Office": "office", "Retail": "retail", "Logistics": "logistics warehouse",
}
MAX_QUERIES, MAX_HITS = 3, 3

SYSTEM = (
    "You classify news items for a UK property-lender early-warning desk. For each item decide whether it "
    "is materially relevant to ONE specific loan (given: borrower, sector, city). Labels: operator_distress "
    "(operator/borrower/landlord insolvency, administration, exit, financial trouble), tenant_loss (a major "
    "tenant leaving, failing or in arrears), refinancing_risk (debt maturity, lender pulling out, covenant "
    "stress for this borrower/segment), regulatory_action (enforcement, building-safety order, licensing "
    "action against this borrower/building/area), irrelevant (generic market commentary, other companies, "
    "wrong city, older than 2025, or unrelated). Be strict: if the item does not clearly concern the named "
    "borrower or the sector in that city, use irrelevant. Severity: low, medium or high; use high ONLY when the item names the borrower itself, "
    "its operator or its tenant; city/sector-level news is at most medium. "
    'Return JSON: {"items":[{"i":<index>,"label":"...","severity":"...","reason":"<=15 words"}]}. '
    "Do not output any numbers other than the index."
)


def _load():
    global _cache
    if _cache is None:
        try:
            _cache = json.loads(CACHE.read_text(encoding="utf-8"))
        except Exception:
            _cache = {}
    return _cache


def _save():
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    with _lock:
        CACHE.write_text(json.dumps(_cache, indent=1), encoding="utf-8")


def _city(loan: dict) -> str:
    for k in ("city", "region"):
        if loan.get(k):
            return str(loan[k])
    m = re.search(r",\s*([^,]+?)\s+-\s", loan.get("name") or "")  # e.g. "CAN-003, Birmingham - build-to-rent block"
    return m.group(1) if m else ""


def queries_for(loan: dict) -> list[str]:
    city, sec = _city(loan), SECTOR_WORDS.get(loan.get("sector", ""), loan.get("sector", "property"))
    qs = []
    if loan.get("borrower"):
        qs.append(f"{loan['borrower']} insolvency administration refinancing 2026")
    qs.append(f"{sec} operator {city} insolvency 2026".replace("  ", " "))
    qs.append(f"{sec} {city} tenant administration closure lender 2026".replace("  ", " "))
    return qs[:MAX_QUERIES]


def _search(query: str) -> list[dict]:
    c = _load()
    if query in c.get("search", {}):
        return c["search"][query]
    from parallel import Parallel
    key = os.getenv("PARALLEL_API_KEY")
    if not key:
        raise RuntimeError("PARALLEL_API_KEY missing")
    r = Parallel(api_key=key).search(
        search_queries=[query], objective=f"Recent (2025-2026) UK news relevant to: {query}",
        mode="fast", max_chars_total=4000,
    ).model_dump()
    hits = [
        {"url": x.get("url"), "title": x.get("title") or x.get("url"), "published": x.get("publish_date"),
         "excerpt": " ".join(x.get("excerpts") or [])[:600]}
        for x in r.get("results", [])[:MAX_HITS] if x.get("url")
    ]
    c.setdefault("search", {})[query] = hits
    _save()
    return hits


def _classify(loan: dict, query: str, hits: list[dict]) -> list[dict]:
    c = _load()
    ck = f"{loan['id']}|{query}"
    if ck in c.setdefault("classified", {}):
        return c["classified"][ck]
    if not hits:
        return []
    user = json.dumps({
        "loan": {"borrower": loan.get("borrower"), "sector": loan.get("sector"), "city": _city(loan)},
        "items": [{"i": i, "title": h["title"], "published": h["published"], "excerpt": h["excerpt"]}
                  for i, h in enumerate(hits)],
    })
    data = json.loads(llm.chat(SYSTEM, user, json_mode=True))
    out = []
    for it in data.get("items", []):
        i, lab, sev = it.get("i"), it.get("label"), it.get("severity")
        if isinstance(i, int) and 0 <= i < len(hits) and lab in LABELS:
            out.append({"i": i, "label": lab, "severity": sev if sev in SEVS else "low", "reason": it.get("reason", "")})
    c["classified"][ck] = out
    _save()
    return out


def _one_loan(loan: dict) -> list[dict]:
    rows, seen = [], set()
    errs = 0
    qs = queries_for(loan)
    for q in qs:
        try:
            hits = _search(q)
            cls = _classify(loan, q, hits)
        except Exception as e:  # one bad query must not kill the loan
            errs += 1
            last = e
            continue
        for it in cls:
            lab = it["label"]
            h = hits[it["i"]]
            if lab == "irrelevant" or lab not in EFFECTS or h["url"] in seen:
                continue
            seen.add(h["url"])
            metric, table = EFFECTS[lab]
            sev = it["severity"]
            rows.append({
                "run_id": None, "loan_id": loan["id"], "kind": "news", "title": h["title"],
                "value": None, "unit": None,
                "effect": {"metric": metric, "delta_pct": float(table[sev]),
                           "label": f"{NICE[lab]} ({sev})", "severity": sev},
                "label": "Parallel + Grok",
                "source": {"url": h["url"], "published": h["published"], "query": q},
            })
    if errs == len(qs) and qs:
        raise last
    return rows


def fetch_news(loans: list[dict]) -> list[dict]:
    _load()
    with ThreadPoolExecutor(max_workers=4) as ex:
        results = list(ex.map(lambda l: _try(l), loans))
    if loans and all(r is None for r in results):
        raise RuntimeError("news: every loan failed (search or LLM unavailable)")
    return [row for r in results if r for row in r]


def _try(loan):
    try:
        return _one_loan(loan)
    except Exception as e:
        print(f"news: loan {loan.get('id')} failed: {type(e).__name__}: {str(e)[:120]}")
        return None


if __name__ == "__main__":
    test = [
        {"id": "L01", "borrower": "Placeholder BTR Holdings Ltd", "sector": "BTR", "city": "Manchester"},
        {"id": "L10", "borrower": "Placeholder Retail Estates Ltd", "sector": "Retail", "city": "Leeds"},
    ]
    rows = fetch_news(test)
    print(len(rows), "evidence rows")
    for r in rows:
        print(r["loan_id"], r["effect"], r["title"][:70], r["source"]["url"][:70])
