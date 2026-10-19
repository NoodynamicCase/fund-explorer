import { useEffect, useState, type ReactNode } from 'react'
import { CRISES } from '../../lib/crises'
import { fmtMonth, fmtYears } from '../../lib/format'
import { YEAR } from '../../lib/series'
import type { ViewState } from '../../lib/urlState'
import type { ViewMode } from '../../types'
import type { DisplayLine } from '../../lib/chartOption'
import { IconClose, IconInfo, IconMinus, IconPlus } from './icons'
import { PerformanceChart } from './PerformanceChart'

export type LegendStatus = 'ok' | 'nodata' | 'loading' | 'unavailable' | 'overflow'

export interface LegendItem {
  id: string
  name: string
  short: string
  color: string
  dash?: string
  status: LegendStatus
  note?: string
}

export type RangeKey = 'max' | '20y' | '10y' | '5y' | '1y'
export const RANGES: { key: RangeKey; label: string; years?: number }[] = [
  { key: 'max', label: 'All' },
  { key: '20y', label: '20 yr', years: 20 },
  { key: '10y', label: '10 yr', years: 10 },
  { key: '5y', label: '5 yr', years: 5 },
  { key: '1y', label: '1 yr', years: 1 },
]

interface Props {
  option: object | null
  lines: DisplayLine[]
  legend: LegendItem[]
  state: ViewState
  from: number
  to: number
  fullFrom: number
  fullTo: number
  windowIsFull: boolean
  activeRange?: RangeKey
  sample: boolean
  empty?: ReactNode
  onUpdate: (patch: Partial<ViewState>) => void
  onZoom: (dir: 'in' | 'out') => void
  onRange: (key: RangeKey) => void
  onPreset: (id: string) => void
  onWindowDrag: (from: number, to: number) => void
  onRemove: (id: string) => void
  onInfo: (id: string) => void
}

function Dash({ color, dash }: { color: string; dash?: string }) {
  return (
    <svg className="line-key" width="22" height="8" viewBox="0 0 22 8" aria-hidden="true">
      <line x1="1" y1="4" x2="21" y2="4" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={dash} />
    </svg>
  )
}

/** A number box that applies its value when you press Enter or leave the box. */
function AxisInput({ label, value, placeholder, onCommit }: { label: string; value: number | undefined; placeholder: string; onCommit: (v: number | undefined) => void }) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  useEffect(() => setText(value === undefined ? '' : String(value)), [value])
  const commit = () => {
    const t = text.trim()
    if (t === '') return onCommit(undefined)
    const n = Number(t)
    if (Number.isFinite(n)) onCommit(n)
    else setText(value === undefined ? '' : String(value))
  }
  return (
    <label className="axis-input">
      <span>{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
    </label>
  )
}

