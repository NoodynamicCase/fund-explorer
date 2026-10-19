#!/usr/bin/env python3
"""Fetch fund price history and write weekly JSON files for the web app.

Run by the GitHub Actions workflow (see .github/workflows/refresh-and-deploy.yml),
or by hand:  python scripts/fetch_data.py  [--only VFIAX,VBTLX] [--out public/data]

How it works
------------
1. Reads catalog/funds.json (one entry per exposure, e.g. "S&P 500 Index").
2. For every ticker it needs, tries the sources in SOURCE_ORDER:
     manual   data_manual/<TICKER>.csv  (a file you downloaded yourself)
     yfinance Yahoo Finance via the yfinance library (no account needed)
     tiingo   Tiingo API, only if the TIINGO_API_KEY environment variable is set
3. Prices are dividend-adjusted (total return), cut to one point per week, and
   indexed to 100 at the first point.
4. Older share classes listed in "extends" are spliced in before the main fund's
   first date, scaled so the two series match on the overlap date.
5. Derived series (60/40 blend, cash, CPI) are computed.
6. Writes public/data/series/<ID>.json and public/data/manifest.json.

Safety rules
------------
* If fewer than MIN_SUCCESS_RATE of the funds download, nothing is written and the
  script exits with an error, so a bad run never replaces good data.
* A fund that fails keeps its previous file (if there is one) and is listed under
  "failed" in the manifest.
* Files marked "synthetic": true (sample data) are always deleted first, so sample
  data can never be mistaken for real data.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
CATALOG_PATH = ROOT / "catalog" / "funds.json"
MANUAL_DIR = ROOT / "data_manual"
DEFAULT_OUT = ROOT / "public" / "data"

SOURCE_ORDER = [s.strip() for s in os.environ.get("SOURCE_ORDER", "manual,yfinance,tiingo").split(",") if s.strip()]
MIN_SUCCESS_RATE = float(os.environ.get("MIN_SUCCESS_RATE", "0.5"))
REQUEST_PAUSE_SECONDS = float(os.environ.get("REQUEST_PAUSE_SECONDS", "1.0"))
USER_AGENT = "Mozilla/5.0 (fund-explorer data refresh; personal research tool)"


def log(msg: str) -> None:
    print(msg, flush=True)


# --------------------------------------------------------------------------- sources


def fetch_manual(ticker: str) -> tuple[pd.Series, str | None] | None:
    """Read data_manual/<TICKER>.csv. Accepts Yahoo-style downloads (Date, Adj Close)."""
    path = MANUAL_DIR / f"{ticker}.csv"
    if not path.exists():
        return None
    df = pd.read_csv(path)
    cols = {c.lower().strip(): c for c in df.columns}
    date_col = cols.get("date") or df.columns[0]
    price_col = cols.get("adj close") or cols.get("adj_close") or cols.get("adjclose") or cols.get("close")
    if price_col is None:
        raise ValueError(f"{path.name}: no 'Adj Close' or 'Close' column")
    s = pd.Series(
        pd.to_numeric(df[price_col], errors="coerce").values,
        index=pd.to_datetime(df[date_col], errors="coerce"),
    ).dropna()
    return s, None


def fetch_yfinance(ticker: str) -> tuple[pd.Series, str | None]:
    import yfinance as yf

    last_err: Exception | None = None
    for attempt in range(3):
        try:
            t = yf.Ticker(ticker)
            hist = t.history(period="max", auto_adjust=False, actions=False)
            if hist is None or hist.empty:
                raise ValueError("empty result")
            col = "Adj Close" if "Adj Close" in hist.columns else "Close"
            s = hist[col].dropna()
            if s.empty:
                raise ValueError("no price column data")
            name = None
            try:
                info = t.get_info()
                name = info.get("longName") or info.get("shortName")
            except Exception:
                pass
            return s, name
        except Exception as exc:  # noqa: BLE001 - network/rate-limit errors vary widely
            last_err = exc
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"yfinance failed: {last_err}")


_tiingo_blocked = False


def fetch_tiingo(ticker: str) -> tuple[pd.Series, str | None]:
    global _tiingo_blocked
    import requests

    key = os.environ.get("TIINGO_API_KEY")
    if not key:
        raise RuntimeError("TIINGO_API_KEY not set")
    if _tiingo_blocked:
        raise RuntimeError("Tiingo rate limit reached earlier in this run")
    url = f"https://api.tiingo.com/tiingo/daily/{ticker}/prices"
    resp = requests.get(
        url,
        params={"startDate": "1970-01-01", "format": "json"},
        headers={"Authorization": f"Token {key}", "Content-Type": "application/json", "User-Agent": USER_AGENT},
        timeout=60,
    )
    if resp.status_code == 429:
        _tiingo_blocked = True
        raise RuntimeError("Tiingo rate limit (HTTP 429)")
    resp.raise_for_status()
    rows = resp.json()
    if not rows:
        raise ValueError("empty result")
    s = pd.Series(
        [r.get("adjClose", r.get("close")) for r in rows],
        index=pd.to_datetime([r["date"] for r in rows]).tz_localize(None),
    ).dropna()
    return s, None


def fetch_prices(ticker: str) -> tuple[pd.Series, str | None, str]:
    """Try each configured source in order. Returns (daily series, provider name, source)."""
    errors: list[str] = []
    for source in SOURCE_ORDER:
        try:
            if source == "manual":
                got = fetch_manual(ticker)
                if got is None:
                    continue
            elif source == "yfinance":
                got = fetch_yfinance(ticker)
                time.sleep(REQUEST_PAUSE_SECONDS)
            elif source == "tiingo":
                if not os.environ.get("TIINGO_API_KEY"):
                    continue
                got = fetch_tiingo(ticker)
            else:
                continue
            series, name = got
            series = clean_series(series)
            if len(series) < 20:
                raise ValueError(f"only {len(series)} price points")
            return series, name, source
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{source}: {exc}")
    raise RuntimeError("; ".join(errors) if errors else "no source available")


def _retry(fn, attempts: int = 4, pause: float = 4.0):
    """Call fn(); on failure wait (4s, 8s, 16s...) and try again. Re-raises the last error."""
    last: Exception | None = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001
            last = exc
            if i < attempts - 1:
                time.sleep(pause * (2 ** i))
    assert last is not None
    raise last


def _fred_from_fred(series_id: str) -> pd.Series:
    import requests

    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=(15, 90))
    resp.raise_for_status()
    df = pd.read_csv(io.StringIO(resp.text))
    dates = pd.to_datetime(df.iloc[:, 0], errors="coerce")
    values = pd.to_numeric(df.iloc[:, 1], errors="coerce")
    return pd.Series(values.values, index=dates).dropna()


def _fred_from_dbnomics(series_id: str) -> pd.Series:
    """DB.nomics mirrors FRED's data and needs no key; used when fred.stlouisfed.org is slow."""
    import requests

    url = f"https://api.db.nomics.world/v22/series/FRED/{series_id}?observations=1&format=json"
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=(15, 90))
    resp.raise_for_status()
    doc = resp.json()["series"]["docs"][0]
    return pd.Series(pd.to_numeric(pd.Series(doc["value"]), errors="coerce").values,
                     index=pd.to_datetime(pd.Series(doc["period"]), errors="coerce")).dropna()


