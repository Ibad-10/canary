"""python -m engine.pipeline [--backtest] [--no-llm]

Runs every step, logs each to steps (status done / fallback / failed / waiting). Integration modules are
imported lazily so a missing or failing service degrades to 'fallback' and the run always completes.
"""
import argparse
import importlib
import itertools
import json
import shutil
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

from engine import backtest, forecast as F, loans as L, signals as S, values as V
from engine.config import AS_OF, BACKTEST_CUTOFF, OUT, ROOT, WEB_DATA

warnings.filterwarnings("ignore", category=FutureWarning)

COLUMNS = {
    "runs": ["id", "created_at", "mode", "as_of", "cutoff", "llm", "score"],
    "loans": ["id", "name", "borrower", "sector", "owner", "amount_gbp", "rate_pct", "value_gbp", "covenants",
              "development_ids", "building_ids", "contract_file", "synthetic_note"],
    "signals": ["id", "run_id", "loan_id", "building_id", "month", "kind", "value", "unit", "detail", "source"],
    "forecasts": ["run_id", "loan_id", "status", "breach_metric", "breach_month", "breach_kind", "metrics", "drivers"],
    "evidence": ["id", "run_id", "loan_id", "kind", "title", "value", "unit", "effect", "label", "source"],
    "steps": ["id", "run_id", "seq", "step", "owner", "status", "detail", "started_at", "finished_at"],
    "drafts": ["id", "run_id", "loan_id", "kind", "title", "body_md", "model", "status", "decided_by", "decided_at", "note"],
}
ANALYST = "Ibad Zuberi"


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def integration(module, fn, *args):
    """Call engine.<module>.<fn>(*args). Returns (result, error-or-None)."""
    try:
        return getattr(importlib.import_module(f"engine.{module}"), fn)(*args), None
    except Exception as e:  # any failure -> fallback, never crash the run
        return None, f"{type(e).__name__}: {e}"[:300]


def make_inputs(loan, series, hooks=None):
    hooks = hooks or {}
    i = loan["_"]
    lid = loan["id"]
    m = hooks.get("market", {}).get(lid) or {}
    return {"loan_id": lid, "sector": loan["sector"], "amount": loan["amount_gbp"], "test_rate_pct": i["test_rate_pct"],
            "covenants": loan["covenants"], "gross_rent": i["gross_rent"], "underwritten_occ": F.UNDERWRITTEN_OCC[loan["sector"]],
            "base_value": loan["value_gbp"], "market_factor": m.get("factor", 1.0), "market_label": m.get("label"),
            "series": series, "news": hooks.get("news", {}).get(lid, []),
            "suppress": sorted({c["signal_kind"] for c in hooks.get("corrections", []) if c.get("loan_id") == lid} & F.SUPPRESSIBLE),
            "evidence_ids": hooks.get("evidence_ids", {}).get(lid, {})}


def compute(loans, as_of, hooks=None, model=None):
    """Signals, forecast inputs and forecasts for every loan using only data dated <= as_of."""
    model = model or F.forecast
    counter = itertools.count(1)
    sigs, inputs, fcs = [], [], []
    for loan in loans:
        rows, series = S.build(loan, as_of, lambda: next(counter))
        inp = make_inputs(loan, series, hooks)
        sigs += rows
        inputs.append(inp)
        fcs.append(model(inp))
    return sigs, inputs, fcs


def template_drafts(loans, fcs):
    by = {l["id"]: l for l in loans}
    lines = []
    for f in sorted(fcs, key=lambda f: ["red", "amber", "green"].index(f["status"])):
        l, m = by[f["loan_id"]], f["metrics"]
        lines.append(f"- **{l['name']}** ({l['sector']}): {f['status'].upper()}; ICR {m['icr']['now']:.2f}x now, {m['icr']['m6']['mid']:.2f}x in 6 months "
                     f"(limit {m['icr']['limit']:.2f}x); LTV {m['ltv']['now']:.1f}% (limit {m['ltv']['limit']:.0f}%)"
                     + (f"; first breach {f['breach_metric'].upper()} {f['breach_month'][:7]}" if f["breach_metric"] else ""))
    red = [f for f in fcs if f["status"] == "red"]
    amber = [f for f in fcs if f["status"] == "amber"]
    out = [{"loan_id": None, "kind": "memo", "title": f"Watchlist memo: {len(red)} red, {len(amber)} amber of {len(fcs)} loans",
            "body_md": "Canary watchlist (template draft, no LLM). Figures from the forecast; sources in the evidence table.\n\n" + "\n".join(lines),
            "model": "template"}]
    for f in red:
        l = by[f["loan_id"]]
        top = "\n".join(f"- {d['label']} ({d['effect_text']}; signals {', '.join(map(str, d['signal_ids'][:3])) or 'n/a'})" for d in f["drivers"][:3])
        out.append({"loan_id": l["id"], "kind": "chase", "title": f"Information request: {l['borrower']}",
                    "body_md": f"Dear {l['borrower']},\n\nOur monitoring of {l['name']} indicates a possible {f['breach_metric'].upper()} covenant issue "
                               f"from {f['breach_month'][:7]}. Please send the latest rent roll, arrears and service-charge accounts, and an update on:\n\n{top}\n\n"
                               f"Regards,\n{l['owner']}",
                    "model": "template"})
    return out


