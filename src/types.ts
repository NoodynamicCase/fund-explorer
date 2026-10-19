export type AssetClass = 'us-stock' | 'intl-stock' | 'bond' | 'balanced' | 'real-assets' | 'reference'
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

export interface Manifest {
  generatedAt: string | null
  synthetic: boolean
  sourceOrder?: string[]
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
