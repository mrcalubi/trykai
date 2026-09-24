const FALLBACK_SESSION_MINS = 120

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

/**
 * Same product rule as `guest_can_leave_review` in 00011, plus the UI
 * fallback when duration_mins is missing (`starts_at` + 2 hours).
 */
export function canLeaveGuestReview(booking, { alreadyReviewed = false, now = new Date() } = {}) {
  if (!booking || alreadyReviewed) return false
  if (booking.status !== 'confirmed') return false
  return sessionHasEnded(booking.sessions, now)
}
