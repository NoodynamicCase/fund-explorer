import type { CatalogFund, HoldingsFile, Series } from '../types'
import { exposureOf, type Exposure } from './themes'
import { allTickers } from './catalog'
import { CRISES, type Crisis } from './crises'
import { fmtDate, fmtMonth, fmtNum, fmtPct } from './format'
import {
  bestWorstYear,
  betaCorrelation,
  crisisResult,
  trailingReturn,
  windowStats,
  type CalendarYear,
  type CrisisResult,
  type WindowStats,
} from './stats'
import { annualise } from './stats'
import { YEAR } from './series'

export interface RowCtx {
  fund: CatalogFund
  series: Series
  from?: number
  to?: number
  rfAnnual: number
  bench?: Series
  holdings?: HoldingsFile | null
  /** Pre-computed exposure (used for the user's mix). Wins over `holdings`. */
  exposure?: Exposure | null
}

export interface RowStats {
  fund: CatalogFund
  start: number
  end: number
  win: WindowStats | null
  r1: number | null
  r3: number | null
  r5: number | null
  r10: number | null
  sinceStart: number | null
  years: { best: CalendarYear; worst: CalendarYear } | null
  beta: { beta: number; corr: number } | null
  crisis: Record<string, CrisisResult | null>
  spliced: { ticker: string; until: string }[]
  synthetic: boolean
  /** AI / software / technology exposure from disclosed holdings; null when unknown or not meaningful. */
  exposure: Exposure | null
}

const FUND_OF_FUNDS = new Set(['allocation', 'target-date'])

export function computeRow(c: RowCtx): RowStats {
  const s = c.series
  const crisis: Record<string, CrisisResult | null> = {}
  for (const k of CRISES) crisis[k.id] = crisisResult(s, k)
  const total = s.v[s.v.length - 1] / s.v[0] - 1
  const yrs = (s.t[s.t.length - 1] - s.t[0]) / YEAR
  return {
    fund: c.fund,
    start: s.t[0],
    end: s.t[s.t.length - 1],
    win: windowStats(s, c.from, c.to, c.rfAnnual),
    r1: trailingReturn(s, 1),
    r3: trailingReturn(s, 3),
    r5: trailingReturn(s, 5),
    r10: trailingReturn(s, 10),
    sinceStart: yrs >= 0.95 ? annualise(total, yrs) : null,
    years: bestWorstYear(s),
    beta: c.bench && c.bench.id !== s.id ? betaCorrelation(s, c.bench, c.from, c.to) : null,
    crisis,
    spliced: (s.meta.spliced as { ticker: string; until: string }[] | undefined) ?? [],
    synthetic: Boolean(s.meta.synthetic),
    exposure: c.exposure !== undefined ? c.exposure : c.holdings && !FUND_OF_FUNDS.has(c.fund.kind) ? exposureOf(c.holdings) : null,
  }
}

export type CellValue = number | string | null

export interface ColumnDef {
  id: string
  label: string
  group: string
  help: string
  defaultOn: boolean
  numeric: boolean
  value: (r: RowStats) => CellValue
  format: (v: CellValue, r: RowStats) => string
  title?: (r: RowStats) => string | undefined
}

const G_WINDOW = 'For the chart window'
const G_LATEST = 'To the latest date'
const G_HIST = 'History'
const G_RISK = 'Risk'
const G_CRISIS = 'Market stress periods'
const G_ABOUT = 'About the fund'
const G_HOLD = 'Holdings and AI / software exposure'

function pct(
  id: string, label: string, group: string, help: string, defaultOn: boolean,
  value: (r: RowStats) => number | null, opts: { signed?: boolean; digits?: number } = {},
): ColumnDef {
  return {
    id, label, group, help, defaultOn, numeric: true, value,
    format: (v) => fmtPct(v as number | null, opts.digits ?? 1, opts.signed),
  }
}

function num(
  id: string, label: string, group: string, help: string, defaultOn: boolean,
  value: (r: RowStats) => number | null, digits = 2,
): ColumnDef {
  return { id, label, group, help, defaultOn, numeric: true, value, format: (v) => fmtNum(v as number | null, digits) }
}

