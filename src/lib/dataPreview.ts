// Only used by `npm run build:preview`: sample data baked into one html file.
import type { Manifest, SeriesFile } from '../types'

const seriesFiles = import.meta.glob('../../preview-data/series/*.json', { eager: true, import: 'default' }) as Record<
  string,
  SeriesFile
>
const manifests = import.meta.glob('../../preview-data/manifest.json', { eager: true, import: 'default' }) as Record<
  string,
  Manifest
>

export const manifest: Manifest = Object.values(manifests)[0] ?? { generatedAt: null, synthetic: false, funds: {} }

const byId = new Map<string, SeriesFile>()
for (const f of Object.values(seriesFiles)) byId.set(f.id, f)

export function getSeriesFile(id: string): SeriesFile | undefined {
  return byId.get(id)
}