def write(run_id, tables):
    run_dir = OUT / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    for name, rows in tables.items():
        cols = COLUMNS.get(name)
        data = [{c: r.get(c) for c in cols} for r in rows] if cols else rows
        (run_dir / f"{name}.json").write_text(json.dumps(data, indent=1, default=_json), encoding="utf-8")
    for dest in (OUT / "latest", WEB_DATA):
        dest.mkdir(parents=True, exist_ok=True)
        for name in COLUMNS:
            shutil.copy(run_dir / f"{name}.json", dest / f"{name}.json")
    shutil.copy(run_dir / "inputs.json", OUT / "latest" / "inputs.json")
    return run_dir


def _json(o):
    if hasattr(o, "item"):
        return o.item()
    if isinstance(o, (set, tuple)):
        return list(o)
    return str(o)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--backtest", action="store_true", help="also write a mode='backtest' runs row")
    ap.add_argument("--no-llm", action="store_true", help="skip news and memo LLM calls (template memo)")
    args = ap.parse_args(argv)

    t0 = datetime.now(timezone.utc)
    run_id = f"run-{t0:%Y%m%d-%H%M}"
    steps = []

    def step(name, owner, status, detail, started):
        steps.append({"id": len(steps) + 1, "run_id": run_id, "seq": len(steps) + 1, "step": name, "owner": owner,
                      "status": status, "detail": detail, "started_at": started, "finished_at": now_iso()})
        print(f"[{status:8}] {name}: {detail}")

    s = now_iso()
    loans = L.build()
    step("Load loans", "Canary engine", "done",
         f"{len(loans)} loans on real Cortile developments ({', '.join(sorted({l['sector'] for l in loans}))}); terms synthetic", s)

    s = now_iso()
    contracts = sorted((ROOT / "engine" / "contracts").glob("*.pdf"))
    got, errs = 0, []
    for path in contracts:
        match = [l for l in loans if l["id"].lower() in path.stem.lower()] or \
                [l for l in loans if l["sector"].lower() in path.stem.lower()]
        if not match:
            continue
        terms, err = integration("extract", "covenants", str(path))
        if terms:
            for k in F.LIMITS.values():
                for key in k[:2]:
                    if terms.get(key) is not None:
                        v = float(terms[key])
                        match[0]["covenants"][key] = v * 100 if not key.startswith("icr") and v <= 1.5 else v
            match[0]["contract_file"] = str(path.relative_to(ROOT)).replace("\\", "/")
            got += 1
        elif err:
            errs.append(err)
    step("Extract covenants", "V7 Go", "done" if got else "fallback",
         f"covenants read from {got} contract PDF(s)" if got else f"hand-typed covenant terms used ({len(contracts)} PDFs found{'; ' + errs[0] if errs else ''})", s)

    s = now_iso()
    sigs, _, _ = compute(loans, AS_OF)
    kinds = sorted({r["kind"] for r in sigs})
    step("Pull Cortile signals", "Canary engine", "done", f"{len(sigs)} monthly signal rows ({len(kinds)} kinds) from the Cortile SQLite, Jan 2025 - {AS_OF[:7]}", s)

    s = now_iso()
    evidence, ev_ids = [], {}

    def add_ev(row):
        row = dict(row, id=len(evidence) + 1, run_id=run_id)
        evidence.append(row)
        return row["id"]

    n_comps = 0
    for loan in loans:
        inc = S.tables()["units"]
        _, evs = V.loan_values({**loan}, inc[inc.id.isin(loan["_"]["unit_ids"])])
        ids = ev_ids.setdefault(loan["id"], {"rent": [], "value": [], "market": []})
        for e in evs:
            ids["rent" if e["kind"] == "rent_comp" else "value"].append(add_ev(e))
            n_comps += e["source"].get("count", 0)
    step("Value comps", "Canary engine", "done", f"{len(evidence)} comp summaries from listings v2 + auction results ({n_comps} comps cited)", s)

    s = now_iso()
    market, errs = {}, []
    for loan in loans:
        res, err = integration("market", "trend", loan["sector"], loan["_"]["region"])
        if res and res.get("factor"):
            market[loan["id"]] = res
            ev_ids[loan["id"]]["market"].append(add_ev({
                "loan_id": loan["id"], "kind": "msci" if "MSCI" in str(res.get("label")) else "hpi",
                "title": f"Market value trend: {res.get('label')}", "value": float(res["factor"]), "unit": "factor",
                "effect": {"metric": "value", "delta_pct": round(100 * (float(res["factor"]) - 1), 2)},
                "label": res.get("label"), "source": res.get("source")}))
        elif err:
            errs.append(err)
    labels = sorted({str(m.get("label")) for m in market.values()})
    step("Market trend", "Canary engine", "done" if market else "fallback",
         f"value factors for {len(market)} loans ({'; '.join(labels)[:200]})" if market else f"flat market assumed{'; ' + errs[0] if errs else ''}", s)

    s = now_iso()
    news = {}
    if args.no_llm:
        step("News", "Grok", "fallback", "skipped (--no-llm)", s)
    else:
        rows, err = integration("news", "fetch_news", [L.public(l) for l in loans])
        for r in rows or []:
            rid = add_ev({**{c: r.get(c) for c in COLUMNS["evidence"]}, "kind": r.get("kind") or "news"})
            if r.get("loan_id"):
                news.setdefault(r["loan_id"], []).append({**r, "id": rid})
        material = sum(1 for rs in news.values() for r in rs if (r.get("effect") or {}).get("metric"))
        step("News", "Grok", "done" if rows is not None else "fallback",
             f"{len(rows or [])} news items, {material} move a forecast input" if rows is not None else f"no news ({err})", s)

    s = now_iso()
    corrections, err = integration("memory", "recall", [l["id"] for l in loans])
    corrections = corrections or []
    step("Recall corrections", "cognee", "done" if err is None else "fallback",
         f"{len(corrections)} analyst correction(s) applied" if err is None else f"no memory ({err})", s)

    s = now_iso()
    hooks = {"market": market, "news": news, "corrections": corrections, "evidence_ids": ev_ids}
    sigs, inputs, fcs = compute(loans, AS_OF, hooks)
    for r in sigs:
        r["run_id"] = run_id
    for f in fcs:
        f["run_id"] = run_id
    tally = {k: sum(f["status"] == k for f in fcs) for k in ("red", "amber", "green")}
    step("Forecast covenants", "Canary engine", "done", f"{tally['red']} red, {tally['amber']} amber, {tally['green']} green (ICR, LTV, occupancy; monthly to 6 months: "
         f"{sum(len(p['events']) for f in fcs for m in f['metrics'].values() for p in m.get('forecast', []))} dated event effects, AutoETS drift, {F.N_DRAWS}-draw Monte Carlo)", s)

    s = now_iso()
    try:
        score = backtest.run(loans, lambda ls, a: compute(ls, a, {**hooks, "news": {}}))
        pers = score.get("persistence") or {}
        w = score.get("recall_wilson_95") or {}
        wtxt = f", recall {score['recall']:.2f} [{w['low']:.2f},{w['high']:.2f}]" if score.get("recall") is not None and w.get("low") is not None else ""
        step("Backtest score", "Canary engine", "done",
             f"cut at {BACKTEST_CUTOFF}: model caught {score['caught']}, missed {score['missed']}, FA {score['false_alarms']}"
             f"{wtxt}; persist caught {pers.get('caught')}, missed {pers.get('missed')}, FA {pers.get('false_alarms')}; "
             f"band coverage {score.get('band_coverage')}", s)
    except Exception as e:
        score = None
        step("Backtest score", "Canary engine", "failed", f"{type(e).__name__}: {e}"[:300], s)

    s = now_iso()
    run = {"id": run_id, "created_at": t0.isoformat(timespec="seconds"), "mode": "live", "as_of": AS_OF, "cutoff": None,
           "llm": "none" if args.no_llm else "grok", "score": score}
    pub = [L.public(l) for l in loans]
    drafts, err = (None, "skipped (--no-llm)") if args.no_llm else integration("memo", "draft", run, pub, fcs, evidence)
    status = "done" if drafts else "fallback"
    if not drafts:
        drafts = template_drafts(loans, fcs)
        run["llm"] = "none"
    drafts = [{"status": "draft", "decided_by": None, "decided_at": None, "note": None, **d, "id": i + 1, "run_id": run_id} for i, d in enumerate(drafts)]
    step("Draft memo", "Grok" if status == "done" else "Canary engine", status,
         f"{len(drafts)} drafts (memo + chase letters)" + ("" if status == "done" else f"; template used ({err})"), s)

    step("Await analyst sign-off", ANALYST, "waiting", "Drafts are never sent; approve or dismiss in the watchlist", now_iso())
    steps[-1]["finished_at"] = None

    runs = [run]
    if args.backtest and score:
        runs.append({**run, "id": run_id + "-bt", "mode": "backtest", "cutoff": BACKTEST_CUTOFF})
    run_dir = write(run_id, {"runs": runs, "loans": pub, "signals": sigs, "forecasts": fcs, "evidence": evidence,
                             "steps": steps, "drafts": drafts, "inputs": inputs})
    print(f"wrote {run_dir}")

    _, err = integration("sync", "push", str(run_dir))
    print(f"sync: {'done' if err is None else 'fallback - ' + err}")
    return run_id


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
