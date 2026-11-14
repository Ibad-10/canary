"""Point-in-time backtest: forecast with data cut at BACKTEST_CUTOFF, score against observed covenant
status at AS_OF (model-derived ground truth from November inputs only — no forecast path).

python -m engine.backtest  scores the hybrid model, the straight-line challenger, and a persistence
baseline side by side (no news, as in the run). Does not write board data.
"""
import math

import pandas as pd

from engine.config import AS_OF, BACKTEST_CUTOFF
from engine.forecast import observed_covenant

ORDER = ["green", "amber", "red"]


def wilson_interval(successes, n, z=1.96):
    """Wilson score 95% interval for a binomial proportion. Returns (low, high) or (None, None) if n=0."""
    if n <= 0:
        return None, None
    p = successes / n
    z2 = z * z
    denom = 1 + z2 / n
    centre = (p + z2 / (2 * n)) / denom
    half = (z / denom) * math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))
    return max(0.0, centre - half), min(1.0, centre + half)


def _score_side(preds, actuals, label):
    """preds/actuals: list of status strings aligned by loan. Returns honest scoring fields."""
    n = len(preds)
    caught = missed = false_alarms = exact = clear = 0
    per = []
    for pred, act in zip(preds, actuals):
        pred_bad, act_bad = pred != "green", act != "green"
        result = "caught" if pred_bad and act_bad else "missed" if act_bad else "false_alarm" if pred_bad else "clear"
        caught += result == "caught"
        missed += result == "missed"
        false_alarms += result == "false_alarm"
        clear += result == "clear"
        exact += pred == act
        per.append(result)
    events = caught + missed  # loans that actually went amber/red
    recall = caught / events if events else None
    lo, hi = wilson_interval(caught, events) if events else (None, None)
    return {
        "label": label,
        "n_loans": n,
        "n_events": events,
        "caught": caught,
        "missed": missed,
        "false_alarms": false_alarms,
        "clear": clear,
        "exact_colour": exact,
        "exact_colour_accuracy": exact / n if n else None,
        "recall": recall,
        "recall_wilson_95": {"low": lo, "high": hi},
        "per_loan_result": per,
    }


def _horizon_index(cutoff, as_of):
    """1-based forecast month index for as_of relative to cutoff month-start (clamped to HORIZON)."""
    from engine.config import HORIZON
    a = pd.Timestamp(cutoff[:7] + "-01")
    b = pd.Timestamp(as_of[:7] + "-01")
    h = (b.year - a.year) * 12 + (b.month - a.month)
    return max(1, min(HORIZON, h))


def _band_coverage(past_fcs, actual_metrics, cutoff, as_of):
    """Share of (loan, metric) actuals that fall inside the cutoff forecast's p10–p90 at the as_of horizon."""
    h = _horizon_index(cutoff, as_of)
    inside = total = 0
    per = []
    for fc in past_fcs:
        act = actual_metrics[fc["loan_id"]]
        row = {"loan_id": fc["loan_id"]}
        for k in ("icr", "ltv", "occupancy"):
            m = fc["metrics"].get(k)
            if m is None or act.get(k) is None:
                continue
            band = m["forecast"][h - 1]
            ok = band["lo"] <= act[k] <= band["hi"]
            inside += int(ok)
            total += 1
            row[k] = {"actual": act[k], "lo": band["lo"], "hi": band["hi"], "inside": ok, "h": h}
        per.append(row)
    return {
        "horizon_month": h,
        "n_checks": total,
        "n_inside": inside,
        "band_coverage": inside / total if total else None,
        "per_loan": per,
    }


