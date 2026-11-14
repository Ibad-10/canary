"""Covenant forecast. Pure functions: inputs dict in, forecast row out.

NOI = gross rent x occupancy - opex - unrecovered service-charge overspend - emergency/reopened repair cost - arrears drag
ICR = NOI / interest.  Value = base value x market factor x (1 - compliance haircut).  LTV = loan / value.

Monthly forecast for h = 1..HORIZON, in three layers:
- events: dated items in the inputs move the cash flow in the month they happen (lease expiries, fire-risk /
  safety-case due dates, service-charge year ends, repair costs leaving the 12-month test window, news from the
  month it was published). No field, no event.
- drift: AutoETS (Nixtla statsforecast, AutoARIMA as the alternative) on monthly repair spend, the only driver with
  monthly history in Cortile; binomial unit churn on occupancy at the observed rate.
- Monte Carlo: N_DRAWS paths through the NOI / value formulas; lo / mid / hi = p10 / p50 / p90. Status reads p50.
The PR's straight-line model is kept as forecast_linear (fallback and backtest comparison).
"""
import copy
import math
import zlib

import numpy as np
import pandas as pd

from engine.config import HORIZON

# Opex as a share of gross rent. LOAN_RULES 5.1 cites a broker range of 25-35% of gross rent for BTR *including*
# voids; voids are modelled separately here, so resi takes the bottom of that range. BTL is tested on gross rent
# (PRA SS13/16 style), commercial on net rent after non-recoverable costs.
OPEX_PCT = {"BTR": 0.25, "PBSA": 0.30, "BTL": 0.0, "Office": 0.10, "Retail": 0.10, "Logistics": 0.10}
UNDERWRITTEN_OCC = {"BTR": 0.96, "PBSA": 0.97, "BTL": 0.95, "Office": 1.0, "Retail": 1.0, "Logistics": 1.0}
RESIDENTIAL = {"BTR", "PBSA", "BTL"}
# ILLUSTRATIVE investment yields used to value income-producing blocks at origination (BTL is valued on comps).
CAP_RATE = {"BTR": 0.0475, "PBSA": 0.0525, "Office": 0.0700, "Retail": 0.0750, "Logistics": 0.0575}
BTL_STRESS_RATE = 5.5
# ILLUSTRATIVE compliance haircut on value.
EWS_HAIRCUT, ITEM_HAIRCUT, MAX_HAIRCUT = 0.05, 0.02, 0.15
Z = 1.28  # 80% band (linear model)
Z80 = 1.2816
TREND_MONTHS = 6
N_DRAWS = 1000
MIN_FIT = 8  # months of history before AutoETS is fitted; fewer -> recent mean
VOID_MONTHS = 9  # ILLUSTRATIVE re-let void after a commercial tenant leaves at lease expiry
MIN_EVENT = 0.005  # smallest ICR (x) or LTV (pp) move worth listing as an event

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


def _mon(month):
    return pd.Timestamp(month).strftime("%b %Y")


def _h(date, m0, strict=False):
    """First forecast month (>= 1) whose month end is on/after `date` (strict: after). m0 = as-of month."""
    d, b = pd.Timestamp(str(date)[:10]), pd.Timestamp(m0)
    k = (d.year - b.year) * 12 + d.month - b.month
    if strict and d >= d + pd.offsets.MonthEnd(0):
        k += 1
    return max(1, k)


LIMITS = {  # metric -> (limit key, cash trap key, higher is better)
    "icr": ("icr_min", "icr_cash_trap", True),
    "ltv": ("ltv_max", "ltv_cash_trap", False),
    "occupancy": ("occupancy_min", "occupancy_cash_trap", True),
}
ORDER = ["green", "amber", "red"]


def _effect_text(metric, amount):
    verb = ("Cuts" if amount < 0 else "Adds") if metric == "icr" else ("Adds" if amount > 0 else "Takes")
    if metric == "icr":
        return f"{verb} {abs(amount):.2f}x {'from' if amount < 0 else 'to'} ICR"
    return f"{verb} {abs(amount):.1f}pp {'to' if amount > 0 else 'off'} {metric.upper() if metric == 'ltv' else metric}"


