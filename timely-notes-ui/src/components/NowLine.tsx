import type { CSSProperties } from 'react'

interface NowLineProps {
  /** How far down the day column, from `dayFractionOf`. */
  fraction: number
}

/** The current minute across today's column. `aria-current` on the row already says it. */
function NowLine({ fraction }: NowLineProps) {
  return (
    <li
      className="now-line"
      aria-hidden="true"
      style={{ '--now-fraction': fraction } as CSSProperties}
    >
      <span className="now-line__dot" />
    </li>
  )
}

export default NowLine
