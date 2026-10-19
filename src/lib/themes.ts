import raw from '../../catalog/themes.json'
import type { Holding, HoldingsFile } from '../types'

export type ThemeId = 'ai' | 'software'
const SYMBOLS = (raw as unknown as { symbols: Record<string, ThemeId[]> }).symbols
export const THEME_LABELS = (raw as unknown as { labels: Record<ThemeId, string> }).labels

export function themesOf(symbol: string): ThemeId[] {
  return SYMBOLS[symbol.toUpperCase().replace('.', '-')] ?? []
}

export interface Exposure {
  /** Percent of the fund in disclosed top holdings that are AI-linked / software / either. */
  ai: number
  software: number
  either: number
  /** Percent of the fund covered by the disclosed holdings, so the numbers above can be read in context. */
  covered: number
  /** Technology sector weight in percent, when the provider reports sectors. */
  tech: number | null
}

const round1 = (x: number) => Math.round(x * 10) / 10

export function exposureOf(h: HoldingsFile): Exposure {
  let ai = 0
  let sw = 0
  let either = 0
  for (const x of h.top) {
    const t = themesOf(x.symbol)
    if (t.includes('ai')) ai += x.pct
    if (t.includes('software')) sw += x.pct
    if (t.length > 0) either += x.pct
  }
  const covered = h.top.reduce((a, x) => a + x.pct, 0)
  const tech = h.sectors && typeof h.sectors.technology === 'number' ? h.sectors.technology : null
  return { ai: round1(ai), software: round1(sw), either: round1(either), covered: round1(covered), tech: tech === null ? null : round1(tech) }
}

export function taggedHoldings(top: Holding[]): (Holding & { themes: ThemeId[] })[] {
  return top.map((x) => ({ ...x, themes: themesOf(x.symbol) }))
}

const SECTOR_NAMES: Record<string, string> = {
  technology: 'Technology',
  healthcare: 'Health care',
  financial_services: 'Financials',
  consumer_cyclical: 'Consumer discretionary',
  consumer_defensive: 'Consumer staples',
  communication_services: 'Communication services',
  industrials: 'Industrials',
  energy: 'Energy',
  utilities: 'Utilities',
  basic_materials: 'Materials',
  realestate: 'Real estate',
}
export const sectorName = (k: string) => SECTOR_NAMES[k] ?? k.replace(/_/g, ' ')

/**
 * Exposure of a mix: each fund's exposure scaled by its weight. A fund with no stock holdings
 * (bonds, gold, cash) is passed as 'none' and counts as zero; if a stock fund's holdings are
 * unknown (null) the whole figure is unknown rather than silently too low.
 */
export function blendExposure(parts: { weight: number; exposure: Exposure | null | 'none' }[]): Exposure | null {
  const total = parts.reduce((a, p) => a + p.weight, 0)
  if (parts.length === 0 || total <= 0) return null
  const out = { ai: 0, software: 0, either: 0, covered: 0, tech: 0 }
  for (const p of parts) {
    if (p.exposure === null) return null
    if (p.exposure === 'none') continue
    const w = p.weight / total
    out.ai += w * p.exposure.ai
    out.software += w * p.exposure.software
    out.either += w * p.exposure.either
    out.covered += w * p.exposure.covered
    if (p.exposure.tech === null) return null
    out.tech += w * p.exposure.tech
  }
  return { ai: round1(out.ai), software: round1(out.software), either: round1(out.either), covered: round1(out.covered), tech: round1(out.tech) }
}
