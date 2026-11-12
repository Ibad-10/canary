# MSCI RCA queries for Canary market trend (lead runs these in Cursor, MCP: MSCI-RCA-MCP)

You (the lead) must run these; the engine cannot call MSCI. Raw MSCI output goes ONLY into `msci_private/` (gitignored). The engine reads only the derived file `msci_private/market.json`, and the UI shows only derived figures labelled "MSCI RCA". Delete everything in `msci_private/` after judging.

## Prompt to paste into Cursor chat

> Using the RCA tools (get_rca_trendtracker; use get_rca_definitions first if you need valid parameter values), get the **UK** RCA Commercial Property Price Index (CPPI) series from January 2024 to the latest month, **monthly**, for each of these property types: **Office, Retail, Industrial, Apartment** (UK apartment/multifamily; also try "Residential" if available). For each type give: the latest index value and its month, the index value 6 months earlier, the index value 12 months earlier, and (if the tool offers it) the latest UK cap rate and the cap rate 12 months earlier. Save the raw output to `msci_private/raw_trendtracker.md`. Then compute the percentage changes yourself and write ONLY this JSON to `msci_private/market.json`. Do not print raw rows in chat.

## Exact JSON shape for `msci_private/market.json`

```json
{
  "as_of": "2026-11-12",
  "source": "MSCI RCA get_rca_trendtracker, UK CPPI",
  "sectors": {
    "Office":      {"cppi_6m_change_pct": -1.4, "cppi_12m_change_pct": -2.9, "cap_rate_pct": 6.9, "cap_rate_change_bps_12m": 25, "as_of": "2026-09"},
    "Retail":      {"cppi_6m_change_pct":  0.3, "cppi_12m_change_pct": -0.5, "cap_rate_pct": 7.4, "cap_rate_change_bps_12m": 10, "as_of": "2026-09"},
    "Industrial":  {"cppi_6m_change_pct":  1.1, "cppi_12m_change_pct":  2.2, "cap_rate_pct": 5.3, "cap_rate_change_bps_12m": -5, "as_of": "2026-09"},
    "Apartment":   {"cppi_6m_change_pct":  0.8, "cppi_12m_change_pct":  1.6, "cap_rate_pct": 4.9, "cap_rate_change_bps_12m":  0, "as_of": "2026-09"},
    "Residential": {"cppi_6m_change_pct":  0.8, "cppi_12m_change_pct":  1.6, "as_of": "2026-09"}
  }
}
```

(The numbers above are placeholders to show the format - replace with the real derived figures.)

Rules for the file:
- Only the keys shown. `cppi_12m_change_pct` is required per sector; other keys optional. `Residential` is used by BTL loans; if MSCI has no separate series, copy `Apartment`.
- Percent values are plain numbers (1.6 means +1.6%), not fractions.
- Optional per sector: `"factor_6m": 0.985` overrides the engine's formula (forward 6-month value factor).

## Accepted alternative shape (the one already in `msci_private/market.json` today)

Sectors may be keyed by Canary sector (`BTR`, `PBSA`, `BTL`, `Office`, `Retail`, `Logistics`) instead, each with `factor_6m` (and optional `cutoff_factor_6m` for the backtest, `metric`, `series`, `cap_rate_pct`). Canary-sector keys are looked up first, then the MSCI-type keys above. `engine.market.trend(sector, region, cutoff=True)` returns the cut-off factor for the backtest.

## How the engine uses it (`engine/market.py`)

`factor = 1 + 0.5 * cppi_12m_change_pct / 100`, clamped to 0.85-1.10 (half of the trailing 12-month move, assumed to continue for 6 months). Sector map: BTR/PBSA -> Apartment, BTL -> Residential, Office -> Office, Retail -> Retail, Logistics -> Industrial. Label shown in the UI: "MSCI RCA". No file -> UK HPI cache (`engine/cache/ukhpi.json`, residential only) -> flat 1.0.

## Optional cross-check query

> Using get_rca_transactions, list UK office, retail and industrial sales since 2026-01-01 (max 20 rows each) and tell me the median price per sq ft and median cap rate per sector. Keep raw rows in `msci_private/` only; give me derived medians only.
