export type AssetClass = 'us-stock' | 'sector' | 'intl-stock' | 'bond' | 'balanced' | 'real-assets' | 'alternatives' | 'reference'
export type Mix = 'stock' | 'mixed' | 'bond' | 'other'
export type Kind = 'index' | 'allocation' | 'target-date' | 'active' | 'commodity' | 'benchmark'
export type Wrapper = 'mutual-fund' | 'etf' | 'reference'
export type Region = 'us' | 'intl' | 'global'

export interface CatalogFund {
  id: string
  name: string
  short: string
  kind: Kind
  assetClass: AssetClass
  category: string
  region: Region
  mix: Mix
  equityPct: number | null
  wrapper: Wrapper
  index: string
  tickers: Record<string, string[]>
  data: { type: string; ticker?: string; extends?: string[]; series?: string; weights?: Record<string, number> }
  purpose: string
  overview: string
  goal: string
  note?: string
  /** Free-form labels used by the Theme filter (sector, tax-managed, factor, defensive, ai-software, dividend). */
  tags?: string[]
}

/** What a series file on disk looks like (see scripts/fetch_data.py). */
export interface SeriesFile {
  id: string
  dates: string[]
  values: number[]
  source?: string
  synthetic?: boolean
  providerName?: string | null
  dataTicker?: string
  spliced?: { ticker: string; until: string }[]
  fetchedAt?: string
}

export interface ManifestEntry {
  first: string
  last: string
  points: number
  source: string
  synthetic: boolean
  fetchedAt?: string
}

export interface Holding {
  symbol: string
  name: string
  /** Percent of the fund (7.4 = 7.4%). */
  pct: number
}

/** Biggest holdings of a fund (public/data/holdings/<id>.json). Yahoo Finance reports only the top 10. */
export interface HoldingsFile {
  id: string
  asOf: string
  source?: string
  symbol?: string
  top: Holding[]
  topTotal?: number
  /** Percent by sector, Yahoo's keys (technology, healthcare, financial_services ...). */
  sectors?: Record<string, number>
  assets?: Record<string, number>
}

export interface Manifest {
  generatedAt: string | null
  synthetic: boolean
  sourceOrder?: string[]
  /** Fund ids that have a holdings file. */
  holdings?: string[]
  funds: Record<string, ManifestEntry>
  failed?: { id: string; reason: string }[]
}

/** A series in memory: timestamps in ms (UTC midnight) and index values. */
export interface Series {
  id: string
  t: number[]
  v: number[]
  meta: Partial<Omit<SeriesFile, 'dates' | 'values'>>
}

export type ViewMode = 'perf' | 'dd'
