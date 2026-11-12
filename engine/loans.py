"""12 synthetic loans on real Cortile developments. Only the loan terms are synthetic; the developments,
units and every signal are real. Deterministic: candidates ranked by real risk signals, terms from a fixed seed."""
import random

import pandas as pd

from engine import forecast as F
from engine import values
from engine.signals import EWS_BAD, HAIRCUT_TYPES, tables

SEED = 42
UNI_CITIES = {"London", "Manchester", "Leeds", "Birmingham", "Bristol", "Liverpool", "Nottingham", "Sheffield",
              "Newcastle upon Tyne", "Cambridge", "Oxford", "Brighton", "Leicester", "Coventry", "Southampton", "Glasgow", "Edinburgh", "Cardiff"}
LEASES = {"Office": "data/legal/Official and public leases/MCL-Office-01.docx",
          "Retail": "data/legal/Official and public leases/MCL-Retail-01.docx",
          "Logistics": "data/legal/Official and public leases/MCL-Logistic-01.docx"}
OWNERS = ["Ibad Zuberi", "Priya Shah", "Tom Hughes"]

# Covenant levels per LOAN_RULES.md sections 2-3 (ICR in x, LTV and occupancy in %). Occupancy levels are ILLUSTRATIVE.
COVENANTS = {
    "BTR": {"icr_min": 1.25, "icr_cash_trap": 1.35, "ltv_max": 65.0, "ltv_cash_trap": 60.0, "occupancy_min": 85.0, "occupancy_cash_trap": 90.0, "test": "ICR"},
    "PBSA": {"icr_min": 1.30, "icr_cash_trap": 1.40, "ltv_max": 65.0, "ltv_cash_trap": 60.0, "occupancy_min": 85.0, "occupancy_cash_trap": 90.0, "test": "ICR"},
    "BTL": {"icr_min": 1.25, "icr_cash_trap": 1.35, "ltv_max": 75.0, "ltv_cash_trap": 70.0, "test": "ICR", "stress_rate_pct": F.BTL_STRESS_RATE},
    "Office": {"icr_min": 1.35, "icr_cash_trap": 1.45, "ltv_max": 65.0, "ltv_cash_trap": 60.0, "test": "ICR"},
    "Retail": {"icr_min": 1.40, "icr_cash_trap": 1.50, "ltv_max": 65.0, "ltv_cash_trap": 60.0, "test": "ICR"},
    "Logistics": {"icr_min": 1.30, "icr_cash_trap": 1.40, "ltv_max": 65.0, "ltv_cash_trap": 60.0, "test": "ICR"},
}
RATE_RANGE = {"BTR": (5.25, 6.0), "PBSA": (5.5, 6.25), "BTL": (4.75, 5.5), "Office": (6.0, 6.75), "Retail": (6.25, 7.0), "Logistics": (5.75, 6.5)}
SIZING_HEADROOM = 0.25  # loans sized so origination ICR = covenant + 0.25x (or the LTV target, whichever is lower)
SUFFIX = {"BTR": "BTR Holdings Ltd", "PBSA": "Student Living Ltd", "BTL": "Lettings LLP", "Office": "Office Investments Ltd",
          "Retail": "Retail Propco Ltd", "Logistics": "Logistics Propco Ltd"}
NAME = {"BTR": "build-to-rent block", "PBSA": "student accommodation", "BTL": "buy-to-let portfolio", "Office": "office units",
        "Retail": "retail units", "Logistics": "trade / logistics units"}


def risk_table():
    """Per development: real risk signals and a simple risk score used only to pick an interesting book."""
    t = tables()
    u = t["units"].merge(t["buildings"][["id", "development_id"]].rename(columns={"id": "building_id"}), on="building_id")
    b = t["buildings"]
    cp = t["compliance"].merge(b[["id", "development_id"]].rename(columns={"id": "building_id"}), on="building_id")
    tk = t["tickets"].merge(b[["id", "development_id"]].rename(columns={"id": "building_id"}), on="building_id")
    rented = u[u.tenure == "rented"]
    g = pd.DataFrame({
        "units": u.groupby("development_id").size(),
        "rented": rented.groupby("development_id").size(),
        "rented_vac": rented.assign(v=rented.occupancy == "vacant").groupby("development_id").v.mean(),
        "rented_studio": rented.assign(s=rented.type == "studio").groupby("development_id").s.mean(),
        "comm": u[u.tenure == "commercial_lease"].groupby("development_id").size(),
        "comm_sqm": u[u.tenure == "commercial_lease"].groupby("development_id").floor_area_sqm.sum(),
        "overdue": cp[(cp.status == "overdue") & cp.type.isin(HAIRCUT_TYPES)].groupby("development_id").size(),
        "ews": b[b.external_wall_status.isin(EWS_BAD)].groupby("development_id").size(),
        "emerg_6m": tk[(tk.urgency == "emergency") & (tk.day >= "2026-05-12")].groupby("development_id").size(),
    }).fillna(0)
    g = g.join(t["developments"].set_index("id")[["name", "city", "region", "postcode_district", "tenure_model"]])
    g["score"] = 100 * g.rented_vac + 4 * g.overdue + 5 * g.ews + 50 * g.emerg_6m / g.units.clip(lower=1)
    return g


