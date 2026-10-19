import raw from '../../catalog/funds.json'
import type { AssetClass, CatalogFund, Manifest } from '../types'
import { parseISO } from './format'
import { crisisById } from './crises'

export const CATALOG: CatalogFund[] = (raw as unknown as { funds: CatalogFund[] }).funds
export const BY_ID = new Map(CATALOG.map((f) => [f.id, f]))

const TICKER_TO_ID = new Map<string, string>()
for (const f of CATALOG) {
  TICKER_TO_ID.set(f.id.toUpperCase(), f.id)
  for (const list of Object.values(f.tickers)) for (const t of list) TICKER_TO_ID.set(t.toUpperCase(), f.id)
}

/** Accepts an id or ANY ticker of the exposure (VOO and SWPPX resolve to the S&P 500 entry). */
export function resolveFundId(input: string): string | undefined {
  return TICKER_TO_ID.get(input.trim().toUpperCase())
}

export function isBenchmark(f: CatalogFund): boolean {
  return f.kind === 'benchmark'
}

export function allTickers(f: CatalogFund): string[] {
  const out: string[] = []
  for (const list of Object.values(f.tickers)) for (const t of list) if (!out.includes(t)) out.push(t)
  return out
}

export const ASSET_CLASSES: { id: AssetClass; label: string }[] = [
  { id: 'us-stock', label: 'US stocks' },
  { id: 'sector', label: 'Sectors and themes' },
  { id: 'intl-stock', label: 'International stocks' },
  { id: 'bond', label: 'Bonds' },
  { id: 'balanced', label: 'Balanced and target-date' },
  { id: 'real-assets', label: 'Real estate, metals and commodities' },
  { id: 'alternatives', label: 'Hedges and alternatives' },
  { id: 'reference', label: 'Benchmarks and blends' },
]

export type FilterKey = 'cls' | 'tag' | 'mix' | 'reg' | 'prov' | 'kind' | 'wrap' | 'hist'
export type Filters = Record<FilterKey, string[]>
export const EMPTY_FILTERS: Filters = { cls: [], tag: [], mix: [], reg: [], prov: [], kind: [], wrap: [], hist: [] }

export const FILTER_GROUPS: { key: FilterKey; label: string; options: { value: string; label: string }[] }[] = [
  { key: 'cls', label: 'Asset class', options: ASSET_CLASSES.map((a) => ({ value: a.id, label: a.label })) },
  {
    key: 'tag',
    label: 'Theme',
    options: [
      { value: 'defensive', label: 'Built to be steadier in downturns' },
      { value: 'ai-software', label: 'Heavy in AI, software or chips' },
      { value: 'sector', label: 'Sector fund' },
      { value: 'tax-managed', label: 'Tax-managed or tax-exempt' },
      { value: 'factor', label: 'Strategy (low volatility, equal weight...)' },
      { value: 'dividend', label: 'Dividend or income' },
    ],
  },
  {
    key: 'mix',
    label: 'Stock / bond mix',
    options: [
      { value: 'stock', label: 'All stock' },
      { value: 'mixed', label: 'Stock and bond mix' },
      { value: 'bond', label: 'All bond' },
      { value: 'other', label: 'Neither (gold, REITs, cash)' },
    ],
  },
  {
    key: 'reg',
    label: 'Region',
    options: [
      { value: 'us', label: 'US' },
      { value: 'intl', label: 'International' },
      { value: 'global', label: 'Global / mixed' },
    ],
  },
  {
    key: 'prov',
    label: 'Offered by',
    options: [
      { value: 'vanguard', label: 'Vanguard' },
      { value: 'schwab', label: 'Schwab' },
      { value: 'both', label: 'Both' },
      { value: 'other', label: 'Neither (reference ETFs)' },
    ],
  },
  {
    key: 'kind',
    label: 'Fund type',
    options: [
      { value: 'index', label: 'Index fund' },
      { value: 'allocation', label: 'Fixed-mix fund of funds' },
      { value: 'target-date', label: 'Target-date' },
      { value: 'active', label: 'Actively managed' },
      { value: 'commodity', label: 'Bullion' },
      { value: 'benchmark', label: 'Benchmark' },
    ],
  },
  {
    key: 'wrap',
    label: 'Format',
    options: [
      { value: 'mutual-fund', label: 'Mutual fund' },
      { value: 'etf', label: 'ETF' },
      { value: 'reference', label: 'Calculated series' },
    ],
  },
  {
    key: 'hist',
    label: 'History reaches back to before',
    options: [
      { value: 'dotcom', label: 'the dot-com peak (Mar 2000)' },
      { value: 'gfc', label: 'the 2008 crisis (Oct 2007)' },
    ],
  },
]

export function filterValues(): Record<FilterKey, string[]> {
  const out = {} as Record<FilterKey, string[]>
  for (const g of FILTER_GROUPS) out[g.key] = g.options.map((o) => o.value)
  return out
}

