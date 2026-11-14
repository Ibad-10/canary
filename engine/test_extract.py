"""extract: covenant sanity checks and V7 vs regex reconciliation (no network, no PDFs)."""
import pytest

from engine import extract as X

GOOD = {"icr_min": 1.25, "icr_cash_trap": 1.35, "ltv_max": 65.0, "ltv_cash_trap": 60.0, "test": "ICR"}


def test_valid_terms_pass():
    assert X.validate(GOOD) == []


@pytest.mark.parametrize("patch,needle", [
    ({"icr_min": 0.8}, "icr_min"),
    ({"icr_cash_trap": 3.5}, "icr_cash_trap"),
    ({"ltv_max": 95.0}, "ltv_max"),
    ({"ltv_cash_trap": 30.0}, "ltv_cash_trap"),
    ({"icr_cash_trap": 1.2}, "not above icr_min"),
    ({"ltv_cash_trap": 70.0}, "not below ltv_max"),
    ({"rate_pct": 18.0}, "rate_pct"),
])
def test_invalid_terms_flagged(patch, needle):
    assert any(needle in p for p in X.validate({**GOOD, **patch}))


def test_fraction_ltv_normalised():
    t, tool, checks = X.reconcile({**GOOD, "ltv_max": 0.65, "ltv_cash_trap": 0.60}, None)
    assert tool == "V7 Go" and t["ltv_max"] == 65.0 and checks == []


def test_v7_wins_but_disagreement_flagged():
    t, tool, checks = X.reconcile({**GOOD, "icr_min": 1.20}, GOOD)
    assert tool == "V7 Go" and t["icr_min"] == 1.20
    assert any("disagree on icr_min" in c for c in checks)


def test_out_of_range_v7_value_falls_back_to_regex():
    t, tool, checks = X.reconcile({**GOOD, "ltv_max": 650.0}, GOOD)
    assert t["ltv_max"] == 65.0 and "regex" in tool
    assert any("out of range" in c for c in checks)


def test_bad_ordering_falls_back_to_regex():
    t, tool, checks = X.reconcile({**GOOD, "icr_cash_trap": 1.2}, GOOD)
    assert t == GOOD and "sanity" in tool and checks


def test_both_invalid_returns_none():
    t, _, checks = X.reconcile({**GOOD, "icr_min": 5.0}, {**GOOD, "icr_min": 4.0})
    assert t is None and checks


def test_regex_only():
    t, tool, checks = X.reconcile(None, GOOD)
    assert t == GOOD and "fallback" in tool and checks == []


def test_covenants_raises_with_checks_when_unusable(monkeypatch):
    monkeypatch.setattr(X, "_v7", lambda p: {**GOOD, "icr_min": 5.0})
    monkeypatch.setattr(X, "_local", lambda p: None)
    with pytest.raises(ValueError, match="sanity checks"):
        X.covenants("x.pdf")


def test_covenants_returns_checks(monkeypatch):
    monkeypatch.setattr(X, "_v7", lambda p: {**GOOD, "icr_min": 1.2})
    monkeypatch.setattr(X, "_local", lambda p: GOOD)
    out = X.covenants("x.pdf")
    assert out["icr_min"] == 1.2 and out["source"]["tool"] == "V7 Go" and out["checks"]
