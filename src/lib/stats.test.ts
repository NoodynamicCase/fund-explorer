import { describe, expect, it } from 'vitest'
import type { Series } from '../types'
import { parseISO } from './format'
import { DAY } from './series'
import {
  annualise,
  bestWorstYear,
  betaCorrelation,
  calendarYears,
  crisisResult,
  maxDrawdown,
  periodsPerYear,
  stdev,
  trailingReturn,
  windowStats,
} from './stats'
import { drawdownLine, rebased, sliceRange, valueNear } from './series'
import { CRISES } from './crises'

function mk(id: string, startISO: string, values: number[], stepDays = 7): Series {
  const t0 = parseISO(startISO)
  return { id, t: values.map((_, i) => t0 + i * stepDays * DAY), v: values, meta: {} }
}

describe('basic helpers', () => {
  it('stdev uses the sample formula', () => {
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4)
  })
  it('annualise', () => {
    expect(annualise(1, 2)).toBeCloseTo(Math.SQRT2 - 1, 10)
  })
  it('detects weekly vs monthly data', () => {
    expect(periodsPerYear(mk('w', '2020-01-03', [1, 2, 3, 4, 5]).t)).toBe(52)
    expect(periodsPerYear(mk('m', '2020-01-01', [1, 2, 3, 4, 5], 30.4).t)).toBe(12)
  })
})

describe('slicing, rebasing and drawdown line', () => {
  const s = mk('x', '2020-01-03', [100, 110, 99, 120, 90])
  it('slices from the first point on/after `from`', () => {
    const r = sliceRange(s, parseISO('2020-01-12'), undefined)!
    expect(r.i0).toBe(2) // 2020-01-17
    expect(r.i1).toBe(4)
  })
  it('rebases to 100 at the first in-window point', () => {
    const line = rebased(s, parseISO('2020-01-10'), undefined)!
    expect(line.v[0]).toBe(100)
    expect(line.v[1]).toBeCloseTo((99 / 110) * 100, 10)
  })
  it('drawdown line is percent below the running peak since window start', () => {
    const line = drawdownLine(s, undefined, undefined)!
    expect(line.v[0]).toBe(0)
    expect(line.v[1]).toBe(0)
    expect(line.v[2]).toBeCloseTo((99 / 110 - 1) * 100, 10)
    expect(line.v[3]).toBe(0)
    expect(line.v[4]).toBeCloseTo((90 / 120 - 1) * 100, 10)
  })
  it('valueNear finds the closest point or nothing', () => {
    const line = { t: [0, 7 * DAY, 14 * DAY], v: [1, 2, 3] }
    expect(valueNear(line, 8 * DAY, 4 * DAY)).toEqual({ t: 7 * DAY, v: 2 })
    expect(valueNear(line, 40 * DAY, 4 * DAY)).toBeNull()
  })
})

describe('maxDrawdown', () => {
  it('finds depth, dates and recovery', () => {
    const s = mk('x', '2020-01-03', [100, 120, 90, 100, 125, 80])
    const d = maxDrawdown(s.t, s.v)
    // the deepest fall is 125 -> 80 = -36%, not recovered
    expect(d.depth).toBeCloseTo(80 / 125 - 1, 10)
    expect(d.peak).toBe(s.t[4])
    expect(d.trough).toBe(s.t[5])
    expect(d.recovery).toBeNull()
  })
  it('reports recovery date when the old peak is regained', () => {
    const s = mk('x', '2020-01-03', [100, 120, 90, 100, 121, 130])
    const d = maxDrawdown(s.t, s.v)
    expect(d.depth).toBeCloseTo(90 / 120 - 1, 10)
    expect(d.recovery).toBe(s.t[4])
  })
  it('is zero for a series that only rises', () => {
    const s = mk('x', '2020-01-03', [1, 2, 3])
    expect(maxDrawdown(s.t, s.v).depth).toBe(0)
  })
})

describe('windowStats', () => {
  // 53 weekly points growing exactly 1% each week
  const values = Array.from({ length: 53 }, (_, i) => 100 * Math.pow(1.01, i))
  const s = mk('g', '2020-01-03', values)
  it('computes return, annualised return and zero volatility for a constant growth rate', () => {
    const w = windowStats(s, undefined, undefined)!
    expect(w.totalReturn).toBeCloseTo(Math.pow(1.01, 52) - 1, 10)
    expect(w.years).toBeCloseTo((52 * 7) / 365.25, 6)
    expect(w.cagr).toBeCloseTo(Math.pow(1 + w.totalReturn, 1 / w.years) - 1, 10)
    expect(w.vol).toBeCloseTo(0, 8)
    expect(w.maxDrawdown.depth).toBe(0)
    expect(w.pctPositive).toBe(1)
    expect(w.periodsPerYear).toBe(52)
  })
  it('annualises volatility by sqrt(periods per year)', () => {
    // alternating +2% / -1% weekly returns
    const v: number[] = [100]
    for (let i = 0; i < 40; i++) v.push(v[v.length - 1] * (i % 2 === 0 ? 1.02 : 0.99))
    const w = windowStats(mk('a', '2020-01-03', v), undefined, undefined)!
    expect(w.vol).toBeCloseTo(stdev([0.02, -0.01, 0.02, -0.01].concat(Array(36).fill(0).map((_, i) => (i % 2 === 0 ? 0.02 : -0.01)))) * Math.sqrt(52), 6)
  })
  it('does not annualise windows shorter than a year', () => {
    const w = windowStats(s, undefined, parseISO('2020-03-27'))!
    expect(w.cagr).toBeNull()
  })
  it('sharpe subtracts the risk-free rate', () => {
    const v: number[] = [100]
    for (let i = 0; i < 52; i++) v.push(v[v.length - 1] * (i % 2 === 0 ? 1.02 : 0.99))
    const a = windowStats(mk('a', '2020-01-03', v), undefined, undefined, 0)!
    const b = windowStats(mk('a', '2020-01-03', v), undefined, undefined, 0.03)!
    expect(a.sharpe! - b.sharpe!).toBeCloseTo(0.03 / a.vol!, 10)
  })
  it('returns null when fewer than two points fall in the window', () => {
    expect(windowStats(s, parseISO('2030-01-01'), undefined)).toBeNull()
  })
})

