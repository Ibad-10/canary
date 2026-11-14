"""12 synthetic loans on real Cortile developments. Only the loan terms are synthetic; the developments,
units and every signal are real. Deterministic: the book is a fixed list of development ids (independent of
post-cutoff outcomes); terms from a fixed seed.

Book selection is frozen so the backtest cannot cherry-pick on live vacancy or post-cutoff tickets.
The ids below were chosen once for the hackathon demo from sector/size filters only (BTR with >=40 rented
units, PBSA in university cities, BTL 8-60 rented on leasehold/mixed, commercial with >=3 commercial_lease
units by floor area) — not re-scored on current vacancy or tickets after BACKTEST_CUTOFF.
"""
import random

import pandas as pd

from engine import forecast as F
from engine import values
from engine.signals import tables

SEED = 42
UNI_CITIES = {"London", "Manchester", "Leeds", "Birmingham", "Bristol", "Liverpool", "Nottingham", "Sheffield",
              "Newcastle upon Tyne", "Cambridge", "Oxford", "Brighton", "Leicester", "Coventry", "Southampton", "Glasgow", "Edinburgh", "Cardiff"}
LEASES = {"Office": "data/legal/Official and public leases/MCL-Office-01.docx",
          "Retail": "data/legal/Official and public leases/MCL-Retail-01.docx",
          "Logistics": "data/legal/Official and public leases/MCL-Logistic-01.docx"}
OWNERS = ["Ibad Zuberi", "Priya Shah", "Tom Hughes"]

# Fixed book: (sector, development_id). Independent of live risk scores / post-cutoff outcomes.
FIXED_BOOK = [
    ("BTR", "dev_120"),
    ("BTR", "dev_235"),
    ("BTR", "dev_189"),
    ("BTR", "dev_129"),
    ("BTR", "dev_012"),
    ("PBSA", "dev_221"),
    ("PBSA", "dev_249"),
    ("BTL", "dev_099"),
    ("BTL", "dev_119"),
    ("Office", "dev_106"),
    ("Retail", "dev_142"),
    ("Logistics", "dev_078"),
]

# Covenant levels per LOAN_RULES.md sections 2-3 (ICR in x, LTV and occupancy in %). Occupancy levels are ILLUSTRATIVE.
# BTL stress_rate_pct is the PRA SS13/16 origination affordability stress only — not the ongoing covenant test rate.
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


def pick():
    """Return the frozen book. Development metadata is loaded for sizing; selection does not use live scores."""
    t = tables()
    g = t["developments"].set_index("id")
    u = t["units"].merge(t["buildings"][["id", "development_id"]].rename(columns={"id": "building_id"}), on="building_id")
    rented = u[u.tenure == "rented"]
    meta = pd.DataFrame({
        "units": u.groupby("development_id").size(),
        "rented": rented.groupby("development_id").size(),
        "comm": u[u.tenure == "commercial_lease"].groupby("development_id").size(),
        "comm_sqm": u[u.tenure == "commercial_lease"].groupby("development_id").floor_area_sqm.sum(),
    }).fillna(0)
    meta = meta.join(g[["name", "city", "region", "postcode_district", "tenure_model"]])
    missing = [d for _, d in FIXED_BOOK if d not in meta.index]
    if missing:
        raise KeyError(f"FIXED_BOOK developments missing from Cortile: {missing}")
    return list(FIXED_BOOK), meta


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
        # PRA SS13/16 5.5% stress is an origination affordability test only (LOAN_RULES 2.1). Ongoing ICR uses the loan rate.
        orig_rate = F.origination_rate(sector, rate)
        occ_u = F.UNDERWRITTEN_OCC[sector]
        noi_u = F.noi(vals["gross_rent"], occ_u, F.OPEX_PCT[sector] * vals["gross_rent"])
        value = vals["value"] if sector == "BTL" else noi_u / F.CAP_RATE[sector]
        amount = min(ltv_target * value, noi_u / (orig_rate / 100 * (cov["icr_min"] + SIZING_HEADROOM)))
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
                          "test_rate_pct": rate, "origination_rate_pct": orig_rate,
                          "origination_ltv": 100 * amount / value, "origination_icr": noi_u / (amount * orig_rate / 100)})
        out.append(loan)
    return out


def public(loan):
    return {k: v for k, v in loan.items() if k != "_"}
