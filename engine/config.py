from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

CORTILE_DB = ROOT / "data" / "cortile" / "cortile-hackathon.sqlite"
LISTINGS_DIR = ROOT / "data" / "listings" / "Listings Data" / "v2"
LISTINGS = LISTINGS_DIR / "listings.parquet"
AUCTIONS = LISTINGS_DIR / "auction-results.parquet"
LEGAL = ROOT / "data" / "legal" / "Official and public leases"
OUT = ROOT / "engine" / "out"
WEB_DATA = ROOT / "web" / "public" / "data"

AS_OF = "2026-11-12"
BACKTEST_CUTOFF = "2026-05-31"
FIRST_MONTH = "2025-01-01"
HORIZON = 6  # forecast months

# Arrears in Cortile are a stock (balance outstanding), not an annual flow. ICR uses annual NOI, so we
# convert balance -> annual drag as ARREARS_WRITEOFF_PCT * balance. ILLUSTRATIVE: expected non-recovery
# / write-off share of the outstanding leaseholder arrears balance each year. We do not use a 12-month
# change in balance because Cortile has no arrears history — only the current snapshot.
ARREARS_WRITEOFF_PCT = 0.25

# Residential occupancy churn (two-state Markov per unit). Cortile has no occupancy history, so the
# monthly move-out rate is ILLUSTRATIVE (~25% annual PRS turnover). Let-up is set so the chain's
# steady state matches the observed occupancy when that snapshot is available.
OCC_MOVE_OUT_MONTHLY = 0.25 / 12.0
