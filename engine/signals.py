"""Monthly Cortile signals per loan. Every row cites {dataset:'cortile', table, row_ids, count}.

History caveat: Cortile is a snapshot. Tickets, compliance due dates and final service-charge years are dated,
so they are cut at `as_of`. Occupancy, leaseholder arrears, EWS status and is_higher_risk have no history and
are read as at the snapshot whatever `as_of` is.
"""
import sqlite3
from functools import lru_cache

import pandas as pd

from engine.config import CORTILE_DB, FIRST_MONTH

CAP_IDS = 50
HAIRCUT_TYPES = {"fire_risk_assessment", "safety_case_report"}
EWS_BAD = {"remediation_in_progress", "remediation_planned"}


@lru_cache(maxsize=1)
def tables():
    con = sqlite3.connect(CORTILE_DB)
    q = lambda s: pd.read_sql(s, con)
    t = {
        "developments": q("select * from developments"),
        "buildings": q("select * from buildings"),
        "units": q("select * from units"),
        "leases": q("select id, unit_id, building_id, arrears_gbp from leases"),
        "compliance": q("select id, building_id, type, label, status, next_due_on, last_completed_on from compliance_items"),
        "budgets": q("select id, building_id, financial_year_end, status, category, budget_gbp, actual_gbp from service_charge_budgets"),
        "tickets": q("select id, building_id, unit_id, urgency, reopened, cost_gbp, reported_at, category from tickets"),
    }
    con.close()
    t["tickets"]["day"] = t["tickets"].reported_at.str[:10]
    t["tickets"]["month"] = t["tickets"].reported_at.str[:7] + "-01"
    t["tickets"]["cost_gbp"] = t["tickets"].cost_gbp.fillna(0.0)
    return t


def months(as_of):
    return [d.strftime("%Y-%m-%d") for d in pd.date_range(FIRST_MONTH, as_of[:7] + "-01", freq="MS")]


def month_end(m, as_of):
    e = (pd.Timestamp(m) + pd.offsets.MonthEnd(0)).strftime("%Y-%m-%d")
    return min(e, as_of)


def _src(table, ids):
    ids = list(ids)
    return {"dataset": "cortile", "table": table, "row_ids": ids[:CAP_IDS], "count": len(ids)}


