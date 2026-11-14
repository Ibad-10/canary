"""python -m engine.test_forecast  - LOAN_RULES.md section 5.1 worked example, stress, dated events, fallbacks, schema."""
import copy

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


def _inputs(n=12):
    return {"loan_id": "T", "sector": "BTR", "amount": 12_000_000, "test_rate_pct": 6.0,
            "covenants": {"icr_min": 1.30, "icr_cash_trap": 1.40, "ltv_max": 65.0, "ltv_cash_trap": 60.0},
            "gross_rent": 1_600_000 / 0.75, "underwritten_occ": 1.0, "base_value": 20_000_000,
            "series": {"months": [f"{2025 + (m - 1) // 12}-{(m - 1) % 12 + 1:02d}-01" for m in range(1, n + 1)],
                       "em_cost": [0.0] * n, "ro_cost": [0.0] * n,
                       "overspend": [0.0] * n, "overdue": [0] * n, "haircut_items": [0] * n, "arrears": 0.0, "occupancy": 1.0,
                       "ews": 0, "income_units": 100, "vacant_units": 0, "sig": {}}}


def _path(f, k):
    return [p["mid"] for p in f["metrics"][k]["forecast"]]


def test_forecast_and_stress():
    inp = _inputs()
    f = F.forecast(inp)
    close(f["metrics"]["icr"]["now"], 1.6 / 0.72)  # gross 2.13m less 25% opex = NOI 1.6m, over 720k interest
    close(f["metrics"]["ltv"]["now"], 60.0)
    assert f["status"] == "green" and f["breach_metric"] is None
    s = F.stress(inp, rate_bps=200, value_pct=-15)
    close(s["metrics"]["icr"]["now"], 1_600_000 / (12_000_000 * 0.08))
    close(s["metrics"]["ltv"]["now"], 100 * 12 / 17)
    close(s["metrics"]["icr"]["m6"]["mid"], 1_600_000 / (12_000_000 * 0.08))
    assert s["status"] == "red" and s["breach_metric"] == "ltv"


def test_lease_expiry_steps_in_its_month():
    inp = _inputs()  # last month 2025-12, so 2026-03-10 is forecast month 3
    inp["series"]["events"] = [{"kind": "lease_expiry", "date": "2026-03-10", "label": "Lease expiry Unit 4 (Acme Ltd)",
                                "rent_share": 0.4, "units": 1, "probability": 1.0, "signal_ids": [7]}]
    f = F.forecast_hybrid(inp)
    icr = _path(f, "icr")
    now = f["metrics"]["icr"]["now"]
    close(icr[0], now)
    close(icr[1], now)
    close(icr[2], now - 0.4 * inp["gross_rent"] / 720_000)  # 40% of rent gone from March, opex unchanged
    close(icr[5], icr[2])  # still void at month 6 (9-month re-let void)
    ev = f["metrics"]["icr"]["forecast"][2]["events"]
    assert [e["kind"] for e in ev] == ["lease_expiry"] and ev[0]["signal_ids"] == [7] and "Mar 2026" in ev[0]["label"]
    assert not f["metrics"]["icr"]["forecast"][1]["events"]
    assert f["status"] == "red" and f["breach_metric"] == "icr" and f["breach_month"] == "2026-03-01"
    assert any(d["kind"] == "lease_expiry" and d["signal_ids"] == [7] for d in f["drivers"])


def test_compliance_due_and_news_step():
    inp = _inputs()
    inp["series"]["events"] = [{"kind": "compliance_due", "date": "2026-02-20", "label": "Fire risk assessment due, Block A",
                                "items": 1, "probability": 1.0, "signal_ids": [3]}]
    inp["news"] = [{"id": 11, "title": "Operator in administration", "effect": {"metric": "rent", "delta_pct": -10.0},
                    "source": {"published": "2026-04-03"}}]
    f = F.forecast_hybrid(inp)
    ltv = _path(f, "ltv")
    close(ltv[0], 60.0)
    close(ltv[1], 100 * 12 / (20 * 0.98))  # overdue after 20 Feb -> 2% haircut from month 2
    icr = _path(f, "icr")
    close(f["metrics"]["icr"]["now"], 1.6 / 0.72)  # news no longer moves 'now'
    close(icr[2], 1.6 / 0.72)
    close(icr[3], 0.9 * 1.6 / 0.72)  # rent -10% from April, opex scales with rent
    assert f["metrics"]["icr"]["forecast"][3]["events"][0]["evidence_ids"] == [11]


