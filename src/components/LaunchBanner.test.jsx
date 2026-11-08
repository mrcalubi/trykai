import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LaunchBanner from './LaunchBanner'
import * as dayOne from '../lib/dayOne'

vi.mock('../lib/dayOne', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, dayOneStatus: vi.fn() }
})

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LaunchBanner />
    </MemoryRouter>,
  )
}

describe('LaunchBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-11-08T04:00:00Z') })
    window.sessionStorage.clear()
    dayOne.dayOneStatus.mockResolvedValue({ spotsLeft: 44, endsAt: '2026-12-01T00:00:00+08:00' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows one short line at a time and rotates to bring-a-friend', async () => {
    renderAt('/listings/abc')
    expect(await screen.findByText('Be one of our first 50 guests')).toBeInTheDocument()
    expect(screen.getByText('23 days left')).toBeInTheDocument()
    expect(screen.queryByText('Bring a friend, skip their booking fee')).not.toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByText('Bring a friend, skip their booking fee')).toBeInTheDocument()
    expect(screen.queryByText('Be one of our first 50 guests')).not.toBeInTheDocument()
  })

  it('opens the details on tap and stops rotating while open', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderAt('/listings/abc')
    const bar = await screen.findByRole('button', { name: /Be one of our first 50 guests/ })
    await user.click(bar)
    expect(bar).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/badge on their profile\. 44 spots left\./)).toBeInTheDocument()
    expect(screen.getByText('first 50 guests').tagName).toBe('STRONG')
    expect(screen.getByText('Day One', { selector: 'mark' })).toHaveClass('launch-banner__highlight')
    expect(screen.getByText(/friends' seats have no booking fee/)).toBeInTheDocument()
    expect(screen.getByText('23 days left until launch on 1 Dec.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Find a session' })).toHaveAttribute('href', '/')
    await act(async () => {
      vi.advanceTimersByTime(15000)
    })
    expect(screen.getByText('Be one of our first 50 guests')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Find a session' }))
  })

  it('switches to the live count when spots run low', async () => {
    dayOne.dayOneStatus.mockResolvedValue({ spotsLeft: 7, endsAt: '2026-12-01T00:00:00+08:00' })
    renderAt('/')
    expect(await screen.findByText('Only 7 Day One spots left')).toBeInTheDocument()
  })

  it('only talks about friends once Day One is full', async () => {
    dayOne.dayOneStatus.mockResolvedValue({ spotsLeft: 0, endsAt: '2026-12-01T00:00:00+08:00' })
    renderAt('/')
    expect(await screen.findByText('Bring a friend, skip their booking fee')).toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(10000)
    })
    expect(screen.getByText('Bring a friend, skip their booking fee')).toBeInTheDocument()
  })

  it('pauses while hovered', async () => {
    renderAt('/')
    const banner = await screen.findByRole('complementary', { name: 'Soft launch offer' })
    fireEvent.mouseEnter(banner)
    await act(async () => {
      vi.advanceTimersByTime(10000)
    })
    expect(screen.getByText('Be one of our first 50 guests')).toBeInTheDocument()
    fireEvent.mouseLeave(banner)
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByText('Bring a friend, skip their booking fee')).toBeInTheDocument()
  })

  it('stays away from account pages', () => {
    const { container } = renderAt('/hosting')
    expect(container).toBeEmptyDOMElement()
  })

  it('closes for the rest of the visit', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const first = renderAt('/')
    await user.click(await screen.findByRole('button', { name: 'Close' }))
    expect(first.container).toBeEmptyDOMElement()
    first.unmount()
    const again = renderAt('/')
    expect(again.container).toBeEmptyDOMElement()
  })

  it('is gone after launch', () => {
    vi.setSystemTime(new Date('2026-12-01T01:00:00Z'))
    const { container } = renderAt('/')
    expect(container).toBeEmptyDOMElement()
  })
})
