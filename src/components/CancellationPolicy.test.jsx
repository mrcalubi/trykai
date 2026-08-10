import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  CancellationPolicyCollapsible,
  CancellationPolicyInfo,
} from './CancellationPolicy'
import { CANCELLATION_POLICY_ITEMS } from '../lib/cancellationPolicy'

describe('CancellationPolicyCollapsible', () => {
  it('starts collapsed', () => {
    render(<CancellationPolicyCollapsible />)
    const toggle = screen.getByRole('button', { name: /Cancellation Policy/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/Full refund/)).not.toBeInTheDocument()
  })

  it('reveals every policy row when opened', async () => {
    const user = userEvent.setup()
    render(<CancellationPolicyCollapsible />)

    await user.click(screen.getByRole('button', { name: /Cancellation Policy/ }))

    expect(screen.getByRole('button', { name: /Cancellation Policy/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    for (const item of CANCELLATION_POLICY_ITEMS) {
      expect(screen.getByText(`${item.scenario}:`)).toBeInTheDocument()
    }
  })

  it('collapses again on a second click', async () => {
    const user = userEvent.setup()
    render(<CancellationPolicyCollapsible />)
    const toggle = screen.getByRole('button', { name: /Cancellation Policy/ })

    await user.click(toggle)
    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/Full refund/)).not.toBeInTheDocument()
  })

  it('swaps the chevron between plus and minus', async () => {
    const user = userEvent.setup()
    const { container } = render(<CancellationPolicyCollapsible />)
    const chevron = () => container.querySelector('.cancellation-policy__chevron').textContent

    expect(chevron()).toBe('+')
    await user.click(screen.getByRole('button', { name: /Cancellation Policy/ }))
    expect(chevron()).toBe('−')
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
