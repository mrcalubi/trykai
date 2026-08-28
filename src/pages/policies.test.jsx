import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import CancellationPolicy from './CancellationPolicy'
import DisputePolicy from './DisputePolicy'
import RefundPolicy from './RefundPolicy'
import { renderWithRouter } from '../test/render'

/**
 * These pages are the terms guests and hosts agree to, so the assertions below
 * pin the numbers and timeframes rather than just checking the page renders. An
 * edit that changes what TryKai has promised should have to change a test too.
 */

describe('Cancellation Policy page', () => {
  beforeEach(() => {
    renderWithRouter(<CancellationPolicy />)
  })

  it('publishes all four guest refund tiers', () => {
    expect(screen.getByText(/48 hours or more before the session starts:/)).toBeInTheDocument()
    expect(screen.getByText(/Between 24 and 48 hours before the session starts:/)).toBeInTheDocument()
    expect(screen.getByText(/Between 6 and 24 hours before the session starts:/)).toBeInTheDocument()
    expect(screen.getByText(/Less than 6 hours before the session starts, or a no show:/)).toBeInTheDocument()
  })

  it('states that three strikes deactivates a host listing', () => {
    expect(screen.getByText(/After 3 strikes, your\s+listings are automatically deactivated/)).toBeInTheDocument()
  })

  it('states that a host no-show costs two strikes', () => {
    expect(screen.getByText(/receives 2 strikes immediately/)).toBeInTheDocument()
  })

  it('gives hosts seven days to appeal a strike', () => {
    expect(screen.getByText(/submit an appeal within 7 days of the\s+cancellation/)).toBeInTheDocument()
  })

  it('links to the refund and dispute policies', () => {
    expect(screen.getByRole('link', { name: 'Refund Policy' })).toHaveAttribute(
      'href',
      '/refund-policy'
    )
    expect(screen.getByRole('link', { name: 'Dispute Policy' })).toHaveAttribute(
      'href',
      '/dispute-policy'
    )
  })

  it('gives a contact address for disputes', () => {
    expect(screen.getByRole('link', { name: 'hello@trykai.sg' })).toHaveAttribute(
      'href',
      'mailto:hello@trykai.sg'
    )
  })
})

describe('Refund Policy page', () => {
  beforeEach(() => {
    renderWithRouter(<RefundPolicy />)
  })

  it('publishes the processing time for every payment method offered', () => {
    expect(screen.getByText('Card:')).toBeInTheDocument()
    expect(screen.getByText(/3 to 5 business days/)).toBeInTheDocument()
    expect(screen.getByText('PayNow:')).toBeInTheDocument()
    expect(screen.queryByText('GrabPay:')).not.toBeInTheDocument()
    expect(screen.getByText(/through Stripe/)).toBeInTheDocument()
  })

  it('promises no fee is charged to receive a refund', () => {
    expect(screen.getByRole('heading', { name: 'No extra fees' })).toBeInTheDocument()
  })

  it('defers refund eligibility to the cancellation policy', () => {
    expect(screen.getByRole('link', { name: 'Cancellation Policy' })).toHaveAttribute(
      'href',
      '/cancellation-policy'
    )
  })

  it('gives guests seven days to raise a session-quality complaint', () => {
    expect(screen.getByText(/within 7 days of your session/)).toBeInTheDocument()
  })
})

describe('Dispute Policy page', () => {
  beforeEach(() => {
    renderWithRouter(<DisputePolicy />)
  })

  it('covers quality complaints, safety reports and strike appeals', () => {
    expect(screen.getByRole('heading', { name: 'Quality complaints' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Safety reports' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Appealing a host strike' })).toBeInTheDocument()
  })

  it('commits to a two business day response on complaints', () => {
    expect(screen.getByText(/respond within 2 business days/)).toBeInTheDocument()
  })

  it('places no time limit on safety reports', () => {
    expect(screen.getByText(/no time limit on raising one/)).toBeInTheDocument()
  })

  it('states when host payouts are released', () => {
    expect(screen.getByText(/released 24 hours after a session starts/)).toBeInTheDocument()
  })

  it('gives a contact address', () => {
    expect(screen.getAllByRole('link', { name: 'hello@trykai.sg' })[0]).toHaveAttribute(
      'href',
      'mailto:hello@trykai.sg'
    )
  })
})
