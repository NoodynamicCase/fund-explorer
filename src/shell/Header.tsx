import type { Manifest } from '../types'
import { fmtDate, parseISO } from '../lib/format'
import { IconLink } from '../modules/funds/icons'

export interface ModuleLink {
  path: string
  label: string
}

interface Props {
  modules: ModuleLink[]
  route: string
  manifest: Manifest | null
  onCopy: () => void
}

export function Header({ modules, route, manifest, onCopy }: Props) {
  const refreshed = manifest?.generatedAt ? fmtDate(parseISO(manifest.generatedAt.slice(0, 10))) : null
  return (
    <header className="site-header">
      <div className="brand">
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="currentColor" />
          <path d="M6 22 12.5 14.5l5 4L26 8" fill="none" stroke="var(--surface)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <div className="brand-name">Fund Explorer</div>
          <div className="brand-sub">Vanguard and Schwab index funds through every market cycle</div>
        </div>
      </div>
      <nav aria-label="Sections">
        {modules.map((m) => (
          <a key={m.path} href={`#${m.path}`} aria-current={route === m.path ? 'page' : undefined}>
            {m.label}
          </a>
        ))}
      </nav>
      <div className="header-right">
        {refreshed && <span className="dim refreshed">Data through {refreshed}</span>}
        <button type="button" className="btn" onClick={onCopy}>
          <IconLink />
          <span>Copy link to this view</span>
        </button>
      </div>
    </header>
  )
}
