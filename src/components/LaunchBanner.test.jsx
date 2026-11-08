import { render, screen } from '@testing-library/react'
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

  it('announces Day One and bring-a-friend with a countdown', async () => {
    renderAt('/listings/abc')
    expect(await screen.findByText(/first 50 guests get a numbered Day One badge/)).toBeInTheDocument()
    expect(screen.getByText('Friends you bring skip the booking fee.')).toBeInTheDocument()
    expect(screen.getByText('23 days left')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Find a session' })).toHaveAttribute('href', '/')
  })

  it('switches to the live count when spots run low', async () => {
    dayOne.dayOneStatus.mockResolvedValue({ spotsLeft: 7, endsAt: '2026-12-01T00:00:00+08:00' })
    renderAt('/')
    expect(await screen.findByText(/Only 7 Day One spots left/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Find a session' })).not.toBeInTheDocument()
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
