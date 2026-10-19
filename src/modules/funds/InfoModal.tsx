import { useEffect, useRef } from 'react'
import type { CatalogFund, ManifestEntry, Series } from '../../types'
import { fmtDate } from '../../lib/format'
import { parseISO } from '../../lib/format'
import { IconClose } from './icons'

interface Props {
  fund: CatalogFund
  entry?: ManifestEntry
  series?: Series
  selected: boolean
  canAdd: boolean
  onToggle: () => void
  onClose: () => void
}

const isMutualFund = (t: string) => t.length === 5 && t.endsWith('X')

function providerLinks(fund: CatalogFund): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = []
  for (const t of fund.tickers.Vanguard ?? []) {
    const kind = isMutualFund(t) ? 'mutual-funds' : 'etfs'
    out.push({ label: `${t} at Vanguard`, href: `https://investor.vanguard.com/investment-products/${kind}/profile/${t.toLowerCase()}` })
  }
  for (const t of fund.tickers.Schwab ?? []) {
    out.push({ label: `${t} at Schwab Asset Management`, href: `https://www.schwabassetmanagement.com/products/${t.toLowerCase()}` })
  }
  const main = fund.data.ticker
  if (main) {
    out.push({ label: `${main} on Yahoo Finance`, href: `https://finance.yahoo.com/quote/${main}` })
    out.push({ label: `${main} on Morningstar`, href: `https://www.morningstar.com/search?query=${main}` })
  }
  return out
}

export function InfoModal({ fund, entry, series, selected, canAdd, onToggle, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const prevFocus = useRef<Element | null>(null)

  useEffect(() => {
    prevFocus.current = document.activeElement
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      if (prevFocus.current instanceof HTMLElement) prevFocus.current.focus()
    }
  }, [onClose])

  const spliced = (series?.meta.spliced as { ticker: string; until: string }[] | undefined) ?? []
  const providerName = series?.meta.providerName as string | undefined
  const tickerGroups = Object.entries(fund.tickers).filter(([, l]) => l.length > 0)

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-head">
          <div>
            <h2 id="modal-title">{fund.name}</h2>
            <p className="dim">{fund.category}</p>
          </div>
          <button ref={closeRef} type="button" className="btn icon" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>

        <div className="modal-body">
          <dl className="facts">
            <dt>Purpose</dt>
            <dd>{fund.purpose}</dd>
            <dt>What it holds</dt>
            <dd>{fund.overview}</dd>
            <dt>Goal</dt>
            <dd>{fund.goal}</dd>
            <dt>Follows</dt>
            <dd>{fund.index}</dd>
            {tickerGroups.length > 0 && (
              <>
                <dt>Same exposure</dt>
                <dd>
                  {tickerGroups.map(([who, list]) => (
                    <span key={who} className="ticker-group">
                      <span className="dim">{who}:</span> {list.join(', ')}
                    </span>
                  ))}
                </dd>
              </>
            )}
            <dt>History here</dt>
            <dd>
              {entry ? (
                <>
                  {fmtDate(parseISO(entry.first))} to {fmtDate(parseISO(entry.last))}
                  {entry.synthetic ? ' (sample data)' : ''}
                </>
              ) : (
                'No data yet'
              )}
              {spliced.length > 0 && (
                <span className="modal-note">
                  Before {fmtDate(parseISO(spliced[0].until))}, this line uses the older share class {spliced.map((s) => s.ticker).join(', ')}, scaled to match on that date. Returns differ only by the fee difference between share classes.
                </span>
              )}
              {providerName && !entry?.synthetic && <span className="modal-note">The data provider names {fund.data.ticker} “{providerName}”. If that looks like a different fund, tell the app’s maintainer.</span>}
            </dd>
          </dl>
          {fund.note && <p className="modal-callout">{fund.note}</p>}
          <p className="modal-links">
            {providerLinks(fund).map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">
                {l.label}
              </a>
            ))}
            <a href="https://www.bogleheads.org/wiki/Main_Page" target="_blank" rel="noopener noreferrer">
              Bogleheads wiki
            </a>
          </p>
          <p className="fineprint">
            These summaries are written from general knowledge, not taken from the fund’s prospectus. Confirm details on the provider’s page before acting. Past performance does not predict future results.
          </p>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn primary" onClick={onToggle} disabled={!selected && !canAdd}>
            {selected ? 'Remove from chart' : canAdd ? 'Add to chart' : 'Chart is full'}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
