import type { SVGProps } from 'react'

const base: SVGProps<SVGSVGElement> = {
  width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
}

export const IconPlus = () => (<svg {...base}><path d="M8 3v10M3 8h10" /></svg>)
export const IconMinus = () => (<svg {...base}><path d="M3 8h10" /></svg>)
export const IconClose = () => (<svg {...base}><path d="M4 4l8 8M12 4l-8 8" /></svg>)
export const IconChevron = ({ open }: { open: boolean }) => (
  <svg {...base} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="M6 3l5 5-5 5" /></svg>
)
export const IconInfo = () => (<svg {...base}><circle cx="8" cy="8" r="6.2" /><path d="M8 7.2v3.6" /><circle cx="8" cy="5" r=".6" fill="currentColor" stroke="none" /></svg>)
export const IconSearch = () => (<svg {...base}><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>)
export const IconLink = () => (<svg {...base}><path d="M6.8 9.2a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.8.8" /><path d="M9.2 6.8a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.8-.8" /></svg>)
export const IconGear = () => (
  <svg {...base}>
    <circle cx="8" cy="8" r="2.2" />
    <path d="M8 1.6v1.7M8 12.7v1.7M14.4 8h-1.7M3.3 8H1.6M12.5 3.5l-1.2 1.2M4.7 11.3l-1.2 1.2M12.5 12.5l-1.2-1.2M4.7 4.7L3.5 3.5" />
  </svg>
)
