import { render } from '@testing-library/react'
import NowLine from './NowLine'

const renderLine = (fraction: number) => render(<NowLine fraction={fraction} />).container

describe('NowLine', () => {
  it('carries the fraction it is given as --now-fraction', () => {
    const line = renderLine(0.85).querySelector<HTMLElement>('.now-line')

    expect(line?.style.getPropertyValue('--now-fraction')).toBe('0.85')
  })

  it('is decorative: hidden, with no role and no name', () => {
    const line = renderLine(0.5).querySelector('.now-line')

    expect(line).toHaveAttribute('aria-hidden', 'true')
    expect(line).not.toHaveAttribute('role')
    expect(line).toHaveAccessibleName('')
  })
})