def _status(metrics_paths, cov, start_month):
    """metrics_paths: {metric: [now, h1..hN]} -> (status, breach_metric, breach_month)."""
    status, breach = "green", []
    for k, path in metrics_paths.items():
        lk, ck, hib = LIMITS[k]
        st = max((check(v, cov[lk], cov.get(ck), hib) for v in path), key=ORDER.index)
        status = max(status, st, key=ORDER.index)
        first = next((h for h, v in enumerate(path) if check(v, cov[lk], None, hib) == "red"), None)
        if first is not None:
            breach.append((first, list(LIMITS).index(k), k))
    breach.sort()
    return (status, breach[0][2], _add_months(start_month, breach[0][0])) if breach else (status, None, None)


# ---- drift layer ----
def _drift(y, h=HORIZON):
    """Monthly driver forecast -> (mean[h], sd[h], method). AutoETS, then AutoARIMA, then the recent mean."""
    y = np.asarray(y, dtype=float)
    if len(y) == 0:
        return np.zeros(h), np.zeros(h), "no history"

    def recent(why):
        tail = y[-TREND_MONTHS:]
        sd = float(tail.std(ddof=1)) if len(tail) > 2 else 0.0
        return np.full(h, max(0.0, float(tail.mean()))), np.full(h, sd), f"{why}: mean of last {len(tail)} months"

    if len(y) < MIN_FIT:
        return recent(f"short history ({len(y)} months)")
    if np.ptp(y) == 0:
        return np.full(h, float(y[0])), np.zeros(h), f"constant over {len(y)} months"
    try:
        from statsforecast.models import AutoARIMA, AutoETS
    except ImportError:
        return recent("statsforecast not installed")
    for name, make in (("AutoETS", lambda: AutoETS(season_length=1, model="ZZN")), ("AutoARIMA", lambda: AutoARIMA(season_length=1))):
        try:
            m = make().fit(y)
            p = m.predict(h=h, level=[80])
            mean = np.asarray(p["mean"], dtype=float)
            sd = (np.asarray(p["hi-80"], dtype=float) - mean) / Z80
            if np.all(np.isfinite(mean)) and np.all(np.isfinite(sd)):
                label = m.model_.get("method", name) if name == "AutoETS" and isinstance(getattr(m, "model_", None), dict) else name
                return np.maximum(mean, 0.0), np.maximum(sd, 0.0), f"{label}, {len(y)} months"
        except Exception:
            continue
    return recent("model fit failed")


