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