def run(loans, compute, cutoff=BACKTEST_CUTOFF, as_of=AS_OF):
    """compute(loans, as_of) -> (signals, inputs, forecasts).

    Actual = observed_covenant on as_of inputs (no forecasting). Persistence = observed colour at cutoff.
    Score dict keeps legacy top-level caught/missed/... for the model, and adds model/persistence blocks.
    """
    _, past_inputs, past = compute(loans, cutoff)
    _, now_inputs, _ = compute(loans, as_of)
    past_by = {f["loan_id"]: f for f in past}
    past_inp = {i["loan_id"]: i for i in past_inputs}
    now_inp = {i["loan_id"]: i for i in now_inputs}

    actuals, persist, actual_metrics = {}, {}, {}
    for lid, inp in now_inp.items():
        obs = observed_covenant(inp)
        actuals[lid] = obs["status"]
        actual_metrics[lid] = {"icr": obs["icr"], "ltv": obs["ltv"], "occupancy": obs["occupancy"],
                               "metric": obs["metric"], "breach_kind": obs["breach_kind"]}
    for lid, inp in past_inp.items():
        persist[lid] = observed_covenant(inp)["status"]

    loan_ids = [f["loan_id"] for f in past]
    model_preds = [past_by[lid]["status"] for lid in loan_ids]
    act_list = [actuals[lid] for lid in loan_ids]
    pers_list = [persist[lid] for lid in loan_ids]

    model_score = _score_side(model_preds, act_list, "model")
    pers_score = _score_side(pers_list, act_list, "persistence")
    bands = _band_coverage(past, actual_metrics, cutoff, as_of)

    per = []
    for lid, mres, pres in zip(loan_ids, model_score["per_loan_result"], pers_score["per_loan_result"]):
        p, act = past_by[lid], actual_metrics[lid]
        per.append({
            "loan_id": lid,
            "predicted": p["status"],
            "predicted_metric": p.get("breach_metric"),
            "predicted_month": p.get("breach_month"),
            "predicted_breach_kind": p.get("breach_kind"),
            "persistence": persist[lid],
            "actual": actuals[lid],
            "actual_metric": act["metric"],
            "actual_breach_kind": act["breach_kind"],
            "result": mres,
            "persistence_result": pres,
            "icr_predicted_m6": p["metrics"].get("icr", {}).get("m6", {}).get("mid"),
            "icr_actual": act["icr"],
            "ltv_predicted_m6": p["metrics"].get("ltv", {}).get("m6", {}).get("mid"),
            "ltv_actual": act["ltv"],
        })

    note = (
        "Point-in-time: tickets, compliance due dates and final service-charge years are cut at the cutoff. "
        "Snapshot-only fields (occupancy, arrears, EWS, higher-risk, compliance no_record) are EXCLUDED at the "
        "cutoff — not filled from the November extract. "
        "Actual = covenant test on observed November inputs only (no forecast path); model-derived ground truth, "
        "not an independent market outturn. "
        "Persistence baseline = colour at cutoff persists. "
        f"Band coverage = share of actual ICR/LTV/occupancy inside the cutoff forecast p10–p90 at horizon "
        f"month {bands['horizon_month']}."
    )

    # Legacy top-level fields = model (UI / runs.score consumers keep working)
    return {
        "cutoff": cutoff,
        "as_of": as_of,
        "caught": model_score["caught"],
        "missed": model_score["missed"],
        "false_alarms": model_score["false_alarms"],
        "exact_status": model_score["exact_colour"],
        "loans": model_score["n_loans"],
        "n_loans": model_score["n_loans"],
        "n_events": model_score["n_events"],
        "exact_colour_accuracy": model_score["exact_colour_accuracy"],
        "recall": model_score["recall"],
        "recall_wilson_95": model_score["recall_wilson_95"],
        "band_coverage": bands["band_coverage"],
        "band_coverage_detail": bands,
        "model": model_score,
        "persistence": pers_score,
        "per_loan": per,
        "actual_definition": "observed_covenant_november_inputs_no_forecast",
        "note": note,
    }


def compare():
    from engine import forecast as F, loans as L, market
    from engine.pipeline import compute
    loans = L.build()
    hooks = {"market": {l["id"]: market.trend(l["sector"], l["_"]["region"]) for l in loans}}
    models = (("linear", F.forecast_linear), ("hybrid", F.forecast_hybrid), ("hybrid+challenger", F.forecast))
    scores = {name: run(loans, lambda ls, a, m=m: compute(ls, a, hooks, m)) for name, m in models}
    print(f"cut {BACKTEST_CUTOFF}, scored vs {AS_OF} (actual = observed covenant, no forecast)")
    print(f"{'model':18} {'n':>3} {'ev':>3}  caught missed FA  exact   recall [Wilson 95%]   vs persist   band cov")
    for name, sc in scores.items():
        m, p = sc["model"], sc["persistence"]
        w = m["recall_wilson_95"]
        wtxt = f"[{w['low']:.2f},{w['high']:.2f}]" if w["low"] is not None else "[n/a]"
        rtxt = f"{m['recall']:.2f}" if m["recall"] is not None else "n/a"
        btxt = f"{sc['band_coverage']:.2f}" if sc["band_coverage"] is not None else "n/a"
        print(f"{name:18} {m['n_loans']:3} {m['n_events']:3}  {m['caught']:4} {m['missed']:4} {m['false_alarms']:4}  "
              f"{m['exact_colour']:2}/{m['n_loans']}  {rtxt:>4} {wtxt:14}  "
              f"persist exact {p['exact_colour']}/{p['n_loans']}  band {btxt}")
        mae = {k: sum(abs((x[f"{k}_predicted_m6"] or 0) - (x[f"{k}_actual"] or 0)) for x in sc["per_loan"]) / max(1, sc["loans"])
               for k in ("icr", "ltv")}
        print(f"{'':18} 6m error vs actual: ICR {mae['icr']:.3f}x, LTV {mae['ltv']:.2f}pp; "
              f"persist caught {p['caught']} missed {p['missed']} FA {p['false_alarms']}")
    print(f"\n{'loan':8} {'actual':7} {'persist':7} {'linear':7} {'hybrid':7} {'+chall':7}")
    for rows in zip(*(scores[n]["per_loan"] for n, _ in models)):
        a = rows[0]
        print(f"{a['loan_id']:8} {a['actual']:7} {a['persistence']:7} "
              f"{rows[0]['predicted']:7} {rows[1]['predicted']:7} {rows[2]['predicted']:7}")
    return scores


if __name__ == "__main__":
    compare()
