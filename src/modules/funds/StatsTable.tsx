import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { allTickers } from '../../lib/catalog'
import { COLUMNS, COLUMN_GROUPS, DEFAULT_COLUMNS, type CellValue, type RowStats } from '../../lib/columns'
import { REBALANCE_OPTIONS, type Rebalance } from '../../lib/portfolio'
import type { CatalogFund } from '../../types'
import { IconClose, IconGear } from './icons'

export interface TableRow {
  fund: CatalogFund
  color: string
  dash?: string
  stats: RowStats | null
  note?: string
  /** The user's own mix row. */
  isMix?: boolean
}

export interface MixControls {
  enabled: boolean
  weights: Record<string, number>
  total: number
  rb: Rebalance
  pending: boolean
  problem?: string
  onToggle: () => void
  onWeight: (id: string, w: number | undefined) => void
  onEqual: () => void
  onRebalance: (rb: Rebalance) => void
}

interface Props {
  rows: TableRow[]
  columns: string[] | undefined
  sort: { col: string; dir: 'asc' | 'desc' } | undefined
  windowLabel: string
  onSort: (col: string) => void
  onColumns: (ids: string[] | undefined) => void
  onRemove: (id: string) => void
  onInfo: (id: string) => void
  mix: MixControls
  footer?: ReactNode
}

function cmp(a: CellValue, b: CellValue, dir: 'asc' | 'desc'): number {
  if (a === null && b === null) return 0
  if (a === null) return 1 // blanks always last
  if (b === null) return -1
  const r = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))
  return dir === 'asc' ? r : -r
}

