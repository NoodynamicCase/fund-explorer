import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { BY_ID, allTickers, isBenchmark } from '../../lib/catalog'
import { buildOption, type DisplayLine } from '../../lib/chartOption'
import {
  BENCH_DARK, BENCH_DASH_ARRAY, BENCH_LIGHT, MAX_BENCH, MAX_COLORED, SERIES_DARK, SERIES_LIGHT, assignSlots, type Slot,
} from '../../lib/colors'
import { DEFAULT_COLUMNS, computeRow } from '../../lib/columns'
import { crisisById } from '../../lib/crises'
import { loadSeries } from '../../lib/data'
import { fmtMonth, parseISO, toISO } from '../../lib/format'
import { readChartTokens, useMediaQuery, useTheme } from '../../lib/hooks'
import { DAY, YEAR, drawdownLine, raw as rawLine, rebased } from '../../lib/series'
import { riskFreeRate } from '../../lib/stats'
import type { ViewState } from '../../lib/urlState'
import type { Manifest, Series } from '../../types'
import { ChartPanel, RANGES, type LegendItem, type RangeKey } from './ChartPanel'
import { FundPicker } from './FundPicker'
import { InfoModal } from './InfoModal'
import { StatsTable, type TableRow } from './StatsTable'
import type { Patch, UpdateMode } from './useViewState'

interface Props {
  state: ViewState
  update: (patch: Patch, mode?: UpdateMode) => void
  manifest: Manifest | null
  notify: (msg: string) => void
}

