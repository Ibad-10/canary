"""Monthly Cortile signals per loan. Every row cites {dataset:'cortile', table, row_ids, count}.

Point-in-time: tickets, compliance due dates and final service-charge years are dated and cut at `as_of`.
Snapshot-only fields (occupancy, leaseholder arrears, EWS status, is_higher_risk, compliance no_record) have
no history in Cortile. They are included only when as_of >= AS_OF (the extract date). At an earlier cutoff
they are EXCLUDED — not filled with today's value — so the backtest cannot leak the future.
"""
import sqlite3
from functools import lru_cache

import pandas as pd

from engine.config import AS_OF, ARREARS_WRITEOFF_PCT, CORTILE_DB, FIRST_MONTH, HORIZON

CAP_IDS = 50
HAIRCUT_TYPES = {"fire_risk_assessment", "safety_case_report"}
EWS_BAD = {"remediation_in_progress", "remediation_planned"}
SC_YEAR_START, SC_RECOGNISED = "2026-01-01", "2026-11-01"  # in-progress service-charge year counts from month 11
# Kinds that exist only as a live Cortile snapshot (no dated history).
SNAPSHOT_KINDS = ("vacancy", "arrears", "ews_remediation", "higher_risk", "compliance_missing")


@lru_cache(maxsize=1)
def tables():
    con = sqlite3.connect(CORTILE_DB)
    q = lambda s: pd.read_sql(s, con)
    t = {
        "developments": q("select * from developments"),
        "buildings": q("select * from buildings"),
        "units": q("select * from units"),
        "leases": q("select id, unit_id, building_id, arrears_gbp, leaseholder_name, lease_start_date, term_years from leases"),
        "compliance": q("select id, building_id, type, label, status, next_due_on, last_completed_on from compliance_items"),
        "budgets": q("select id, building_id, financial_year_end, status, category, budget_gbp, actual_gbp from service_charge_budgets"),
        "tickets": q("select id, building_id, unit_id, urgency, reopened, cost_gbp, reported_at, category from tickets"),
    }
    con.close()
    t["tickets"]["day"] = t["tickets"].reported_at.str[:10]
    t["tickets"]["month"] = t["tickets"].reported_at.str[:7] + "-01"
    t["tickets"]["cost_gbp"] = t["tickets"].cost_gbp.fillna(0.0)
    ls = t["leases"]
    ls["end"] = (ls.lease_start_date.str[:4].astype(int) + ls.term_years).astype(str).str.zfill(4) + ls.lease_start_date.str[4:10]
    return t


def horizon_end(as_of):
    return (pd.Timestamp(as_of[:7] + "-01") + pd.DateOffset(months=HORIZON) + pd.offsets.MonthEnd(0)).strftime("%Y-%m-%d")


def use_snapshot(as_of):
    """True only at/after the Cortile extract date — snapshot fields are not known earlier."""
    return as_of >= AS_OF


@lru_cache(maxsize=4)
def miss_rate(as_of):
    """Book-wide share of fire-risk / safety-case items due in the 12 months to as_of that went overdue."""
    hc = tables()["compliance"]
    hc = hc[hc.type.isin(HAIRCUT_TYPES)]
    w0 = (pd.Timestamp(as_of) - pd.DateOffset(months=12)).strftime("%Y-%m-%d")
    missed = int(((hc.status == "overdue") & (hc.next_due_on > w0) & (hc.next_due_on <= as_of)).sum())
    done = int(((hc.last_completed_on > w0) & (hc.last_completed_on <= as_of)).sum())
    return missed / max(1, missed + done), missed, missed + done


