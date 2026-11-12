"""Covenant forecast. Pure functions: inputs dict in, forecast row out.

NOI = gross rent x occupancy - opex - unrecovered service-charge overspend - emergency/reopened repair cost - arrears drag
ICR = NOI / interest.  Value = base value x market factor x (1 - compliance haircut).  LTV = loan / value.
"""
import copy
import math

import numpy as np
import pandas as pd

# Opex as a share of gross rent. LOAN_RULES 5.1 cites a broker range of 25-35% of gross rent for BTR *including*
# voids; voids are modelled separately here, so resi takes the bottom of that range. BTL is tested on gross rent
# (PRA SS13/16 style), commercial on net rent after non-recoverable costs.
OPEX_PCT = {"BTR": 0.25, "PBSA": 0.30, "BTL": 0.0, "Office": 0.10, "Retail": 0.10, "Logistics": 0.10}
UNDERWRITTEN_OCC = {"BTR": 0.96, "PBSA": 0.97, "BTL": 0.95, "Office": 1.0, "Retail": 1.0, "Logistics": 1.0}
# ILLUSTRATIVE investment yields used to value income-producing blocks at origination (BTL is valued on comps).
CAP_RATE = {"BTR": 0.0475, "PBSA": 0.0525, "Office": 0.0700, "Retail": 0.0750, "Logistics": 0.0575}
BTL_STRESS_RATE = 5.5
# ILLUSTRATIVE compliance haircut on value.
EWS_HAIRCUT, ITEM_HAIRCUT, MAX_HAIRCUT = 0.05, 0.02, 0.15
Z = 1.28  # 80% band
TREND_MONTHS = 6

SUPPRESSIBLE = {"vacancy", "sc_overspend", "emergency_tickets", "reopened_tickets", "arrears", "compliance_overdue", "ews_remediation"}


# ---- primitives (LOAN_RULES section 5) ----
def interest(amount, rate_pct):
    return amount * rate_pct / 100.0


def icr(noi, interest_gbp):
    return noi / interest_gbp if interest_gbp else math.inf


def ltv(loan_gbp, value_gbp):
    return 100.0 * loan_gbp / value_gbp if value_gbp else math.inf


def noi(gross, occupancy, opex, other_costs=0.0):
    return gross * occupancy - opex - other_costs


def haircut(ews_buildings, overdue_items):
    return min(MAX_HAIRCUT, (EWS_HAIRCUT if ews_buildings else 0.0) + ITEM_HAIRCUT * overdue_items)


def test_rate(sector, rate_pct):
    return max(rate_pct, BTL_STRESS_RATE) if sector == "BTL" else rate_pct


def check(value, limit, cash_trap, higher_is_better):
    """'red' if the default limit is broken, 'amber' if only the cash trap is, else 'green'."""
    if limit is None:
        return "green"
    bad = (lambda v, l: v < l) if higher_is_better else (lambda v, l: v > l)
    if bad(value, limit):
        return "red"
    if cash_trap is not None and bad(value, cash_trap):
        return "amber"
    return "green"


# ---- series ----
def _point(inp, i, adj=None):
    """ICR, LTV %, occupancy % at month index i. adj = news deltas {occupancy pp, rent/value/opex pct}."""
    adj = adj or {}
    s, sup = inp["series"], inp.get("suppress", set())
    occ = inp["underwritten_occ"] if "vacancy" in sup else s["occupancy"]
    occ = min(1.0, max(0.0, occ + adj.get("occupancy", 0.0) / 100.0))
    gross = inp["gross_rent"] * (1 + adj.get("rent", 0.0) / 100.0)
    opex = OPEX_PCT[inp["sector"]] * gross * (1 + adj.get("opex", 0.0) / 100.0)
    costs = sum(0.0 if k in sup else v for k, v in (
        ("sc_overspend", s["overspend"][i]), ("emergency_tickets", s["em_cost"][i]),
        ("reopened_tickets", s["ro_cost"][i]), ("arrears", s["arrears"])))
    n = noi(gross, occ, opex, costs)
    hc = haircut(0 if "ews_remediation" in sup else s["ews"], 0 if "compliance_overdue" in sup else s["haircut_items"][i])
    value = inp["base_value"] * inp.get("market_factor", 1.0) * (1 - hc) * (1 + adj.get("value", 0.0) / 100.0)
    return {"icr": icr(n, interest(inp["amount"], inp["test_rate_pct"])), "ltv": ltv(inp["amount"], value),
            "occupancy": 100.0 * occ, "noi": n, "value": value, "haircut": hc}


