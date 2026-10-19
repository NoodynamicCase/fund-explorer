"""Tests for the pure data-transform functions. Run: python -m pytest scripts -q"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_data as fd  # noqa: E402


def daily(start, n, f):
    idx = pd.bdate_range(start, periods=n)
    return pd.Series([f(i) for i in range(n)], index=idx, dtype=float)


def test_clean_series_dedupes_sorts_and_drops_nonpositive():
    s = pd.Series([2.0, 1.0, 0.0, -1.0, 5.0], index=pd.to_datetime(
        ["2020-01-03", "2020-01-02", "2020-01-06", "2020-01-07", "2020-01-03"]))
    out = fd.clean_series(s)
    assert list(out.index) == list(pd.to_datetime(["2020-01-02", "2020-01-03"]))
    assert out.loc["2020-01-03"] == 5.0  # keeps the last duplicate


def test_to_weekly_takes_last_observation_of_each_week():
    s = daily("2024-01-01", 15, lambda i: 100 + i)  # Mon 1 Jan .. 15 business days
    w = fd.to_weekly(s)
    assert w.index[0] == pd.Timestamp("2024-01-05")
    assert w.iloc[0] == 104.0  # Friday of week 1 = 5th business day (index 4)
    assert w.iloc[1] == 109.0


def test_to_weekly_labels_partial_final_week_with_real_date():
    s = daily("2024-01-01", 8, lambda i: 100 + i)  # ends Wed 10 Jan
    w = fd.to_weekly(s)
    assert w.index[-1] == pd.Timestamp("2024-01-10")
    assert w.iloc[-1] == 107.0


def test_splice_scales_older_series_to_match_on_overlap():
    older = pd.Series([50.0, 55.0, 60.0, 66.0, 70.0],
                      index=pd.to_datetime(["2000-01-03", "2000-01-04", "2000-01-05", "2000-01-06", "2000-01-07"]))
    primary = pd.Series([132.0, 140.0],
                        index=pd.to_datetime(["2000-01-06", "2000-01-07"]))
    combined, notes = fd.splice(primary, [("OLD", older)])
    # ratio = 132 / 66 = 2; older points before 2000-01-06 are doubled
    assert list(combined.values) == [100.0, 110.0, 120.0, 132.0, 140.0]
    assert notes == [{"ticker": "OLD", "until": "2000-01-06"}]


def test_splice_skips_older_series_that_start_later():
    older = pd.Series([1.0, 2.0], index=pd.to_datetime(["2010-01-04", "2010-01-05"]))
    primary = pd.Series([10.0, 11.0], index=pd.to_datetime(["2005-01-03", "2005-01-04"]))
    combined, notes = fd.splice(primary, [("LATE", older)])
    assert len(combined) == 2 and notes == []


def test_rebase100():
    s = pd.Series([4.0, 5.0, 8.0], index=pd.to_datetime(["2020-01-01", "2020-01-08", "2020-01-15"]))
    assert list(fd.rebase100(s).values) == [100.0, 125.0, 200.0]


def test_cash_index_compounds_monthly_rate():
    rates = pd.Series([12.0, 12.0, 12.0], index=pd.to_datetime(["2020-01-01", "2020-02-01", "2020-03-01"]))
    idx = fd.cash_index(rates)
    assert idx.iloc[0] == pytest.approx(100.0)
    assert idx.iloc[1] == pytest.approx(101.0)       # 12% / 12 = 1% for the month
    assert idx.iloc[2] == pytest.approx(102.01)


def test_blend_matches_hand_calculation_with_monthly_rebalance():
    dates = pd.to_datetime(["2020-01-03", "2020-01-10", "2020-01-17", "2020-02-07"])
    a = pd.Series([100.0, 110.0, 110.0, 99.0], index=dates)   # +10%, 0%, -10%
    b = pd.Series([100.0, 100.0, 105.0, 105.0], index=dates)  # 0%, +5%, 0%
    out = fd.blend_series({"A": a, "B": b}, {"A": 0.6, "B": 0.4}, "monthly")
    # week 2: 0.6*1.10 + 0.4*1.00 = 1.06
    assert out.iloc[1] == pytest.approx(106.0)
    # weights drift: A = 0.66/1.06, B = 0.40/1.06. week 3: A flat, B +5%
    h_a, h_b = 0.66 / 1.06, 0.40 / 1.06
    g3 = h_a * 1.0 + h_b * 1.05
    assert out.iloc[2] == pytest.approx(106.0 * g3)
    # week 4 falls in February, but the rebalance applies AFTER that week's return:
    h_a3, h_b3 = h_a / g3, h_b * 1.05 / g3
    g4 = h_a3 * 0.90 + h_b3 * 1.0
    assert out.iloc[3] == pytest.approx(106.0 * g3 * g4)


def test_blend_requires_overlap():
    a = pd.Series([1.0, 2.0], index=pd.to_datetime(["2020-01-03", "2020-01-10"]))
    b = pd.Series([1.0, 2.0], index=pd.to_datetime(["2021-01-01", "2021-01-08"]))
    with pytest.raises(ValueError):
        fd.blend_series({"A": a, "B": b}, {"A": 0.5, "B": 0.5})


def test_catalog_is_consistent():
    import json
    cat = json.loads(fd.CATALOG_PATH.read_text())["funds"]
    ids = {e["id"] for e in cat}
    for e in cat:
        d = e["data"]
        if d["type"] == "blend":
            assert set(d["weights"]) <= ids
            assert abs(sum(d["weights"].values()) - 1) < 1e-9


# ---- end-to-end orchestration with the network mocked ------------------------------------

def _fake_daily(seed, start="1990-01-02", end="2025-12-31"):
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range(start, end)
    return pd.Series(100 * np.cumprod(1 + rng.normal(0.0003, 0.01, len(idx))), index=idx)


def _run_main(monkeypatch, tmp_path, fetch, argv=()):
    monkeypatch.setattr(fd, "fetch_prices", fetch)
    monkeypatch.setattr(fd, "fetch_fred", lambda sid: pd.Series(
        [3.0 + 0.01 * i if sid == "TB3MS" else 100 + i for i in range(120)],
        index=pd.date_range("2015-01-01", periods=120, freq="MS")))
    monkeypatch.setattr(sys, "argv", ["fetch_data.py", "--out", str(tmp_path), *argv])
    return fd.main()


def test_main_writes_series_and_manifest(monkeypatch, tmp_path):
    import json
    calls = []

    def fetch(ticker):
        calls.append(ticker)
        return _fake_daily(abs(hash(ticker)) % 1000), f"Name of {ticker}", "yfinance"

    code = _run_main(monkeypatch, tmp_path, fetch)
    assert code == 0
    manifest = json.loads((tmp_path / "manifest.json").read_text())
    assert manifest["synthetic"] is False
    assert "VFIAX" in manifest["funds"] and "BLEND6040" in manifest["funds"] and "CASH" in manifest["funds"]
    s = json.loads((tmp_path / "series" / "VFIAX.json").read_text())
    assert s["values"][0] == 100.0 and s["providerName"] == "Name of VFIAX"
    assert len(s["dates"]) == len(s["values"])
    assert "VFINX" in calls  # older share class was requested for splicing


def test_main_refuses_to_write_when_most_downloads_fail(monkeypatch, tmp_path):
    def fetch(ticker):
        raise RuntimeError("blocked")

    code = _run_main(monkeypatch, tmp_path, fetch)
    assert code == 1
    assert not (tmp_path / "manifest.json").exists()


def test_main_deletes_sample_files_and_keeps_old_real_files(monkeypatch, tmp_path):
    import json
    (tmp_path / "series").mkdir()
    (tmp_path / "series" / "SLV.json").write_text(json.dumps({"id": "SLV", "dates": ["2020-01-03"], "values": [100], "synthetic": True}))
    (tmp_path / "series" / "GLD.json").write_text(json.dumps({"id": "GLD", "dates": ["2020-01-03", "2020-01-10"], "values": [100, 101], "synthetic": False, "source": "yfinance"}))

    def fetch(ticker):
        if ticker in ("GLD", "SLV"):
            raise RuntimeError("blocked")
        return _fake_daily(1), None, "yfinance"

    assert _run_main(monkeypatch, tmp_path, fetch) == 0
    assert not (tmp_path / "series" / "SLV.json").exists()      # sample file removed, fetch failed -> no file
    assert (tmp_path / "series" / "GLD.json").exists()           # real old file kept
    manifest = json.loads((tmp_path / "manifest.json").read_text())
    assert {f["id"] for f in manifest["failed"]} >= {"GLD", "SLV"}
    assert manifest["funds"]["GLD"]["points"] == 2