def fetch_fred(series_id: str) -> pd.Series:
    """Monthly economic series (CPI, T-bill rate). Tries FRED with retries, then DB.nomics."""
    errors: list[str] = []
    for name, fn in (("FRED", _fred_from_fred), ("DB.nomics", _fred_from_dbnomics)):
        try:
            s = _retry(lambda fn=fn: fn(series_id))
            s = s[~s.index.isna()].sort_index()
            if s.empty:
                raise ValueError("empty")
            return s
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{name}: {exc}")
    raise RuntimeError(f"{series_id}: " + "; ".join(errors))


# ------------------------------------------------------------------------- holdings


def holdings_eligible(entry: dict) -> bool:
    """Stock and stock/bond funds (and REITs) get a top-holdings file. Bond, gold and hedge funds do not."""
    return entry["data"]["type"] == "fund" and (entry.get("mix") in ("stock", "mixed") or entry["id"] == "VNQ")


def holdings_symbols(entry: dict) -> list[str]:
    """ETF tickers first (their holdings pages are the most complete), then mutual-fund tickers."""
    out: list[str] = []
    for lst in entry.get("tickers", {}).values():
        out.extend(lst)
    out.append(entry["data"]["ticker"])
    uniq = list(dict.fromkeys(out))
    return sorted(uniq, key=lambda t: 1 if (len(t) == 5 and t.endswith("X")) else 0)


