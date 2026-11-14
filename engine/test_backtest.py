"""Point-in-time backtest, persistence baseline, Wilson interval, arrears flow."""
import itertools

from engine import backtest as B
from engine import forecast as F
from engine import loans as L
from engine import signals as S
from engine.config import ARREARS_WRITEOFF_PCT, AS_OF, BACKTEST_CUTOFF
from engine.pipeline import make_inputs


def test_wilson_interval():
    lo, hi = B.wilson_interval(4, 5)
    assert 0 <= lo < 0.8 < hi <= 1
    assert B.wilson_interval(0, 0) == (None, None)
    lo0, hi0 = B.wilson_interval(0, 10)
    assert lo0 == 0.0 and hi0 < 0.5


def test_cutoff_excludes_snapshot_signals():
    """No post-cutoff / snapshot-only kinds at the May cut; November may include them."""
    loans = L.build()
    loan = loans[0]
    counter = itertools.count(1)
    rows_cut, series_cut = S.build(loan, BACKTEST_CUTOFF, lambda: next(counter))
    counter = itertools.count(1)
    rows_now, series_now = S.build(loan, AS_OF, lambda: next(counter))

    assert series_cut["occupancy"] is None
    assert series_cut["arrears"] == 0.0
    assert series_cut["ews"] == 0
    assert set(series_cut["snapshot_excluded"]) >= {"vacancy", "arrears", "ews_remediation"}

    kinds_cut = {r["kind"] for r in rows_cut}
    assert not (kinds_cut & {"vacancy", "arrears", "ews_remediation", "higher_risk", "compliance_missing"})

    # Dated ticket months must be <= cutoff
    for r in rows_cut:
        if r["kind"] in ("emergency_tickets", "reopened_tickets"):
            assert r["month"] <= BACKTEST_CUTOFF[:7] + "-01" or r["month"][:7] <= BACKTEST_CUTOFF[:7]

    # Ticket days used in series history are cut
    assert series_now["occupancy"] is not None
    assert "vacancy" not in (series_now.get("snapshot_excluded") or [])


def test_no_post_cutoff_ticket_dates_in_cutoff_inputs():
    loans = L.build()
    for loan in loans:
        rows, _ = S.build(loan, BACKTEST_CUTOFF, lambda c=itertools.count(1): next(c))
        for r in rows:
            # Signal month is month-start; must not be after cutoff month
            assert r["month"][:7] <= BACKTEST_CUTOFF[:7], (loan["id"], r["kind"], r["month"])
            if r["kind"] in ("emergency_tickets", "reopened_tickets", "compliance_overdue", "sc_overspend"):
                assert r["month"] <= BACKTEST_CUTOFF or r["month"][:10] <= BACKTEST_CUTOFF


def test_arrears_flow_conversion_at_as_of():
    loans = L.build()
    for loan in loans:
        _, series = S.build(loan, AS_OF, lambda c=itertools.count(1): next(c))
        bal = series.get("arrears_balance", 0.0)
        assert abs(series["arrears"] - ARREARS_WRITEOFF_PCT * bal) < 1e-6
        assert series["arrears"] <= bal + 1e-9


def test_persistence_baseline_and_score_fields():
    loans = L.build()[:3]

    def compute(ls, as_of):
        sigs, inputs, fcs = [], [], []
        counter = itertools.count(1)
        for loan in ls:
            rows, series = S.build(loan, as_of, lambda: next(counter))
            inp = make_inputs(loan, series, {})
            sigs += rows
            inputs.append(inp)
            fcs.append(F.forecast(inp))
        return sigs, inputs, fcs

    score = B.run(loans, compute)
    assert score["n_loans"] == 3
    assert "model" in score and "persistence" in score
    assert score["model"]["n_loans"] == 3
    assert set(score["model"]) >= {"caught", "missed", "false_alarms", "exact_colour", "recall", "recall_wilson_95", "n_events"}
    assert score["caught"] == score["model"]["caught"]
    assert score["actual_definition"] == "observed_covenant_november_inputs_no_forecast"
    assert "band_coverage" in score
    for row in score["per_loan"]:
        assert "persistence" in row and "persistence_result" in row
        assert row["result"] in ("caught", "missed", "false_alarm", "clear")


def test_observed_actual_independent_of_forecast_path():
    loans = L.build()
    loan = loans[0]
    _, series = S.build(loan, AS_OF, lambda c=itertools.count(1): next(c))
    inp = make_inputs(loan, series, {})
    obs = F.observed_covenant(inp)
    fc = F.forecast(inp)
    # Same 'now' maths, but observed_covenant never builds a forecast path
    # forecast row rounds 'now' to 3 d.p.; observed_covenant is the unrounded same formula
    assert abs(obs["icr"] - fc["metrics"]["icr"]["now"]) < 5e-3
    assert abs(obs["ltv"] - fc["metrics"]["ltv"]["now"]) < 5e-3
    assert "forecast" not in obs


def test_fixed_book_independent_of_outcomes():
    a = L.pick()[0]
    b = L.pick()[0]
    assert a == b == L.FIXED_BOOK
    assert len(L.FIXED_BOOK) == 12


def test_ongoing_btl_rate_is_contractual():
    for loan in L.build():
        if loan["sector"] == "BTL":
            assert loan["_"]["test_rate_pct"] == loan["rate_pct"]
            assert loan["_"]["origination_rate_pct"] == max(loan["rate_pct"], F.BTL_STRESS_RATE)


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok:", name)
