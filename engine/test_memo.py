"""memo._check: every figure in a loan's text must come from that loan's own facts."""
import pytest

from engine import memo

L01 = {"loan_id": "L01", "name": "Rowan Works, Birmingham - build-to-rent block", "amount_gbp": 12000000,
       "status": "red", "breach_metric": "icr", "breach_month": "2027-03-01",
       "icr": {"now": 1.38, "limit": 1.3, "cash_trap": 1.4, "forecast_6m_mid": 1.21},
       "ltv": {"now": 61.9, "limit": 65.0, "unit": "percent"}, "ltv_now_pct": 61.9,
       "drivers": [{"cite": "L01/D1", "kind": "arrears", "effect": "ICR -0.09x over 6 months"}],
       "evidence": [{"cite": "L01/E1", "title": "Scheme left unfinished", "url": "https://example.com/report-2029-77"}]}
L02 = {"loan_id": "L02", "name": "Kings Yard, Leeds - office", "amount_gbp": 8500000, "status": "amber",
       "icr": {"now": 1.55, "limit": 1.25}, "ltv": {"now": 58.4, "limit": 70.0, "unit": "percent"},
       "drivers": [], "evidence": []}
COMMON = {"2026", "11", "12", "1", "0", "6"}


def check(body):
    return memo._check(body, [L01, L02], COMMON)


def test_clean_text_passes():
    assert check("- L01 Rowan Works: ICR 1.38x now, forecast 1.21x against a 1.3x limit [L01/D1]. LTV 61.9%.") == []
    assert check("- L02 Kings Yard: ICR 1.55x, LTV 58.4% against 70%.") == []


def test_rounding_and_millions_allowed():
    assert check("L01 is a £12m loan with ICR 1.4x and LTV 62%.") == []


def test_planted_wrong_number_flagged():
    assert check("- L01: ICR 1.19x by March 2027 [L01/D1].") == ["1.19"]


def test_other_loans_number_flagged():
    # 1.55 is L02's ICR: true somewhere in the payload, but not for L01
    assert check("- L01 Rowan Works: ICR 1.55x now.") == ["1.55"]
    assert check("- Kings Yard: LTV 61.9%.") == ["61.9"]


def test_loanless_bullet_does_not_inherit():
    body = "- L01: ICR 1.38x.\n- Request a valuation within 14 days."
    assert check(body) == ["14"]


def test_paragraph_inherits_loan():
    body = "L01 Rowan Works is the main concern.\nICR is 1.55x."
    assert check(body) == ["1.55"]


def test_years_only_in_date_context():
    assert check("L01 may breach by 2028.") == []
    assert check("L01 may breach in Q3 2029.") == []
    assert check("L01 may breach in September 2029.") == []
    assert check("L01 has 2028 units.") == ["2028"]


def test_citations_and_urls_are_not_facts():
    assert check("L01 news [L01/E1].") == []
    # 77 only appears in an evidence URL
    assert check("L01 has 77 complaints.") == ["77"]


def test_pct_units_explicit():
    assert memo._pct(61.867, "pct") == 61.9
    assert memo._pct(0.62, "fraction") == 62.0
    assert memo._pct(None, "pct") is None
    with pytest.raises(ValueError):
        memo._pct(1.2, "x")


def test_facts_use_metric_unit():
    fc = {"status": "red", "metrics": {"ltv": {"now": 0.6187, "limit": 0.65, "unit": "fraction"}}, "drivers": []}
    f = memo._facts({"id": "L09", "name": "X"}, fc, [])
    assert f["ltv"]["now"] == 61.9 and f["ltv"]["limit"] == 65.0 and f["ltv_now_pct"] == 61.9
    fc = {"status": "red", "metrics": {"ltv": {"now": 61.867, "limit": 65.0}}, "drivers": []}
    assert memo._facts({"id": "L09", "name": "X"}, fc, [])["ltv_now_pct"] == 61.9


def test_gen_falls_back_after_two_bad_drafts(monkeypatch):
    monkeypatch.setattr(memo.llm, "chat", lambda s, u: "L01 ICR 9.99x")
    with pytest.raises(RuntimeError, match="9.99"):
        memo._gen("sys", {"loans": [L01]}, [L01], COMMON)
