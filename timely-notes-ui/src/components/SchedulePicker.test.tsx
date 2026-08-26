import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SchedulePicker from './SchedulePicker'

describe('SchedulePicker', () => {
  it('renders a button for every schedule', () => {
    render(<SchedulePicker selected="s3" onChange={vi.fn()} />)

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      '1h',
      '3h',
      '6h',
    ])
  })

  it('presses only the selected schedule', () => {
    render(<SchedulePicker selected="s3" onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: '3h', pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1h' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '6h' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports the short name of the schedule clicked', async () => {
    const onChange = vi.fn()
    render(<SchedulePicker selected="s3" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: '6h' }))

    expect(onChange).toHaveBeenCalledWith('s6')
  })
})
