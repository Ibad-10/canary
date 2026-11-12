"""Grok drafts the watchlist memo + one chase per red loan. LLM writes text only; numbers come from the JSON."""
import json
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

from . import llm

RULES = (
    "Rules: use ONLY numbers that appear in the JSON you are given; never invent, round differently, convert or "
    "estimate figures. Quote the citation ids given (in square brackets, exactly as written, e.g. [L03/D1]) after "
    "each claim they support. UK English, plain words, no fluff, no emojis. You draft text only; you do not do maths."
)
MEMO_SYS = (
    "You write the weekly 'Watchlist memo' for a UK property-lending credit team (Canary early-warning desk). "
    "Markdown with exactly three sections: '## In short' (2-3 sentences), '## What changed' (one bullet per red or "
    "amber loan: loan id and name, the metric, forecast breach month, the driver(s) with citation ids), "
    "'## Next steps' (3-5 concrete actions, e.g. chase borrower, request valuation). " + RULES
)
CHASE_SYS = (
    "You draft a polite, firm email from the lender's asset-management team to a borrower about a loan whose "
    "covenant is forecast to breach. Start with the line 'DRAFT - not sent'. Then Subject line, greeting to the "
    "borrower, 1 short paragraph on why we are writing (cite the evidence ids; do not accuse), a bullet list of the "
    "documents requested (use ONLY the 'requests' list given), the deadline date given, and a courteous sign-off "
    "from 'Asset Management'. Do not mention internal models or forecasts as certainties; say 'our monitoring "
    "indicates'. " + RULES
)
REQUESTS = {
    "arrears": ["Current rent roll", "Arrears ledger by tenant/leaseholder with ageing"],
    "sc_overspend": ["Service charge reconciliation and variance explanation for the current year"],
    "compliance_overdue": ["Evidence of up-to-date compliance certificates (fire risk assessment, EICR) for the affected buildings"],
    "compliance_missing": ["Copies of missing compliance certificates (fire risk assessment, EICR) or a dated plan to obtain them"],
    "ews_remediation": ["EWS1 form or remediation programme and timetable"],
    "higher_risk": ["Building safety case / higher-risk building registration status"],
    "emergency_tickets": ["Summary of emergency repairs and costs in the last six months"],
    "reopened_tickets": ["Summary of repeat repair issues and remedial plan"],
    "vacancy": ["Current vacancy schedule and letting plan"],
    "news": ["Confirmation of operator/tenant status and any lender-relevant events"],
}


def _pct(x):
    if x is None:
        return None
    return round(x * 100 if abs(x) <= 2 else x, 1)


def _m(metrics: dict, k: str) -> dict:
    d = (metrics or {}).get(k) or {}
    out = {"now": d.get("now"), "limit": d.get("limit"), "cash_trap": d.get("cash_trap"),
           "forecast_6m_mid": (d.get("m6") or {}).get("mid")}
    return {k2: (round(v, 3) if isinstance(v, float) else v) for k2, v in out.items() if v is not None}


def _facts(loan: dict, fc: dict, evidence: list) -> dict:
    lid = loan["id"]
    drivers = []
    for n, d in enumerate(fc.get("drivers") or [], 1):
        drivers.append({"cite": f"{lid}/D{n}", "kind": d.get("kind"), "label": d.get("label"),
                        "effect": d.get("effect_text"), "delta": d.get("delta")})
    ev = [{"cite": f"{lid}/E{n}", "title": e.get("title"), "kind": e.get("kind"), "label": e.get("label"),
           "effect": (e.get("effect") or {}).get("label"), "url": (e.get("source") or {}).get("url")}
          for n, e in enumerate([e for e in evidence if e.get("loan_id") == lid][:6], 1)]
    return {
        "loan_id": lid, "name": loan.get("name"), "borrower": loan.get("borrower"), "sector": loan.get("sector"),
        "amount_gbp": loan.get("amount_gbp"), "status": fc.get("status"),
        "breach_metric": fc.get("breach_metric"), "breach_month": fc.get("breach_month"),
        "icr": _m(fc.get("metrics"), "icr"), "ltv": _m(fc.get("metrics"), "ltv"),
        "ltv_now_pct": _pct(((fc.get("metrics") or {}).get("ltv") or {}).get("now")),
        "drivers": drivers, "evidence": ev,
    }


def _numbers(s: str) -> set[str]:
    return set(re.findall(r"\d+(?:\.\d+)?", s.replace(",", "")))


def _check(body: str, allowed_src: str, extra: set[str]) -> list[str]:
    allowed = _numbers(allowed_src) | extra
    # tolerate rounding/format variants of allowed numbers
    for n in list(allowed):
        f = float(n)
        allowed |= {f"{f:.0f}", f"{f:.1f}", f"{f:.2f}", f"{f:.3f}", str(f).rstrip("0").rstrip(".")}
    body = re.sub(r"\[[^\]]*\]", "", body)  # citation ids are not figures
    bad = []
    for n in _numbers(body):
        v = float(n)
        # Only years may appear without being in the payload (as_of / breach months).
        # Do NOT allow small integers like 0 — that let a model invent "0 red".
        if n in allowed or (v.is_integer() and 2024 <= v <= 2030):
            continue
        bad.append(n)
    return bad


