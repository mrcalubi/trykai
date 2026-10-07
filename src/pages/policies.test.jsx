import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import CancellationPolicy from './CancellationPolicy'
import DisputePolicy from './DisputePolicy'
import RefundPolicy from './RefundPolicy'
import Terms from './Terms'
import Privacy from './Privacy'
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

  it('tells guests to cancel from their profile, not a dashboard', () => {
    expect(screen.getByText(/Cancel anytime from your profile/)).toBeInTheDocument()
    expect(screen.queryByText(/Dashboard/)).not.toBeInTheDocument()
  })

  it('does not promise a reschedule that is not built', () => {
    expect(screen.queryByRole('heading', { name: 'Rescheduling instead of cancelling' })).not.toBeInTheDocument()
    expect(screen.queryByText(/reschedule your booking/)).not.toBeInTheDocument()
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

  it('links to the published terms', () => {
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
  })
})

describe('Terms of Service page', () => {
  beforeEach(() => {
    renderWithRouter(<Terms />)
  })

  it('requires users to be 18 and names the UEN', () => {
    expect(screen.getByText(/You must be 18 or older/)).toBeInTheDocument()
    expect(screen.getByText(/UEN 53526159D/)).toBeInTheDocument()
  })

  it('caps TryKai liability at the booking fee for that booking', () => {
    expect(
      screen.getByText(/limited to the booking fee TryKai received for the booking/)
    ).toBeInTheDocument()
  })

  it('states the host fee starts on the fourth confirmed booking', () => {
    expect(screen.getByText(/starting from your fourth confirmed booking/)).toBeInTheDocument()
  })

  it('links to the privacy, dispute, cancellation and refund policies', () => {
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: 'Dispute Policy' })).toHaveAttribute(
      'href',
      '/dispute-policy'
    )
    expect(screen.getAllByRole('link', { name: 'Cancellation Policy' })[0]).toHaveAttribute(
      'href',
      '/cancellation-policy'
    )
    expect(screen.getByRole('link', { name: 'Refund Policy' })).toHaveAttribute(
      'href',
      '/refund-policy'
    )
  })
})

describe('Privacy Policy page', () => {
  beforeEach(() => {
    renderWithRouter(<Privacy />)
  })

  it('names the DPO and the PDPA', () => {
    expect(screen.getByText(/Personal Data Protection Act 2012/)).toBeInTheDocument()
    expect(screen.getByText(/Caleb Ong/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'privacy@trykai.sg' })[0]).toHaveAttribute(
      'href',
      'mailto:privacy@trykai.sg'
    )
  })

  it('does not claim TryKai stores Stripe Identity images', () => {
    expect(screen.getByText(/TryKai does not receive or store those images/)).toBeInTheDocument()
  })

  it('keeps booking records for five years and does not sell personal data', () => {
    expect(screen.getByText(/kept for 5 years/)).toBeInTheDocument()
    expect(screen.getByText(/We do not sell personal data/)).toBeInTheDocument()
  })
})