/** Loads the series files the view needs, once each. */
function useSeriesStore(ids: string[], manifest: Manifest | null) {
  const [store, setStore] = useState<Record<string, Series>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const inflight = useRef(new Set<string>())
  const key = ids.join(',')

  useEffect(() => {
    if (!manifest) return
    for (const id of ids) {
      if (store[id] || errors[id] || inflight.current.has(id) || !manifest.funds[id]) continue
      inflight.current.add(id)
      loadSeries(id)
        .then((s) => setStore((p) => ({ ...p, [id]: s })))
        .catch((e: Error) => setErrors((p) => ({ ...p, [id]: e.message })))
        .finally(() => inflight.current.delete(id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, manifest])

  const loading = manifest ? ids.some((id) => manifest.funds[id] && !store[id] && !errors[id]) : true
  return { store, errors, loading }
}

export function FundsModule({ state, update, manifest, notify }: Props) {
  const theme = useTheme()
  const narrow = useMediaQuery('(max-width: 640px)')
  const [infoId, setInfoId] = useState<string | null>(null)
  const slotsRef = useRef<Record<string, Slot>>({})

  const visibleCols = state.cols ?? DEFAULT_COLUMNS
  const needBench = visibleCols.includes('beta') || visibleCols.includes('corr')
  const ids = useMemo(
    () => [...new Set([...state.funds, 'CASH', ...(needBench ? ['VFIAX'] : []), ...(infoId ? [infoId] : [])])],
    [state.funds, needBench, infoId],
  )
  const { store, errors, loading } = useSeriesStore(ids, manifest)
  const sample = Boolean(manifest?.synthetic)

  // ---- colours: a fund keeps its colour while it stays on the chart ----
  const selected = useMemo(() => state.funds.map((id) => BY_ID.get(id)!).filter(Boolean), [state.funds])
  const assigned = assignSlots(slotsRef.current, selected.map((f) => ({ id: f.id, bench: isBenchmark(f) })))
  for (const id of Object.keys(slotsRef.current)) if (!state.funds.includes(id)) delete slotsRef.current[id]
  for (const [id, s] of Object.entries(assigned)) if (s) slotsRef.current[id] = s
  const slotKey = JSON.stringify(assigned)

  const palette = theme === 'dark' ? SERIES_DARK : SERIES_LIGHT
  const benchPalette = theme === 'dark' ? BENCH_DARK : BENCH_LIGHT
  const styleOf = (slot: Slot | undefined): { color: string; dash?: string } => {
    if (!slot) return { color: '#898781' }
    return slot.kind === 'series' ? { color: palette[slot.index] } : { color: benchPalette[slot.index], dash: BENCH_DASH_ARRAY[slot.index] }
  }

  // ---- full range and visible window ----
  const drawn = selected.filter((f) => assigned[f.id] && store[f.id])
  const fullFrom = drawn.length ? Math.min(...drawn.map((f) => store[f.id].t[0])) : 0
  const fullTo = drawn.length ? Math.max(...drawn.map((f) => store[f.id].t[store[f.id].t.length - 1])) : 0

  const win = useMemo(() => {
    if (!drawn.length) return null
    let from = fullFrom
    let to = fullTo
    const crisis = crisisById(state.preset)
    if (crisis) {
      from = parseISO(crisis.view.from)
      to = parseISO(crisis.view.to)
    } else {
      if (state.from) from = parseISO(state.from)
      if (state.to) to = parseISO(state.to)
    }
    from = Math.max(from, fullFrom)
    to = Math.min(to, fullTo)
    if (to - from < 21 * DAY) return { from: fullFrom, to: fullTo }
    return { from, to }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn.length, fullFrom, fullTo, state.from, state.to, state.preset])

  const windowIsFull = win ? win.from <= fullFrom + DAY && win.to >= fullTo - DAY : true

  // ---- chart lines and legend ----
  const { lines, legend } = useMemo(() => {
    const lines: DisplayLine[] = []
    const legend: LegendItem[] = []
    for (const f of selected) {
      const slot = assigned[f.id]
      const st = styleOf(slot)
      const base = { id: f.id, name: f.name, short: f.short, color: st.color, dash: st.dash }
      if (!slot) {
        legend.push({ ...base, status: 'overflow', note: 'not drawn: chart is full' })
        continue
      }
      if (manifest && !manifest.funds[f.id]) {
        legend.push({ ...base, status: 'unavailable', note: 'no data yet' })
        continue
      }
      const s = store[f.id]
      if (!s) {
        legend.push({ ...base, status: errors[f.id] ? 'unavailable' : 'loading', note: errors[f.id] ? 'could not load' : 'loading' })
        continue
      }
      if (!win) continue
      const line = state.view === 'dd' ? drawdownLine(s, win.from, win.to) : state.rebase ? rebased(s, win.from, win.to) : rawLine(s, win.from, win.to)
      if (!line) {
        const note = s.t[0] > win.to ? `starts ${fmtMonth(s.t[0])}` : s.t[s.t.length - 1] < win.from ? `ends ${fmtMonth(s.t[s.t.length - 1])}` : 'no data in this window'
        legend.push({ ...base, status: 'nodata', note })
        continue
      }
      lines.push({ ...base, bench: isBenchmark(f), line })
      legend.push({ ...base, status: 'ok' })
    }
    return { lines, legend }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, slotKey, store, errors, manifest, win, state.view, state.rebase, theme])

  const option = useMemo(() => {
    if (!win || lines.length === 0) return null
    return buildOption({
      lines, view: state.view, log: state.log, rebase: state.rebase, ymin: state.ymin, ymax: state.ymax, ddmin: state.ddmin,
      from: win.from, to: win.to, fullFrom, fullTo, shade: state.shade, tokens: readChartTokens(), sample, narrow,
    })
  }, [lines, win, fullFrom, fullTo, state.view, state.log, state.rebase, state.ymin, state.ymax, state.ddmin, state.shade, sample, narrow, theme])

  // ---- table ----
  const statFrom = win && !windowIsFull ? win.from : undefined
  const statTo = win && !windowIsFull ? win.to : undefined
  const rows: TableRow[] = useMemo(() => {
    const rf = riskFreeRate(store['CASH'], statFrom, statTo)
    const out: TableRow[] = []
    for (const f of selected) {
      const slot = assigned[f.id]
      if (!slot) continue
      const st = styleOf(slot)
      const s = store[f.id]
      let note: string | undefined
      if (!s) note = manifest && !manifest.funds[f.id] ? 'No data yet' : errors[f.id] ? 'Could not load' : 'Loading'
      out.push({
        fund: f, color: st.color, dash: st.dash, note,
        stats: s ? computeRow({ fund: f, series: s, from: statFrom, to: statTo, rfAnnual: rf, bench: store['VFIAX'] }) : null,
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, slotKey, store, errors, manifest, statFrom, statTo, theme])

  const windowLabel = win ? (windowIsFull ? `full history, ${fmtMonth(win.from)} – ${fmtMonth(win.to)}` : `${fmtMonth(win.from)} – ${fmtMonth(win.to)}`) : 'no data yet'

  // ---- actions ----
  const setWindow = (from: number, to: number, mode: UpdateMode) => {
    const s = Math.round(from / DAY) * DAY
    const e = Math.round(to / DAY) * DAY
    if (s <= fullFrom + DAY && e >= fullTo - DAY) update({ from: undefined, to: undefined, preset: undefined }, mode)
    else update({ from: toISO(Math.max(s, fullFrom)), to: toISO(Math.min(e, fullTo)), preset: undefined }, mode)
  }

  const onZoom = (dir: 'in' | 'out') => {
    if (!win) return
    const span = win.to - win.from
    const center = (win.from + win.to) / 2
    const newSpan = dir === 'in' ? Math.max(span * 0.6, 45 * DAY) : span / 0.6
    if (newSpan >= fullTo - fullFrom) return setWindow(fullFrom, fullTo, 'push')
    let from = center - newSpan / 2
    let to = center + newSpan / 2
    if (from < fullFrom) { to += fullFrom - from; from = fullFrom }
    if (to > fullTo) { from -= to - fullTo; to = fullTo }
    setWindow(from, to, 'push')
  }

  const onRange = (key: RangeKey) => {
    const years = RANGES.find((r) => r.key === key)?.years
    if (!years) return setWindow(fullFrom, fullTo, 'push')
    setWindow(Math.max(fullFrom, fullTo - years * YEAR), fullTo, 'push')
  }

  const activeRange: RangeKey | undefined = !win
    ? undefined
    : windowIsFull
      ? 'max'
      : RANGES.find((r) => r.years && Math.abs(win.to - fullTo) < 8 * DAY && Math.abs(win.to - win.from - r.years * YEAR) < 8 * DAY)?.key

  const toggleFund = (id: string) => {
    if (state.funds.includes(id)) return update({ funds: state.funds.filter((x) => x !== id) })
    const f = BY_ID.get(id)
    if (!f) return
    const bench = isBenchmark(f)
    const inUse = state.funds.filter((x) => { const g = BY_ID.get(x); return g ? isBenchmark(g) === bench : false }).length
    const cap = bench ? MAX_BENCH : MAX_COLORED
    if (inUse >= cap) {
      notify(bench ? `The chart holds up to ${cap} benchmark lines. Remove one first.` : `The chart holds up to ${cap} funds so the colors stay easy to tell apart. Remove one first.`)
      return
    }
    update({ funds: [...state.funds, id] })
  }

  // ---- empty / status messages for the chart area ----
  const noDataAtAll = manifest !== null && Object.keys(manifest.funds).length === 0
  let empty: ReactElement | undefined
  if (manifest === null) empty = <p>Loading fund data…</p>
  else if (noDataAtAll)
    empty = (
      <div>
        <p><strong>No fund data yet.</strong></p>
        <p>The weekly data job has not run. In the GitHub repository, open the <em>Actions</em> tab, choose <em>Refresh fund data and deploy</em>, and press <em>Run workflow</em>. It takes a few minutes, then reload this page.</p>
      </div>
    )
  else if (state.funds.length === 0) empty = <p>Pick one or more funds below to draw them here.</p>
  else if (loading && lines.length === 0) empty = <p>Loading fund data…</p>
  else if (lines.length === 0) empty = <p>None of the chosen funds has data for this time range. Zoom out, or pick other funds.</p>

  const colors: Record<string, string | undefined> = {}
  for (const f of selected) colors[f.id] = assigned[f.id] ? styleOf(assigned[f.id]).color : undefined

  const infoFund = infoId ? BY_ID.get(infoId) : undefined
  const infoCanAdd = infoFund
    ? state.funds.filter((x) => { const g = BY_ID.get(x); return g ? isBenchmark(g) === isBenchmark(infoFund) : false }).length < (isBenchmark(infoFund) ? MAX_BENCH : MAX_COLORED)
    : false

  const tickersNote = useMemo(() => selected.map((f) => allTickers(f)[0]).filter(Boolean).join(', '), [selected])

  return (
    <>
      <ChartPanel
        option={option}
        lines={lines}
        legend={legend}
        state={state}
        from={win?.from ?? 0}
        to={win?.to ?? 0}
        fullFrom={fullFrom}
        fullTo={fullTo}
        windowIsFull={windowIsFull}
        activeRange={activeRange}
        sample={sample}
        empty={empty}
        onUpdate={(patch) => update(patch)}
        onZoom={onZoom}
        onRange={onRange}
        onPreset={(id) => update({ preset: id, from: undefined, to: undefined })}
        onWindowDrag={(f, t) => setWindow(f, t, 'replace')}
        onRemove={(id) => update({ funds: state.funds.filter((x) => x !== id) })}
        onInfo={setInfoId}
      />

      <FundPicker
        manifest={manifest}
        selected={state.funds}
        colors={colors}
        q={state.q}
        filters={state.filters}
        onToggle={toggleFund}
        onInfo={setInfoId}
        onQ={(q) => update({ q }, 'replace')}
        onFilters={(filters) => update({ filters })}
        onSet={(funds) => update({ funds })}
      />

      <StatsTable
        rows={rows}
        columns={state.cols}
        sort={state.sort}
        windowLabel={windowLabel}
        onSort={(col) =>
          update((s) => ({
            sort: s.sort?.col === col ? (s.sort.dir === 'desc' ? { col, dir: 'asc' as const } : undefined) : { col, dir: 'desc' as const },
          }))
        }
        onColumns={(cols) => update({ cols })}
        onRemove={(id) => update({ funds: state.funds.filter((x) => x !== id) })}
        onInfo={setInfoId}
        footer={tickersNote ? <span className="sr-only">Tickers: {tickersNote}</span> : undefined}
      />

      {infoFund && (
        <InfoModal
          fund={infoFund}
          entry={manifest?.funds[infoFund.id]}
          series={store[infoFund.id]}
          selected={state.funds.includes(infoFund.id)}
          canAdd={infoCanAdd}
          onToggle={() => toggleFund(infoFund.id)}
          onClose={() => setInfoId(null)}
        />
      )}
    </>
  )
}