def test_service_charge_year_end_and_rolloff():
    inp = _inputs(n=14)  # last month 2026-02
    s = inp["series"]
    s["overspend"] = [50_000.0] * 14
    s["events"] = [{"kind": "service_charge_year_end", "date": "2026-06-30", "label": "Service-charge year end 2026-06-30",
                    "cost_change": -50_000.0, "probability": 1.0, "signal_ids": [9]}]
    f = F.forecast_hybrid(inp)
    icr = _path(f, "icr")
    close(icr[2], f["metrics"]["icr"]["now"])
    close(icr[3], 1_600_000 / 720_000)  # June: overspend leaves the cost base
    assert f["metrics"]["icr"]["forecast"][3]["events"][0]["kind"] == "service_charge_year_end"

    inp = _inputs(n=14)
    s = inp["series"]
    s["em_month"] = [0.0, 0.0, 36_000.0] + [0.0] * 11  # Mar 2025 repair leaves the trailing 12 months in Mar 2026 (month 1)
    s["em_cost"] = [0.0, 0.0] + [36_000.0 * 12 / (i + 1) for i in range(2, 12)] + [36_000.0, 36_000.0]
    s["ro_month"] = [0.0] * 14
    f = F.forecast_hybrid(inp)
    ev = f["metrics"]["icr"]["forecast"][0]["events"]
    assert [e["kind"] for e in ev] == ["repair_rolloff"] and abs(ev[0]["delta"]["amount"] - 0.05) < 1e-6
    assert _path(f, "icr")[0] > f["metrics"]["icr"]["now"]


def test_short_history_fallback():
    mean, sd, how = F._drift([100.0, 300.0, 200.0])
    assert "short history" in how and abs(mean[0] - 200.0) < 1e-9 and len(mean) == F.HORIZON
    mean, sd, how = F._drift([0.0] * 20)
    assert "constant" in how and mean.max() == 0 and sd.max() == 0
    inp = _inputs(n=3)
    inp["series"]["em_month"] = [1000.0, 0.0, 2000.0]
    inp["series"]["ro_month"] = [0.0, 0.0, 0.0]
    f = F.forecast_hybrid(inp)
    assert "short history" in f["metrics"]["icr"]["model"]["drift"]["emergency_tickets"]
    mean, sd, how = F._drift([0, 300, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 1100, 0, 0, 0, 0])
    assert how.startswith(("ETS", "AutoARIMA")) or "statsforecast not installed" in how


def test_schema_and_fallback():
    inp = _inputs()
    inp["series"]["em_month"] = [500.0 * (i % 3) for i in range(12)]
    inp["series"]["ro_month"] = [0.0] * 12
    f = F.forecast(inp)
    assert set(f) == {"loan_id", "status", "breach_metric", "breach_month", "metrics", "drivers"}
    for k, m in f["metrics"].items():
        assert {"now", "m3", "m6", "limit", "cash_trap", "series", "forecast"} <= set(m)
        assert m["m3"].keys() == m["m6"].keys() == {"lo", "mid", "hi"}
        assert len(m["forecast"]) == F.HORIZON and m["forecast"][5]["mid"] == m["m6"]["mid"]
        assert m["forecast"][0]["month"] == "2026-01-01"
        for p in m["forecast"]:
            assert {"month", "lo", "mid", "hi", "events"} <= set(p) and p["lo"] <= p["mid"] <= p["hi"]
    for d in f["drivers"]:
        assert {"kind", "label", "effect_text", "delta", "signal_ids", "evidence_ids"} <= set(d)
    broken = copy.deepcopy(inp)
    broken["series"]["events"] = [{"kind": "lease_expiry", "date": "2026-02-01"}]  # missing fields -> linear fallback
    g = F.forecast(broken)
    assert g["metrics"]["icr"]["model"]["name"] == "linear trend (fallback)" and len(g["metrics"]["icr"]["forecast"]) == F.HORIZON


def test_challenger_keeps_worse_colour():
    inp = _inputs()
    inp["series"]["haircut_items"] = [0] * 6 + [1, 2, 2, 3, 4, 4]  # LTV climbing on overdue items
    lin, hyb, both = F.forecast_linear(inp), F.forecast_hybrid(inp), F.forecast(inp)
    assert both["status"] == max(lin["status"], hyb["status"], key=F.ORDER.index)
    assert both["metrics"]["ltv"]["m6"] == hyb["metrics"]["ltv"]["m6"]
    if lin["status"] != hyb["status"]:
        assert both["drivers"][0]["label"].startswith("Straight-line challenger")


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok:", name)
