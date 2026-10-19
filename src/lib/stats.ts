import type { Series } from '../types'
import type { Crisis } from './crises'
import { DAY, YEAR, floorIndex, medianGap, sliceRange } from './series'
import { parseISO } from './format'

export interface Drawdown {
  /** Negative fraction, e.g. -0.34 */
  depth: number
  peak: number
  trough: number
  /** First date after the trough when the old peak was regained, if that happened inside the window. */
  recovery: number | null
}

export interface WindowStats {
  start: number
  end: number
  years: number
  totalReturn: number
  /** Annualised return; null for windows shorter than a year. */
  cagr: number | null
  vol: number | null
  downsideDev: number | null
  sharpe: number | null
  sortino: number | null
  maxDrawdown: Drawdown
  pctPositive: number | null
  periodsPerYear: number
}

/** A 52-week window counts as a year, so '1Y' ranges show an annualised figure. */
export const MIN_YEARS_TO_ANNUALISE = 0.95

export function periodsPerYear(t: number[]): number {
  const gapDays = medianGap(t) / DAY
  return Math.min(52, Math.max(12, Math.round(365.25 / gapDays)))
}

export function mean(x: number[]): number {
  let s = 0
  for (const v of x) s += v
  return s / x.length
}

export function stdev(x: number[]): number {
  if (x.length < 2) return NaN
  const m = mean(x)
  let s = 0
  for (const v of x) s += (v - m) * (v - m)
  return Math.sqrt(s / (x.length - 1))
}

export function periodReturns(v: number[]): number[] {
  const r: number[] = []
  for (let i = 1; i < v.length; i++) r.push(v[i] / v[i - 1] - 1)
  return r
}

export function annualise(totalReturn: number, years: number): number {
  return Math.pow(1 + totalReturn, 1 / years) - 1
}

/** Deepest peak-to-trough fall over the given points (peak starts at the first point). */
export function maxDrawdown(t: number[], v: number[]): Drawdown {
  let peakIdx = 0
  let best = { depth: 0, peak: 0, trough: 0 }
  for (let i = 1; i < v.length; i++) {
    if (v[i] > v[peakIdx]) peakIdx = i
    const d = v[i] / v[peakIdx] - 1
    if (d < best.depth) best = { depth: d, peak: peakIdx, trough: i }
  }
  let recovery: number | null = null
  if (best.depth < 0) {
    for (let i = best.trough + 1; i < v.length; i++) {
      if (v[i] >= v[best.peak]) {
        recovery = t[i]
        break
      }
    }
  }
  return { depth: best.depth, peak: t[best.peak], trough: t[best.trough], recovery }
}

/**
 * Statistics for one fund over a window. `rfAnnual` is the annual risk-free rate (as a
 * fraction) used for Sharpe and Sortino; pass 0 when no cash series is available.
 */
export function windowStats(
  s: Series,
  from: number | undefined,
  to: number | undefined,
  rfAnnual = 0,
): WindowStats | null {
  const r = sliceRange(s, from, to)
  if (!r) return null
  const t = s.t.slice(r.i0, r.i1 + 1)
  const v = s.v.slice(r.i0, r.i1 + 1)
  const years = (t[t.length - 1] - t[0]) / YEAR
  const totalReturn = v[v.length - 1] / v[0] - 1
  const ppy = periodsPerYear(t)
  const rets = periodReturns(v)
  const enough = rets.length >= 8
  const vol = enough ? stdev(rets) * Math.sqrt(ppy) : null
  const rfPeriod = rfAnnual / ppy
  let downsideDev: number | null = null
  if (enough) {
    let ss = 0
    for (const x of rets) {
      const d = Math.min(x - rfPeriod, 0)
      ss += d * d
    }
    downsideDev = Math.sqrt(ss / rets.length) * Math.sqrt(ppy)
  }
  const excess = enough ? mean(rets) * ppy - rfAnnual : null
  return {
    start: t[0],
    end: t[t.length - 1],
    years,
    totalReturn,
    cagr: years >= MIN_YEARS_TO_ANNUALISE ? annualise(totalReturn, years) : null,
    vol,
    downsideDev,
    sharpe: excess !== null && vol ? excess / vol : null,
    sortino: excess !== null && downsideDev ? excess / downsideDev : null,
    maxDrawdown: maxDrawdown(t, v),
    pctPositive: enough ? rets.filter((x) => x > 0).length / rets.length : null,
    periodsPerYear: ppy,
  }
}

/**
 * Annualised return over the last `years` years ending at the series' final point, using
 * the point closest to that start date. Null if the history is shorter than that.
 */