# ---- hybrid simulation ----
def _simulate(inp):
    """Monte Carlo draws {metric: (N_DRAWS, HORIZON)} plus the dated events and model notes."""
    s, sup = inp["series"], set(inp.get("suppress") or ())
    last, m0 = len(s["months"]) - 1, s["months"][-1]
    H, n = HORIZON, N_DRAWS
    rng = np.random.default_rng(zlib.crc32(str(inp["loan_id"]).encode()))
    i_gbp = interest(inp["amount"], inp["test_rate_pct"])
    now = _point(inp, last)
    events, model = [], {"name": "dated events + statistical drift + Monte Carlo", "draws": n, "bands": "p10 / p50 / p90", "drift": {}}

    def event(h, kind, label, deltas, probability=1.0, signal_ids=(), evidence_ids=(), date=None, **extra):
        events.append({"h": h, "month": _add_months(m0, h), "kind": kind, "label": label, "date": date, "probability": round(float(probability), 4),
                       "deltas": {k: float(v) for k, v in deltas.items()}, "signal_ids": list(signal_ids), "evidence_ids": list(evidence_ids), **extra})

    # news: a fixed-table step from the month it was published (never before month 1)
    adj = {k: np.zeros(H) for k in ("occupancy", "rent", "value", "opex")}
    for e in inp.get("news") or []:
        eff = e.get("effect") or {}
        met = eff.get("metric")
        if met not in adj:
            continue
        try:
            h0 = _h((e.get("source") or {}).get("published") or m0, m0)
        except (ValueError, TypeError):
            h0 = 1
        if h0 > H:
            continue
        delta = float(eff.get("delta_pct", 0.0))
        adj[met][h0 - 1:] += delta
        moved = _point(inp, last, {met: delta})
        deltas = {k: moved[k] - now[k] for k in LIMITS if abs(moved[k] - now[k]) > 1e-9}
        event(h0, "news", e.get("title", "News"), deltas, 1.0, (), [e["id"]] if e.get("id") is not None else [],
              (e.get("source") or {}).get("published"), news=(met, delta))

    # occupancy: binomial churn of residential lets around the observed rate (Cortile has no occupancy history);
    # commercial income is contracted and only moves at lease events
    units = int(s.get("income_units") or 0)
    occ0 = inp["underwritten_occ"] if "vacancy" in sup else s["occupancy"]
    if "vacancy" in sup or units == 0 or inp["sector"] not in RESIDENTIAL:
        occ = np.full((n, H), float(occ0))
        model["drift"]["occupancy"] = "held at the " + ("underwritten" if "vacancy" in sup else "observed") + " rate" + \
            ("; moves only at lease events" if inp["sector"] not in RESIDENTIAL else "")
    else:
        occ = rng.binomial(units, occ0, size=(n, H)) / units
        model["drift"]["occupancy"] = f"binomial churn of {units} units at the observed {100 * occ0:.1f}% (no occupancy history)"
    occ = np.clip(occ + adj["occupancy"] / 100.0, 0.0, 1.0)
    gross = inp["gross_rent"] * (1 + adj["rent"] / 100.0)
    opex = OPEX_PCT[inp["sector"]] * gross * (1 + adj["opex"] / 100.0)

    # dated events from signals: lease expiries, compliance due dates, service-charge year ends
    lost_share, lost_units = np.zeros((n, H)), np.zeros((n, H))
    over = np.full(H, 0.0 if "sc_overspend" in sup else float(s["overspend"][last]))
    items = np.full((n, H), 0.0 if "compliance_overdue" in sup else float(s["haircut_items"][last]))
    ews = 0 if "ews_remediation" in sup else s["ews"]
    clean_value = inp["base_value"] * inp.get("market_factor", 1.0)
    for e in s.get("events") or []:
        kind, p = e["kind"], float(e.get("probability", 1.0))
        if kind == "lease_expiry":
            h0 = _h(e["date"], m0)
            if h0 > H:
                continue
            hit = rng.random(n) < p
            span = slice(h0 - 1, min(H, h0 - 1 + VOID_MONTHS))
            lost_share[hit, span] += e["rent_share"]
            lost_units[hit, span] += e.get("units", 1)
            deltas = {"icr": -p * gross[h0 - 1] * e["rent_share"] / i_gbp}
            if units:
                deltas["occupancy"] = -p * 100.0 * e.get("units", 1) / units
            event(h0, kind, f"{e['label']}, {_mon(e['date'])}: GBP {gross[h0 - 1] * e['rent_share']:,.0f} a year of rent at risk, "
                  f"{p:.0%} chance the tenant leaves (Cortile history), {VOID_MONTHS}-month re-let void (ILLUSTRATIVE)",
                  deltas, p, e.get("signal_ids", []), (), e["date"])
        elif kind == "compliance_due" and "compliance_overdue" not in sup:
            h0 = _h(e["date"], m0, strict=True)
            if h0 > H:
                continue
            hit = rng.random(n) < p
            items[hit, h0 - 1:] += e.get("items", 1)
            k0 = float(s["haircut_items"][last])
            full = ltv(inp["amount"], clean_value * (1 - haircut(ews, k0 + e.get("items", 1)))) - ltv(inp["amount"], clean_value * (1 - haircut(ews, k0)))
            event(h0, kind, f"{e['label']}, {_mon(e['date'])}: {p:.0%} chance it goes overdue (book rate), {ITEM_HAIRCUT:.0%} value haircut if so (ILLUSTRATIVE)",
                  {"ltv": p * full}, p, e.get("signal_ids", []), (), e["date"])
        elif kind in ("service_charge_year_end", "service_charge_in_year") and "sc_overspend" not in sup:
            h0 = _h(e["date"], m0)
            if h0 > H:
                continue
            over[h0 - 1:] = np.maximum(0.0, over[h0 - 1:] + p * e["cost_change"])
            what = "prior-year overspend leaves the cost base" if e["cost_change"] < 0 else "overspend added to the cost base (estimate: last year's)"
            event(h0, kind, f"{e['label']}: GBP {abs(e['cost_change']):,.0f} {what}",
                  {"icr": -p * e["cost_change"] / i_gbp}, p, e.get("signal_ids", []), (), e["date"])

    # repair spend: AutoETS on monthly cost, rolled through the trailing 12-month window the covenant test uses
    repair = np.zeros((n, H))
    repair_note = []
    for kind, t12, mk, sk, name in (("emergency_tickets", "em_cost", "em_month", "em_sig", "emergency"),
                                    ("reopened_tickets", "ro_cost", "ro_month", "ro_sig", "repeat")):
        if kind in sup:
            continue
        hist = s.get(mk)
        if not hist:
            repair += float(s[t12][last])
            model["drift"][kind] = "12-month cost held flat (no monthly history in inputs)"
            continue
        mean, sd, method = _drift(hist)
        model["drift"][kind] = method
        full = np.concatenate([np.tile(np.asarray(hist, dtype=float), (n, 1)), np.maximum(0.0, mean + sd * rng.standard_normal((n, H)))], axis=1)
        for h in range(1, H + 1):
            j = last + h
            w0 = max(0, j - 11)
            repair[:, h - 1] += full[:, w0:j + 1].sum(axis=1) * 12.0 / (j + 1 - w0)
            out = j - 12
            if 0 <= out <= last and hist[out] / i_gbp >= MIN_EVENT:
                sid = (s.get(sk) or [None] * (last + 1))[out]
                event(h, "repair_rolloff", f"{_mon(s['months'][out])} {name} repairs (GBP {hist[out]:,.0f}) leave the 12-month test window",
                      {"icr": hist[out] / i_gbp}, 1.0, [sid] if sid is not None else [], (), s["months"][out])
        gone = sum(hist[j - 12] for j in range(last + 1, last + H + 1) if 0 <= j - 12 <= last)
        repair_note.append((name, gone, float(mean.sum()), method, kind))

    arrears = 0.0 if "arrears" in sup else float(s["arrears"])
    income = gross * occ - gross * lost_share
    noi_d = income - opex - over - repair - arrears
    value = clean_value * (1 - np.minimum(MAX_HAIRCUT, (EWS_HAIRCUT if ews else 0.0) + ITEM_HAIRCUT * items)) * (1 + adj["value"] / 100.0)
    draws = {"icr": noi_d / i_gbp if i_gbp else np.full((n, H), math.inf),
             "ltv": 100.0 * inp["amount"] / value,
             "occupancy": 100.0 * np.clip(occ - (lost_units / units if units else 0.0), 0.0, 1.0)}
    return {"draws": draws, "events": events, "model": model, "repair": repair_note, "i_gbp": i_gbp}