describe('trailing returns', () => {
  const s = mk('t', '2000-01-07', Array.from({ length: 1200 }, (_, i) => 100 * Math.pow(1.002, i)))
  it('gives the same annual rate for 1y and 5y when growth is constant', () => {
    const annual = Math.pow(1.002, 365.25 / 7) - 1
    expect(trailingReturn(s, 1)!).toBeCloseTo(annual, 3)
    expect(trailingReturn(s, 5)!).toBeCloseTo(annual, 3)
  })
  it('is null when history is too short', () => {
    expect(trailingReturn(mk('s', '2024-01-05', [1, 2, 3, 4]), 5)).toBeNull()
  })
})

describe('calendar years', () => {
  it('computes year-end to year-end and drops the first (partial) year', () => {
    const s: Series = {
      id: 'c',
      t: [parseISO('2019-06-14'), parseISO('2019-12-27'), parseISO('2020-06-12'), parseISO('2020-12-25'), parseISO('2021-12-31')],
      v: [100, 110, 120, 132, 119.8],
      meta: {},
    }
    const years = calendarYears(s)
    expect(years.map((y) => y.year)).toEqual([2020, 2021])
    expect(years[0].ret).toBeCloseTo(132 / 110 - 1, 10)
    expect(years[1].ret).toBeCloseTo(119.8 / 132 - 1, 10)
    const bw = bestWorstYear(s)!
    expect(bw.best.year).toBe(2020)
    expect(bw.worst.year).toBe(2021)
  })
  it('marks a still-running year as partial and excludes it from best/worst', () => {
    const s: Series = {
      id: 'c',
      t: [parseISO('2019-12-27'), parseISO('2020-12-25'), parseISO('2021-03-05')],
      v: [100, 110, 50],
      meta: {},
    }
    expect(calendarYears(s).find((y) => y.year === 2021)!.partial).toBe(true)
    expect(bestWorstYear(s)!.worst.year).toBe(2020)
  })
})

describe('beta and correlation', () => {
  it('a fund that moves twice as much as the benchmark has beta 2 and correlation 1', () => {
    const br = [0.01, -0.02, 0.015, 0.0, -0.01, 0.02, 0.005, -0.015, 0.01, 0.0, 0.02, -0.01, 0.01, 0.015, -0.02, 0.01, 0.0, 0.01, -0.005, 0.02, 0.01, -0.01]
    const bench: number[] = [100]
    const fund: number[] = [100]
    for (const r of br) {
      bench.push(bench[bench.length - 1] * (1 + r))
      fund.push(fund[fund.length - 1] * (1 + 2 * r))
    }
    const b = mk('b', '2020-01-03', bench)
    const f = mk('f', '2020-01-03', fund)
    const res = betaCorrelation(f, b, undefined, undefined)!
    expect(res.beta).toBeCloseTo(2, 10)
    expect(res.corr).toBeCloseTo(1, 10)
  })
  it('needs enough matching dates', () => {
    const b = mk('b', '2020-01-03', [1, 2, 3, 4, 5])
    expect(betaCorrelation(b, b, undefined, undefined)).toBeNull()
  })
})

describe('crisis results', () => {
  const dotcom = CRISES.find((c) => c.id === 'dotcom')!
  it('is null when the fund did not exist at the peak', () => {
    expect(crisisResult(mk('n', '2005-01-07', Array(300).fill(100)), dotcom)).toBeNull()
  })
  it('measures return and drawdown between the peak and trough dates', () => {
    // weekly points from 2000-01-07; value falls 40% linearly between the two crisis dates
    const t0 = parseISO('2000-01-07')
    const peak = parseISO(dotcom.peak)
    const trough = parseISO(dotcom.trough)
    const t: number[] = []
    const v: number[] = []
    for (let x = t0; x <= parseISO('2003-06-27'); x += 7 * DAY) {
      t.push(x)
      if (x < peak) v.push(100)
      else if (x <= trough) v.push(100 - (60 * (x - peak)) / (trough - peak))
      else v.push(40)
    }
    const res = crisisResult({ id: 'c', t, v, meta: {} }, dotcom)!
    expect(res.ret).toBeLessThan(-0.55)
    expect(res.ret).toBeGreaterThan(-0.62)
    expect(res.drawdown).toBeCloseTo(res.ret, 6) // monotone fall: drawdown equals return
  })
})