export function trailingReturn(s: Series, years: number): number | null {
  if (s.t.length < 2) return null
  const end = s.t[s.t.length - 1]
  const target = end - years * YEAR
  if (s.t[0] > target + 10 * DAY) return null
  const lo = Math.max(0, floorIndex(s.t, target))
  const hi = Math.min(s.t.length - 1, lo + 1)
  const i = Math.abs(s.t[hi] - target) < Math.abs(target - s.t[lo]) ? hi : lo
  if (i >= s.t.length - 1) return null
  const total = s.v[s.v.length - 1] / s.v[i] - 1
  return annualise(total, (end - s.t[i]) / YEAR)
}

export interface CalendarYear {
  year: number
  ret: number
  partial: boolean
}

/** Calendar-year returns (year-end to year-end). The first year and a still-running year are flagged or skipped. */
export function calendarYears(s: Series): CalendarYear[] {
  if (s.t.length < 2) return []
  const lastOfYear = new Map<number, number>() // year -> value of last point in that year
  const lastDateOfYear = new Map<number, number>()
  for (let i = 0; i < s.t.length; i++) {
    const y = new Date(s.t[i]).getUTCFullYear()
    lastOfYear.set(y, s.v[i])
    lastDateOfYear.set(y, s.t[i])
  }
  const years = [...lastOfYear.keys()].sort((a, b) => a - b)
  const lastYear = years[years.length - 1]
  const monthly = periodsPerYear(s.t) <= 12
  const out: CalendarYear[] = []
  for (let k = 1; k < years.length; k++) {
    const y = years[k]
    const prev = lastOfYear.get(years[k - 1])!
    if (years[k - 1] !== y - 1) continue // gap in history
    const end = lastDateOfYear.get(y)!
    const endDate = new Date(end)
    const finished = monthly ? endDate.getUTCMonth() === 11 : end >= Date.UTC(y, 11, 24)
    out.push({ year: y, ret: lastOfYear.get(y)! / prev - 1, partial: y === lastYear && !finished })
  }
  return out
}

export function bestWorstYear(s: Series): { best: CalendarYear; worst: CalendarYear } | null {
  const full = calendarYears(s).filter((y) => !y.partial)
  if (full.length === 0) return null
  let best = full[0]
  let worst = full[0]
  for (const y of full) {
    if (y.ret > best.ret) best = y
    if (y.ret < worst.ret) worst = y
  }
  return { best, worst }
}

/** Beta and correlation of weekly returns versus a benchmark over a window, matched on exact dates. */
export function betaCorrelation(
  s: Series,
  bench: Series,
  from: number | undefined,
  to: number | undefined,
): { beta: number; corr: number } | null {
  const r = sliceRange(s, from, to)
  if (!r) return null
  const benchAt = new Map<number, number>()
  for (let i = 0; i < bench.t.length; i++) benchAt.set(bench.t[i], bench.v[i])
  const fv: number[] = []
  const bv: number[] = []
  for (let i = r.i0; i <= r.i1; i++) {
    const b = benchAt.get(s.t[i])
    if (b !== undefined) {
      fv.push(s.v[i])
      bv.push(b)
    }
  }
  if (fv.length < 21) return null
  const fr = periodReturns(fv)
  const br = periodReturns(bv)
  const mf = mean(fr)
  const mb = mean(br)
  let cov = 0
  let varB = 0
  let varF = 0
  for (let i = 0; i < fr.length; i++) {
    cov += (fr[i] - mf) * (br[i] - mb)
    varB += (br[i] - mb) ** 2
    varF += (fr[i] - mf) ** 2
  }
  if (varB === 0 || varF === 0) return null
  return { beta: cov / varB, corr: cov / Math.sqrt(varB * varF) }
}

export interface CrisisResult {
  /** Total return from the market peak date to its trough date. */
  ret: number
  /** Deepest fall inside that period. */
  drawdown: number
}

/** How a fund behaved between the S&P 500's peak and trough. Null if the fund did not exist at the peak. */
export function crisisResult(s: Series, c: Crisis): CrisisResult | null {
  const peak = parseISO(c.peak)
  const trough = parseISO(c.trough)
  if (s.t.length < 2 || s.t[0] > peak + 14 * DAY) return null
  if (s.t[s.t.length - 1] < trough - 7 * DAY) return null
  // start from the last point on/before the peak (fund was trading), end at last point on/before the trough
  const i0 = Math.max(0, floorIndex(s.t, peak))
  const i1 = floorIndex(s.t, trough)
  if (i1 - i0 < 1) return null
  const t = s.t.slice(i0, i1 + 1)
  const v = s.v.slice(i0, i1 + 1)
  return { ret: v[v.length - 1] / v[0] - 1, drawdown: maxDrawdown(t, v).depth }
}


/** Annualised cash return over a window, used as the risk-free rate. 0 if cash data is missing or the window is very short. */
export function riskFreeRate(cash: Series | undefined, from: number | undefined, to: number | undefined): number {
  if (!cash) return 0
  const w = windowStats(cash, from, to)
  if (!w || w.years < 0.25) return 0
  return annualise(w.totalReturn, w.years)
}
