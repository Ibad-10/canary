"""6-month forward value factor per sector/region. MSCI RCA derived figures -> UK HPI cache -> flat."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MSCI = ROOT / "msci_private" / "market.json"
HPI = ROOT / "engine" / "cache" / "ukhpi.json"  # {"as_of": "...", "regions": {"London": {"annual_change_pct": 1.2}}, "uk": {...}}

# canary sector -> MSCI sector key used in market.json
SECTOR_KEY = {"BTR": "Apartment", "PBSA": "Apartment", "BTL": "Residential",
              "Office": "Office", "Retail": "Retail", "Logistics": "Industrial"}
RESIDENTIAL = {"BTR", "PBSA", "BTL"}
MOMENTUM = 0.5  # forward 6m move = half of trailing 12m move (momentum, deliberately damped)
LO, HI = 0.85, 1.10


def _clamp(x: float) -> float:
    return round(max(LO, min(HI, x)), 4)


def _read(p: Path):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def trend(sector: str, region: str, cutoff: bool = False) -> dict:
    """cutoff=True returns the factor as known at the backtest cut-off (cutoff_factor_6m) when present."""
    m = _read(MSCI)
    if m:
        secs = m.get("sectors") or {}
        row = secs.get(sector) or secs.get(SECTOR_KEY.get(sector, sector))
        if row:
            fk = "cutoff_factor_6m" if cutoff and row.get("cutoff_factor_6m") else "factor_6m"
            if row.get(fk):
                f = float(row[fk])
            else:
                ch = row.get("cppi_12m_change_pct")
                if ch is None:
                    ch = row.get("cppi_6m_change_pct", 0) * 2
                f = 1 + MOMENTUM * float(ch) / 100
            return {
                "factor": _clamp(f),
                "label": "MSCI RCA",
                "source": {"dataset": "MSCI RCA", "tool": "get_rca_trendtracker",
                           "sector": sector, "series": row.get("series"), "metric": row.get("metric"),
                           "as_of": row.get("as_of") or m.get("as_of"), "derived": True, "note": "derived figure only; raw MSCI rows not shown"},
            }
    if sector in RESIDENTIAL:
        h = _read(HPI)
        if h:
            row = (h.get("regions") or {}).get(region) or h.get("uk")
            if row and row.get("annual_change_pct") is not None:
                return {
                    "factor": _clamp(1 + MOMENTUM * float(row["annual_change_pct"]) / 100),
                    "label": "UK HPI",
                    "source": {"dataset": "UK HPI (HM Land Registry)", "region": region if region in (h.get("regions") or {}) else "UK",
                               "as_of": h.get("as_of"), "annual_change_pct": row["annual_change_pct"]},
                }
    return {"factor": 1.0, "label": "flat (no market data)", "source": {"dataset": None, "note": "no MSCI cache or HPI file"}}


if __name__ == "__main__":
    for s, r in (("Office", "London"), ("BTR", "Manchester"), ("Logistics", "Leeds")):
        print(s, r, trend(s, r))
    print(trend("Office", "London", cutoff=True)["factor"])
