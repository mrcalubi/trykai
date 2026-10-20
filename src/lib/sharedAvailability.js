/**
 * Shared availability across a host's listings (00033). A session is 'held'
 * when the host is booked on another listing at the same time; it reopens by
 * itself if that booking is cancelled.
 */

export function isHeld(session) {
  return session?.status === 'held'
}

/** { [sessionId]: listing title } for every session that could hold another. */
export function heldByTitleMap(sessions) {
  const byId = {}
  for (const session of sessions ?? []) {
    if (session?.id) byId[session.id] = session.listings?.title || ''
  }
  return byId
}

export function heldSessionLine(holderTitle) {
  return holderTitle
    ? `Taken: you're booked for ${holderTitle} then. Reopens if that booking is cancelled.`
    : "Taken: you're booked at this time. Reopens if that booking is cancelled."
}

export function sharedBatchLine(title, created, attempted) {
  if (created === 0) return `None added on ${title} (those times clash with its own sessions).`
  if (created === attempted) return `Also added on ${title}.`
  return `Also added ${created} of ${attempted} on ${title}; the rest clash with its own sessions.`
}
