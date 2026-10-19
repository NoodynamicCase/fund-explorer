import { useCallback, useEffect, useRef, useState } from 'react'
import { filterValues, resolveFundId } from '../../lib/catalog'
import { COLUMN_IDS } from '../../lib/columns'
import { CRISES } from '../../lib/crises'
import { parseHash, serializeState, type ParseCtx, type ViewState } from '../../lib/urlState'

const ctx: ParseCtx = {
  resolveFund: resolveFundId,
  columnIds: COLUMN_IDS,
  presetIds: CRISES.map((c) => c.id),
  filterValues: filterValues(),
}

interface Parsed {
  route: string
  state: ViewState
}

const read = (): Parsed => parseHash(window.location.hash, ctx)

export type UpdateMode = 'push' | 'replace'
export type Patch = Partial<ViewState> | ((s: ViewState) => Partial<ViewState>)

/**
 * The whole view lives in the address bar: funds, window, axis settings, filters, columns.
 * Discrete choices add a history entry (Back works); continuous ones (dragging the zoom,
 * typing in search) replace the current entry.
 */
export function useViewState() {
  const [parsed, setParsed] = useState<Parsed>(read)
  const ref = useRef(parsed)

  useEffect(() => {
    const onNav = () => {
      const next = read()
      if (serializeState(next.state, next.route) !== serializeState(ref.current.state, ref.current.route)) {
        ref.current = next
        setParsed(next)
      }
    }
    window.addEventListener('popstate', onNav)
    window.addEventListener('hashchange', onNav)
    return () => {
      window.removeEventListener('popstate', onNav)
      window.removeEventListener('hashchange', onNav)
    }
  }, [])

  const update = useCallback((patch: Patch, mode: UpdateMode = 'push') => {
    const prev = ref.current
    const p = typeof patch === 'function' ? patch(prev.state) : patch
    const next: Parsed = { route: prev.route, state: { ...prev.state, ...p } }
    const before = serializeState(prev.state, prev.route)
    const after = serializeState(next.state, next.route)
    if (before === after) return
    if (mode === 'push') window.history.pushState(null, '', after)
    else window.history.replaceState(null, '', after)
    ref.current = next
    setParsed(next)
  }, [])

  return { route: parsed.route, state: parsed.state, update }
}
