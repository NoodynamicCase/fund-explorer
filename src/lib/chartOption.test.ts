import { describe, expect, it } from 'vitest'
import { buildOption, tooltipRows, type ChartInput, type DisplayLine } from './chartOption'
import { DAY } from './series'
import { parseISO } from './format'

const tokens = { ink: '#000', ink2: '#333', muted: '#888', grid: '#eee', axis: '#ccc', surface: '#fff', band: 'rgba(0,0,0,.06)', bandText: '#666', watermark: 'rgba(0,0,0,.05)' }
const t0 = parseISO('2000-01-07')
const mkLine = (id: string, startOffsetWeeks: number, n: number, f: (i: number) => number, bench = false): DisplayLine => ({
  id, name: `Fund ${id}`, short: id, color: '#2a78d6', bench,
  line: { t: Array.from({ length: n }, (_, i) => t0 + (startOffsetWeeks + i) * 7 * DAY), v: Array.from({ length: n }, (_, i) => f(i)) },
})
const base = (lines: DisplayLine[]): ChartInput => ({
  lines, view: 'perf', log: false, rebase: true, from: t0, to: t0 + 200 * 7 * DAY, fullFrom: t0, fullTo: t0 + 200 * 7 * DAY,
  shade: true, tokens, sample: false, narrow: false,
})

describe('tooltip rows', () => {
  it('lists only funds that have data near the hovered date, highest first', () => {
    const early = mkLine('A', 0, 100, (i) => 100 + i)
    const late = mkLine('B', 50, 100, (i) => 100 - i * 0.1)
    const rowsEarly = tooltipRows([early, late], t0 + 10 * 7 * DAY, 'perf', true)
    expect(rowsEarly.map((r) => r.id)).toEqual(['A']) // B has not started yet
    const rowsLate = tooltipRows([early, late], t0 + 80 * 7 * DAY, 'perf', true)
    expect(rowsLate.map((r) => r.id)).toEqual(['A', 'B'])
    expect(rowsLate[0].text).toContain('(+') // shows growth versus the window start
  })
  it('does not show a fund after its data ends', () => {
    const a = mkLine('A', 0, 20, (i) => 100 + i)
    expect(tooltipRows([a], t0 + 100 * 7 * DAY, 'perf', true)).toEqual([])
  })
  it('formats drawdowns as percent below peak', () => {
    const a = mkLine('A', 0, 20, () => -12.34)
    expect(tooltipRows([a], t0 + 5 * 7 * DAY, 'dd', true)[0].text).toBe('-12.3%')
  })
})

describe('buildOption', () => {
  it('gives each line its own series with id, and labels the line ends only when there are few lines', () => {
    const few = buildOption(base([mkLine('A', 0, 50, (i) => 100 + i), mkLine('B', 0, 50, (i) => 100 - i)]))
    expect(few.series.map((s) => s.id)).toEqual(['A', 'B'])
    expect(few.series[0].endLabel.show).toBe(true)
    const many = buildOption(base(Array.from({ length: 6 }, (_, k) => mkLine(`F${k}`, 0, 50, (i) => 100 + i))))
    expect(many.series[0].endLabel.show).toBe(false)
  })
  it('applies manual y-axis limits and the log scale', () => {
    const o = buildOption({ ...base([mkLine('A', 0, 50, (i) => 100 + i)]), log: true, ymin: 50, ymax: 400 })
    expect(o.yAxis.type).toBe('log')
    expect((o.yAxis as { min?: number }).min).toBe(50)
    expect((o.yAxis as { max?: number }).max).toBe(400)
  })
  it('caps the drawdown axis at zero', () => {
    const o = buildOption({ ...base([mkLine('A', 0, 50, () => -5)]), view: 'dd', ddmin: -60 })
    expect((o.yAxis as { max?: number }).max).toBe(0)
    expect((o.yAxis as { min?: number }).min).toBe(-60)
  })
  it('only draws crisis bands that overlap the window and when shading is on', () => {
    const lines = [mkLine('A', 0, 50, (i) => 100 + i)]
    const none = buildOption({ ...base(lines), shade: false })
    expect(none.series[0].markArea).toBeUndefined()
    const dotcom = buildOption({ ...base(lines), to: parseISO('2003-12-31'), fullTo: parseISO('2003-12-31') })
    expect(dotcom.series[0].markArea?.data).toHaveLength(1)
  })
})