def _spread(df, n):
    """n picks across a risk-sorted frame: riskiest first, then spread down to the safest."""
    df = df.sort_values("score", ascending=False)
    idx = sorted({round(i * (len(df) - 1) / (n - 1)) for i in range(n)}) if n > 1 else [0]
    if n >= 4:
        idx = [0, 1] + [round(len(df) * 0.4)] + [len(df) - 2, len(df) - 1][: n - 3]
    return df.iloc[idx]


def pick():
    g = risk_table()
    btr = g[(g.tenure_model == "build_to_rent") & (g.rented >= 40)]
    pbsa = btr[btr.city.isin(UNI_CITIES)].sort_values("rented_studio", ascending=False).head(2)
    btr = _spread(btr.drop(pbsa.index), 5)
    btl_pool = g[g.tenure_model.isin(["leasehold", "mixed_tenure"]) & g.rented.between(8, 60)]
    btl = _spread(btl_pool, 2)
    comm = g[g.comm >= 3].drop(list(btr.index) + list(pbsa.index), errors="ignore").sort_values("comm_sqm", ascending=False).head(3)
    picks = [("BTR", d) for d in btr.index] + [("PBSA", d) for d in pbsa.index] + [("BTL", d) for d in btl.index]
    picks += list(zip(["Office", "Retail", "Logistics"], comm.index))
    return picks, g


def build():
    t = tables()
    picks, g = pick()
    rng = random.Random(SEED)
    out = []
    for n, (sector, dev) in enumerate(picks, start=1):
        d = g.loc[dev]
        bl = t["buildings"][t["buildings"].development_id == dev]
        units = t["units"][t["units"].building_id.isin(bl.id)]
        tenure = "commercial_lease" if sector in LEASES else "rented"
        inc = units[units.tenure == tenure]
        if sector in LEASES:
            bl = bl[bl.id.isin(inc.building_id)]
        lid = f"CAN-{n:03d}"
        loan = {"id": lid, "_": {"postcode_district": d.postcode_district, "building_ids": bl.id.tolist(),
                                 "unit_ids": inc.id.tolist(), "freehold": sector in ("BTR", "PBSA"), "development": d["name"], "city": d.city, "region": d.region}}
        vals, _ = values.loan_values({**loan, "sector": sector}, inc)
        rate = round(rng.uniform(*RATE_RANGE[sector]) * 4) / 4
        ltv_target = rng.uniform(0.55, 0.65)
        cov = dict(COVENANTS[sector])
        trate = F.test_rate(sector, rate)
        occ_u = F.UNDERWRITTEN_OCC[sector]
        noi_u = F.noi(vals["gross_rent"], occ_u, F.OPEX_PCT[sector] * vals["gross_rent"])
        value = vals["value"] if sector == "BTL" else noi_u / F.CAP_RATE[sector]
        amount = min(ltv_target * value, noi_u / (trate / 100 * (cov["icr_min"] + SIZING_HEADROOM)))
        amount = float(int(amount / 10000) * 10000)
        loan.update({
            "name": f"{d['name']}, {d.city} - {NAME[sector]}",
            "borrower": f"{d['name'].split()[0]} {SUFFIX[sector]}",
            "sector": sector, "owner": OWNERS[(n - 1) % 3], "amount_gbp": amount, "rate_pct": rate, "value_gbp": round(value, -3),
            "covenants": cov, "development_ids": [dev], "building_ids": bl.id.tolist(), "contract_file": LEASES.get(sector),
            "synthetic_note": ("SYNTHETIC: borrower (fictional), amount, rate, covenant levels and origination value. "
                               f"REAL: development {dev} and its {len(bl)} building(s) / {len(inc)} {tenure} units in Cortile; rent and value comps from listings v2."
                               + (f" Sector label and tenant lease ({LEASES[sector].rsplit('/', 1)[1]}, public MCL template) assigned synthetically to the real commercial_lease units." if sector in LEASES else "")
                               + (" Origination value = underwritten NOI / ILLUSTRATIVE yield." if sector != "BTL" else " Value = flat comps x units.")),
        })
        loan["_"].update({"gross_rent": vals["gross_rent"], "vp_value": vals["value"], "underwritten_noi": noi_u,
                          "test_rate_pct": trate, "origination_ltv": 100 * amount / value, "origination_icr": noi_u / (amount * trate / 100)})
        out.append(loan)
    return out


def public(loan):
    return {k: v for k, v in loan.items() if k != "_"}
