import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MenuDrawer from './MenuDrawer'

type Props = Parameters<typeof MenuDrawer>[0]

const renderDrawer = (overrides: Partial<Props> = {}) => {
  const handlers = {
    onChangeSchedule: vi.fn(),
    onClose: vi.fn(),
  }
  const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')

  const view = render(<MenuDrawer isOpen selected="s3" {...handlers} {...overrides} />)

  return { ...view, ...handlers, showModal }
}

describe('MenuDrawer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing and opens nothing while closed', () => {
    const { showModal } = renderDrawer({ isOpen: false })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '3h' })).not.toBeInTheDocument()
    expect(showModal).not.toHaveBeenCalled()
  })

  it('shows the Schedule picker under a Menu heading when open', () => {
    const { showModal } = renderDrawer()

    expect(screen.getByRole('heading', { name: 'Menu' })).toBeInTheDocument()

    const picker = screen.getByRole('group', { name: 'Schedule' })

    expect(within(picker).getAllByRole('button')).toHaveLength(3)
    expect(screen.getByRole('button', { name: '3h' })).toHaveAttribute('aria-pressed', 'true')
    expect(showModal).toHaveBeenCalled()
  })

  it('asks for a Schedule rather than choosing one itself', async () => {
    const user = userEvent.setup()
    const { onChangeSchedule } = renderDrawer()

    await user.click(screen.getByRole('button', { name: '6h' }))

    expect(onChangeSchedule).toHaveBeenCalledWith('s6')
  })

  it('closes on the Close button, which sits beside the heading', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDrawer()

    const close = screen.getByRole('button', { name: 'Close' })

    expect(close.closest('.menu-drawer__header')).not.toBeNull()

    await user.click(close)

    expect(onClose).toHaveBeenCalled()
  })

  it('closes on a press outside the panel, which lands on the dialog itself', () => {
    const { onClose } = renderDrawer()

    fireEvent.click(screen.getByRole('dialog'))

    expect(onClose).toHaveBeenCalled()
  })

  it('stays open on a press inside the panel', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDrawer()

    await user.click(screen.getByRole('heading', { name: 'Menu' }))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape, which the browser turns into a cancel event', () => {
    const { onClose } = renderDrawer()

    fireEvent(screen.getByRole('dialog'), new Event('cancel'))

    expect(onClose).toHaveBeenCalled()
  })
})
