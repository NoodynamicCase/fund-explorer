import type { ViewMode } from '../types'
import { CRISES } from './crises'
import { fmtDate, fmtMonth, parseISO } from './format'
import { DAY, medianGap, valueNear, type Line } from './series'

export interface DisplayLine {
  id: string
  name: string
  short: string
  color: string
  /** SVG dash pattern for benchmark lines; undefined = solid. */
  dash?: string
  bench: boolean
  /** The user's own mix: drawn solid, heavier, and on top. */
  thick?: boolean
  line: Line
}

export interface ChartTokens {
  ink: string
  ink2: string
  muted: string
  grid: string
  axis: string
  surface: string
  band: string
  bandText: string
  watermark: string
}

export interface ChartInput {
  lines: DisplayLine[]
  view: ViewMode
  log: boolean
  rebase: boolean
  ymin?: number
  ymax?: number
  ddmin?: number
  from: number
  to: number
  fullFrom: number
  fullTo: number
  shade: boolean
  tokens: ChartTokens
  sample: boolean
  narrow: boolean
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function dashStyle(dash: string | undefined): string {
  if (!dash) return 'solid'
  return dash.startsWith('2,') ? 'dotted' : 'dashed'
}

export function formatTooltipValue(v: number, view: ViewMode, _rebase?: boolean): string {
  if (view === 'dd') return `${v.toFixed(1)}%`
  const level = v.toLocaleString('en-US', { maximumFractionDigits: v >= 1000 ? 0 : 1, minimumFractionDigits: v >= 1000 ? 0 : 1 })
  const change = (v / 100 - 1) * 100
  const sign = change > 0 ? '+' : ''
  const changeText = Math.abs(change) >= 1000 ? change.toLocaleString('en-US', { maximumFractionDigits: 0 }) : change.toFixed(1)
  return `${level}  (${sign}${changeText}%)`
}

/** Rows for the hover readout: every line that has a point near the hovered date, highest value first. */
export function tooltipRows(lines: DisplayLine[], x: number, view: ViewMode, rebase: boolean) {
  const rows: { id: string; name: string; color: string; dash?: string; value: number; text: string; date: number }[] = []
  for (const l of lines) {
    const gap = Math.max(4 * DAY, medianGap(l.line.t) * 0.75)
    const hit = valueNear(l.line, x, gap)
    if (hit) rows.push({ id: l.id, name: l.name, color: l.color, dash: l.dash, value: hit.v, text: formatTooltipValue(hit.v, view, rebase), date: hit.t })
  }
  rows.sort((a, b) => b.value - a.value)
  return rows
}

function tooltipHtml(input: ChartInput, x: number): string {
  const rows = tooltipRows(input.lines, x, input.view, input.rebase)
  if (rows.length === 0) return ''
  const head = `<div style="font-size:12px;opacity:.75;margin-bottom:6px">${esc(fmtDate(x))}</div>`
  const body = rows
    .map(
      (r) =>
        `<div style="display:flex;align-items:center;gap:8px;margin:3px 0">` +
        `<span style="flex:none;width:16px;border-top:3px ${dashStyle(r.dash)} ${r.color}"></span>` +
        `<b style="flex:none;min-width:92px;font-variant-numeric:tabular-nums">${esc(r.text)}</b>` +
        `<span style="opacity:.85">${esc(r.name)}</span></div>`,
    )
    .join('')
  const unit =
    input.view === 'dd'
      ? 'Below the highest point since the window start'
      : input.rebase
        ? 'Growth of 100 from the window start'
        : 'Growth of 100 from each fund’s own start'
  return `${head}${body}<div style="font-size:11px;opacity:.65;margin-top:6px">${unit}</div>`
}

export function buildOption(input: ChartInput) {
  const { tokens: tk, lines } = input
  const showEndLabels = !input.narrow && lines.length > 0 && lines.length <= 4
  const dd = input.view === 'dd'

  const bands = input.shade
    ? CRISES.filter((c) => parseISO(c.trough) >= input.from && parseISO(c.peak) <= input.to).map((c) => [
        { name: c.short, xAxis: parseISO(c.peak) },
        { xAxis: parseISO(c.trough) },
      ])
    : []

  const series = lines.map((l, i) => ({
    id: l.id,
    name: l.name,
    type: 'line' as const,
    data: l.line.t.map((t, k) => [t, l.line.v[k]]),
    showSymbol: false,
    symbol: 'none',
    smooth: false,
    animation: false,
    z: 3 + i,
    lineStyle: {
      width: l.thick ? 3.5 : l.bench ? 1.75 : 2.25,
      color: l.color,
      type: l.dash ? dashStyle(l.dash) : 'solid',
      cap: 'round' as const,
      join: 'round' as const,
    },
    itemStyle: { color: l.color },
    emphasis: { disabled: true },
    endLabel: showEndLabels
      ? { show: true, formatter: () => l.short, color: tk.ink2, fontSize: 12, distance: 8, overflow: 'truncate' as const, width: 108 }
      : { show: false },
    labelLayout: showEndLabels ? { moveOverlap: 'shiftY' as const } : undefined,
    ...(i === 0
      ? {
          markArea: bands.length
            ? {
                silent: true,
                animation: false,
                itemStyle: { color: tk.band },
                label: { show: true, position: (dd ? 'insideBottom' : 'insideTop') as 'insideBottom' | 'insideTop', color: tk.bandText, fontSize: 11, distance: 4 },
                data: bands,
              }
            : undefined,
          markLine:
            !dd && input.rebase
              ? {
                  silent: true,
                  animation: false,
                  symbol: 'none',
                  label: { show: false },
                  lineStyle: { color: tk.axis, type: 'solid' as const, width: 1 },
                  data: [{ yAxis: 100 }],
                }
              : undefined,
        }
      : {}),
  }))

  const yAxis = dd
    ? {
        type: 'value' as const,
        max: 0,
        min: input.ddmin,
        axisLabel: { color: tk.muted, fontSize: 12, formatter: (v: number) => `${v}%` },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: tk.grid } },
      }
    : {
        type: input.log ? ('log' as const) : ('value' as const),
        logBase: 2,
        scale: true,
        min: input.ymin,
        max: input.ymax,
        axisLabel: {
          color: tk.muted,
          fontSize: 12,
          formatter: (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : String(Math.round(v * 10) / 10)),
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: tk.grid } },
        minorTick: { show: input.log },
        minorSplitLine: { show: false },
      }

  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
    grid: {
      left: input.narrow ? 44 : 56,
      right: showEndLabels ? 124 : input.narrow ? 12 : 24,
      top: 26,
      bottom: 62,
    },
    xAxis: {
      type: 'time' as const,
      min: input.fullFrom,
      max: input.fullTo,
      axisLine: { lineStyle: { color: tk.axis } },
      axisTick: { show: false },
      axisLabel: { color: tk.muted, fontSize: 12, hideOverlap: true },
      splitLine: { show: false },
    },
    yAxis,
    series,
    dataZoom: [
      {
        id: 'zoomInside',
        type: 'inside' as const,
        xAxisIndex: 0,
        filterMode: 'filter' as const,
        startValue: input.from,
        endValue: input.to,
        zoomOnMouseWheel: 'ctrl' as const,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
        minValueSpan: 30 * DAY,
      },
      {
        id: 'zoomSlider',
        type: 'slider' as const,
        xAxisIndex: 0,
        filterMode: 'filter' as const,
        startValue: input.from,
        endValue: input.to,
        height: 22,
        bottom: 10,
        showDataShadow: false,
        brushSelect: false,
        borderColor: 'transparent',
        backgroundColor: tk.grid,
        fillerColor: tk.band,
        handleSize: '120%',
        handleStyle: { color: tk.surface, borderColor: tk.muted },
        moveHandleStyle: { color: tk.muted },
        textStyle: { color: tk.muted, fontSize: 11 },
        labelFormatter: (v: number) => fmtMonth(v),
        minValueSpan: 30 * DAY,
      },
    ],
    tooltip: {
      trigger: 'axis' as const,
      confine: true,
      transitionDuration: 0,
      backgroundColor: tk.surface,
      borderColor: tk.grid,
      borderWidth: 1,
      padding: [10, 12],
      textStyle: { color: tk.ink, fontSize: 13 },
      extraCssText: 'box-shadow:0 4px 18px rgba(0,0,0,.14);border-radius:6px;',
      axisPointer: { type: 'line' as const, snap: false, lineStyle: { color: tk.muted, width: 1 } },
      formatter: (params: unknown) => {
        const p = Array.isArray(params) ? params[0] : params
        const x = (p as { axisValue?: number } | undefined)?.axisValue
        return typeof x === 'number' ? tooltipHtml(input, x) : ''
      },
    },
    graphic: input.sample
      ? [
          {
            type: 'text' as const,
            left: 'center',
            top: 'middle',
            silent: true,
            z: 0,
            rotation: 0.22,
            style: { text: 'SAMPLE DATA', fontSize: 64, fontWeight: 700 as const, fill: tk.watermark },
          },
        ]
      : [],
  }
}
