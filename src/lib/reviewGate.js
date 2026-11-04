const FALLBACK_SESSION_MINS = 120
export const REVIEW_WINDOW_DAYS = 7

export function sessionEndAt(session) {
  const startsAt = session?.starts_at
  if (!startsAt) return null
  const startMs = new Date(startsAt).getTime()
  if (Number.isNaN(startMs)) return null

  if (session.ends_at) {
    const endMs = new Date(session.ends_at).getTime()
    if (!Number.isNaN(endMs)) return new Date(endMs)
  }

  const durationMins = Number(session.duration_mins)
  if (Number.isFinite(durationMins) && durationMins > 0) {
    return new Date(startMs + durationMins * 60 * 1000)
  }

  return new Date(startMs + FALLBACK_SESSION_MINS * 60 * 1000)
}

export function sessionHasEnded(session, now = new Date()) {
  const endsAt = sessionEndAt(session)
  if (!endsAt) return false
  return endsAt < now
}

export function reviewDeadlineAt(session) {
  const endsAt = sessionEndAt(session)
  if (!endsAt) return null
  return new Date(endsAt.getTime() + REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * Same product rule as `post_review` / `guest_can_leave_review`: confirmed,
 * session ended, still inside the 7-day window. The Bookings list uses this
 * so "Leave a review" matches `my_review_state.can_review`.
 */
export function canLeaveGuestReview(booking, { alreadyReviewed = false, now = new Date() } = {}) {
  if (!booking || alreadyReviewed) return false
  if (booking.status !== 'confirmed') return false
  if (!sessionHasEnded(booking.sessions, now)) return false
  const deadline = reviewDeadlineAt(booking.sessions)
  if (!deadline) return false
  return now < deadline
}