def forecast(inp):
    """Forecast row (without run_id) for one loan: hybrid numbers, status no better than the straight-line challenger.
    Falls back to the straight-line model if the hybrid fails."""
    lin = forecast_linear(inp)
    try:
        row = forecast_hybrid(inp)
    except Exception as e:  # never lose a loan from the board
        for m in lin["metrics"].values():
            m["model"] = {"name": "linear trend (fallback)", "error": f"{type(e).__name__}: {e}"[:200]}
        return lin
    return _challenge(row, lin, inp["series"]["months"][-1])


def _challenge(row, lin, m0):
    """If the 6-month straight-line trend crosses a level the hybrid median path does not, take its colour and say why."""
    if ORDER.index(lin["status"]) <= ORDER.index(row["status"]):
        return row
    for k, m in lin["metrics"].items():
        lk, ck, hib = LIMITS[k]
        path = [m["now"]] + [p["mid"] for p in m["forecast"]]
        st = max((check(v, m["limit"], m["cash_trap"], hib) for v in path), key=ORDER.index)
        if st != lin["status"]:
            continue
        level = m["limit"] if st == "red" else m["cash_trap"]
        h = next(h for h, v in enumerate(path) if ORDER.index(check(v, m["limit"], m["cash_trap"], hib)) >= ORDER.index(st))
        name = {"icr": "ICR", "ltv": "LTV", "occupancy": "occupancy"}[k]
        amt = m["m6"]["mid"] - m["now"]
        row["drivers"].insert(0, {"kind": "trend", "label": f"Straight-line challenger: the last 6 months' {name} trend crosses the "
                                  f"{'covenant limit' if st == 'red' else 'cash-trap level'} ({level:g}) by {_mon(_add_months(m0, h))}; "
                                  f"the event model's median path does not", "effect_text": _effect_text(k, amt),
                                  "delta": {"metric": k, "amount": round(amt, 3)}, "signal_ids": [], "evidence_ids": [],
                                  "month": _add_months(m0, h)})
        break
    row["status"] = lin["status"]
    if row["breach_metric"] is None and lin["breach_metric"]:
        row["breach_metric"], row["breach_month"] = lin["breach_metric"], lin["breach_month"]
    return row


