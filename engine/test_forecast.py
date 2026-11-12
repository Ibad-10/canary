"""python -m engine.test_forecast  - LOAN_RULES.md section 5.1 worked example + a stress check."""
from engine import forecast as F


def close(a, b, tol=0.005):
    assert abs(a - b) <= tol, (a, b)


def test_worked_example():
    interest = F.interest(12_000_000, 6.0)
    assert interest == 720_000
    close(F.ltv(12_000_000, 20_000_000), 60.0)
    noi = F.noi(1_600_000, 1.0, 480_000)
    assert noi == 1_120_000
    close(F.icr(noi, interest), 1.56)
    assert F.check(F.icr(noi, interest), 1.30, None, True) == "green"
    bad = F.icr(F.noi(1_350_000, 1.0, 450_000), interest)
    close(bad, 1.25)
    assert F.check(bad, 1.30, None, True) == "red"
    v = F.ltv(12_000_000, 17_000_000)
    close(v, 70.6, 0.05)
    assert F.check(v, 65.0, 60.0, False) == "red"
    assert F.check(62.0, 65.0, 60.0, False) == "amber"


def _inputs():
    n = 12
    return {"loan_id": "T", "sector": "BTR", "amount": 12_000_000, "test_rate_pct": 6.0,
            "covenants": {"icr_min": 1.30, "icr_cash_trap": 1.40, "ltv_max": 65.0, "ltv_cash_trap": 60.0},
            "gross_rent": 1_600_000 / 0.75, "underwritten_occ": 1.0, "base_value": 20_000_000,
            "series": {"months": [f"2026-{m:02d}-01" for m in range(1, n + 1)], "em_cost": [0.0] * n, "ro_cost": [0.0] * n,
                       "overspend": [0.0] * n, "overdue": [0] * n, "haircut_items": [0] * n, "arrears": 0.0, "occupancy": 1.0,
                       "ews": 0, "income_units": 100, "vacant_units": 0, "sig": {}}}


def test_forecast_and_stress():
    inp = _inputs()
    f = F.forecast(inp)
    close(f["metrics"]["icr"]["now"], 1.6 / 0.72)  # gross 2.13m less 25% opex = NOI 1.6m, over 720k interest
    close(f["metrics"]["ltv"]["now"], 60.0)
    assert f["status"] == "green" and f["breach_metric"] is None
    s = F.stress(inp, rate_bps=200, value_pct=-15)
    close(s["metrics"]["icr"]["now"], 1_600_000 / (12_000_000 * 0.08))
    close(s["metrics"]["ltv"]["now"], 100 * 12 / 17)
    assert s["status"] == "red" and s["breach_metric"] == "ltv"


if __name__ == "__main__":
    test_worked_example()
    test_forecast_and_stress()
    print("ok: worked example (ICR 1.56x, 1.25x breach vs 1.30x, LTV 70.6%) and stress check")
