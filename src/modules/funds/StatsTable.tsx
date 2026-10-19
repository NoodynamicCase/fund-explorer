import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { allTickers } from '../../lib/catalog'
import { COLUMNS, COLUMN_GROUPS, DEFAULT_COLUMNS, type CellValue, type RowStats } from '../../lib/columns'
import type { CatalogFund } from '../../types'
import { IconClose, IconGear } from './icons'

export interface TableRow {
  fund: CatalogFund
  color: string
  dash?: string
  stats: RowStats | null
  note?: string
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

export function StatsTable(p: Props) {
  const visibleIds = p.columns ?? DEFAULT_COLUMNS
  const cols = COLUMNS.filter((c) => visibleIds.includes(c.id))

  const sorted = useMemo(() => {
    if (!p.sort) return p.rows
    const { col, dir } = p.sort
    const def = COLUMNS.find((c) => c.id === col)
    const rows = [...p.rows]
    rows.sort((a, b) => {
      if (col === 'name' || !def) return cmp(a.fund.short, b.fund.short, dir)
      return cmp(a.stats ? def.value(a.stats) : null, b.stats ? def.value(b.stats) : null, dir)
    })
    return rows
  }, [p.rows, p.sort])

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
        <ColumnPicker visible={visibleIds} onChange={p.onColumns} />
      </div>

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
                <tr key={r.fund.id}>
                  <th scope="row" className="fund-col">
                    <span className="fund-cell">
                      <svg className="line-key" width="22" height="8" viewBox="0 0 22 8" aria-hidden="true">
                        <line x1="1" y1="4" x2="21" y2="4" stroke={r.color} strokeWidth="3" strokeLinecap="round" strokeDasharray={r.dash} />
                      </svg>
                      <button type="button" className="link-btn" onClick={() => p.onInfo(r.fund.id)} title={`About ${r.fund.name}`}>
                        {r.fund.short}
                      </button>
                      <span className="dim ticker">{allTickers(r.fund)[0] ?? ''}</span>
                      <button type="button" className="btn icon tiny" onClick={() => p.onRemove(r.fund.id)} aria-label={`Remove ${r.fund.name}`} title="Remove from chart">
                        <IconClose />
                      </button>
                    </span>
                    {r.note && <span className="row-note">{r.note}</span>}
                  </th>
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
