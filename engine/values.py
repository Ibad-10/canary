"""Rent and value per unit from listings v2 and auction results. Every figure cites listing_id / result_id."""
import re
from functools import lru_cache

import pandas as pd

from engine.config import AUCTIONS, LISTINGS

SQFT_PER_SQM = 10.7639
STUDIO_FACTOR = 0.75  # ILLUSTRATIVE: studio rent/value vs flat comps (no studio comps in listings)
DUPLEX_FACTOR = 1.2  # ILLUSTRATIVE
MIN_COMPS = 5
CAP_IDS = 50

RESI_TYPES = {"flat": {"flat", "apartment", "studio", "maisonette"}, "house": {"house", "residential"}}
COMM_TYPES = {"Office": {"office"}, "Retail": {"retail", "shop"}, "Logistics": {"industrial", "warehouse"}}


def _district(pc):
    return pc.split()[0].upper() if isinstance(pc, str) and pc.strip() else None


def _area(district):
    m = re.match(r"[A-Z]+", district or "")
    return m.group(0) if m else None


def _annual_rent(row):
    """Normalise a let listing to GBP per year; None if it cannot be trusted."""
    p, text, basis = row.price_gbp, (row.price_text or "").lower(), (row.price_basis or "")
    if pd.isna(p) or "psf" in basis:
        return None
    if re.search(r"pcm|per calendar month|per month|p\.c\.m|monthly", text):
        return p * 12 if p < 20000 else None
    if re.search(r"\bpw\b|per week|p/w", text):
        return p * 52
    return p


@lru_cache(maxsize=1)
def _tables():
    L = pd.read_parquet(LISTINGS)
    L["size_sqft"] = pd.to_numeric(L["size_sqft"], errors="coerce")
    L["district"] = L["postcode"].map(_district)
    L["area"] = L["district"].map(_area)
    L["ptype"] = L["property_type"].fillna("").str.lower()
    lets = L[L.sale_or_let == "let"].copy()
    lets["rent_pa"] = [_annual_rent(r) for r in lets.itertuples()]
    lets["rent_pa"] = pd.to_numeric(lets.rent_pa, errors="coerce").astype(float)
    psf = pd.to_numeric(lets.price_gbp, errors="coerce").astype(float).where(lets.price_basis.fillna("").str.contains("psf"))
    lets["rent_psf"] = psf.fillna(lets.rent_pa / lets.size_sqft.astype(float))
    sales = L[L.sale_or_let == "sale"].copy()
    sales["value_psf"] = sales.price_gbp / sales.size_sqft
    A = pd.read_parquet(AUCTIONS)
    A["district"] = A["postcode"].map(_district)
    A["area"] = A["district"].map(_area)
    A = A[A.achieved_price_gbp.notna() & A.result_status.fillna("").str.startswith("sold")]
    return lets, sales, A


def _pick(df, district, area):
    """Same postcode district, else same postcode area, else national. Returns (rows, scope)."""
    for col, key, label in (("district", district, f"district {district}"), ("area", area, f"area {area}"), (None, None, "national")):
        sub = df if col is None else df[df[col] == key]
        if len(sub) >= MIN_COMPS or col is None:
            return sub, label


def _stats(series):
    s = series.dropna()
    if s.empty:
        return None
    return {"median": float(s.median()), "q1": float(s.quantile(0.25)), "q3": float(s.quantile(0.75)), "n": int(len(s))}


def resi_comps(postcode_district):
    """Annual rent and value per flat/house unit near a postcode district."""
    lets, sales, A = _tables()
    district, area = postcode_district.upper(), _area(postcode_district.upper())
    out = {}
    for kind in ("flat", "house"):
        types = RESI_TYPES[kind]
        r = lets[lets.ptype.isin(types) & lets.rent_pa.between(4000, 60000)]
        r, rscope = _pick(r, district, area)
        s = sales[sales.ptype.isin(types) & sales.price_gbp.between(50000, 1500000)]
        s, sscope = _pick(s, district, area)
        a = A[(A.lot_type == "residential") & A.achieved_price_gbp.between(30000, 1500000)]
        a, ascope = _pick(a, district, area)
        values = pd.concat([s.price_gbp, a.achieved_price_gbp])
        out[kind] = {
            "rent": _stats(r.rent_pa), "rent_scope": rscope, "rent_ids": r.listing_id.tolist(),
            "value": _stats(values), "value_scope": sscope, "value_ids": s.listing_id.tolist(),
            "auction": _stats(a.achieved_price_gbp), "auction_scope": ascope, "auction_ids": a.result_id.tolist(),
        }
    return out


