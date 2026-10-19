import type { HoldingsFile, Manifest, Series, SeriesFile } from '../types'
import { toSeries } from './series'

declare const __PREVIEW__: boolean

export const EMPTY_MANIFEST: Manifest = { generatedAt: null, synthetic: false, funds: {} }

let manifestPromise: Promise<Manifest> | null = null
const seriesCache = new Map<string, Promise<Series>>()

function dataUrl(path: string): string {
  return new URL(path, document.baseURI).toString()
}

/** Loads data/manifest.json. A missing file (404) means the data job has not run yet. */
export function loadManifest(): Promise<Manifest> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      if (__PREVIEW__) {
        const m = await import('./dataPreview')
        return m.manifest
      }
      const res = await fetch(dataUrl('data/manifest.json'), { cache: 'no-cache' })
      if (res.status === 404) return EMPTY_MANIFEST
      if (!res.ok) throw new Error(`Could not load the data index (HTTP ${res.status}).`)
      return (await res.json()) as Manifest
    })()
    manifestPromise.catch(() => {
      manifestPromise = null // allow a retry
    })
  }
  return manifestPromise
}

export function loadSeries(id: string): Promise<Series> {
  let p = seriesCache.get(id)
  if (!p) {
    p = (async () => {
      let file: SeriesFile | undefined
      if (__PREVIEW__) {
        const m = await import('./dataPreview')
        file = m.getSeriesFile(id)
        if (!file) throw new Error(`No sample data for ${id}`)
      } else {
        const res = await fetch(dataUrl(`data/series/${encodeURIComponent(id)}.json`), { cache: 'no-cache' })
        if (!res.ok) throw new Error(`Could not load ${id} (HTTP ${res.status}).`)
        file = (await res.json()) as SeriesFile
      }
      const s = toSeries(file)
      if (s.t.length < 2) throw new Error(`${id} has too little data.`)
      return s
    })()
    seriesCache.set(id, p)
    p.catch(() => seriesCache.delete(id))
  }
  return p
}

const holdingsCache = new Map<string, Promise<HoldingsFile | null>>()

/** Top holdings for a fund, or null when there is no file (not every fund has one). */
export function loadHoldings(id: string): Promise<HoldingsFile | null> {
  let p = holdingsCache.get(id)
  if (!p) {
    p = (async () => {
      if (__PREVIEW__) return null
      try {
        const res = await fetch(dataUrl(`data/holdings/${encodeURIComponent(id)}.json`), { cache: 'no-cache' })
        if (!res.ok) return null
        const h = (await res.json()) as HoldingsFile
        return Array.isArray(h.top) && h.top.length > 0 ? h : null
      } catch {
        return null
      }
    })()
    holdingsCache.set(id, p)
  }
  return p
}