def build(loan, as_of, next_id):
    """Signal rows + monthly input series for one loan, using only data dated <= as_of.

    loan['_'] holds internal fields: building_ids, unit_ids (income units), freehold (bool).
    next_id: callable returning the next signal id.
    """
    t = tables()
    inner = loan["_"]
    bids, uids = set(inner["building_ids"]), set(inner["unit_ids"])
    lid = loan["id"]
    ms = months(as_of)
    rows = []
    sig = {}

    def add(kind, month, value, unit, detail, source, building_id=None):
        r = {"id": next_id(), "run_id": None, "loan_id": lid, "building_id": building_id, "month": month,
             "kind": kind, "value": round(float(value), 2), "unit": unit, "detail": detail, "source": source}
        rows.append(r)
        sig.setdefault(kind, []).append(r["id"])
        return r

    units = t["units"][t["units"].building_id.isin(bids)]
    inc = units[units.id.isin(uids)]
    share = inc.groupby("building_id").service_charge_share_pct.sum() / 100.0
    snap_month = ms[-1]

    # tickets: monthly counts and trailing-12m annualised cost
    tk = t["tickets"][t["tickets"].building_id.isin(bids) & (t["tickets"].day <= as_of)]
    em = tk[tk.urgency == "emergency"]
    ro = tk[(tk.reopened == 1) & (tk.urgency != "emergency")]
    em_cost, ro_cost = [], []
    for i, m in enumerate(ms):
        for kind, df, label in (("emergency_tickets", em, "emergency"), ("reopened_tickets", ro, "reopened (non-emergency)")):
            mm = df[df.month == m]
            if len(mm):
                add(kind, m, len(mm), "tickets", f"{len(mm)} {label} tickets reported, GBP {mm.cost_gbp.sum():,.0f} repair cost", _src("tickets", mm.id))
        window = ms[max(0, i - 11): i + 1]
        scale = 12.0 / len(window)
        em_cost.append(float(em[em.month.isin(window)].cost_gbp.sum()) * scale)
        ro_cost.append(float(ro[ro.month.isin(window)].cost_gbp.sum()) * scale)

    # service charge: unrecovered overspend of latest final year ended <= month end (landlord share only)
    bg = t["budgets"][t["budgets"].building_id.isin(bids)].copy()
    bg["over"] = bg.actual_gbp - bg.budget_gbp
    final = bg[(bg.status == "final") & (bg.financial_year_end <= as_of)]
    by_year = {}
    for (b, fy), g in final.groupby(["building_id", "financial_year_end"]):
        by_year.setdefault(b, []).append((fy, max(0.0, g.over.sum()) * float(share.get(b, 0.0)), g.id.tolist()))
    over_series = []
    for m in ms:
        e = month_end(m, as_of)
        tot = 0.0
        for b, ys in by_year.items():
            past = [y for y in ys if y[0] <= e]
            if past:
                tot += max(past)[1]
        over_series.append(tot)
    for fy in sorted(final.financial_year_end.unique()):
        if fy < FIRST_MONTH:
            continue
        g = final[final.financial_year_end == fy]
        val = sum(y[1] for ys in by_year.values() for y in ys if y[0] == fy)
        if val > 0:
            add("sc_overspend", fy[:7] + "-01", val, "GBP", f"Service-charge year to {fy}: GBP {val:,.0f} over budget, landlord-funded share",
                _src("service_charge_budgets", g[g.over > 0].id))
    prog = bg[(bg.status == "in_progress") & (bg.financial_year_end > as_of)]
    if len(prog) and as_of >= "2026-11-01":
        elapsed = (pd.Timestamp(as_of) - pd.Timestamp("2026-01-01")).days / 365.0
        ytd = 0.0
        for b, g in prog.groupby("building_id"):
            ytd += max(0.0, (g.actual_gbp - g.budget_gbp * elapsed).sum()) * float(share.get(b, 0.0))
        if ytd > 0:
            over_series[-1] += ytd / elapsed
            add("sc_overspend", snap_month, ytd, "GBP", f"Service-charge year to 2026-12-31 (in progress): GBP {ytd:,.0f} over pro-rata budget so far",
                _src("service_charge_budgets", prog.id))

    # leaseholder arrears (snapshot)
    ls = t["leases"][t["leases"].building_id.isin(bids) & (t["leases"].arrears_gbp > 0)]
    arrears_drag = 0.0
    for b, g in ls.groupby("building_id"):
        own = g[g.unit_id.isin(uids)].arrears_gbp.sum()
        other = g[~g.unit_id.isin(uids)].arrears_gbp.sum()
        arrears_drag += own + other * (1.0 if inner["freehold"] else float(share.get(b, 0.0)))
    if len(ls):
        add("arrears", snap_month, ls.arrears_gbp.sum(), "GBP",
            f"{len(ls)} leases in arrears (service charge / ground rent), GBP {ls.arrears_gbp.sum():,.0f}; GBP {arrears_drag:,.0f} falls on the borrower",
            _src("leases", ls.id))

    # compliance: overdue by month (reconstructed from next_due_on), no_record as snapshot
    cp = t["compliance"][t["compliance"].building_id.isin(bids)]
    od = cp[cp.status == "overdue"]
    overdue_n, haircut_n = [], []
    for m in ms:
        e = month_end(m, as_of)
        cur = od[od.next_due_on < e]
        overdue_n.append(len(cur))
        haircut_n.append(int(cur.type.isin(HAIRCUT_TYPES).sum()))
        if len(cur):
            top = ", ".join(f"{k} x{v}" for k, v in cur.label.value_counts().head(3).items())
            add("compliance_overdue", m, len(cur), "items", f"{len(cur)} compliance items overdue ({top})", _src("compliance_items", cur.id))
    nr = cp[cp.status == "no_record"]
    if len(nr):
        add("compliance_missing", snap_month, len(nr), "items", f"{len(nr)} compliance items with no record ({', '.join(nr.label.unique()[:3])})",
            _src("compliance_items", nr.id))

    # buildings: EWS remediation and higher-risk (snapshot)
    bl = t["buildings"][t["buildings"].id.isin(bids)]
    ews = bl[bl.external_wall_status.isin(EWS_BAD)]
    for b in ews.itertuples():
        add("ews_remediation", snap_month, 1, "building", f"{b.name}: external wall {b.external_wall_status.replace('_', ' ')}",
            _src("buildings", [b.id]), building_id=b.id)
    hr = bl[bl.is_higher_risk == 1]
    if len(hr):
        add("higher_risk", snap_month, len(hr), "buildings", f"{len(hr)} of {len(bl)} buildings are higher-risk (18m+ / 7+ storeys)", _src("buildings", hr.id))

    # vacancy of income units (snapshot)
    vac = inc[inc.occupancy == "vacant"]
    occ = 1.0 - len(vac) / max(1, len(inc))
    add("vacancy", snap_month, 100 * (1 - occ), "%", f"{len(vac)} of {len(inc)} income units vacant", _src("units", vac.id))

    series = {
        "months": ms, "em_cost": em_cost, "ro_cost": ro_cost, "overspend": over_series,
        "overdue": overdue_n, "haircut_items": haircut_n,
        "arrears": arrears_drag, "occupancy": occ, "ews": int(len(ews)),
        "income_units": int(len(inc)), "vacant_units": int(len(vac)), "sig": sig,
    }
    return rows, series
