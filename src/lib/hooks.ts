import { useEffect, useState } from 'react'
import type { ChartTokens } from './chartOption'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false))
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setMatches(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return matches
}

export type Theme = 'light' | 'dark'

export function useTheme(): Theme {
  return useMediaQuery('(prefers-color-scheme: dark)') ? 'dark' : 'light'
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

/** Reads the colour tokens from the stylesheet so the chart follows light/dark mode. */
export function readChartTokens(): ChartTokens {
  return {
    ink: cssVar('--ink', '#0b0b0b'),
    ink2: cssVar('--ink-2', '#52514e'),
    muted: cssVar('--muted', '#898781'),
    grid: cssVar('--grid', '#e1e0d9'),
    axis: cssVar('--axis', '#c3c2b7'),
    surface: cssVar('--surface', '#fcfcfb'),
    band: cssVar('--band', 'rgba(11,11,11,0.06)'),
    bandText: cssVar('--ink-2', '#52514e'),
    watermark: cssVar('--watermark', 'rgba(11,11,11,0.07)'),
  }
}