const crisisCols = (): ColumnDef[] =>
  CRISES.flatMap((k: Crisis) => [
    pct(`c_${k.id}`, `${k.short}: return`, G_CRISIS,
      `Total return from the S&P 500's peak (${fmtDate(Date.parse(k.peak))}) to its low (${fmtDate(Date.parse(k.trough))}). Blank if the fund did not exist yet.`,
      false, (r) => r.crisis[k.id]?.ret ?? null, { signed: true }),
    pct(`d_${k.id}`, `${k.short}: worst fall`, G_CRISIS,
      `Deepest peak-to-trough fall inside the same period (${k.label}). Blank if the fund did not exist yet.`,
      false, (r) => r.crisis[k.id]?.drawdown ?? null),
  ])

export const COLUMNS: ColumnDef[] = [
  {
    id: 'start', label: 'History starts', group: G_HIST, defaultOn: true, numeric: true,
    help: 'First date with data in this app. Older share classes may be spliced in; see the fund info.',
    value: (r) => r.start, format: (v) => (v === null ? '–' : fmtMonth(v as number)),
    title: (r) => (r.spliced.length ? `Before this fund's own start, history uses ${r.spliced.map((s) => s.ticker).join(', ')} (older share class)` : undefined),
  },
  pct('winRet', 'Return', G_WINDOW, 'Total return over the window shown in the chart.', true, (r) => r.win?.totalReturn ?? null, { signed: true }),
  pct('winCagr', 'Per year', G_WINDOW, 'The same return expressed per year. Blank for windows under about a year.', true, (r) => r.win?.cagr ?? null, { signed: true }),
  pct('r1', '1 yr', G_LATEST, 'Annualised return over the last year of data.', true, (r) => r.r1, { signed: true }),
  pct('r3', '3 yr', G_LATEST, 'Annualised return over the last 3 years.', false, (r) => r.r3, { signed: true }),
  pct('r5', '5 yr', G_LATEST, 'Annualised return over the last 5 years.', true, (r) => r.r5, { signed: true }),
  pct('r10', '10 yr', G_LATEST, 'Annualised return over the last 10 years.', true, (r) => r.r10, { signed: true }),
  pct('sinceStart', 'Since start', G_LATEST, 'Annualised return over the fund’s whole history in this app.', false, (r) => r.sinceStart, { signed: true }),
  pct('vol', 'Volatility', G_RISK, 'How much returns bounce around: annualised standard deviation of weekly returns in the window. Higher means a bumpier ride.', true, (r) => r.win?.vol ?? null),
  {
    id: 'maxdd', label: 'Worst fall', group: G_RISK, defaultOn: true, numeric: true,
    help: 'Largest peak-to-trough drop inside the window (hover a value for the dates).',
    value: (r) => r.win?.maxDrawdown.depth ?? null,
    format: (v) => fmtPct(v as number | null, 1),
    title: (r) => {
      const d = r.win?.maxDrawdown
      if (!d || d.depth === 0) return undefined
      return `Peak ${fmtDate(d.peak)}, low ${fmtDate(d.trough)}, ${d.recovery ? `regained ${fmtDate(d.recovery)}` : 'not regained within this window'}`
    },
  },
  {
    id: 'recovery', label: 'Time to recover', group: G_RISK, defaultOn: false, numeric: true,
    help: 'Months from the low of the worst fall until the old peak was regained. Blank if it never was within the window.',
    value: (r) => {
      const d = r.win?.maxDrawdown
      return d && d.depth < 0 && d.recovery ? (d.recovery - d.trough) / (YEAR / 12) : null
    },
    format: (v) => (v === null ? '–' : `${Math.round(v as number)} mo`),
  },
  num('sharpe', 'Sharpe', G_RISK, 'Return above cash per unit of volatility, over the window. Higher is better.', true, (r) => r.win?.sharpe ?? null),
  num('sortino', 'Sortino', G_RISK, 'Like Sharpe, but only downward swings count as risk.', false, (r) => r.win?.sortino ?? null),
  pct('downside', 'Downside volatility', G_RISK, 'Annualised volatility of below-cash weekly returns only.', false, (r) => r.win?.downsideDev ?? null),
  pct('pctUp', 'Weeks up', G_RISK, 'Share of weeks with a gain, over the window.', false, (r) => r.win?.pctPositive ?? null, { digits: 0 }),
  {
    id: 'bestYear', label: 'Best year', group: G_HIST, defaultOn: false, numeric: true,
    help: 'Best complete calendar year in the fund’s history.',
    value: (r) => r.years?.best.ret ?? null,
    format: (v, r) => (v === null || !r.years ? '–' : `${fmtPct(v as number, 1, true)} (${r.years.best.year})`),
  },
  {
    id: 'worstYear', label: 'Worst year', group: G_HIST, defaultOn: false, numeric: true,
    help: 'Worst complete calendar year in the fund’s history.',
    value: (r) => r.years?.worst.ret ?? null,
    format: (v, r) => (v === null || !r.years ? '–' : `${fmtPct(v as number, 1, true)} (${r.years.worst.year})`),
  },
  num('beta', 'Beta vs S&P 500', G_RISK, 'How much the fund moves when the S&P 500 line moves, over the window. 1.0 moves in step; below 1 moves less.', false, (r) => r.beta?.beta ?? null),
  num('corr', 'Correlation vs S&P 500', G_RISK, 'How closely the fund moves with the S&P 500 line, from -1 to 1. Near 1 means little diversification.', false, (r) => r.beta?.corr ?? null),
  ...crisisCols(),
  {
    id: 'tech', label: 'Technology sector', group: G_HOLD, defaultOn: false, numeric: true,
    help: 'Share of the fund in technology-sector companies, as reported by the data provider. Blank until holdings data has been downloaded, and for bond funds.',
    value: (r) => r.exposure?.tech ?? null, format: (v) => (v === null ? '–' : `${(v as number).toFixed(1)}%`),
  },
  {
    id: 'aiTop', label: 'AI-linked (top holdings)', group: G_HOLD, defaultOn: false, numeric: true,
    help: 'Share of the fund in its ten biggest holdings that are chips, AI infrastructure, cloud platforms or other AI-dependent companies (my classification, listed in catalog/themes.json). Only the top ten are disclosed, so the true figure is higher. Blank for funds of funds.',
    value: (r) => r.exposure?.ai ?? null, format: (v) => (v === null ? '–' : `${(v as number).toFixed(1)}%`),
    title: (r) => (r.exposure ? `Top 10 holdings are ${r.exposure.covered.toFixed(1)}% of the fund` : undefined),
  },
  {
    id: 'swTop', label: 'Software (top holdings)', group: G_HOLD, defaultOn: false, numeric: true,
    help: 'Share of the fund in its ten biggest holdings that are software companies (my classification). Only the top ten are disclosed. Blank for funds of funds.',
    value: (r) => r.exposure?.software ?? null, format: (v) => (v === null ? '–' : `${(v as number).toFixed(1)}%`),
    title: (r) => (r.exposure ? `Top 10 holdings are ${r.exposure.covered.toFixed(1)}% of the fund` : undefined),
  },
  {
    id: 'aiSwTop', label: 'AI or software (top holdings)', group: G_HOLD, defaultOn: false, numeric: true,
    help: 'The two groups combined, counting a company once (Microsoft is both). Only the ten biggest holdings are counted.',
    value: (r) => r.exposure?.either ?? null, format: (v) => (v === null ? '–' : `${(v as number).toFixed(1)}%`),
    title: (r) => (r.exposure ? `Top 10 holdings are ${r.exposure.covered.toFixed(1)}% of the fund` : undefined),
  },
  {
    id: 'top10', label: 'Top 10 share', group: G_HOLD, defaultOn: false, numeric: true,
    help: 'How much of the fund the ten biggest holdings make up. A bigger number means a few companies drive the result.',
    value: (r) => r.exposure?.covered ?? null, format: (v) => (v === null ? '–' : `${(v as number).toFixed(1)}%`),
  },
  {
    id: 'tickers', label: 'Tickers', group: G_ABOUT, defaultOn: false, numeric: false,
    help: 'Funds that give this exposure.', value: (r) => allTickers(r.fund).join(' '), format: (v) => (v ? String(v) : '–'),
  },
  {
    id: 'stockShare', label: 'Stock share', group: G_ABOUT, defaultOn: false, numeric: true,
    help: 'Approximate share of the fund held in stocks (blank for target-date funds and non-stock assets).',
    value: (r) => (r.fund.equityPct === null ? null : r.fund.equityPct / 100), format: (v) => fmtPct(v as number | null, 0),
  },
  {
    id: 'asOf', label: 'Data through', group: G_HIST, defaultOn: false, numeric: true,
    help: 'Last date with data.', value: (r) => r.end, format: (v) => (v === null ? '–' : fmtDate(v as number)),
  },
]

export const COLUMN_IDS = COLUMNS.map((c) => c.id)
export const DEFAULT_COLUMNS = COLUMNS.filter((c) => c.defaultOn).map((c) => c.id)
export const COLUMN_GROUPS = [...new Set(COLUMNS.map((c) => c.group))]
