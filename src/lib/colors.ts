// Categorical palette from the validated reference set (adjacent pairs pass the
// colour-vision and contrast checks). Slots are handed out in fixed order and never
// cycled, so the chart is capped at MAX_COLORED lines plus a few neutral benchmark lines.
export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
export const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']

/** Benchmarks are drawn in neutral ink with different dash patterns. */
export const BENCH_LIGHT = ['#0b0b0b', '#52514e', '#898781', '#0b0b0b']
export const BENCH_DARK = ['#f0efec', '#c3c2b7', '#898781', '#f0efec']
export const BENCH_DASH: ('dashed' | 'dotted')[] = ['dashed', 'dotted', 'dashed', 'dotted']
export const BENCH_DASH_ARRAY = ['8,5', '2,4', '14,4,2,4', '5,4']

export const MAX_COLORED = SERIES_LIGHT.length
export const MAX_BENCH = BENCH_LIGHT.length

export interface Slot {
  kind: 'series' | 'bench'
  index: number
}

/**
 * Keep each fund's colour stable: funds that stay selected keep their slot, new
 * funds take the lowest free slot of their kind. Returns undefined for a fund that
 * does not fit (all slots of its kind are taken).
 */
export function assignSlots(
  prev: Record<string, Slot>,
  selected: { id: string; bench: boolean }[],
): Record<string, Slot | undefined> {
  const out: Record<string, Slot | undefined> = {}
  const used = { series: new Set<number>(), bench: new Set<number>() }
  for (const f of selected) {
    const p = prev[f.id]
    const kind = f.bench ? 'bench' : 'series'
    if (p && p.kind === kind && !used[kind].has(p.index)) {
      out[f.id] = p
      used[kind].add(p.index)
    }
  }
  for (const f of selected) {
    if (out[f.id]) continue
    const kind = f.bench ? 'bench' : 'series'
    const cap = f.bench ? MAX_BENCH : MAX_COLORED
    let i = 0
    while (i < cap && used[kind].has(i)) i++
    if (i < cap) {
      out[f.id] = { kind, index: i }
      used[kind].add(i)
    } else {
      out[f.id] = undefined
    }
  }
  return out
}