export function providersOf(f: CatalogFund): string[] {
  const has = (name: string) => (f.tickers[name]?.length ?? 0) > 0
  const out: string[] = []
  if (has('Vanguard')) out.push('vanguard')
  if (has('Schwab')) out.push('schwab')
  if (has('Vanguard') && has('Schwab')) out.push('both')
  if (!has('Vanguard') && !has('Schwab')) out.push('other')
  return out
}

function matchesGroup(selected: string[], values: string[]): boolean {
  return selected.length === 0 || selected.some((s) => values.includes(s))
}

export function matchesFilters(f: CatalogFund, filters: Filters, manifest: Manifest | null): boolean {
  if (!matchesGroup(filters.cls, [f.assetClass])) return false
  if (!matchesGroup(filters.tag, f.tags ?? [])) return false
  if (!matchesGroup(filters.mix, [f.mix])) return false
  if (!matchesGroup(filters.reg, [f.region])) return false
  if (!matchesGroup(filters.prov, providersOf(f))) return false
  if (!matchesGroup(filters.kind, [f.kind])) return false
  if (!matchesGroup(filters.wrap, [f.wrapper])) return false
  if (filters.hist.length > 0) {
    const first = manifest?.funds[f.id]?.first
    if (!first) return false
    const start = parseISO(first)
    const ok = filters.hist.every((h) => {
      const c = crisisById(h)
      return c ? start <= parseISO(c.peak) : true
    })
    if (!ok) return false
  }
  return true
}

function haystack(f: CatalogFund): string {
  return [f.name, f.short, f.category, f.index, f.purpose, f.overview, f.goal, f.note ?? '', allTickers(f).join(' '), f.id].join(' ').toLowerCase()
}
const HAY = new Map(CATALOG.map((f) => [f.id, haystack(f)]))

/** Every word in the query must appear somewhere in the fund's name, tickers or description. */
export function matchesSearch(f: CatalogFund, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const h = HAY.get(f.id) ?? haystack(f)
  return words.every((w) => h.includes(w))
}

export interface FundGroup {
  cls: AssetClass
  label: string
  subgroups: { category: string; funds: CatalogFund[] }[]
  count: number
}

export function groupFunds(funds: CatalogFund[]): FundGroup[] {
  const out: FundGroup[] = []
  for (const a of ASSET_CLASSES) {
    const inClass = funds.filter((f) => f.assetClass === a.id)
    if (inClass.length === 0) continue
    const cats: string[] = []
    for (const f of inClass) if (!cats.includes(f.category)) cats.push(f.category)
    out.push({
      cls: a.id,
      label: a.label,
      count: inClass.length,
      subgroups: cats.map((c) => ({ category: c, funds: inClass.filter((f) => f.category === c) })),
    })
  }
  return out
}

export const QUICK_SETS: { label: string; hint: string; ids: string[]; mix?: Record<string, number> }[] = [
  { label: 'Stocks, bonds, gold', hint: 'The three basic ingredients side by side', ids: ['VFIAX', 'VBTLX', 'GLD'] },
  { label: 'US vs international', hint: 'Home market against the rest of the world', ids: ['VFIAX', 'VTIAX', 'VEMAX'] },
  { label: 'Risk ladder', hint: 'Vanguard LifeStrategy from 80% to 20% stocks', ids: ['VASGX', 'VSMGX', 'VSCGX', 'VASIX'] },
  { label: 'Stock/bond blends', hint: '80/20 down to 20/80, rebalanced monthly', ids: ['BLEND8020', 'BLEND6040', 'BLEND4060', 'BLEND2080'] },
  { label: 'Bond maturities', hint: 'Short, intermediate and long Treasuries', ids: ['VGSH', 'VGIT', 'VGLT'] },
  { label: 'Stocks vs 60/40 vs cash', hint: 'What risk bought you, and what cash would have done', ids: ['VFIAX', 'BLEND6040', 'CASH'] },
  { label: 'Held up in downturns', hint: 'Defensive sectors, low volatility, gold and bonds next to the S&P 500', ids: ['VFIAX', 'VDC', 'VPU', 'USMV', 'GLD', 'VBTLX'] },
  { label: 'Sector spread', hint: 'Six sectors that behave very differently', ids: ['VGT', 'VHT', 'VFH', 'VDE', 'VDC', 'VPU'] },
  { label: 'AI and software bets', hint: 'The most AI- and software-heavy funds against the S&P 500', ids: ['VFIAX', 'QQQ', 'IGV', 'SMH'] },
  { label: 'Dilute the big tech names', hint: 'Equal weight, value and dividend funds hold far less of the largest technology stocks', ids: ['VFIAX', 'RSP', 'VVIAX', 'SCHD', 'VDC'] },
  { label: 'Tax-managed vs regular', hint: 'Before-tax returns are close; the difference is the tax bill', ids: ['VFIAX', 'VTCLX', 'VWIUX', 'VBILX'] },
  { label: '50/50 mix example', hint: 'Half S&P 500, half Total Bond Market, built with the mix tool', ids: ['VFIAX', 'VBTLX'], mix: { VFIAX: 50, VBTLX: 50 } },
]
