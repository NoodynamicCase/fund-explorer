import { describe, expect, it } from 'vitest'
import { filterValues, resolveFundId } from './catalog'
import { DEFAULT_FUNDS, defaultState, parseHash, serializeState, type ParseCtx } from './urlState'
import { assignSlots } from './colors'

const ctx: ParseCtx = {
  resolveFund: resolveFundId,
  columnIds: ['winRet', 'maxdd', 'vol', 'r5'],
  presetIds: ['dotcom', 'gfc'],
  filterValues: filterValues(),
}
const parse = (h: string) => parseHash(h, ctx).state

describe('URL state', () => {
  it('an empty or unknown hash gives the defaults and an empty link', () => {
    expect(parse('')).toEqual(defaultState())
    expect(serializeState(defaultState())).toBe('#/funds')
  })

  it('round-trips a full view', () => {
    const state = {
      ...defaultState(),
      funds: ['VFIAX', 'VBLAX', 'GLD'],
      from: '1999-06-01',
      to: '2003-01-31',
      rebase: false,
      log: true,
      view: 'dd' as const,
      shade: false,
      ymin: 50,
      ymax: 400,
      ddmin: -60,
      q: 'dividend growth',
      filters: { ...defaultState().filters, cls: ['us-stock', 'bond'], hist: ['gfc'] },
      cols: ['maxdd', 'vol'],
      sort: { col: 'maxdd', dir: 'asc' as const },
    }
    const link = serializeState(state)
    expect(parse(link)).toEqual(state)
  })

  it('a preset replaces explicit dates', () => {
    const link = serializeState({ ...defaultState(), preset: 'gfc', from: '2000-01-01' })
    expect(link).toBe('#/funds?preset=gfc')
    expect(parse(link).preset).toBe('gfc')
  })

  it('writes only non-default values, with readable commas', () => {
    const link = serializeState({ ...defaultState(), funds: ['VFIAX', 'VBTLX'] })
    expect(link).toBe('#/funds?f=VFIAX,VBTLX')
  })

  it('an explicitly empty selection survives (it is not the default)', () => {
    const link = serializeState({ ...defaultState(), funds: [] })
    expect(link).toBe('#/funds?f=')
    expect(parse(link).funds).toEqual([])
  })

  it('accepts any ticker of an exposure and drops unknown ones and duplicates', () => {
    expect(parse('#/funds?f=voo,SWPPX,NOPE,VBTLX').funds).toEqual(['VFIAX', 'VBTLX'])
  })

  it('ignores garbage values instead of breaking', () => {
    const s = parse('#/funds?from=banana&to=2020-02-31&ymin=abc&ymax=&ddmin=50&view=zzz&cls=nope,bond&cols=zzz&sort=zzz:asc&preset=zzz')
    expect(s.from).toBeUndefined()
    expect(s.to).toBeUndefined()
    expect(s.ymin).toBeUndefined()
    expect(s.ddmin).toBeUndefined()
    expect(s.view).toBe('perf')
    expect(s.filters.cls).toEqual(['bond'])
    expect(s.cols).toBeUndefined()
    expect(s.sort).toBeUndefined()
    expect(s.preset).toBeUndefined()
  })

  it('drops contradictory ranges', () => {
    expect(parse('#/funds?from=2010-01-01&to=2000-01-01').from).toBeUndefined()
    expect(parse('#/funds?ymin=200&ymax=100').ymin).toBeUndefined()
    expect(parse('#/funds?log=1&ymin=-5').ymin).toBeUndefined()
  })

  it('reads the route so future modules can share the same scheme', () => {
    expect(parseHash('#/retirement?x=1', ctx).route).toBe('/retirement')
    expect(parseHash('#?f=VFIAX', ctx).route).toBe('/funds')
  })

  it('caps the number of funds', () => {
    const ids = ['VFIAX', 'VTSAX', 'VEXAX', 'VIGAX', 'VVIAX', 'VIMAX', 'VSMAX', 'VSIAX', 'VIG', 'VYM', 'SCHD', 'VTIAX', 'VTMGX', 'SWISX']
    expect(parse(`#/funds?f=${ids.join(',')}`).funds).toHaveLength(12)
  })

  it('default funds are all in the catalog', () => {
    for (const id of DEFAULT_FUNDS) expect(resolveFundId(id)).toBe(id)
  })
})

describe('colour slots', () => {
  it('keeps colours stable when another fund is removed', () => {
    const a = assignSlots({}, [{ id: 'A', bench: false }, { id: 'B', bench: false }, { id: 'C', bench: false }])
    const b = assignSlots(a as never, [{ id: 'A', bench: false }, { id: 'C', bench: false }])
    expect(b.A).toEqual(a.A)
    expect(b.C).toEqual(a.C)
    const c = assignSlots(b as never, [{ id: 'A', bench: false }, { id: 'C', bench: false }, { id: 'D', bench: false }])
    expect(c.D).toEqual({ kind: 'series', index: 1 }) // reuses the freed slot
  })
  it('separates benchmarks from funds and reports overflow', () => {
    const sel = Array.from({ length: 9 }, (_, i) => ({ id: `F${i}`, bench: false }))
    const res = assignSlots({}, [...sel, { id: 'BM', bench: true }])
    expect(res.F8).toBeUndefined()
    expect(res.BM).toEqual({ kind: 'bench', index: 0 })
  })
})
