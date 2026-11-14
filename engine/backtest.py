"""Backtest: forecast with data cut at 2026-05-31, score against covenant status on full data at 2026-11-12.

python -m engine.backtest  scores the hybrid model and the old straight-line model side by side (no news, as in the run).
"""
from engine.config import AS_OF, BACKTEST_CUTOFF
from engine.forecast import LIMITS, check

ORDER = ["green", "amber", "red"]


def actual_status(fc, covenants):
    """Covenant status today from the 'now' values only (no projection)."""
    worst, metric = "green", None
    for k, (lk, ck, hib) in LIMITS.items():
        m = fc["metrics"].get(k)
        if m is None:
            continue
        st = check(m["now"], covenants[lk], covenants.get(ck), hib)
        if ORDER.index(st) > ORDER.index(worst):
            worst, metric = st, k
    return worst, metric


def run(loans, compute, cutoff=BACKTEST_CUTOFF, as_of=AS_OF):
    """compute(loans, as_of) -> (signals, inputs, forecasts). Returns the score dict."""
    _, _, past = compute(loans, cutoff)
    _, _, now = compute(loans, as_of)
    cov = {l["id"]: l["covenants"] for l in loans}
    now_by = {f["loan_id"]: f for f in now}
    per, caught, missed, false_alarms, exact = [], 0, 0, 0, 0
    for p in past:
        act, act_metric = actual_status(now_by[p["loan_id"]], cov[p["loan_id"]])
        pred_bad, act_bad = p["status"] != "green", act != "green"
        result = "caught" if pred_bad and act_bad else "missed" if act_bad else "false_alarm" if pred_bad else "clear"
        caught += result == "caught"
        missed += result == "missed"
        false_alarms += result == "false_alarm"
        exact += p["status"] == act
        per.append({"loan_id": p["loan_id"], "predicted": p["status"], "predicted_metric": p["breach_metric"],
                    "predicted_month": p["breach_month"], "actual": act, "actual_metric": act_metric, "result": result,
                    "icr_predicted_m6": p["metrics"].get("icr", {}).get("m6", {}).get("mid"),
                    "icr_actual": now_by[p["loan_id"]]["metrics"].get("icr", {}).get("now"),
                    "ltv_predicted_m6": p["metrics"].get("ltv", {}).get("m6", {}).get("mid"),
                    "ltv_actual": now_by[p["loan_id"]]["metrics"].get("ltv", {}).get("now")})
    return {"cutoff": cutoff, "as_of": as_of, "caught": caught, "missed": missed, "false_alarms": false_alarms,
            "exact_status": exact, "loans": len(per), "per_loan": per,
            "note": "Tickets, compliance due dates and final service-charge years are cut at the cutoff; occupancy, arrears and EWS status have no history in Cortile and are read from the snapshot."}


def compare():
    from engine import forecast as F, loans as L, market
    from engine.pipeline import compute
    loans = L.build()
    hooks = {"market": {l["id"]: market.trend(l["sector"], l["_"]["region"]) for l in loans}}
    models = (("linear", F.forecast_linear), ("hybrid", F.forecast_hybrid), ("hybrid+challenger", F.forecast))
    scores = {name: run(loans, lambda ls, a, m=m: compute(ls, a, hooks, m)) for name, m in models}
    print(f"cut {BACKTEST_CUTOFF}, scored vs {AS_OF}")
    for name, sc in scores.items():
        mae = {k: sum(abs(p[f"{k}_predicted_m6"] - p[f"{k}_actual"]) for p in sc["per_loan"]) / sc["loans"] for k in ("icr", "ltv")}
        print(f"{name:18} caught {sc['caught']}, missed {sc['missed']}, false alarms {sc['false_alarms']}, exact colour {sc['exact_status']}/{sc['loans']}; "
              f"6-month error vs actual: ICR {mae['icr']:.3f}x, LTV {mae['ltv']:.2f}pp")
    print(f"{'loan':8} {'actual':7} {'linear':7} {'hybrid':7} {'+chall':7} icr_m6 lin/hyb/actual   ltv_m6 lin/hyb/actual")
    for a, b, c in zip(*(scores[n]["per_loan"] for n, _ in models)):
        print(f"{a['loan_id']:8} {a['actual']:7} {a['predicted']:7} {b['predicted']:7} {c['predicted']:7} "
              f"{a['icr_predicted_m6']:.3f}/{b['icr_predicted_m6']:.3f}/{a['icr_actual']:.3f}   {a['ltv_predicted_m6']:.2f}/{b['ltv_predicted_m6']:.2f}/{a['ltv_actual']:.2f}")
    return scores


if __name__ == "__main__":
    compare()
