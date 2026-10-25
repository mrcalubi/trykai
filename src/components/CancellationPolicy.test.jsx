import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CancellationPolicyInfo, GuestCancellationNote } from './CancellationPolicy'
import {
  CANCELLATION_POLICY_ITEMS,
  GUEST_CANCELLATION_POLICY_ITEMS,
  GUEST_HOST_CANCEL_COPY,
  HOST_APPEAL_HREF,
  HOST_CANCEL_SUMMARY,
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
    expect(screen.queryByText(/You cancel a booked session/)).not.toBeInTheDocument()
    expect(screen.queryByText(/You remove a date nobody has booked/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Your listings are taken down automatically/)).not.toBeInTheDocument()
    expect(screen.queryByText(/How long a strike lasts/)).not.toBeInTheDocument()
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
  it('starts with the full policy closed', () => {
    render(<CancellationPolicyInfo />)
    const toggle = screen.getByRole('button', { name: 'See full policy' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(HOST_CANCEL_SUMMARY)).toBeInTheDocument()
    expect(screen.queryByText(`${CANCELLATION_POLICY_ITEMS[0].scenario}:`)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'appeal' })).not.toBeInTheDocument()
  })

  it('opens every row and the appeal line', async () => {
    const user = userEvent.setup()
    render(<CancellationPolicyInfo />)

    await user.click(screen.getByRole('button', { name: 'See full policy' }))

    expect(screen.getByRole('button', { name: 'See full policy' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    for (const item of CANCELLATION_POLICY_ITEMS) {
      expect(screen.getByText(`${item.scenario}:`)).toBeInTheDocument()
    }
    const appeal = screen.getByRole('link', { name: 'appeal' })
    expect(appeal).toHaveAttribute('href', HOST_APPEAL_HREF)
    expect(appeal).toHaveAttribute('target', '_blank')
    expect(appeal).toHaveAttribute('rel', 'noopener')
  })

  it('collapses again on a second click', async () => {
    const user = userEvent.setup()
    render(<CancellationPolicyInfo />)
    const toggle = screen.getByRole('button', { name: 'See full policy' })

    await user.click(toggle)
    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(`${CANCELLATION_POLICY_ITEMS[0].scenario}:`)).not.toBeInTheDocument()
  })
})