def _trend(values):
    y = np.array(values[-TREND_MONTHS:], dtype=float)
    x = np.arange(len(y))
    if len(y) < 2:
        return float(y[-1]), 0.0, 0.0
    b, a = np.polyfit(x, y, 1)
    resid = y - (a + b * x)
    sd = float(resid.std(ddof=1)) if len(y) > 2 else 0.0
    return float(a + b * (len(y) - 1)), float(b), sd


def _news_adj(news):
    adj = {}
    for ev in news or []:
        eff = ev.get("effect") or {}
        if eff.get("metric") in ("occupancy", "rent", "value", "opex"):
            adj[eff["metric"]] = adj.get(eff["metric"], 0.0) + float(eff.get("delta_pct", 0.0))
    return adj


def _add_months(month, h):
    return (pd.Timestamp(month) + pd.DateOffset(months=h)).strftime("%Y-%m-%d")


LIMITS = {  # metric -> (limit key, cash trap key, higher is better)
    "icr": ("icr_min", "icr_cash_trap", True),
    "ltv": ("ltv_max", "ltv_cash_trap", False),
    "occupancy": ("occupancy_min", "occupancy_cash_trap", True),
}


def forecast(inp):
    """Forecast row (without run_id) for one loan."""
    s = inp["series"]
    ms = s["months"]
    pts = [_point(inp, i) for i in range(len(ms))]
    adj = _news_adj(inp.get("news"))
    last = len(ms) - 1
    shift = {k: _point(inp, last, adj)[k] - pts[last][k] for k in LIMITS} if adj else {k: 0.0 for k in LIMITS}
    cov = inp["covenants"]
    metrics, status, breach = {}, "green", []
    for k, (lk, ck, hib) in LIMITS.items():
        if cov.get(lk) is None:
            continue
        vals = [p[k] for p in pts]
        now_fit, slope, sd = _trend(vals)
        now = vals[-1] + shift[k]
        sd = max(sd, 0.005 * abs(now))
        path = [now + slope * h for h in range(7)]
        band = lambda h: {"lo": round(path[h] - Z * sd * math.sqrt(h), 3), "mid": round(path[h], 3), "hi": round(path[h] + Z * sd * math.sqrt(h), 3)}
        metrics[k] = {"now": round(now, 3), "m3": band(3), "m6": band(6), "limit": cov[lk], "cash_trap": cov.get(ck),
                      "series": [{"month": m, "value": round(v, 3)} for m, v in zip(ms, vals)]}
        st = max((check(v, cov[lk], cov.get(ck), hib) for v in path), key=["green", "amber", "red"].index)
        status = max(status, st, key=["green", "amber", "red"].index)
        first = next((h for h, v in enumerate(path) if check(v, cov[lk], None, hib) == "red"), None)
        if first is not None:
            breach.append((first, list(LIMITS).index(k), k))
    breach.sort()
    bm, bmonth = (breach[0][2], _add_months(ms[-1], breach[0][0])) if breach else (None, None)
    return {"loan_id": inp["loan_id"], "status": status, "breach_metric": bm, "breach_month": bmonth,
            "metrics": metrics, "drivers": drivers(inp, pts, metrics)}


