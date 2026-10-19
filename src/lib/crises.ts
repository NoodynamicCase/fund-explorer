export interface Crisis {
  id: string
  label: string
  short: string
  /** S&P 500 closing high before the decline, and closing low at the bottom. */
  peak: string
  trough: string
  /** The window the preset button zooms to (includes some lead-in and recovery). */
  view: { from: string; to: string }
}

export const CRISES: Crisis[] = [
  { id: 'dotcom', label: 'Dot-com crash', short: 'Dot-com', peak: '2000-03-24', trough: '2002-10-09', view: { from: '2000-01-03', to: '2003-12-31' } },
  { id: 'gfc', label: '2008 financial crisis', short: '2008', peak: '2007-10-09', trough: '2009-03-09', view: { from: '2007-06-01', to: '2010-12-31' } },
  { id: 'covid', label: 'COVID crash', short: 'COVID', peak: '2020-02-19', trough: '2020-03-23', view: { from: '2020-01-02', to: '2021-01-29' } },
  { id: 'rates2022', label: '2022 rate shock', short: '2022', peak: '2022-01-03', trough: '2022-10-12', view: { from: '2021-11-01', to: '2023-06-30' } },
]

export function crisisById(id: string | undefined): Crisis | undefined {
  return CRISES.find((c) => c.id === id)
}
