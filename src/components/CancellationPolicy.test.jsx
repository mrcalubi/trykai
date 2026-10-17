import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CancellationPolicyInfo, GuestCancellationNote } from './CancellationPolicy'
import {
  CANCELLATION_POLICY_ITEMS,
  GUEST_CANCELLATION_POLICY_ITEMS,
  GUEST_HOST_CANCEL_COPY,
} from '../lib/cancellationPolicy'

describe('GuestCancellationNote', () => {
  it('starts with the guest rules closed', () => {
    render(<GuestCancellationNote />)
    const toggle = screen.getByRole('button', { name: 'Cancellation policy' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(/Full refund if you cancel 48\+ hours before/)).toBeInTheDocument()
    expect(screen.queryByText(/Full refund, including the platform fee/)).not.toBeInTheDocument()
  })

  it('opens the guest tiers and host-cancel sentence only', async () => {
    const user = userEvent.setup()
    render(<GuestCancellationNote />)

    await user.click(screen.getByRole('button', { name: 'Cancellation policy' }))

    expect(screen.getByRole('button', { name: 'Cancellation policy' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    for (const item of GUEST_CANCELLATION_POLICY_ITEMS) {
      expect(screen.getByText(`${item.scenario}:`)).toBeInTheDocument()
    }
    expect(screen.getByText(GUEST_HOST_CANCEL_COPY)).toBeInTheDocument()
    expect(screen.queryByText(/host receives a strike/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Listing is automatically deactivated/)).not.toBeInTheDocument()
  })

  it('collapses again on a second click', async () => {
    const user = userEvent.setup()
    render(<GuestCancellationNote />)
    const toggle = screen.getByRole('button', { name: 'Cancellation policy' })

    await user.click(toggle)
    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/Full refund, including the platform fee/)).not.toBeInTheDocument()
  })
})

describe('CancellationPolicyInfo', () => {
  it('shows the policy without needing any interaction', () => {
    render(<CancellationPolicyInfo />)
    for (const item of CANCELLATION_POLICY_ITEMS) {
      expect(screen.getByText(`${item.scenario}:`)).toBeInTheDocument()
    }
  })

  it('spells out the host strike consequence', () => {
    render(<CancellationPolicyInfo />)
    expect(screen.getByText(/Listing is automatically deactivated/)).toBeInTheDocument()
  })
})
