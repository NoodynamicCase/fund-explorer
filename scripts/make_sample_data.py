#!/usr/bin/env python3
"""Generate INVENTED sample data so the app can be previewed without a data download.

!! Nothing this script writes is real performance. Every file is marked
   "synthetic": true, the app shows a banner whenever it is displaying such data,
   and scripts/fetch_data.py deletes all synthetic files before writing real ones.

Usage:  python scripts/make_sample_data.py --out preview-data
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_data as fd  # noqa: E402

END = pd.Timestamp("2026-10-16")

# Invented stress periods (loosely placed where well-known market stress happened;
# the sizes of the moves below are made up, not historical).
WINDOWS = {
    "dotcom": ("2000-03-24", "2002-10-09"),
    "gfc": ("2007-10-09", "2009-03-09"),
    "covid": ("2020-02-19", "2020-03-23"),
    "rates2022": ("2022-01-03", "2022-10-12"),
}
EQUITY = {"dotcom": -0.42, "gfc": -0.47, "covid": -0.28, "rates2022": -0.21}
BONDS = {"dotcom": 0.08, "gfc": 0.05, "covid": 0.02, "rates2022": -0.12}
GOLD = {"dotcom": 0.06, "gfc": 0.15, "covid": 0.04, "rates2022": -0.03}

START_YEAR = {
    "VFIAX": 1976, "VTSAX": 1992, "VEXAX": 1987, "VIGAX": 1992, "VVIAX": 1992, "VIMAX": 1998, "VSMAX": 1980,
    "VSIAX": 1998, "VIG": 2006, "VYM": 2006, "SCHD": 2011, "VTIAX": 1996, "VTMGX": 2007, "SWISX": 1993,
    "VEMAX": 1994, "VGK": 2005, "VPL": 2005, "VBTLX": 1986, "VBIRX": 1994, "VBILX": 1994, "VBLAX": 1994,
    "VGSH": 2009, "VGIT": 2009, "VGLT": 2009, "SCHP": 2010, "VTIP": 2012, "VCIT": 2009, "VTEB": 2015,
    "BNDX": 2013, "VSCGX": 1994, "VSMGX": 1994, "VASGX": 1994, "VASIX": 1994, "VBIAX": 1992, "VTINX": 2003,
    "VTHRX": 2004, "VFIFX": 2004, "SWANX": 1998, "SWHGX": 1996, "SWBGX": 1996, "SWCGX": 1996, "VNQ": 1996,
    "VGPMX": 1984, "GLD": 2004, "SLV": 2006, "EFA": 2001, "ACWX": 2008,
}

CATEGORY_BETA = {
    "Growth": 1.12, "Value": 0.93, "Dividend": 0.78, "Mid and small-cap": 1.15, "Broad market": 1.0,
    "Large-cap blend": 1.0,
}


def factor(dates: pd.DatetimeIndex, rng, mean: float, sd: float, moves: dict[str, float]) -> np.ndarray:
    r = rng.normal(mean, sd, len(dates))
    for name, (a, b) in WINDOWS.items():
        mask = (dates >= a) & (dates <= b)
        n = int(mask.sum())
        if n == 0:
            continue
        noise = rng.normal(0, sd * 0.9, n)
        noise -= noise.mean()
        r[mask] = (1 + moves[name]) ** (1 / n) - 1 + noise
    return r


def loadings(e: dict) -> dict[str, float]:
    """Factor loadings (E equity, I intl, B bonds, G gold, R reit) by catalog entry."""
    ac, cat, fid = e["assetClass"], e["category"], e["id"]
    eq = (e.get("equityPct") or 0) / 100.0
    if ac == "us-stock":
        return {"E": CATEGORY_BETA.get(cat, 1.0)}
    if ac == "intl-stock":
        return {"I": 1.15 if cat == "Emerging markets" else 1.0}
    if ac == "bond":
        dur = {"VBIRX": 0.45, "VGSH": 0.25, "VBILX": 0.9, "VBLAX": 1.9, "VGIT": 0.9, "VGLT": 2.2, "VTIP": 0.3,
               "SCHP": 0.9, "VCIT": 0.95, "VTEB": 0.8, "BNDX": 0.7}.get(fid, 1.0)
        return {"B": dur}
    if ac == "balanced":
        if fid in ("VTINX", "VTHRX", "VFIFX"):
            eq = {"VTINX": 0.3, "VTHRX": 0.6, "VFIFX": 0.9}[fid]
        return {"E": eq * 0.65, "I": eq * 0.35, "B": 1 - eq}
    if fid == "VNQ":
        return {"R": 1.0}
    if fid == "VGPMX":
        return {"G": 1.7, "E": 0.4}
    if fid in ("GLD",):
        return {"G": 1.0}
    if fid == "SLV":
        return {"G": 1.4}
    if fid in ("EFA", "ACWX"):
        return {"I": 1.0}
    return {"E": 1.0}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="preview-data")
    args = ap.parse_args()
    out_dir = Path(args.out)
    series_dir = out_dir / "series"
    series_dir.mkdir(parents=True, exist_ok=True)
    for p in series_dir.glob("*.json"):
        p.unlink()

    catalog = json.loads(fd.CATALOG_PATH.read_text(encoding="utf-8"))["funds"]
    dates = pd.date_range("1975-12-26", END, freq="W-FRI")
    rng = np.random.default_rng(20261018)

    E = factor(dates, rng, 0.0017, 0.022, EQUITY)
    I = 0.75 * E + rng.normal(0.0002, 0.013, len(dates))
    B = factor(dates, rng, 0.0008, 0.0055, BONDS)
    G = factor(dates, rng, 0.0012, 0.018, GOLD)
    R = 0.7 * E + rng.normal(0.0003, 0.014, len(dates))
    F = {"E": E, "I": I, "B": B, "G": G, "R": R}

    built: dict[str, pd.Series] = {}
    for e in catalog:
        if e["data"]["type"] != "fund":
            continue
        fid = e["id"]
        ld = loadings(e)
        r = sum(F[k] * v for k, v in ld.items()) + rng.normal(0, 0.0015, len(dates))
        s = pd.Series(100.0 * np.cumprod(1 + r), index=dates)
        s = s[s.index >= pd.Timestamp(f"{START_YEAR.get(fid, 2005)}-03-01")]
        built[fid] = fd.rebase100(s)

    # monthly reference series (invented)
    months = pd.date_range("1976-01-01", "2026-09-01", freq="MS")
    cash_rate = pd.Series(np.clip(4 + 3 * np.sin(np.arange(len(months)) / 90) + rng.normal(0, 0.15, len(months)), 0.05, 12), index=months)
    built["CASH"] = fd.cash_index(cash_rate)
    cpi = pd.Series(100 * np.cumprod(1 + rng.normal(0.0025, 0.002, len(months))), index=months)
    built["CPI"] = fd.rebase100(cpi)
    built["BLEND6040"] = fd.rebase100(fd.blend_series(
        {"VFIAX": built["VFIAX"], "VBTLX": built["VBTLX"]}, {"VFIAX": 0.6, "VBTLX": 0.4}))

    for fid, s in built.items():
        payload = fd.series_payload(fid, s, source="sample", providerName="SAMPLE DATA (invented)", spliced=[])
        payload["synthetic"] = True
        fd.write_json(series_dir / f"{fid}.json", payload)
    manifest = fd.build_manifest(out_dir, [], ["sample"])
    fd.write_json(out_dir / "manifest.json", manifest)
    print(f"Wrote {len(built)} INVENTED sample series to {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
