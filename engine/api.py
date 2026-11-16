"""FastAPI: POST /run, GET /stress, POST /corrections.  Run: uvicorn engine.api:app --port 8000"""
import hmac
import json
import os
import subprocess
import sys
import time
from contextlib import contextmanager
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
LATEST = ROOT / "engine" / "out" / "latest"
LOCK = ROOT / "engine" / "out" / ".pipeline.lock"


def require_token(x_canary_token: str | None = Header(default=None)):
    expected = os.getenv("CANARY_API_TOKEN")
    if not expected:
        raise HTTPException(503, "CANARY_API_TOKEN is not set on the engine; write endpoints are disabled")
    if not x_canary_token or not hmac.compare_digest(x_canary_token, expected):
        raise HTTPException(401, "missing or wrong X-Canary-Token header")


@contextmanager
def pipeline_lock():
    """Cross-process lock: O_EXCL create fails if another run holds it. Stale locks (>20 min) are taken over."""
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    try:
        if LOCK.exists() and time.time() - LOCK.stat().st_mtime > 1200:
            LOCK.unlink()
        fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        raise HTTPException(409, "a pipeline run is already in progress")
    try:
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)
        yield
    finally:
        LOCK.unlink(missing_ok=True)

app = FastAPI(title="Canary engine API")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
                   allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/run", dependencies=[Depends(require_token)])
def run(backtest: bool = False):
    """Runs the pipeline to completion (blocking, a few minutes at most) and returns the live run id."""
    cmd = [sys.executable, "-m", "engine.pipeline"] + (["--backtest"] if backtest else [])
    with pipeline_lock():
        try:
            p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=900)
        except subprocess.TimeoutExpired:
            raise HTTPException(504, "pipeline timed out")
    if p.returncode != 0:
        raise HTTPException(500, {"error": "pipeline failed", "stderr": p.stderr[-800:]})
    try:
        runs = json.loads((LATEST / "runs.json").read_text(encoding="utf-8"))
        rid = next((r["id"] for r in runs if r.get("mode") == ("backtest" if backtest else "live")), runs[0]["id"])
    except Exception:
        raise HTTPException(500, "pipeline finished but runs.json is unreadable")
    return {"run_id": rid, "log_tail": p.stdout[-600:]}


@app.get("/stress")
def stress(rate_bps: float = 0, value_pct: float = 0):
    """Re-run the forecast on the latest cached inputs with rate +rate_bps and value +value_pct (percent)."""
    try:
        from engine import forecast
        fn = forecast.stress
    except (ImportError, AttributeError):
        raise HTTPException(501, "engine.forecast.stress not available")
    p = LATEST / "inputs.json"
    if not p.exists():
        raise HTTPException(404, "no cached inputs: run the pipeline first")
    inputs = json.loads(p.read_text(encoding="utf-8"))
    out = []
    for inp in inputs:
        f = fn(inp, rate_bps=rate_bps, value_pct=value_pct)
        out.append({"loan_id": inp["loan_id"], **f})
    return {"rate_bps": rate_bps, "value_pct": value_pct, "forecasts": out,
            "counts": {s: sum(1 for f in out if f["status"] == s) for s in ("red", "amber", "green")}}


class Correction(BaseModel):
    loan_id: str
    signal_kind: str
    note: str = ""
    author: str = "analyst"


@app.post("/corrections", dependencies=[Depends(require_token)])
def corrections(c: Correction):
    res, ok = {}, 0
    try:
        from engine import memory
        memory.remember(c.model_dump())
        res["cognee"], ok = "stored", ok + 1
    except Exception as e:
        res["cognee"] = f"failed: {type(e).__name__}: {str(e)[:120]}"
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    try:
        if not (url and key):
            raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing")
        r = httpx.post(f"{url.rstrip('/')}/rest/v1/corrections", timeout=20,
                       headers={"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "return=minimal"}, json=c.model_dump())
        r.raise_for_status()
        res["supabase"], ok = "stored", ok + 1
    except Exception as e:
        res["supabase"] = f"failed: {type(e).__name__}: {str(e)[:120]}"
    if not ok:
        raise HTTPException(502, res)
    return res


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("engine.api:app", host="127.0.0.1", port=8000, reload=False)
