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

  it('states that strikes expire after 12 months', () => {
    expect(screen.getByText(/Strikes expire 12 months after they.re given/)).toBeInTheDocument()
  })

  it('states that removing an unbooked date is never a strike', () => {
    expect(screen.getByText(/Removing a date nobody has\s+booked is never a strike/)).toBeInTheDocument()
  })

  it('states that a host no-show costs two strikes', () => {
    expect(screen.getByText(/receives 2 strikes immediately/)).toBeInTheDocument()
  })

  it('gives hosts seven days to appeal a strike', () => {
    expect(screen.getByText(/submit an appeal within 7 days of the\s+cancellation/)).toBeInTheDocument()
    expect(
      screen.getByText(
        (_content, node) =>
          node?.tagName === 'P' &&
          Boolean(
            node.textContent?.includes(
              'Email hello@trykai.sg with your booking reference and what happened',
            ),
          ),
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Appealing a strike' })).toHaveAttribute(
      'id',
      'appeals',
    )
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
    const mail = screen.getAllByRole('link', { name: 'hello@trykai.sg' })
    expect(mail.length).toBeGreaterThan(0)
    for (const link of mail) {
      expect(link).toHaveAttribute('href', 'mailto:hello@trykai.sg')
    }
  })

  it('tells guests to cancel from their profile, not a dashboard', () => {
    expect(screen.getByText(/Cancel anytime from the Bookings tab on your profile/)).toBeInTheDocument()
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

  it('publishes Stripe timing and the PayNow 90-day limit', () => {
    expect(
      screen.getByText(
        /Card refunds usually take 5 to 10 business days to appear\. PayNow\s+refunds are usually faster\./,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /PayNow refunds can only be made within 90 days of payment/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/we'll contact you and\s+refund you another way/),
    ).toBeInTheDocument()
    expect(screen.getByText(/through Stripe/)).toBeInTheDocument()
    expect(screen.queryByText(/HitPay/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/GrabPay/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/3 to 5 business days/)).not.toBeInTheDocument()
    expect(screen.queryByText(/few hours/)).not.toBeInTheDocument()
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

  it('gives guests three days to raise a session-quality complaint', () => {
    expect(screen.getByText(/within 3 days after your session ends/)).toBeInTheDocument()
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

  it('gives guests three days after the session to raise a quality complaint', () => {
    expect(
      screen.getByText(/within 3 days after\s+the session ends\. We cannot review complaints raised after that\./)
    ).toBeInTheDocument()
  })

  it('commits to a two business day response on complaints', () => {
    expect(screen.getByText(/respond within 2 business days/)).toBeInTheDocument()
  })

  it('places no time limit on safety reports', () => {
    expect(screen.getByText(/no time limit on raising one/)).toBeInTheDocument()
  })

  it('states when host payouts are released', () => {
    expect(screen.getByText(/released 72 hours after a session ends/)).toBeInTheDocument()
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

  it('describes verification as an upload reviewed by TryKai, not Stripe Identity', () => {
    expect(screen.getByText(/uploading a photo of your passport or NRIC and a\s+selfie/)).toBeInTheDocument()
    expect(screen.getByText(/with Singpass where\s+it is offered/)).toBeInTheDocument()
    expect(screen.queryByText(/Stripe Identity/)).not.toBeInTheDocument()
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

  it('says host strikes expire after 12 months', () => {
    expect(screen.getByText(/Strikes expire 12 months after they.re given/)).toBeInTheDocument()
  })

  it('anchors the Host and Booking parts for the listing and checkout checkboxes', () => {
    expect(screen.getByRole('heading', { name: 'Part 2: Hosting' })).toHaveAttribute(
      'id',
      'part-2-hosting',
    )
    expect(screen.getByRole('heading', { name: 'Part 3: Booking' })).toHaveAttribute(
      'id',
      'part-3-booking',
    )
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

  it('says hosts upload ID photos that TryKai stores, and no longer claims Stripe checks them', () => {
    expect(screen.getByText(/Hosts can instead verify by uploading a photo of their passport or NRIC/)).toBeInTheDocument()
    expect(screen.getByText(/you may cover the number/)).toBeInTheDocument()
    expect(screen.getByText(/We do not receive your NRIC number or\s+any document images/)).toBeInTheDocument()
    expect(screen.queryByText(/Stripe Identity/)).not.toBeInTheDocument()
    expect(screen.queryByText(/does not receive or store those images/)).not.toBeInTheDocument()
  })

  it('keeps booking records for five years and does not sell personal data', () => {
    expect(screen.getByText(/kept for 5 years/)).toBeInTheDocument()
    expect(screen.getByText(/We do not sell personal data/)).toBeInTheDocument()
  })

  it('names OneMap as the address lookup service', () => {
    expect(screen.getByText(/OneMap \(Singapore Land Authority\)/)).toBeInTheDocument()
    expect(screen.getByText(/look up and verify listing addresses/)).toBeInTheDocument()
  })
})