def _num(x) -> float | None:
    try:
        v = float(x)
        return v if np.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def fetch_holdings(symbols: list[str]) -> dict:
    """Biggest holdings and sector weights from Yahoo Finance (via yfinance). Raises if nothing usable."""
    import yfinance as yf

    errors: list[str] = []
    for sym in symbols:
        try:
            fd_ = yf.Ticker(sym).funds_data
            th = fd_.top_holdings
            if th is None or len(th) == 0:
                raise ValueError("no top holdings")
            name_col = next((c for c in th.columns if "name" in str(c).lower()), None)
            pct_col = next((c for c in th.columns if "percent" in str(c).lower() or "weight" in str(c).lower()), None)
            if pct_col is None:
                raise ValueError("no weight column")
            top = []
            for symbol, row in th.iterrows():
                pct = _num(row[pct_col])
                if pct is None:
                    continue
                top.append({"symbol": str(symbol).strip(), "name": str(row[name_col]).strip() if name_col else "", "pct": round(pct * 100.0, 2)})
            if not top:
                raise ValueError("empty after parsing")
            out: dict = {"symbol": sym, "top": top, "topTotal": round(sum(t["pct"] for t in top), 2)}
            try:
                sw = fd_.sector_weightings or {}
                sectors = {str(k): round(float(v) * 100.0, 2) for k, v in sw.items() if _num(v) is not None}
                if sectors:
                    out["sectors"] = sectors
            except Exception:  # noqa: BLE001
                pass
            try:
                ac = fd_.asset_classes or {}
                assets = {str(k): round(float(v) * 100.0, 2) for k, v in ac.items() if _num(v) is not None}
                if assets:
                    out["assets"] = assets
            except Exception:  # noqa: BLE001
                pass
            return out
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{sym}: {exc}")
    raise RuntimeError("; ".join(errors)[:300])


# ---------------------------------------------------------------------- transforms


def clean_series(s: pd.Series) -> pd.Series:
    s = s.copy()
    idx = pd.to_datetime(s.index)
    if getattr(idx, "tz", None) is not None:
        idx = idx.tz_localize(None)
    s.index = idx.normalize()
    s = s[~s.index.duplicated(keep="last")].sort_index()
    s = s[s > 0].dropna()
    return s


def splice(primary: pd.Series, older: list[tuple[str, pd.Series]]) -> tuple[pd.Series, list[dict]]:
    """Extend `primary` backwards using older share classes.

    For each older series, scale it so it equals the combined series on the combined
    series' first date, then keep only the part before that date.
    """
    combined = primary
    notes: list[dict] = []
    for ticker, series in older:
        d0 = combined.index[0]
        before = series[series.index <= d0]
        if before.empty:
            continue  # older series starts after the combined one: nothing to add
        ratio = combined.iloc[0] / before.iloc[-1]
        extra = series[series.index < d0] * ratio
        if extra.empty:
            continue
        combined = pd.concat([extra, combined]).sort_index()
        notes.append({"ticker": ticker, "until": d0.strftime("%Y-%m-%d")})
    return combined, notes


def to_weekly(s: pd.Series) -> pd.Series:
    """One observation per week (last trading day of each week), labelled by Friday.
    The final partial week is labelled with its real last date."""
    s = clean_series(s)
    weekly = s.resample("W-FRI").last().dropna()
    if len(weekly) and weekly.index[-1] > s.index[-1]:
        new_index = weekly.index[:-1].append(pd.DatetimeIndex([s.index[-1]]))
        weekly.index = new_index
        weekly = weekly[~weekly.index.duplicated(keep="last")]
    return weekly


def rebase100(s: pd.Series) -> pd.Series:
    return s / s.iloc[0] * 100.0


def cash_index(rates_pct: pd.Series) -> pd.Series:
    """Growth of cash earning an annual rate (in percent) quoted monthly."""
    # Each month earns the rate quoted for the PREVIOUS month-start (rate known in advance).
    growth = 1.0 + rates_pct.shift(1) / 100.0 / 12.0
    growth.iloc[0] = 1.0
    return growth.cumprod() * 100.0


