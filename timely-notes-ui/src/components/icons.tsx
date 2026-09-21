/**
 * The header's glyphs, and the drawer's. Decorative by construction — the button carries the name,
 * in both an `aria-label` and a `title`, so the SVG is hidden from assistive technology.
 */

const glyph = {
  'aria-hidden': true,
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export const MenuIcon = () => (
  <svg {...glyph}>
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="20" y2="17" />
  </svg>
)

export const CalendarIcon = () => (
  <svg {...glyph}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="3" x2="8" y2="7" />
    <line x1="16" y1="3" x2="16" y2="7" />
  </svg>
)

export const NoteNowIcon = () => (
  <svg {...glyph}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
    <line x1="14" y1="6" x2="18" y2="10" />
  </svg>
)

export const CloseIcon = () => (
  <svg {...glyph}>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
)
