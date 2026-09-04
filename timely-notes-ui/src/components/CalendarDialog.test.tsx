import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { addMonths, monthGrid, monthStartOf } from '../domain/months'
import CalendarDialog from './CalendarDialog'

const day = (year: number, month: number, dayOfMonth: number) =>
  new Date(year, month, dayOfMonth).getTime()

const september = monthStartOf(day(2026, 8, 1))

type Props = Parameters<typeof CalendarDialog>[0]

const renderDialog = (overrides: Partial<Props> = {}) => {
  const handlers = {
    onChangeMonth: vi.fn(),
    onPickDay: vi.fn(),
    onClose: vi.fn(),
  }
  const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')

  const view = render(
    <CalendarDialog
      isOpen
      monthStart={september}
      weeks={monthGrid(september)}
      currentDayStart={day(2026, 8, 17)}
      focusDayStart={day(2026, 8, 17)}
      countFor={() => 0}
      isLoading={false}
      error={null}
      {...handlers}
      {...overrides}
    />,
  )

  return { ...view, ...handlers, showModal }
}

describe('CalendarDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing and opens nothing while closed', () => {
    const { showModal, onPickDay } = renderDialog({ isOpen: false })

    expect(screen.queryByText('September 2026')).not.toBeInTheDocument()
    expect(showModal).not.toHaveBeenCalled()
    expect(onPickDay).not.toHaveBeenCalled()
  })

  it('shows the month heading and the grid when open', () => {
    const { showModal } = renderDialog()

    expect(screen.getByText('September 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '17' })).toBeInTheDocument()
    expect(showModal).toHaveBeenCalled()
  })

  it('asks for the neighbouring months rather than changing month itself', async () => {
    const { onChangeMonth } = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(onChangeMonth).toHaveBeenCalledWith(addMonths(september, -1))

    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(onChangeMonth).toHaveBeenCalledWith(addMonths(september, 1))
    expect(screen.getByText('September 2026')).toBeInTheDocument()
  })

  it('closes on the close button', async () => {
    const { onClose } = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const { onClose } = renderDialog()

    fireEvent(document.querySelector('dialog')!, new Event('cancel'))

    expect(onClose).toHaveBeenCalled()
  })

  it('passes a picked day straight through', async () => {
    const { onPickDay } = renderDialog()

    await userEvent.click(screen.getByRole('button', { name: '22' }))

    expect(onPickDay).toHaveBeenCalledWith(day(2026, 8, 22))
  })

  it('renders the days while the counts are still loading', () => {
    renderDialog({ isLoading: true })

    expect(screen.getByRole('button', { name: '17' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
  })

  it('renders the days when the counts failed', () => {
    renderDialog({ error: 'Could not load the calendar for the 1h schedule.' })

    expect(screen.getByRole('button', { name: '17' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/could not load/i)
  })
})