export function ChartPanel(p: Props) {
  const { state } = p
  const dd = state.view === 'dd'
  const spanYears = (p.to - p.from) / YEAR
  const views: { id: ViewMode; label: string }[] = [
    { id: 'perf', label: 'Growth' },
    { id: 'dd', label: 'Drops from peak' },
  ]
  const hasAxisOverride = dd ? state.ddmin !== undefined : state.ymin !== undefined || state.ymax !== undefined

  return (
    <section className="card" aria-labelledby="chart-title">
      <div className="card-head">
        <h2 id="chart-title">{dd ? 'How far each fund fell from its high' : 'How each fund grew'}</h2>
        <div className="caption" aria-live="polite">
          {fmtMonth(p.from)} – {fmtMonth(p.to)} <span className="dim">({fmtYears(spanYears)})</span>
        </div>
      </div>

      <div className="controls">
        <div className="group" role="group" aria-label="Time range">
          <button type="button" className="btn icon" onClick={() => p.onZoom('out')} disabled={p.windowIsFull} aria-label="Zoom out to a longer time range" title="Zoom out">
            <IconMinus />
          </button>
          <button type="button" className="btn icon" onClick={() => p.onZoom('in')} aria-label="Zoom in to a shorter time range" title="Zoom in">
            <IconPlus />
          </button>
          {RANGES.map((r) => (
            <button key={r.key} type="button" className="chip" aria-pressed={p.activeRange === r.key} onClick={() => p.onRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="group" role="group" aria-label="Jump to a market stress period">
          <span className="group-label">Jump to</span>
          {CRISES.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={state.preset === c.id} title={`${c.label}: zoom to ${c.view.from} – ${c.view.to}`} onClick={() => p.onPreset(c.id)}>
              {c.short}
            </button>
          ))}
          <label className="check">
            <input type="checkbox" checked={state.shade} onChange={(e) => p.onUpdate({ shade: e.target.checked })} />
            <span>Shade stress periods</span>
          </label>
        </div>
      </div>

      <div className="controls">
        <div className="segmented" role="group" aria-label="What to plot">
          {views.map((v) => (
            <button key={v.id} type="button" aria-pressed={state.view === v.id} onClick={() => p.onUpdate({ view: v.id })}>
              {v.label}
            </button>
          ))}
        </div>
        <label className={`check${dd ? ' disabled' : ''}`} title="Every line starts at 100 at the left edge of the chart, so funds with different start dates are comparable.">
          <input type="checkbox" checked={state.rebase} disabled={dd} onChange={(e) => p.onUpdate({ rebase: e.target.checked })} />
          <span>Start all lines at 100</span>
        </label>
        <label className={`check${dd ? ' disabled' : ''}`} title="Equal vertical distances mean equal percentage changes. Helpful when funds differ a lot.">
          <input type="checkbox" checked={state.log} disabled={dd} onChange={(e) => p.onUpdate({ log: e.target.checked, ymin: e.target.checked && (state.ymin ?? 1) <= 0 ? undefined : state.ymin })} />
          <span>Log scale</span>
        </label>
        <div className="group axis-group" role="group" aria-label="Vertical axis range">
          <span className="group-label">Vertical axis</span>
          {dd ? (
            <AxisInput label="Floor %" value={state.ddmin} placeholder="auto" onCommit={(v) => p.onUpdate({ ddmin: v !== undefined && v < 0 && v >= -100 ? v : undefined })} />
          ) : (
            <>
              <AxisInput label="Min" value={state.ymin} placeholder="auto" onCommit={(v) => p.onUpdate({ ymin: v !== undefined && (!state.log || v > 0) && (state.ymax === undefined || v < state.ymax) ? v : undefined })} />
              <AxisInput label="Max" value={state.ymax} placeholder="auto" onCommit={(v) => p.onUpdate({ ymax: v !== undefined && (!state.log || v > 0) && (state.ymin === undefined || v > state.ymin) ? v : undefined })} />
            </>
          )}
          <button type="button" className="btn text" disabled={!hasAxisOverride} onClick={() => p.onUpdate({ ymin: undefined, ymax: undefined, ddmin: undefined })}>
            Auto
          </button>
        </div>
      </div>

      <div className="chart-wrap">
        {p.option && p.lines.length > 0 ? (
          <PerformanceChart option={p.option} onWindow={p.onWindowDrag} label={`Line chart of ${p.lines.map((l) => l.name).join(', ')}. A table with the same funds follows below.`} />
        ) : (
          <div className="chart-empty">{p.empty}</div>
        )}
      </div>

      {p.legend.length > 0 && (
        <ul className="legend" aria-label="Funds on the chart">
          {p.legend.map((l) => (
            <li key={l.id} className={`legend-item ${l.status}`}>
              <Dash color={l.color} dash={l.dash} />
              <span className="legend-name" title={l.name}>
                {l.short}
              </span>
              {l.note && <span className="legend-note">{l.note}</span>}
              <button type="button" className="btn icon tiny" onClick={() => p.onInfo(l.id)} aria-label={`About ${l.name}`} title="About this fund">
                <IconInfo />
              </button>
              <button type="button" className="btn icon tiny" onClick={() => p.onRemove(l.id)} aria-label={`Remove ${l.name} from the chart`} title="Remove">
                <IconClose />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="hint">
        Hover the chart for exact values. Drag it to pan, Ctrl + scroll (or pinch) to zoom, or drag the bar under the chart. Stress periods run from the S&amp;P 500’s high to its low.
      </p>
      {p.sample && <p className="hint warn-text">Sample data: these lines are invented for previewing the layout and say nothing about real funds.</p>}
    </section>
  )
}
