import type { CatalogFund, Series } from '../types'
import { DAY, floorIndex, medianGap } from './series'

export type Rebalance = 'never' | 'monthly' | 'quarterly' | 'yearly'

export const REBALANCE_OPTIONS: { value: Rebalance; label: string; code: string }[] = [
  { value: 'never', label: 'Never (buy and hold)', code: 'n' },
  { value: 'monthly', label: 'Every month', code: 'm' },
  { value: 'quarterly', label: 'Every quarter', code: 'q' },
  { value: 'yearly', label: 'Every year', code: 'y' },
]
export const DEFAULT_REBALANCE: Rebalance = 'yearly'

export const MIX_ID = 'MIX'

/** Stand-in catalog entry so the user's mix can sit in the same table and legend as real funds. */
export const MIX_FUND: CatalogFund = {
  id: MIX_ID,
  name: 'My mix',
  short: 'My mix',
  kind: 'benchmark',
  assetClass: 'reference',
  category: 'Your mix',
  region: 'us',
  mix: 'other',
  equityPct: null,
  wrapper: 'reference',
  index: 'Calculated here from the weights you entered',
  tickers: {},
  data: { type: 'mix' },
  purpose: 'Shows how the weights you entered would have performed together.',
  overview: 'Computed in your browser from the weekly returns of the funds you chose.',
  goal: 'Show how your mix would have behaved.',
}

export interface MixPart {
  id: string
  weight: number
  series: Series
}

export interface MixResult {
  series: Series
  start: number
  end: number
  /** The fund whose short history set the start date (only when it is later than the others). */
  limitedBy?: string
  /** Weights scaled to add up to 1. */
  weights: Record<string, number>
}

function periodKey(ms: number, rb: Rebalance): number {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  if (rb === 'monthly') return y * 12 + m
  if (rb === 'quarterly') return y * 4 + Math.floor(m / 3)
  if (rb === 'yearly') return y
  return 0
}

/**
 * Value of a constant-weight mix of several series (index 100 at the start).
 *
 * The mix starts when the youngest fund starts and ends when the earliest-ending fund ends.
 * Between rebalancing dates each holding drifts with its own return; on a rebalancing date the
 * weights are reset. With "never" the holdings simply drift (buy and hold).
 */
export function blendMix(parts: MixPart[], rb: Rebalance): MixResult | null {
  const live = parts.filter((p) => Number.isFinite(p.weight) && p.weight > 0 && p.series.t.length >= 2)
  if (live.length === 0) return null
  const total = live.reduce((a, p) => a + p.weight, 0)
  const w = live.map((p) => p.weight / total)

  const start = Math.max(...live.map((p) => p.series.t[0]))
  const end = Math.min(...live.map((p) => p.series.t[p.series.t.length - 1]))
  if (end - start < 14 * DAY) return null

  // Dates: those of the weekly series (monthly ones like cash are carried forward onto them).
  const weekly = live.filter((p) => medianGap(p.series.t) <= 10 * DAY)
  const sources = weekly.length > 0 ? weekly : live
  const grid = [...new Set(sources.flatMap((p) => p.series.t.filter((t) => t >= start && t <= end)))].sort((a, b) => a - b)
  if (grid.length < 3) return null

  const price = (p: MixPart, x: number) => p.series.v[Math.max(0, floorIndex(p.series.t, x))]
  let prev = live.map((p) => price(p, grid[0]))
  let h = w.slice()
  let value = 100
  const t: number[] = [grid[0]]
  const v: number[] = [value]
  for (let k = 1; k < grid.length; k++) {
    const cur = live.map((p) => price(p, grid[k]))
    let sum = 0
    for (let i = 0; i < h.length; i++) {
      h[i] *= cur[i] / prev[i]
      sum += h[i]
    }
    value *= sum
    for (let i = 0; i < h.length; i++) h[i] /= sum
    if (rb !== 'never' && periodKey(grid[k], rb) !== periodKey(grid[k - 1], rb)) h = w.slice()
    prev = cur
    t.push(grid[k])
    v.push(value)
  }

  const firsts = live.map((p) => p.series.t[0])
  const latest = Math.max(...firsts)
  const earliest = Math.min(...firsts)
  const limitedBy = latest - earliest > 30 * DAY ? live[firsts.indexOf(latest)].id : undefined
  const weights: Record<string, number> = {}
  live.forEach((p, i) => (weights[p.id] = w[i]))
  return { series: { id: MIX_ID, t, v, meta: {} }, start, end, limitedBy, weights }
}

/** "50% S&P 500 + 50% Total Bond Market" */
export function describeMix(weights: Record<string, number>, nameOf: (id: string) => string): string {
  return Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .map(([id, w]) => `${Math.round(w * 1000) / 10}% ${nameOf(id)}`)
    .join(' + ')
}

export function equalWeights(ids: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  if (ids.length === 0) return out
  const each = Math.round((100 / ids.length) * 10) / 10
  for (const id of ids) out[id] = each
  return out
}