@lru_cache(maxsize=4)
def vacate_rate(as_of):
    """Book-wide share of commercial leases that ended on or before as_of whose unit is vacant at the extract.

    Vacancy itself is snapshot-only, so this prior is only used when use_snapshot(as_of). At an earlier
    cutoff the forecast uses a neutral 50% leave probability instead (see build).
    """
    t = tables()
    u = t["units"].set_index("id")
    ls = t["leases"][t["leases"].unit_id.map(u.tenure) == "commercial_lease"]
    ended = ls[ls.end <= as_of]
    vacant = int((ended.unit_id.map(u.occupancy) == "vacant").sum())
    return vacant / max(1, len(ended)), vacant, len(ended)


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
    Snapshot-only fields are omitted when as_of < AS_OF.
    """
    t = tables()
    inner = loan["_"]
    bids, uids = set(inner["building_ids"]), set(inner["unit_ids"])
    lid = loan["id"]
    ms = months(as_of)
    rows = []
    sig = {}
    snap = use_snapshot(as_of)
    excluded = [] if snap else list(SNAPSHOT_KINDS)

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
    month_cost = {"emergency_tickets": [], "reopened_tickets": []}
    month_sig = {"emergency_tickets": [], "reopened_tickets": []}
    for i, m in enumerate(ms):
        for kind, df, label in (("emergency_tickets", em, "emergency"), ("reopened_tickets", ro, "reopened (non-emergency)")):
            mm = df[df.month == m]
            month_cost[kind].append(float(mm.cost_gbp.sum()))
            month_sig[kind].append(None)
            if len(mm):
                month_sig[kind][-1] = add(kind, m, len(mm), "tickets", f"{len(mm)} {label} tickets reported, GBP {mm.cost_gbp.sum():,.0f} repair cost", _src("tickets", mm.id))["id"]
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
    h_end = horizon_end(as_of)
    events = []
    if len(prog) and as_of < SC_RECOGNISED <= h_end:
        # the in-progress year enters the cost base on SC_RECOGNISED; best estimate before then is last final year's overspend
        prev = [max(by_year[b]) for b in prog.building_id.unique() if b in by_year]
        est = sum(p[1] for p in prev)
        if est > 0:
            r = add("service_charge_in_year", snap_month, est, "GBP",
                    f"In-progress service-charge year enters the test from {SC_RECOGNISED}; estimate = the {max(p[0] for p in prev)} overspend (GBP {est:,.0f}, landlord share)",
                    _src("service_charge_budgets", [i for p in prev for i in p[2]]))
            events.append({"kind": "service_charge_in_year", "date": SC_RECOGNISED, "label": f"In-progress service-charge year recognised {SC_RECOGNISED}",
                           "cost_change": est, "probability": 1.0, "signal_ids": [r["id"]]})
    if len(prog) and as_of >= SC_RECOGNISED:
        elapsed = (pd.Timestamp(as_of) - pd.Timestamp(SC_YEAR_START)).days / 365.0
        ytd = 0.0
        for b, g in prog.groupby("building_id"):
            ytd += max(0.0, (g.actual_gbp - g.budget_gbp * elapsed).sum()) * float(share.get(b, 0.0))
        if ytd > 0:
            over_series[-1] += ytd / elapsed
            add("sc_overspend", snap_month, ytd, "GBP", f"Service-charge year to 2026-12-31 (in progress): GBP {ytd:,.0f} over pro-rata budget so far",
                _src("service_charge_budgets", prog.id))
        # at year end the in-progress year becomes the latest final year, so the previous final year's overspend leaves the cost base
        for fy, g in prog[prog.financial_year_end <= h_end].groupby("financial_year_end"):
            prev = [max(by_year[b]) for b in g.building_id.unique() if b in by_year]
            gone = sum(p[1] for p in prev)
            if gone > 0:
                r = add("service_charge_year_end", snap_month, gone, "GBP",
                        f"Service-charge year ends {fy}: the {max(p[0] for p in prev)} overspend (GBP {gone:,.0f}, landlord share) is replaced by this year's outturn",
                        _src("service_charge_budgets", [i for p in prev for i in p[2]]))
                events.append({"kind": "service_charge_year_end", "date": fy, "label": f"Service-charge year end {fy}",
                               "cost_change": -gone, "probability": 1.0, "signal_ids": [r["id"]]})

    # leaseholder arrears: snapshot stock -> annual flow (see ARREARS_WRITEOFF_PCT). Borrower's share only.
    arrears_drag = 0.0
    arrears_balance = 0.0
    if snap:
        ls = t["leases"][t["leases"].building_id.isin(bids) & (t["leases"].arrears_gbp > 0)]
        for b, g in ls.groupby("building_id"):
            own = float(g[g.unit_id.isin(uids)].arrears_gbp.sum())
            other = float(g[~g.unit_id.isin(uids)].arrears_gbp.sum())
            # Always the borrower's service-charge share of other leaseholders' arrears — never 100% just because freehold.
            arrears_balance += own + other * float(share.get(b, 0.0))
        arrears_drag = ARREARS_WRITEOFF_PCT * arrears_balance
        if len(ls):
            add("arrears", snap_month, arrears_drag, "GBP",
                f"{len(ls)} leases in arrears (service charge / ground rent), balance GBP {arrears_balance:,.0f}; "
                f"annual ICR drag GBP {arrears_drag:,.0f} (= {ARREARS_WRITEOFF_PCT:.0%} write-off share of borrower-attributable balance)",
                _src("leases", ls.id))

    # compliance: overdue by month (reconstructed from next_due_on); no_record is snapshot-only
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
    due = cp[cp.type.isin(HAIRCUT_TYPES) & (cp.next_due_on >= as_of) & (cp.next_due_on <= h_end)].sort_values("next_due_on")
    if len(due):
        p, missed, n = miss_rate(as_of)
        r = add("compliance_due", snap_month, len(due), "items",
                f"{len(due)} fire-risk / safety-case item(s) fall due by {h_end} ({', '.join(due.next_due_on.str[:10].head(4))}); "
                f"book-wide {missed} of {n} due in the last 12 months went overdue ({p:.0%})", _src("compliance_items", due.id))
        names = t["buildings"].set_index("id").name
        for c in due.itertuples():
            events.append({"kind": "compliance_due", "date": c.next_due_on[:10], "label": f"{c.label} due, {names.get(c.building_id, c.building_id)}",
                           "items": 1, "probability": round(p, 4), "signal_ids": [r["id"]]})
    if snap:
        nr = cp[cp.status == "no_record"]
        if len(nr):
            add("compliance_missing", snap_month, len(nr), "items", f"{len(nr)} compliance items with no record ({', '.join(nr.label.unique()[:3])})",
                _src("compliance_items", nr.id))

    # buildings: EWS remediation and higher-risk (snapshot only)
    ews_n = 0
    if snap:
        bl = t["buildings"][t["buildings"].id.isin(bids)]
        ews = bl[bl.external_wall_status.isin(EWS_BAD)]
        ews_n = int(len(ews))
        for b in ews.itertuples():
            add("ews_remediation", snap_month, 1, "building", f"{b.name}: external wall {b.external_wall_status.replace('_', ' ')}",
                _src("buildings", [b.id]), building_id=b.id)
        hr = bl[bl.is_higher_risk == 1]
        if len(hr):
            add("higher_risk", snap_month, len(hr), "buildings", f"{len(hr)} of {len(bl)} buildings are higher-risk (18m+ / 7+ storeys)", _src("buildings", hr.id))

    # vacancy of income units (snapshot only). When excluded, occupancy is None -> forecast uses underwritten.
    if snap:
        vac = inc[inc.occupancy == "vacant"]
        occ = 1.0 - len(vac) / max(1, len(inc))
        vacant_units = int(len(vac))
        add("vacancy", snap_month, 100 * (1 - occ), "%", f"{len(vac)} of {len(inc)} income units vacant", _src("units", vac.id))
    else:
        occ = None
        vacant_units = None

    # lease expiries on let income units inside the horizon; rent share by floor area
    area = float(inc.floor_area_sqm.sum()) or 1.0
    if snap:
        occupied = inc[inc.occupancy == "occupied"].set_index("id")
        leave_p, vacant_n, ended_n = vacate_rate(as_of)
        leave_note = f"book-wide {vacant_n} of {ended_n} ended commercial leases left the unit vacant"
    else:
        # Without snapshot occupancy we cannot see who is let today; use all income units with a lease ending,
        # and a neutral leave probability (vacancy status would leak the extract).
        occupied = inc.set_index("id")
        leave_p, vacant_n, ended_n = 0.5, 0, 0
        leave_note = "neutral 50% leave probability (occupancy snapshot excluded at this cutoff)"
    ending = t["leases"][t["leases"].unit_id.isin(occupied.index) & (t["leases"].end > as_of) & (t["leases"].end <= h_end)]
    if len(ending):
        for le in ending.sort_values("end").itertuples():
            u = occupied.loc[le.unit_id]
            rent_share = float(u.floor_area_sqm) / area
            r = add("lease_expiry", snap_month, 100 * rent_share, "% of income",
                    f"{u.unit_number} lease to {le.leaseholder_name} ends {le.end} ({rent_share:.0%} of income floor area); {leave_note}",
                    _src("leases", [le.id]), building_id=le.building_id)
            events.append({"kind": "lease_expiry", "date": le.end, "label": f"Lease expiry {u.unit_number} ({le.leaseholder_name})",
                           "rent_share": round(rent_share, 4), "units": 1, "probability": round(leave_p, 4), "signal_ids": [r["id"]]})

    series = {
        "months": ms, "em_cost": em_cost, "ro_cost": ro_cost, "overspend": over_series,
        "em_month": month_cost["emergency_tickets"], "ro_month": month_cost["reopened_tickets"],
        "em_sig": month_sig["emergency_tickets"], "ro_sig": month_sig["reopened_tickets"],
        "overdue": overdue_n, "haircut_items": haircut_n,
        "arrears": arrears_drag, "arrears_balance": arrears_balance, "occupancy": occ, "ews": ews_n,
        "income_units": int(len(inc)), "vacant_units": vacant_units, "sig": sig,
        "events": sorted(events, key=lambda e: e["date"]),
        "snapshot_excluded": excluded,
    }
    return rows, series
