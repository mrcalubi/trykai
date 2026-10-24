import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import WaitingState, {
  WAITING_LONG_AFTER_MS,
  WAITING_LONG_MESSAGE,
  WAITING_STILL_AFTER_MS,
  WAITING_STILL_MESSAGE,
} from './WaitingState'

describe('WaitingState', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('steps its message at 4s and 12s', () => {
    render(<WaitingState title="Setting up payouts" message="Opening Stripe." />)

    expect(screen.getByRole('heading', { name: 'Setting up payouts' })).toBeInTheDocument()
    expect(screen.getByText('Opening Stripe.')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(WAITING_STILL_AFTER_MS)
    })
    expect(screen.getByText(WAITING_STILL_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText('Opening Stripe.')).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(WAITING_LONG_AFTER_MS - WAITING_STILL_AFTER_MS)
    })
    expect(screen.getByText(WAITING_LONG_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText(WAITING_STILL_MESSAGE)).not.toBeInTheDocument()
  })
})
