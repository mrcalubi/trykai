import { describe, expect, it } from 'vitest'
import { hoursFromNow } from '../test/fixtures'
import {
  UNPAID_CANCELLATION_NOTE,
  awaitingPaidBookingId,
  guestBookingActions,
  guestCancellationNote,
  showGuestBooking,
} from './guestBookings'

function booking(overrides = {}) {
  return {
    id: 'booking-1',
    status: 'confirmed',
    total_amount: 4500,
    platform_fee: 675,
    sessions: {
      starts_at: hoursFromNow(72),
      duration_mins: 90,
      listings: { title: 'Latte art', host_id: 'host-1', duration_mins: 90 },
    },
    ...overrides,
  }
}

describe('showGuestBooking', () => {
  it('keeps paid bookings, including a cancellation that captured a charge', () => {
    expect(showGuestBooking(booking())).toBe(true)
    expect(
      showGuestBooking(booking({ status: 'cancelled', stripe_charge_id: 'ch_1' })),
    ).toBe(true)
  })

  it('hides an unpaid checkout and a cancellation that never charged anyone', () => {
    expect(showGuestBooking(booking({ status: 'pending' }))).toBe(false)
    expect(showGuestBooking(booking({ status: 'cancelled' }))).toBe(false)
  })

  it('keeps the pending row only while a accepted payment is still syncing', () => {
    expect(
      showGuestBooking(booking({ status: 'pending' }), { awaitingBookingId: 'booking-1' }),
    ).toBe(true)
    expect(
      showGuestBooking(booking({ id: 'other', status: 'pending' }), {
        awaitingBookingId: 'booking-1',
      }),
    ).toBe(false)
  })
})

describe('awaitingPaidBookingId', () => {
  it('ignores a cancelled checkout', () => {
    expect(
      awaitingPaidBookingId({ bookingId: 'booking-1', redirectStatus: 'failed' }),
    ).toBeNull()
    expect(awaitingPaidBookingId({ bookingId: 'booking-1' })).toBeNull()
  })

  it('follows a payment Stripe has accepted', () => {
    expect(
      awaitingPaidBookingId({ bookingId: 'booking-1', paymentStatus: 'succeeded' }),
    ).toBe('booking-1')
  })
})

describe('guestCancellationNote', () => {
  it('does not promise a refund when the guest was never charged', () => {
    expect(guestCancellationNote(booking({ status: 'pending' }))).toBe(UNPAID_CANCELLATION_NOTE)
  })

  it('quotes the cancellation policy for a paid booking', () => {
    expect(guestCancellationNote(booking())).toContain('Full refund of $45')
  })
})

describe('guestBookingActions', () => {
  it('lets a guest cancel an upcoming confirmed booking, not review it', () => {
    expect(guestBookingActions(booking())).toEqual({ review: false, cancel: true })
  })

  it('offers a review, not cancellation, after a confirmed session has ended', () => {
    expect(
      guestBookingActions(
        booking({
          sessions: {
            starts_at: hoursFromNow(-5),
            duration_mins: 90,
            listings: { duration_mins: 90 },
          },
        }),
      ),
    ).toEqual({ review: true, cancel: false })
  })

  it('uses the listing duration when the session row has none', () => {
    expect(
      guestBookingActions(
        booking({
          sessions: {
            starts_at: hoursFromNow(-3),
            duration_mins: null,
            listings: { duration_mins: 60 },
          },
        }),
      ),
    ).toEqual({ review: true, cancel: false })
  })

  it('does not let an unpaid checkout be cancelled or reviewed', () => {
    expect(guestBookingActions(booking({ status: 'pending' }))).toEqual({
      review: false,
      cancel: false,
    })
  })
})