def _period_key(ts: pd.Timestamp, rebalance: str):
    if rebalance == "monthly":
        return (ts.year, ts.month)
    if rebalance == "quarterly":
        return (ts.year, (ts.month - 1) // 3)
    if rebalance == "yearly":
        return ts.year
    return None  # "never": buy and hold


def align_to_weekly(parts: dict[str, pd.Series]) -> dict[str, pd.Series]:
    """Monthly series (cash, CPI) are carried forward onto the weekly dates of the other parts."""
    def gap(x: pd.Series) -> float:
        d = x.index.to_series().diff().dt.days.dropna()
        return float(d.median()) if len(d) else 7.0

    weekly = [k for k, v in parts.items() if gap(v) <= 10]
    if not weekly:
        return parts
    base = parts[weekly[0]].index
    for k in weekly[1:]:
        base = base.union(parts[k].index)
    out: dict[str, pd.Series] = {}
    for k, v in parts.items():
        out[k] = v if k in weekly else v.reindex(v.index.union(base)).ffill().reindex(base)
    return out


def blend_series(parts: dict[str, pd.Series], weights: dict[str, float], rebalance: str = "monthly") -> pd.Series:
    """Constant-mix blend of weekly series, rebalanced monthly/quarterly/yearly (or never)."""
    parts = align_to_weekly(parts)
    df = pd.concat(parts, axis=1).ffill().dropna()
    if len(df) < 3:
        raise ValueError("not enough overlapping history to blend")
    w = pd.Series(weights)[df.columns].astype(float)
    w = w / w.sum()
    rets = df.pct_change().iloc[1:]
    h = w.copy()
    value = 100.0
    out = [(df.index[0], value)]
    prev_period = _period_key(df.index[0], rebalance)
    for date, r in rets.iterrows():
        h = h * (1.0 + r)
        growth = float(h.sum())
        value *= growth
        h = h / growth
        period = _period_key(date, rebalance)
        if period is not None and period != prev_period:
            h = w.copy()
        prev_period = period
        out.append((date, value))
    return pd.Series([v for _, v in out], index=pd.DatetimeIndex([d for d, _ in out]))


# ------------------------------------------------------------------------- output


def series_payload(fund_id: str, s: pd.Series, **meta) -> dict:
    s = s.dropna()
    return {
        "id": fund_id,
        "dates": [d.strftime("%Y-%m-%d") for d in s.index],
        "values": [round(float(v), 4) for v in s.values],
        "synthetic": False,
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        **meta,
    }


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")


def remove_synthetic(series_dir: Path) -> int:
    removed = 0
    if not series_dir.exists():
        return 0
    for p in series_dir.glob("*.json"):
        try:
            if json.loads(p.read_text(encoding="utf-8")).get("synthetic"):
                p.unlink()
                removed += 1
        except Exception:  # noqa: BLE001
            p.unlink()
            removed += 1
    return removed


def build_manifest(out_dir: Path, failed: list[dict], source_order: list[str]) -> dict:
    funds: dict[str, dict] = {}
    for p in sorted((out_dir / "series").glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        if not d.get("dates"):
            continue
        funds[d["id"]] = {
            "first": d["dates"][0],
            "last": d["dates"][-1],
            "points": len(d["dates"]),
            "source": d.get("source", "unknown"),
            "synthetic": bool(d.get("synthetic")),
            "fetchedAt": d.get("fetchedAt"),
        }
    hold_dir = out_dir / "holdings"
    holdings = sorted(p.stem for p in hold_dir.glob("*.json")) if hold_dir.exists() else []
    return {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "synthetic": any(f["synthetic"] for f in funds.values()),
        "sourceOrder": source_order,
        "funds": funds,
        "holdings": holdings,
        "failed": failed,
    }


# --------------------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="output directory (default public/data)")
    ap.add_argument("--only", default="", help="comma-separated fund ids to refresh (default: all)")
    ap.add_argument("--no-holdings", action="store_true", help="skip the top-holdings download")
    args = ap.parse_args()

    out_dir = Path(args.out)
    series_dir = out_dir / "series"
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))["funds"]
    only = {x.strip() for x in args.only.split(",") if x.strip()}
    entries = [e for e in catalog if not only or e["id"] in only]
    log(f"Catalog: {len(catalog)} entries; refreshing {len(entries)}. Sources: {', '.join(SOURCE_ORDER)}")

    removed = remove_synthetic(series_dir)
    if removed:
        log(f"Removed {removed} sample-data file(s)")

    failed: list[dict] = []
    weekly: dict[str, pd.Series] = {}
    results: dict[str, dict] = {}

    fund_entries = [e for e in entries if e["data"]["type"] == "fund"]
    cache: dict[str, tuple[pd.Series, str | None, str]] = {}

    def get(ticker: str):
        if ticker not in cache:
            cache[ticker] = fetch_prices(ticker)
        return cache[ticker]

    # 1) real funds
    for e in fund_entries:
        fid, d = e["id"], e["data"]
        try:
            daily, name, source = get(d["ticker"])
            older: list[tuple[str, pd.Series]] = []
            for t in d.get("extends", []):
                try:
                    older.append((t, get(t)[0]))
                except Exception as exc:  # noqa: BLE001
                    log(f"  note: {fid}: could not fetch older class {t}: {exc}")
            combined, spliced = splice(daily, older)
            w = rebase100(to_weekly(combined))
            weekly[fid] = w
            results[fid] = series_payload(
                fid, w, source=source, providerName=name, spliced=spliced, dataTicker=d["ticker"]
            )
            log(f"  ok   {fid:10s} {w.index[0].date()} -> {w.index[-1].date()}  {len(w):5d} weeks  via {source}"
                + (f"  (+{','.join(s['ticker'] for s in spliced)})" if spliced else ""))
        except Exception as exc:  # noqa: BLE001
            failed.append({"id": fid, "reason": str(exc)[:300]})
            log(f"  FAIL {fid:10s} {exc}")

    # 2) reference series from FRED
    for e in [e for e in entries if e["data"]["type"] in ("fred_cash", "fred_index")]:
        fid, d = e["id"], e["data"]
        try:
            raw = fetch_fred(d["series"])
            idx = cash_index(raw) if d["type"] == "fred_cash" else rebase100(raw)
            weekly[fid] = idx
            results[fid] = series_payload(fid, idx, source="fred", providerName=f"FRED {d['series']}", spliced=[])
            log(f"  ok   {fid:10s} {idx.index[0].date()} -> {idx.index[-1].date()}  {len(idx):5d} points  via FRED")
        except Exception as exc:  # noqa: BLE001
            failed.append({"id": fid, "reason": str(exc)[:300]})
            log(f"  FAIL {fid:10s} {exc}")

    # 3) blends (need the funds they are built from)
    for e in [e for e in entries if e["data"]["type"] == "blend"]:
        fid, d = e["id"], e["data"]
        try:
            parts: dict[str, pd.Series] = {}
            for part_id in d["weights"]:
                if part_id in weekly:
                    parts[part_id] = weekly[part_id]
                else:
                    prev = series_dir / f"{part_id}.json"
                    if not prev.exists():
                        raise ValueError(f"missing component {part_id}")
                    j = json.loads(prev.read_text(encoding="utf-8"))
                    parts[part_id] = pd.Series(j["values"], index=pd.to_datetime(j["dates"]))
            b = blend_series(parts, d["weights"], d.get("rebalance", "monthly"))
            b = rebase100(b)
            results[fid] = series_payload(fid, b, source="computed", providerName=None, spliced=[])
            log(f"  ok   {fid:10s} {b.index[0].date()} -> {b.index[-1].date()}  {len(b):5d} weeks  computed")
        except Exception as exc:  # noqa: BLE001
            failed.append({"id": fid, "reason": str(exc)[:300]})
            log(f"  FAIL {fid:10s} {exc}")

    ok_count = len(results)
    total = len(entries)
    rate = ok_count / total if total else 0
    log(f"\n{ok_count}/{total} succeeded ({rate:.0%}).")
    if rate < MIN_SUCCESS_RATE:
        log(f"ERROR: success rate below {MIN_SUCCESS_RATE:.0%}. Not writing anything.")
        log("Likely causes: Yahoo is rate-limiting this network (add a TIINGO_API_KEY secret), or no internet.")
        return 1

    for fid, payload in results.items():
        write_json(series_dir / f"{fid}.json", payload)

    # 4) top holdings (best effort: never blocks the price data)
    if not args.no_holdings and os.environ.get("FETCH_HOLDINGS", "1") != "0":
        got = 0
        todo = [e for e in entries if holdings_eligible(e)]
        log(f"\nTop holdings for {len(todo)} funds ...")
        for e in todo:
            try:
                h = fetch_holdings(holdings_symbols(e))
                payload = {"id": e["id"], "asOf": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "source": "yfinance", **h}
                write_json(out_dir / "holdings" / f"{e['id']}.json", payload)
                got += 1
                log(f"  ok   {e['id']:10s} {len(h['top'])} holdings via {h['symbol']}")
            except Exception as exc:  # noqa: BLE001
                log(f"  skip {e['id']:10s} {exc}")
            time.sleep(REQUEST_PAUSE_SECONDS)
        log(f"Holdings: {got}/{len(todo)} funds.")
    manifest = build_manifest(out_dir, failed, SOURCE_ORDER)
    write_json(out_dir / "manifest.json", manifest)
    log(f"Wrote {len(results)} series files and manifest.json to {out_dir}")
    if failed:
        log("Failed (kept previous data where it existed):")
        for f in failed:
            log(f"  - {f['id']}: {f['reason']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