def _gen(system: str, payload: dict, extra_nums: set[str]) -> str:
    src = json.dumps(payload, default=str)
    user = "JSON facts:\n" + src
    for attempt in range(2):
        body = llm.chat(system, user)
        bad = _check(body, src, extra_nums)
        if not bad:
            return body
        user = (f"JSON facts:\n{src}\n\nYour previous draft used numbers not in the JSON: {', '.join(bad)}. "
                "Rewrite it using only numbers from the JSON (remove any others).")
    raise RuntimeError(f"LLM used numbers not in the data: {bad}")


def _deadline(as_of) -> str:
    d = date.fromisoformat(str(as_of)[:10]) if as_of else date.today()
    n = 0
    while n < 10:
        d += timedelta(days=1)
        n += d.weekday() < 5
    return d.strftime("%d %B %Y")


def draft(run: dict, loans: list, forecasts: list, evidence: list) -> list[dict]:
    rid, as_of = run.get("id"), run.get("as_of")
    by_loan = {l["id"]: l for l in loans}
    facts = [_facts(by_loan[f["loan_id"]], f, evidence) for f in forecasts if f["loan_id"] in by_loan]
    flagged = [f for f in facts if f["status"] in ("red", "amber")]
    counts = {s: sum(1 for f in facts if f["status"] == s) for s in ("red", "amber", "green")}
    nums = _numbers(json.dumps(counts)) | _numbers(str(as_of))
    model = llm.MODEL_NAME  # populated after the first call; refreshed below

    def memo():
        return _gen(MEMO_SYS, {"as_of": str(as_of), "counts": counts, "loans": flagged or facts[:3]}, nums)

    reds = [f for f in facts if f["status"] == "red"]
    dl = _deadline(as_of)

    def chase(f):
        reqs = []
        for k in [d["kind"] for d in f["drivers"]] + (["news"] if f["evidence"] else []):
            reqs += [r for r in REQUESTS.get(k, []) if r not in reqs]
        reqs = reqs or ["Current rent roll", "Arrears ledger", "Latest compliance certificates"]
        p = {**f, "requests": reqs, "deadline": dl}
        body = _gen(CHASE_SYS, p, _numbers(dl))
        if "DRAFT - not sent" not in body:
            body = "DRAFT - not sent\n\n" + body
        return body

    with ThreadPoolExecutor(max_workers=4) as ex:
        fm = ex.submit(memo)
        fcs = [(f, ex.submit(chase, f)) for f in reds]
        memo_body = fm.result()
        chases = [(f, fu.result()) for f, fu in fcs]
    model = llm.MODEL_NAME
    out = [{"run_id": rid, "loan_id": None, "kind": "memo", "title": f"Watchlist memo - {as_of}",
            "body_md": memo_body, "model": model, "status": "draft"}]
    for f, body in chases:
        out.append({"run_id": rid, "loan_id": f["loan_id"], "kind": "chase",
                    "title": f"Chase draft - {f['loan_id']} {f['name']}", "body_md": body,
                    "model": model, "status": "draft"})
    return out


if __name__ == "__main__":
    run = {"id": "smoke", "as_of": "2026-11-12"}
    loans = [{"id": "L01", "name": "Test BTR Manchester", "borrower": "Test BTR Ltd", "sector": "BTR", "amount_gbp": 12000000},
             {"id": "L02", "name": "Test Office Leeds", "borrower": "Test Office Ltd", "sector": "Office", "amount_gbp": 8500000}]
    fcs = [
        {"loan_id": "L01", "status": "red", "breach_metric": "icr", "breach_month": "2027-03-01",
         "metrics": {"icr": {"now": 1.38, "limit": 1.3, "cash_trap": 1.4, "m6": {"lo": 1.1, "mid": 1.21, "hi": 1.3}},
                     "ltv": {"now": 0.61, "limit": 0.65, "cash_trap": 0.62, "m6": {"mid": 0.64}}},
         "drivers": [{"kind": "arrears", "label": "Leaseholder arrears rising", "effect_text": "ICR -0.09x over 6 months",
                      "delta": {"metric": "icr", "amount": -0.09}}]},
        {"loan_id": "L02", "status": "green", "metrics": {}, "drivers": []},
    ]
    ev = [{"loan_id": "L01", "kind": "news", "title": "Scheme left unfinished", "label": "Parallel + Grok",
           "effect": {"label": "Operator distress (medium)"}, "source": {"url": "https://example.com/x"}}]
    for d in draft(run, loans, fcs, ev):
        print("=" * 60, d["kind"], d["loan_id"], d["model"])
        print(d["body_md"])