def forecast_hybrid(inp):
    s = inp["series"]
    ms = s["months"]
    pts = [_point(inp, i) for i in range(len(ms))]
    sim = _simulate(inp)
    cov = inp["covenants"]
    months = [_add_months(ms[-1], h) for h in range(1, HORIZON + 1)]
    metrics, paths = {}, {}
    for k, (lk, ck, hib) in LIMITS.items():
        if cov.get(lk) is None:
            continue
        q = np.percentile(sim["draws"][k], [10, 50, 90], axis=0)
        fc = [{"month": months[h - 1], "lo": round(float(q[0][h - 1]), 3), "mid": round(float(q[1][h - 1]), 3), "hi": round(float(q[2][h - 1]), 3),
               "events": [_path_event(e, k) for e in sim["events"] if e["h"] == h and abs(e["deltas"].get(k, 0.0)) >= (1e-9 if e["kind"] == "news" else MIN_EVENT / 10)]}
              for h in range(1, HORIZON + 1)]
        band = lambda h: {key: fc[h - 1][key] for key in ("lo", "mid", "hi")}
        now = pts[-1][k]
        metrics[k] = {"now": round(now, 3), "m3": band(3), "m6": band(6), "limit": cov[lk], "cash_trap": cov.get(ck),
                      "series": [{"month": m, "value": round(p[k], 3)} for m, p in zip(ms, pts)],
                      "forecast": fc, "model": sim["model"]}
        paths[k] = [now] + [float(x) for x in q[1]]
    status, bm, bmonth = _status(paths, cov, ms[-1])
    out = drivers(inp, pts, metrics)
    out += _event_drivers(sim, metrics)
    out.sort(key=lambda x: -abs(x["delta"]["amount"]) * (10 if x["delta"]["metric"] == "icr" else 1))
    return {"loan_id": inp["loan_id"], "status": status, "breach_metric": bm, "breach_month": bmonth,
            "metrics": metrics, "drivers": out}


def _path_event(e, metric):
    amt = e["deltas"][metric]
    return {"kind": e["kind"], "label": e["label"], "date": e["date"], "probability": e["probability"],
            "effect_text": _effect_text(metric, amt), "delta": {"metric": metric, "amount": round(amt, 4)},
            "signal_ids": e["signal_ids"], "evidence_ids": e["evidence_ids"]}


def _event_drivers(sim, metrics):
    """Forward drivers: one per dated event (expected effect, month in the label) plus the net repair-spend drift."""
    out = []
    for e in sim["events"]:
        if e["kind"] == "repair_rolloff":
            continue
        month = e["month"]
        if e["kind"] == "news":
            news_metric, pct = e["news"]
            out.append({"kind": "news", "label": f"{e['label']} (from {_mon(month)})", "effect_text": f"{news_metric} {pct:+.1f}%",
                        "delta": {"metric": news_metric, "amount": pct}, "signal_ids": [], "evidence_ids": e["evidence_ids"], "month": month})
            continue
        met = next(k for k in ("icr", "ltv", "occupancy") if k in e["deltas"])
        amt = e["deltas"][met]
        if abs(amt) < MIN_EVENT or met not in metrics:
            continue
        out.append({"kind": e["kind"], "label": e["label"], "effect_text": _effect_text(met, amt), "delta": {"metric": met, "amount": round(amt, 3)},
                    "signal_ids": e["signal_ids"], "evidence_ids": [], "month": month, "probability": e["probability"]})
    gone = sum(r[1] for r in sim["repair"])
    new = sum(r[2] for r in sim["repair"])
    amt = (gone - new) / sim["i_gbp"] if sim["i_gbp"] else 0.0
    if "icr" in metrics and abs(amt) >= MIN_EVENT:
        methods = "; ".join(f"{r[0]} {r[3]}" for r in sim["repair"])
        out.append({"kind": "trend", "label": f"Repair spend, next 6 months: GBP {gone:,.0f} leaves the 12-month window, GBP {new:,.0f} new expected ({methods})",
                    "effect_text": _effect_text("icr", amt), "delta": {"metric": "icr", "amount": round(amt, 3)}, "signal_ids": [], "evidence_ids": []})
    return out


