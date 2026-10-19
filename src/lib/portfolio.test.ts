import { describe, expect, it } from 'vitest'
import type { Series } from '../types'
import { DAY } from './series'
import { blendMix, equalWeights, describeMix } from './portfolio'

const T0 = Date.UTC(2020, 0, 3) // a Friday
function weekly(id: string, values: number[], offsetWeeks = 0): Series {
  return { id, t: values.map((_, i) => T0 + (i + offsetWeeks) * 7 * DAY), v: values, meta: {} }
}

describe('blendMix', () => {
  it('buy and hold equals the weighted average of each fund’s growth', () => {
    const a = weekly('A', [100, 110, 121, 133.1])
    const b = weekly('B', [100, 100, 100, 100])
    const r = blendMix([{ id: 'A', weight: 50, series: a }, { id: 'B', weight: 50, series: b }], 'never')!
    expect(r.series.v[0]).toBeCloseTo(100)
    expect(r.series.v[3]).toBeCloseTo(50 * 1.331 + 50, 6)
  })

  it('rebalancing every month differs from buy and hold when returns differ', () => {
    const a = weekly('A', Array.from({ length: 30 }, (_, i) => 100 * 1.02 ** i))
    const b = weekly('B', Array.from({ length: 30 }, () => 100))
    const hold = blendMix([{ id: 'A', weight: 1, series: a }, { id: 'B', weight: 1, series: b }], 'never')!
    const monthly = blendMix([{ id: 'A', weight: 1, series: a }, { id: 'B', weight: 1, series: b }], 'monthly')!
    // Letting the winner run beats trimming it back to half each month
    expect(hold.series.v.at(-1)!).toBeGreaterThan(monthly.series.v.at(-1)!)
    expect(monthly.series.v.at(-1)!).toBeGreaterThan(100)
  })

  it('weights are scaled, so dollar amounts work', () => {
    const a = weekly('A', [100, 120, 130])
    const b = weekly('B', [100, 90, 95])
    const pct = blendMix([{ id: 'A', weight: 50, series: a }, { id: 'B', weight: 50, series: b }], 'never')!
    const usd = blendMix([{ id: 'A', weight: 5000, series: a }, { id: 'B', weight: 5000, series: b }], 'never')!
    expect(usd.series.v).toEqual(pct.series.v)
    expect(usd.weights.A).toBeCloseTo(0.5)
  })

  it('starts when the youngest fund starts and says which one limited it', () => {
    const old = weekly('OLD', Array.from({ length: 60 }, (_, i) => 100 + i))
    const young = weekly('YOUNG', Array.from({ length: 20 }, (_, i) => 50 + i), 40)
    const r = blendMix([{ id: 'OLD', weight: 1, series: old }, { id: 'YOUNG', weight: 1, series: young }], 'yearly')!
    expect(r.start).toBe(young.t[0])
    expect(r.limitedBy).toBe('YOUNG')
    expect(r.series.t[0]).toBe(young.t[0])
  })

  it('carries a monthly series (like cash) forward onto weekly dates', () => {
    const a = weekly('A', Array.from({ length: 20 }, (_, i) => 100 + i))
    const cash: Series = { id: 'CASH', t: [T0 - 30 * DAY, T0 + 28 * DAY, T0 + 58 * DAY, T0 + 88 * DAY, T0 + 118 * DAY], v: [100, 100.3, 100.6, 100.9, 101.2], meta: {} }
    const r = blendMix([{ id: 'A', weight: 1, series: a }, { id: 'CASH', weight: 1, series: cash }], 'monthly')!
    expect(r.series.t.length).toBeGreaterThan(10)
    expect(r.series.t.every((t) => a.t.includes(t))).toBe(true)
  })

  it('returns null with no usable weights or too little overlap', () => {
    const a = weekly('A', [100, 101, 102])
    expect(blendMix([{ id: 'A', weight: 0, series: a }], 'never')).toBeNull()
    const b = weekly('B', [100, 101, 102], 30)
    expect(blendMix([{ id: 'A', weight: 1, series: a }, { id: 'B', weight: 1, series: b }], 'never')).toBeNull()
  })
})

describe('helpers', () => {
  it('equalWeights splits evenly', () => {
    expect(equalWeights(['A', 'B', 'C'])).toEqual({ A: 33.3, B: 33.3, C: 33.3 })
    expect(equalWeights([])).toEqual({})
  })
  it('describeMix lists the biggest first', () => {
    expect(describeMix({ A: 0.3, B: 0.7 }, (id) => id)).toBe('70% B + 30% A')
  })
})
