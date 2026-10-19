import type { ViewMode } from '../types'
import { parseISO } from './format'
import { EMPTY_FILTERS, type FilterKey, type Filters } from './catalog'

export const DEFAULT_FUNDS = ['VFIAX', 'VBTLX', 'VTIAX']
export const MAX_FUNDS = 12
export const ROUTE_FUNDS = '/funds'

export interface ViewState {
  funds: string[]
  /** Explicit window (ISO dates); undefined = full history. */
  from?: string
  to?: string
  /** Named crisis preset; when set it defines the window. */
  preset?: string
  rebase: boolean
  log: boolean
  view: ViewMode
  shade: boolean
  ymin?: number
  ymax?: number
  ddmin?: number
  q: string
  filters: Filters
  cols?: string[]
  sort?: { col: string; dir: 'asc' | 'desc' }
}

export function defaultState(): ViewState {
  return {
    funds: [...DEFAULT_FUNDS],
    rebase: true,
    log: false,
    view: 'perf',
    shade: true,
    q: '',
    filters: { ...EMPTY_FILTERS },
  }
}

export interface ParseCtx {
  resolveFund: (s: string) => string | undefined
  columnIds: string[]
  presetIds: string[]
  filterValues: Record<FilterKey, string[]>
}

const FILTER_KEYS: FilterKey[] = ['cls', 'mix', 'reg', 'prov', 'kind', 'wrap', 'hist']

function num(s: string | null): number | undefined {
  if (s === null || s.trim() === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

function list(s: string | null): string[] {
  return s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []
}

/** Reads "#/funds?f=VFIAX,VBTLX&from=2000-01-01". Anything invalid is ignored. */
export function parseHash(hash: string, ctx: ParseCtx): { route: string; state: ViewState } {
  const h = hash.replace(/^#/, '')
  const qIndex = h.indexOf('?')
  const path = qIndex >= 0 ? h.slice(0, qIndex) : h
  const qs = new URLSearchParams(qIndex >= 0 ? h.slice(qIndex + 1) : '')
  const state = defaultState()

  if (qs.has('f')) {
    const ids: string[] = []
    for (const raw of list(qs.get('f'))) {
      const id = ctx.resolveFund(raw)
      if (id && !ids.includes(id)) ids.push(id)
    }
    state.funds = ids.slice(0, MAX_FUNDS)
  }

  const preset = qs.get('preset')
  const from = qs.get('from')
  const to = qs.get('to')
  if (preset && ctx.presetIds.includes(preset)) {
    state.preset = preset
  } else {
    const f = from && !Number.isNaN(parseISO(from)) ? from : undefined
    const t = to && !Number.isNaN(parseISO(to)) ? to : undefined
    if (f && t && parseISO(f) >= parseISO(t)) {
      // contradictory window: ignore it
    } else {
      state.from = f
      state.to = t
    }
  }

  if (qs.get('rebase') === '0') state.rebase = false
  if (qs.get('log') === '1') state.log = true
  if (qs.get('view') === 'dd') state.view = 'dd'
  if (qs.get('shade') === '0') state.shade = false

  const ymin = num(qs.get('ymin'))
  const ymax = num(qs.get('ymax'))
  if (ymin !== undefined && ymax !== undefined && ymin >= ymax) {
    // contradictory range: ignore it
  } else {
    if (ymin !== undefined && !(state.log && ymin <= 0)) state.ymin = ymin
    if (ymax !== undefined && !(state.log && ymax <= 0)) state.ymax = ymax
  }
  const ddmin = num(qs.get('ddmin'))
  if (ddmin !== undefined && ddmin < 0 && ddmin >= -100) state.ddmin = ddmin

  state.q = (qs.get('q') ?? '').slice(0, 100)
  for (const key of FILTER_KEYS) {
    state.filters[key] = list(qs.get(key)).filter((v) => ctx.filterValues[key].includes(v))
  }

  if (qs.has('cols')) {
    const cols = list(qs.get('cols')).filter((c) => ctx.columnIds.includes(c))
    if (cols.length > 0) state.cols = cols
  }
  const sort = qs.get('sort')
  if (sort) {
    const [col, dir] = sort.split(':')
    if (ctx.columnIds.includes(col) || col === 'name') state.sort = { col, dir: dir === 'asc' ? 'asc' : 'desc' }
  }

  const route = path.startsWith('/') && path.length > 1 ? path : ROUTE_FUNDS
  return { route, state }
}

function enc(v: string): string {
  return encodeURIComponent(v).replace(/%2C/g, ',').replace(/%3A/g, ':')
}

/** Writes only what differs from the defaults, so links stay short. */
export function serializeState(state: ViewState, route: string = ROUTE_FUNDS): string {
  const parts: string[] = []
  const def = defaultState()
  const sameFunds = state.funds.length === def.funds.length && state.funds.every((f, i) => f === def.funds[i])
  if (!sameFunds) parts.push(`f=${state.funds.map(enc).join(',')}`)
  if (state.preset) parts.push(`preset=${enc(state.preset)}`)
  else {
    if (state.from) parts.push(`from=${state.from}`)
    if (state.to) parts.push(`to=${state.to}`)
  }
  if (!state.rebase) parts.push('rebase=0')
  if (state.log) parts.push('log=1')
  if (state.view === 'dd') parts.push('view=dd')
  if (!state.shade) parts.push('shade=0')
  if (state.ymin !== undefined) parts.push(`ymin=${state.ymin}`)
  if (state.ymax !== undefined) parts.push(`ymax=${state.ymax}`)
  if (state.ddmin !== undefined) parts.push(`ddmin=${state.ddmin}`)
  if (state.q.trim()) parts.push(`q=${enc(state.q.trim())}`)
  for (const key of FILTER_KEYS) {
    if (state.filters[key].length > 0) parts.push(`${key}=${state.filters[key].map(enc).join(',')}`)
  }
  if (state.cols && state.cols.length > 0) parts.push(`cols=${state.cols.map(enc).join(',')}`)
  if (state.sort) parts.push(`sort=${enc(state.sort.col)}:${state.sort.dir}`)
  return `#${route}${parts.length ? '?' + parts.join('&') : ''}`
}
