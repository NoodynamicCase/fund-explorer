import type { Series, SeriesFile } from '../types'
import { parseISO } from './format'

export const DAY = 86_400_000
export const YEAR = 365.25 * DAY

export function toSeries(file: SeriesFile): Series {
  const { dates, values, ...meta } = file
  const t: number[] = []
  const v: number[] = []
  for (let i = 0; i < dates.length; i++) {
    const ms = parseISO(dates[i])
    const val = values[i]
    if (Number.isFinite(ms) && Number.isFinite(val) && val > 0) {
      t.push(ms)
      v.push(val)
    }
  }
  return { id: file.id, t, v, meta }
}

/** First index with t[i] >= x (t.length if none). */
export function lowerBound(t: number[], x: number): number {
  let lo = 0
  let hi = t.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (t[mid] < x) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Last index with t[i] <= x (-1 if none). */
export function floorIndex(t: number[], x: number): number {
  let lo = 0
  let hi = t.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (t[mid] <= x) lo = mid + 1
    else hi = mid
  }
  return lo - 1
}

export interface Range {
  i0: number
  i1: number
}

/** Indices of the first point on/after `from` and the last point on/before `to`. Needs >= 2 points. */
export function sliceRange(s: { t: number[] }, from: number | undefined, to: number | undefined): Range | null {
  if (s.t.length < 2) return null
  const i0 = from === undefined ? 0 : lowerBound(s.t, from)
  const i1 = to === undefined ? s.t.length - 1 : floorIndex(s.t, to)
  if (i0 >= s.t.length || i1 < 0 || i1 - i0 < 1) return null
  return { i0, i1 }
}

export interface Line {
  t: number[]
  v: number[]
}

/** The window's points, indexed to 100 at the first point in the window. */
export function rebased(s: Series, from: number | undefined, to: number | undefined): Line | null {
  const r = sliceRange(s, from, to)
  if (!r) return null
  const base = s.v[r.i0]
  const t = s.t.slice(r.i0, r.i1 + 1)
  const v = s.v.slice(r.i0, r.i1 + 1).map((x) => (x / base) * 100)
  return { t, v }
}

/** The window's points, unchanged (index = 100 at the fund's own first date). */
export function raw(s: Series, from: number | undefined, to: number | undefined): Line | null {
  const r = sliceRange(s, from, to)
  if (!r) return null
  return { t: s.t.slice(r.i0, r.i1 + 1), v: s.v.slice(r.i0, r.i1 + 1) }
}

/** Percent below the running peak (0 at a new high, -23.4 = 23.4% below peak). Peak starts at the window start. */
export function drawdownLine(s: Series, from: number | undefined, to: number | undefined): Line | null {
  const r = sliceRange(s, from, to)
  if (!r) return null
  const t = s.t.slice(r.i0, r.i1 + 1)
  const src = s.v.slice(r.i0, r.i1 + 1)
  let peak = src[0]
  const v = src.map((x) => {
    if (x > peak) peak = x
    return (x / peak - 1) * 100
  })
  return { t, v }
}

/** Value of the last point on or before x, only if that point is within maxGapMs of x. */
export function valueNear(line: Line, x: number, maxGapMs: number): { t: number; v: number } | null {
  const i = floorIndex(line.t, x)
  const j = i + 1
  let best = -1
  let bestGap = Infinity
  for (const k of [i, j]) {
    if (k >= 0 && k < line.t.length) {
      const gap = Math.abs(line.t[k] - x)
      if (gap < bestGap) {
        bestGap = gap
        best = k
      }
    }
  }
  if (best < 0 || bestGap > maxGapMs) return null
  return { t: line.t[best], v: line.v[best] }
}

/** Typical gap between points, in ms (median). */
export function medianGap(t: number[]): number {
  if (t.length < 2) return 7 * DAY
  const gaps: number[] = []
  for (let i = 1; i < t.length; i++) gaps.push(t[i] - t[i - 1])
  gaps.sort((a, b) => a - b)
  return gaps[gaps.length >> 1]
}
