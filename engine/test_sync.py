"""sync.remap_forecasts: citation ids follow the rows to their new database ids."""
from engine import sync


def test_remap_forecasts():
    fc = [{"loan_id": "L01", "drivers": [{"signal_ids": [1, 2], "evidence_ids": [7]}, {"label": "no ids"}]},
          {"loan_id": "L02", "drivers": [{"signal_ids": [3, 99], "evidence_ids": []}]}]
    old = {"signals": [1, 2, 3], "evidence": [7]}
    new = {"signals": [101, 102, 103], "evidence": [507]}
    out = sync.remap_forecasts(fc, old, new)
    assert out[0]["drivers"][0] == {"signal_ids": [101, 102], "evidence_ids": [507]}
    assert out[0]["drivers"][1] == {"label": "no ids"}
    assert out[1]["drivers"][0]["signal_ids"] == [103, 99]  # unknown ids are left alone
    assert fc[0]["drivers"][0]["signal_ids"] == [1, 2]  # input not mutated


def test_remap_keeps_signal_and_evidence_spaces_apart():
    fc = [{"drivers": [{"signal_ids": [5], "evidence_ids": [5]}]}]
    out = sync.remap_forecasts(fc, {"signals": [5], "evidence": [5]}, {"signals": [50], "evidence": [500]})
    assert out[0]["drivers"][0] == {"signal_ids": [50], "evidence_ids": [500]}
