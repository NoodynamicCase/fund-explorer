import { useMemo, useState } from 'react'
import {
  CATALOG,
  EMPTY_FILTERS,
  FILTER_GROUPS,
  QUICK_SETS,
  allTickers,
  groupFunds,
  matchesFilters,
  matchesSearch,
  type FilterKey,
  type Filters,
} from '../../lib/catalog'
import type { Manifest } from '../../types'
import { IconChevron, IconClose, IconInfo, IconSearch } from './icons'

interface Props {
  manifest: Manifest | null
  selected: string[]
  colors: Record<string, string | undefined>
  q: string
  filters: Filters
  onToggle: (id: string) => void
  onInfo: (id: string) => void
  onQ: (q: string) => void
  onFilters: (f: Filters) => void
  onSet: (ids: string[]) => void
}

export function FundPicker(p: Props) {
  const [open, setOpen] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const activeFilterCount = Object.values(p.filters).reduce((n, v) => n + v.length, 0)
  const narrowing = activeFilterCount > 0 || p.q.trim() !== ''

  const matches = useMemo(
    () => CATALOG.filter((f) => matchesFilters(f, p.filters, p.manifest) && matchesSearch(f, p.q)),
    [p.filters, p.q, p.manifest],
  )
  const groups = useMemo(() => groupFunds(matches), [matches])
  const dataKnown = p.manifest !== null && Object.keys(p.manifest.funds).length > 0

  const toggleFilter = (key: FilterKey, value: string) => {
    const cur = p.filters[key]
    p.onFilters({ ...p.filters, [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] })
  }
  const toggleGroup = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <section className="card" aria-labelledby="funds-title">
      <h2 id="funds-title" className="expander-title">
        <button type="button" className="expander-btn" aria-expanded={open} aria-controls="funds-body" onClick={() => setOpen(!open)}>
          <IconChevron open={open} />
          <span>Choose funds</span>
          <span className="count-pill">{p.selected.length} on chart</span>
        </button>
      </h2>

      {open && (
        <div id="funds-body" className="picker">
          <div className="search-row">
            <label className="search">
              <IconSearch />
              <span className="sr-only">Search funds by name, ticker or keyword</span>
              <input
                type="search"
                value={p.q}
                placeholder="Search by name, ticker or keyword, such as dividend, treasury or VOO"
                onChange={(e) => p.onQ(e.target.value)}
              />
              {p.q && (
                <button type="button" className="btn icon tiny" onClick={() => p.onQ('')} aria-label="Clear search">
                  <IconClose />
                </button>
              )}
            </label>
            <button type="button" className="btn text" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
            {p.selected.length > 0 && (
              <button type="button" className="btn text" onClick={() => p.onSet([])}>
                Clear chart
              </button>
            )}
          </div>

          {filtersOpen && (
            <div className="filters">
              {FILTER_GROUPS.map((g) => (
                <fieldset key={g.key} className="filter-group">
                  <legend>{g.label}</legend>
                  <div className="chips">
                    {g.options.map((o) => (
                      <button key={o.value} type="button" className="chip" aria-pressed={p.filters[g.key].includes(o.value)} onClick={() => toggleFilter(g.key, o.value)}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
              {activeFilterCount > 0 && (
                <button type="button" className="btn text" onClick={() => p.onFilters({ ...EMPTY_FILTERS })}>
                  Clear filters
                </button>
              )}
            </div>
          )}

          <div className="quick">
            <span className="group-label">Quick comparisons</span>
            {QUICK_SETS.map((s) => (
              <button key={s.label} type="button" className="chip" title={s.hint} onClick={() => p.onSet(s.ids)}>
                {s.label}
              </button>
            ))}
          </div>

          <p className="result-count" aria-live="polite">
            {narrowing ? `${matches.length} of ${CATALOG.length} funds match` : `${CATALOG.length} funds`}
            {p.filters.hist.length > 0 && !dataKnown ? ' (history filters need data; run the data job first)' : ''}
          </p>

          <div className="fund-groups">
            {groups.length === 0 && <p className="empty-inline">No funds match. Try fewer filters or a different word.</p>}
            {groups.map((g) => {
              const isCollapsed = !narrowing && collapsed.has(g.cls)
              return (
                <div key={g.cls} className="fund-group">
                  <h3>
                    <button type="button" className="group-btn" aria-expanded={!isCollapsed} onClick={() => toggleGroup(g.cls)}>
                      <IconChevron open={!isCollapsed} />
                      <span>{g.label}</span>
                      <span className="dim">{g.count}</span>
                    </button>
                  </h3>
                  {!isCollapsed &&
                    g.subgroups.map((sg) => (
                      <div key={sg.category} className="subgroup">
                        <div className="subgroup-title">{sg.category}</div>
                        <ul className="fund-list">
                          {sg.funds.map((f) => {
                            const on = p.selected.includes(f.id)
                            const entry = p.manifest?.funds[f.id]
                            const noData = p.manifest !== null && !entry
                            const since = entry ? entry.first.slice(0, 4) : null
                            return (
                              <li key={f.id} className={`fund-row${on ? ' on' : ''}${noData ? ' nodata' : ''}`}>
                                <button
                                  type="button"
                                  className="fund-toggle"
                                  aria-pressed={on}
                                  disabled={noData && !on}
                                  title={noData ? 'No data for this fund yet. It may have failed to download; see the data job log.' : f.name}
                                  onClick={() => p.onToggle(f.id)}
                                >
                                  <span className="swatch" style={on && p.colors[f.id] ? { background: p.colors[f.id], borderColor: p.colors[f.id] } : undefined} aria-hidden="true" />
                                  <span className="fund-text">
                                    <span className="fund-name">{f.short}</span>
                                    <span className="fund-tickers">{allTickers(f).slice(0, 4).join(' · ') || f.category}</span>
                                  </span>
                                  {since && <span className="fund-since" title="First year with data">since {since}</span>}
                                </button>
                                <button type="button" className="btn icon tiny" onClick={() => p.onInfo(f.id)} aria-label={`About ${f.name}`} title="About this fund">
                                  <IconInfo />
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
