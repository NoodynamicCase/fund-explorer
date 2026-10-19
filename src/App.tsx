import { useCallback, useEffect, useRef, useState } from 'react'
import { loadManifest } from './lib/data'
import { FundsModule } from './modules/funds/FundsModule'
import { useViewState } from './modules/funds/useViewState'
import { Header, type ModuleLink } from './shell/Header'
import type { Manifest } from './types'

// Add future modules (retirement projections, net worth...) here and in the route switch below.
const MODULES: ModuleLink[] = [{ path: '/funds', label: 'Fund explorer' }]

export default function App() {
  const { route, state, update } = useViewState()
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const fetchManifest = useCallback(() => {
    setError(null)
    loadManifest().then(setManifest).catch((e: Error) => setError(e.message))
  }, [])
  useEffect(fetchManifest, [fetchManifest])

  const notify = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), 3600)
  }, [])

  const copyLink = useCallback(async () => {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      notify('Link copied. Anyone who opens it sees this exact view.')
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = url
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        if (!ok) throw new Error('copy failed')
        notify('Link copied. Anyone who opens it sees this exact view.')
      } catch {
        window.prompt('Copy this link:', url)
      }
    }
  }, [notify])

  return (
    <>
      <Header modules={MODULES} route={route} manifest={manifest} onCopy={copyLink} />
      {manifest?.synthetic && (
        <div className="banner" role="status">
          <strong>Sample data.</strong> The lines you see are invented to preview the layout. They are not real fund performance.
        </div>
      )}
      <main className="app">
        {error && (
          <div className="banner error" role="alert">
            <span>{error}</span>
            <button type="button" className="btn" onClick={fetchManifest}>Try again</button>
          </div>
        )}
        {route === '/funds' ? (
          <FundsModule state={state} update={update} manifest={manifest} notify={notify} />
        ) : (
          <section className="card">
            <h2>That page does not exist</h2>
            <p><a href="#/funds">Go to the fund explorer</a></p>
          </section>
        )}
      </main>
      <footer className="site-footer">
        <p>
          For research, not advice. Past performance does not predict future results. Prices come from public data providers and are adjusted for dividends; they can contain errors, and funds that closed or merged may be missing. This site is not affiliated with Vanguard or Schwab.
        </p>
      </footer>
      <div className="toast" role="status" aria-live="polite">{toast}</div>
    </>
  )
}