def comm_comps(sector, postcode_district):
    """Rent and value per sq ft for Office / Retail / Logistics near a postcode district."""
    lets, sales, A = _tables()
    district, area = postcode_district.upper(), _area(postcode_district.upper())
    types = COMM_TYPES[sector]
    r = lets[lets.ptype.isin(types) & lets.rent_psf.between(2, 150)]
    r, rscope = _pick(r, district, area)
    s = sales[sales.ptype.isin(types) & sales.value_psf.between(20, 2000)]
    s, sscope = _pick(s, district, area)
    return {"rent": _stats(r.rent_psf), "rent_scope": rscope, "rent_ids": r.listing_id.tolist(),
            "value": _stats(s.value_psf), "value_scope": sscope, "value_ids": s.listing_id.tolist()}


def _ev(loan_id, kind, title, st, unit, src):
    return {"loan_id": loan_id, "kind": kind, "title": title, "value": round(st["median"], 2), "unit": unit,
            "effect": None, "label": "Listings v2 (24 Oct 2026 crawl)" if kind != "auction" else "Auction results v2",
            "source": src | {"count": st["n"], "iqr": [round(st["q1"], 2), round(st["q3"], 2)]}}


def loan_values(loan, units):
    """Gross annual rent and value for the loan's income units. units: DataFrame of Cortile units (type, floor_area_sqm).

    Returns (vals, evidence_rows). vals = {gross_rent, value, rent_per_unit:{type:..}, value_per_unit:{..}}.
    """
    lid, pcd = loan["id"], loan["_"]["postcode_district"]
    ev = []
    if loan["sector"] in COMM_TYPES:
        c = comm_comps(loan["sector"], pcd)
        sqft = float(units.floor_area_sqm.sum()) * SQFT_PER_SQM
        rent, val = c["rent"]["median"] * sqft, c["value"]["median"] * sqft
        ev.append(_ev(lid, "rent_comp", f"{loan['sector']} rent per sq ft ({c['rent_scope']}, n={c['rent']['n']})", c["rent"], "GBP/sqft/yr",
                      {"dataset": "listings", "listing_ids": c["rent_ids"][:CAP_IDS]}))
        ev.append(_ev(lid, "value_comp", f"{loan['sector']} value per sq ft ({c['value_scope']}, n={c['value']['n']})", c["value"], "GBP/sqft",
                      {"dataset": "listings", "listing_ids": c["value_ids"][:CAP_IDS]}))
        return {"gross_rent": rent, "value": val, "sqft": sqft, "rent_psf": c["rent"]["median"], "value_psf": c["value"]["median"]}, ev

    c = resi_comps(pcd)
    flat = c["flat"]
    ev.append(_ev(lid, "rent_comp", f"Flat rent per year ({flat['rent_scope']}, n={flat['rent']['n']})", flat["rent"], "GBP/unit/yr",
                  {"dataset": "listings", "listing_ids": flat["rent_ids"][:CAP_IDS]}))
    ev.append(_ev(lid, "value_comp", f"Flat value, asking + achieved ({flat['value_scope']}, n={flat['value']['n']})", flat["value"], "GBP/unit",
                  {"dataset": "listings", "listing_ids": flat["value_ids"][:CAP_IDS]}))
    if flat["auction"]:
        ev.append(_ev(lid, "auction", f"Achieved auction price, residential ({flat['auction_scope']}, n={flat['auction']['n']})", flat["auction"], "GBP/lot",
                      {"dataset": "auctions", "result_ids": flat["auction_ids"][:CAP_IDS]}))
    rent_u = {"flat": flat["rent"]["median"], "duplex": flat["rent"]["median"] * DUPLEX_FACTOR, "studio": flat["rent"]["median"] * STUDIO_FACTOR}
    val_u = {"flat": flat["value"]["median"], "duplex": flat["value"]["median"] * DUPLEX_FACTOR, "studio": flat["value"]["median"] * STUDIO_FACTOR}
    types = units.type.where(units.type.isin(rent_u), "flat")
    rent = float(types.map(rent_u).sum())
    val = float(types.map(val_u).sum())
    return {"gross_rent": rent, "value": val, "rent_per_unit": rent_u, "value_per_unit": val_u}, ev