def drivers(inp, pts, metrics):
    """Explain the move from underwriting to now (and the 6-month trend), each with its signal/evidence ids."""
    s, sup, sig = inp["series"], inp.get("suppress", set()), inp["series"]["sig"]
    ev = inp.get("evidence_ids", {})
    last = len(s["months"]) - 1
    i_gbp = interest(inp["amount"], inp["test_rate_pct"])
    out = []

    def d(kind, label, metric, amount, signal_ids, evidence_ids=(), unit="x"):
        if abs(amount) < 0.005:
            return
        verb = ("Cuts" if amount < 0 else "Adds") if metric == "icr" else ("Adds" if amount > 0 else "Takes")
        txt = f"{verb} {abs(amount):.2f}x {'from' if amount < 0 else 'to'} ICR" if metric == "icr" else \
            f"{verb} {abs(amount):.1f}pp {'to' if amount > 0 else 'off'} {metric.upper() if metric == 'ltv' else metric}"
        out.append({"kind": kind, "label": label, "effect_text": txt, "delta": {"metric": metric, "amount": round(amount, 3)},
                    "signal_ids": list(signal_ids)[-6:], "evidence_ids": list(evidence_ids)})

    if "vacancy" not in sup:
        lost = inp["gross_rent"] * (inp["underwritten_occ"] - s["occupancy"])
        d("vacancy", f"{s['vacant_units']} of {s['income_units']} units empty ({100 * (1 - s['occupancy']):.1f}% vacancy vs {100 * (1 - inp['underwritten_occ']):.0f}% underwritten)",
          "icr", -lost / i_gbp, sig.get("vacancy", []), ev.get("rent", []))
    for kind, val, label in (
            ("sc_overspend", s["overspend"][last], "Service-charge overspend the landlord has to fund"),
            ("emergency_tickets", s["em_cost"][last], "Emergency repair cost, last 12 months"),
            ("reopened_tickets", s["ro_cost"][last], "Repeat repairs (reopened tickets), last 12 months"),
            ("arrears", s["arrears"], "Leaseholder arrears the borrower has to cover")):
        if kind not in sup and val > 0:
            d(kind, f"{label}: GBP {val:,.0f}", "icr", -val / i_gbp, sig.get(kind, []))
    if "ltv" in metrics:
        base = inp["base_value"] * inp.get("market_factor", 1.0)
        ltv_clean = ltv(inp["amount"], base)
        if s["ews"] and "ews_remediation" not in sup:
            d("ews_remediation", f"External wall remediation on {s['ews']} building(s): {EWS_HAIRCUT:.0%} value haircut (ILLUSTRATIVE)", "ltv",
              ltv(inp["amount"], base * (1 - EWS_HAIRCUT)) - ltv_clean, sig.get("ews_remediation", []), ev.get("value", []))
        n = s["haircut_items"][last]
        if n and "compliance_overdue" not in sup:
            full = pts[last]["ltv"]
            without = ltv(inp["amount"], base * (1 - haircut(0 if "ews_remediation" in sup else s["ews"], 0)))
            d("compliance_overdue", f"{n} fire-risk / safety-case item(s) overdue: {ITEM_HAIRCUT:.0%} haircut each (ILLUSTRATIVE)", "ltv",
              full - without, sig.get("compliance_overdue", [])[-1:], ev.get("value", []))
        mf = inp.get("market_factor", 1.0)
        if abs(mf - 1.0) > 1e-6:
            d("market", f"Market value trend: {inp.get('market_label', 'market factor')} (x{mf:.3f})", "ltv",
              ltv_clean - ltv(inp["amount"], inp["base_value"]), [], ev.get("market", []))
    for e in inp.get("news") or []:
        eff = e.get("effect") or {}
        if eff.get("metric"):
            out.append({"kind": "news", "label": e.get("title", "News"), "effect_text": f"{eff['metric']} {eff.get('delta_pct', 0):+.1f}%",
                        "delta": {"metric": eff["metric"], "amount": eff.get("delta_pct", 0)}, "signal_ids": [],
                        "evidence_ids": [e["id"]] if e.get("id") is not None else []})
    if "icr" in metrics:
        tr = metrics["icr"]["m6"]["mid"] - metrics["icr"]["now"]
        d("trend", "6-month trend on the last 6 months of data", "icr", tr, [])
    out.sort(key=lambda x: -abs(x["delta"]["amount"]) * (10 if x["delta"]["metric"] == "icr" else 1))
    return out


def stress(inputs, rate_bps=0, value_pct=0):
    """Re-run the forecast with the interest rate moved by rate_bps and values moved by value_pct."""
    inp = copy.deepcopy(inputs)
    inp["test_rate_pct"] = inp["test_rate_pct"] + rate_bps / 100.0
    inp["base_value"] = inp["base_value"] * (1 + value_pct / 100.0)
    return forecast(inp)
