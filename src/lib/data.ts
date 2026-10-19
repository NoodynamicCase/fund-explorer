import type { Manifest, Series, SeriesFile } from '../types'
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