function ColumnPicker({ visible, onChange }: { visible: string[]; onChange: (ids: string[] | undefined) => void }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (id: string) => {
    const next = visible.includes(id) ? visible.filter((x) => x !== id) : [...visible, id]
    const ordered = COLUMNS.map((c) => c.id).filter((x) => next.includes(x))
    const isDefault = ordered.length === DEFAULT_COLUMNS.length && ordered.every((x, i) => x === DEFAULT_COLUMNS[i])
    onChange(isDefault ? undefined : ordered)
  }

  return (
    <div className="col-picker" ref={wrap}>
      <button type="button" className="btn icon" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)} aria-label="Choose table columns" title="Choose table columns">
        <IconGear />
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Table columns">
          <div className="popover-head">
            <strong>Columns</strong>
            <button type="button" className="btn text" onClick={() => onChange(undefined)}>
              Reset
            </button>
            <button type="button" className="btn icon tiny" onClick={() => setOpen(false)} aria-label="Close">
              <IconClose />
            </button>
          </div>
          <div className="popover-body">
            {COLUMN_GROUPS.map((g) => (
              <fieldset key={g}>
                <legend>{g}</legend>
                {COLUMNS.filter((c) => c.group === g).map((c) => (
                  <label key={c.id} className="col-option">
                    <input type="checkbox" checked={visible.includes(c.id)} onChange={() => toggle(c.id)} />
                    <span>
                      <span className="col-label">{c.label}</span>
                      <span className="col-help">{c.help}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function WeightInput({ value, share, showShare, name, onCommit }: { value: number | undefined; share: number; showShare: boolean; name: string; onCommit: (w: number | undefined) => void }) {
  const parse = (x: string): number | undefined => {
    const t = x.trim().replace(/[$,%\s]/g, '')
    const n = Number(t)
    return t !== '' && Number.isFinite(n) && n >= 0 ? n : undefined
  }
  const [text, setText] = useState(value === undefined ? '' : String(value))
  // Follow outside changes (Equal weights, a link), but never fight what is being typed ("5." stays "5.")
  useEffect(() => {
    setText((cur) => (parse(cur) === value ? cur : value === undefined ? '' : String(value)))
  }, [value])
  const commit = () => {
    const t = text.trim().replace(/[$,%\s]/g, '')
    if (t === '') return onCommit(undefined)
    const n = Number(t)
    if (Number.isFinite(n) && n >= 0) onCommit(n)
    else setText(value === undefined ? '' : String(value))
  }
  return (
    <span className="weight-input">
      <input
        type="text"
        inputMode="decimal"
        value={text}
        placeholder="0"
        aria-label={`Weight for ${name}`}
        onChange={(e) => {
          setText(e.target.value)
          const t = e.target.value.trim().replace(/[$,%\s]/g, '')
          const n = Number(t)
          if (t === '') onCommit(undefined)
          else if (Number.isFinite(n) && n >= 0) onCommit(n)
        }}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {showShare && share > 0 && <span className="dim weight-share">{Math.round(share * 1000) / 10}%</span>}
    </span>
  )
}

export function StatsTable(p: Props) {
  const visibleIds = p.columns ?? DEFAULT_COLUMNS
  const cols = COLUMNS.filter((c) => visibleIds.includes(c.id))

  const sorted = useMemo(() => {
    const pinned = p.rows.filter((r) => r.isMix)
    const rest = p.rows.filter((r) => !r.isMix)
    if (!p.sort) return [...pinned, ...rest]
    const { col, dir } = p.sort
    const def = COLUMNS.find((c) => c.id === col)
    const rows = [...rest]
    rows.sort((a, b) => {
      if (col === 'name' || !def) return cmp(a.fund.short, b.fund.short, dir)
      return cmp(a.stats ? def.value(a.stats) : null, b.stats ? def.value(b.stats) : null, dir)
    })
    return [...pinned, ...rows]
  }, [p.rows, p.sort])

  const EXPOSURE_IDS = ['tech', 'aiTop', 'swTop', 'aiSwTop']
  const exposureOn = EXPOSURE_IDS.every((id) => visibleIds.includes(id))
  const STRESS_IDS = ['c_dotcom', 'c_gfc', 'c_covid', 'c_rates2022']
  const stressOn = STRESS_IDS.every((id) => visibleIds.includes(id))
  const setGroup = (ids: string[], on: boolean) => {
    const next = on ? [...new Set([...visibleIds, ...ids])] : visibleIds.filter((x) => !ids.includes(x))
    const ordered = COLUMNS.map((c) => c.id).filter((x) => next.includes(x))
    const isDefault = ordered.length === DEFAULT_COLUMNS.length && ordered.every((x, i) => x === DEFAULT_COLUMNS[i])
    p.onColumns(isDefault ? undefined : ordered)
  }
  const toggleExposure = () => setGroup(EXPOSURE_IDS, !exposureOn)
  const toggleStress = () => setGroup(STRESS_IDS, !stressOn)

  const ariaSort = (id: string) => (p.sort?.col === id ? (p.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none')
  const arrow = (id: string) => (p.sort?.col === id ? (p.sort.dir === 'asc' ? ' ▲' : ' ▼') : '')

  return (
    <section className="card" aria-labelledby="table-title">
      <div className="card-head">
        <div>
          <h2 id="table-title">Compare the numbers</h2>
          <div className="caption">
            Window columns follow the chart: <strong>{p.windowLabel}</strong>
          </div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn" aria-pressed={stressOn} onClick={toggleStress} title="Show each fund's return from the S&P 500's peak to its low in the dot-com crash, 2008, COVID and 2022. Click a column name to rank funds by it.">
            {stressOn ? 'Hide downturn columns' : 'Show downturn results'}
          </button>
          <button type="button" className="btn" aria-pressed={exposureOn} onClick={toggleExposure} title="Show how much of each fund is technology, AI-linked or software">
            {exposureOn ? 'Hide AI/software columns' : 'Show AI/software exposure'}
          </button>
          <button type="button" className="btn" aria-pressed={p.mix.enabled} onClick={p.mix.onToggle} title="Enter a weight for each fund and see how the combined mix would have performed">
            {p.mix.enabled ? 'Turn off my mix' : 'Build my mix'}
          </button>
          <ColumnPicker visible={visibleIds} onChange={p.onColumns} />
        </div>
      </div>

      {p.mix.enabled && (
        <div className="mixbar">
          <p className="mix-help">
            Type how much goes in each fund: percentages or dollar amounts both work, since they are scaled to add up to 100%. The combined result is the bold line in the chart and the top row below.
          </p>
          <div className="mix-tools">
            <button type="button" className="btn" onClick={p.mix.onEqual}>Equal weights</button>
            <label className="mix-select">
              <span>Rebalance</span>
              <select value={p.mix.rb} onChange={(e) => p.mix.onRebalance(e.target.value as Rebalance)}>
                {REBALANCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <span className="dim mix-total">Total entered: {Math.round(p.mix.total * 100) / 100}</span>
          </div>
          {p.mix.problem && <p className="mix-problem" role="status">{p.mix.problem}</p>}
        </div>
      )}

      {p.rows.length === 0 ? (
        <p className="empty-inline">Choose funds above and their numbers appear here, one row each.</p>
      ) : (
        <div className="table-scroll">
          <table className="stats">
            <thead>
              <tr>
                <th scope="col" aria-sort={ariaSort('name')} className="fund-col">
                  <button type="button" className="th-btn" onClick={() => p.onSort('name')}>
                    Fund{arrow('name')}
                  </button>
                </th>
                {p.mix.enabled && (
                  <th scope="col" className="num" title="How much of your mix goes in this fund. Dollar amounts work too.">Weight</th>
                )}
                {cols.map((c) => (
                  <th key={c.id} scope="col" aria-sort={ariaSort(c.id)} className={c.numeric ? 'num' : undefined} title={c.help}>
                    <button type="button" className="th-btn" onClick={() => p.onSort(c.id)}>
                      {c.label}
                      {arrow(c.id)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.fund.id} className={r.isMix ? 'mix-row' : undefined}>
                  <th scope="row" className="fund-col">
                    <span className="fund-cell">
                      <svg className="line-key" width="22" height="8" viewBox="0 0 22 8" aria-hidden="true">
                        <line x1="1" y1="4" x2="21" y2="4" stroke={r.color} strokeWidth={r.isMix ? 4.5 : 3} strokeLinecap="round" strokeDasharray={r.dash} />
                      </svg>
                      {r.isMix ? (
                        <strong>{r.fund.short}</strong>
                      ) : (
                        <>
                          <button type="button" className="link-btn" onClick={() => p.onInfo(r.fund.id)} title={`About ${r.fund.name}`}>
                            {r.fund.short}
                          </button>
                          <span className="dim ticker">{allTickers(r.fund)[0] ?? ''}</span>
                          <button type="button" className="btn icon tiny" onClick={() => p.onRemove(r.fund.id)} aria-label={`Remove ${r.fund.name}`} title="Remove from chart">
                            <IconClose />
                          </button>
                        </>
                      )}
                    </span>
                    {r.note && <span className="row-note">{r.note}</span>}
                  </th>
                  {p.mix.enabled && (
                    <td className="num weight-cell">
                      {r.isMix ? (
                        <span className="dim">100%</span>
                      ) : r.fund.id === 'CPI' ? (
                        <span className="dim" title="Inflation is not something you can hold">–</span>
                      ) : (
                        <WeightInput value={p.mix.weights[r.fund.id]} share={p.mix.total > 0 ? (p.mix.weights[r.fund.id] ?? 0) / p.mix.total : 0} showShare={Math.abs(p.mix.total - 100) > 0.05} name={r.fund.short} onCommit={(w) => p.mix.onWeight(r.fund.id, w)} />
                      )}
                    </td>
                  )}
                  {cols.map((c) => {
                    const v = r.stats ? c.value(r.stats) : null
                    return (
                      <td key={c.id} className={c.numeric ? 'num' : undefined} title={r.stats ? c.title?.(r.stats) : undefined}>
                        {r.stats ? c.format(v, r.stats) : '–'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="hint">
        “To the latest date” columns end at each fund’s last data point. Risk figures use weekly data, so they can slightly understate day-to-day extremes. Sharpe and Sortino measure return above 3-month Treasury bills. Hover a column name for its meaning, or click it to sort. The gear adds more columns, including how each fund did in the dot-com crash, 2008, COVID and 2022.
      </p>
      {p.footer}
    </section>
  )
}