def drivers(inp, pts, metrics):
    """Explain the move from underwriting to now, each with its signal/evidence ids."""
    s, sup, sig = inp["series"], inp.get("suppress", set()), inp["series"]["sig"]
    ev = inp.get("evidence_ids", {})
    last = len(s["months"]) - 1
    i_gbp = interest(inp["amount"], inp["test_rate_pct"])
    out = []

    def d(kind, label, metric, amount, signal_ids, evidence_ids=()):
        if abs(amount) < 0.005:
            return
        out.append({"kind": kind, "label": label, "effect_text": _effect_text(metric, amount), "delta": {"metric": metric, "amount": round(amount, 3)},
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
    return out


# ---- the previous straight-line model (fallback, and the backtest baseline) ----
def forecast_linear(inp):
    s = inp["series"]
    ms = s["months"]
    pts = [_point(inp, i) for i in range(len(ms))]
    adj = _news_adj(inp.get("news"))
    last = len(ms) - 1
    shift = {k: _point(inp, last, adj)[k] - pts[last][k] for k in LIMITS} if adj else {k: 0.0 for k in LIMITS}
    cov = inp["covenants"]
    metrics, paths = {}, {}
    for k, (lk, ck, hib) in LIMITS.items():
        if cov.get(lk) is None:
            continue
        vals = [p[k] for p in pts]
        _, slope, sd = _trend(vals)
        now = vals[-1] + shift[k]
        sd = max(sd, 0.005 * abs(now))
        path = [now + slope * h for h in range(HORIZON + 1)]
        band = lambda h: {"lo": round(path[h] - Z * sd * math.sqrt(h), 3), "mid": round(path[h], 3), "hi": round(path[h] + Z * sd * math.sqrt(h), 3)}
        metrics[k] = {"now": round(now, 3), "m3": band(3), "m6": band(6), "limit": cov[lk], "cash_trap": cov.get(ck),
                      "series": [{"month": m, "value": round(v, 3)} for m, v in zip(ms, vals)],
                      "forecast": [{"month": _add_months(ms[-1], h), **band(h), "events": []} for h in range(1, HORIZON + 1)]}
        paths[k] = path
    status, bm, bmonth = _status(paths, cov, ms[-1])
    out = drivers(inp, pts, metrics)
    for e in inp.get("news") or []:
        eff = e.get("effect") or {}
        if eff.get("metric"):
            out.append({"kind": "news", "label": e.get("title", "News"), "effect_text": f"{eff['metric']} {eff.get('delta_pct', 0):+.1f}%",
                        "delta": {"metric": eff["metric"], "amount": eff.get("delta_pct", 0)}, "signal_ids": [],
                        "evidence_ids": [e["id"]] if e.get("id") is not None else []})
    if "icr" in metrics:
        tr = metrics["icr"]["m6"]["mid"] - metrics["icr"]["now"]
        if abs(tr) >= 0.005:
            out.append({"kind": "trend", "label": "6-month trend on the last 6 months of data", "effect_text": _effect_text("icr", tr),
                        "delta": {"metric": "icr", "amount": round(tr, 3)}, "signal_ids": [], "evidence_ids": []})
    out.sort(key=lambda x: -abs(x["delta"]["amount"]) * (10 if x["delta"]["metric"] == "icr" else 1))
    return {"loan_id": inp["loan_id"], "status": status, "breach_metric": bm, "breach_month": bmonth,
            "metrics": metrics, "drivers": out}


def stress(inputs, rate_bps=0, value_pct=0):
    """Re-run the forecast with the interest rate moved by rate_bps and values moved by value_pct."""
    inp = copy.deepcopy(inputs)
    inp["test_rate_pct"] = inp["test_rate_pct"] + rate_bps / 100.0
    inp["base_value"] = inp["base_value"] * (1 + value_pct / 100.0)
    return forecast(inp)
