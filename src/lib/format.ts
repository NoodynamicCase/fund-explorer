const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function parseISO(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return NaN
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const ms = Date.UTC(y, mo - 1, d)
  const back = new Date(ms)
  // reject things like 2020-02-31
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return NaN
  return ms
}

export function toISO(ms: number): string {
  const d = new Date(ms)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/** "Mar 24, 2000" */
export function fmtDate(ms: number): string {
  const d = new Date(ms)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

/** "Mar 2000" */
export function fmtMonth(ms: number): string {
  const d = new Date(ms)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function fmtPct(x: number | null | undefined, digits = 1, signed = false): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '–'
  const v = x * 100
  const s = v.toFixed(digits)
  const sign = signed && v > 0 ? '+' : ''
  // avoid "-0.0%"
  return `${sign}${Number(s) === 0 ? (0).toFixed(digits) : s}%`
}

export function fmtNum(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '–'
  return x.toFixed(digits)
}

export function fmtYears(y: number): string {
  if (y >= 1) return `${y.toFixed(1)} yr`
  return `${Math.round(y * 12)} mo`
}
