export const HOST_SESSIONS_SELECT = `
          id,
          starts_at,
          duration_mins,
          listing_id,
          status,
          held_by_session_id,
          listings (title),
          bookings (id, status, guests_count, total_amount, platform_fee, host_payout_amount)
        `

export function upcomingSessionsFrom(rows, now = Date.now()) {
  return (rows ?? []).filter((session) => new Date(session.starts_at).getTime() > now)
}

export function listingUpcomingStats(listingId, hostSessions) {
  const sessions = (hostSessions ?? []).filter((session) => session.listing_id === listingId)
  const bookings = sessions.flatMap((session) =>
    (session.bookings ?? []).filter((booking) => booking.status === 'confirmed'),
  )
  return { sessionCount: sessions.length, bookingCount: bookings.length }
}
