import { guestRefundDescription } from './cancellationPolicy'
import { canLeaveGuestReview, sessionHasEnded } from './reviewGate'

const FALLBACK_SESSION_MINS = 120

/**
 * Prefer the session length, then the listing length, then the same two-hour
 * fallback the review screen already uses when neither was stored.
 */
export function sessionForReview(session) {
  if (!session) return session
  const own = Number(session.duration_mins)
  if (Number.isFinite(own) && own > 0) return session
  const listed = Number(session.listings?.duration_mins)
  if (Number.isFinite(listed) && listed > 0) {
    return { ...session, duration_mins: listed }
  }
  if (!Number.isFinite(own) || own <= 0) {
    return { ...session, duration_mins: FALLBACK_SESSION_MINS }
  }
  return session
}

function bookingForReview(booking) {
  const session = sessionForReview(booking?.sessions)
  if (!booking || session === booking.sessions) return booking
  return { ...booking, sessions: session }
}

/** Money actually moved. An abandoned checkout has none of these. */
export function paymentCaptured(booking) {
  return (
    Boolean(booking?.stripe_charge_id) ||
    Number(booking?.refund_amount) > 0 ||
    Boolean(booking?.stripe_refund_id)
  )
}

/**
 * Pending rows are created when checkout starts, before any charge. They are
 * not bookings. A cancellation that never captured a charge is that same
 * checkout being closed. Keep a pending row on screen only while this visit
 * is waiting for a payment Stripe has already accepted.
 */
export function showGuestBooking(booking, { awaitingBookingId = null } = {}) {
  if (!booking) return false
  if (booking.status === 'confirmed') return true
  if (booking.status === 'cancelled') return paymentCaptured(booking)
  if (booking.status === 'pending') {
    return Boolean(awaitingBookingId) && booking.id === awaitingBookingId
  }
  return false
}

export function awaitingPaidBookingId({
  bookingId = null,
  redirectStatus = null,
  paymentStatus = null,
} = {}) {
  if (!bookingId) return null
  if (redirectStatus === 'failed' || paymentStatus === 'failed') return null
  if (
    redirectStatus === 'succeeded' ||
    redirectStatus === 'pending' ||
    paymentStatus === 'succeeded' ||
    paymentStatus === 'processing'
  ) {
    return bookingId
  }
  return null
}

export const UNPAID_CANCELLATION_NOTE =
  'You have not been charged, so there is nothing to refund.'

export function guestCancellationNote(booking) {
  if (booking?.status !== 'confirmed') return UNPAID_CANCELLATION_NOTE
  return guestRefundDescription(
    booking.total_amount,
    booking.sessions?.starts_at,
    booking.platform_fee,
  )
}

/**
 * Cancel is only for a confirmed booking whose session has not started.
 * Once the session has ended, the action is a review. Those never overlap:
 * a finished session must not offer cancellation, and an upcoming one is
 * not ready to review.
 */
export function guestBookingActions(booking, { alreadyReviewed = false, now = new Date() } = {}) {
  const reviewable = bookingForReview(booking)
  if (!reviewable || reviewable.status !== 'confirmed') {
    return { review: false, cancel: false }
  }
  const review = canLeaveGuestReview(reviewable, { alreadyReviewed, now })
  const startsAt = reviewable.sessions?.starts_at
  const started = Boolean(startsAt) && new Date(startsAt) <= now
  const ended = sessionHasEnded(reviewable.sessions, now)
  return {
    review,
    cancel: !review && !started && !ended && Boolean(startsAt),
  }
}
