import { describe, expect, it } from 'vitest'
import { blendExposure, exposureOf, sectorName, themesOf } from './themes'

describe('themes', () => {
  it('tags known symbols and ignores unknown ones', () => {
    expect(themesOf('NVDA')).toEqual(['ai'])
    expect(themesOf('msft')).toEqual(['ai', 'software'])
    expect(themesOf('KO')).toEqual([])
  })
  it('sums exposure over the disclosed holdings without double counting', () => {
    const e = exposureOf({
      id: 'X', asOf: '2026-10-19',
      top: [{ symbol: 'MSFT', name: 'Microsoft', pct: 6 }, { symbol: 'NVDA', name: 'Nvidia', pct: 7 }, { symbol: 'CRM', name: 'Salesforce', pct: 1.5 }, { symbol: 'WMT', name: 'Walmart', pct: 2 }],
      sectors: { technology: 31.04 },
    })
    expect(e).toEqual({ ai: 13, software: 7.5, either: 14.5, covered: 16.5, tech: 31 })
  })
  it('has readable sector names', () => {
    expect(sectorName('financial_services')).toBe('Financials')
    expect(sectorName('odd_new_key')).toBe('odd new key')
  })

  it('blends exposure by weight and treats bonds as zero', () => {
    const stock = { ai: 20, software: 10, either: 25, covered: 40, tech: 30 }
    expect(blendExposure([{ weight: 60, exposure: stock }, { weight: 40, exposure: 'none' }])).toEqual({ ai: 12, software: 6, either: 15, covered: 24, tech: 18 })
  })
  it('is unknown when a stock fund has no holdings data', () => {
    expect(blendExposure([{ weight: 1, exposure: null }, { weight: 1, exposure: 'none' }])).toBeNull()
    expect(blendExposure([])).toBeNull()
  })
})
