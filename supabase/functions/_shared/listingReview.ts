/**
 * Listing review (00036, DECISIONS.md 23 October). Hosts are approved the
 * moment Singpass confirms who they are; the TryKai team's sense-check is on
 * the listing instead. A new listing is hidden from guests until a reviewer
 * approves it, and the team is emailed the moment it is created.
 *
 * Pure rules only, so the test suite covers them without Supabase or Deno.
 */

export const LISTING_REVIEW_STATUSES = ['pending', 'approved', 'changes_requested'] as const
export type ListingReviewStatus = (typeof LISTING_REVIEW_STATUSES)[number]

export const LISTING_REVIEW_DECISIONS = ['approved', 'changes_requested'] as const
export type ListingReviewDecision = (typeof LISTING_REVIEW_DECISIONS)[number]

/** Matches listings_review_note_length. The note reaches the host by email. */
export const MAX_LISTING_REVIEW_NOTE_LENGTH = 500

/** The most listings one listing-submitted call emails about. */
export const MAX_SUBMITTED_NOTICES = 5

export function prepareListingReview(input: { decision: unknown; note: unknown }):
  | { ok: true; decision: ListingReviewDecision; note: string | null }
  | { ok: false; status: 400; message: string } {
  const decision = input.decision
  if (decision !== 'approved' && decision !== 'changes_requested') {
    return { ok: false, status: 400, message: 'decision must be approved or changes_requested' }
  }
  const note = typeof input.note === 'string' ? input.note.trim() : ''
  if (decision === 'changes_requested' && !note) {
    return { ok: false, status: 400, message: 'Tell the host what to change' }
  }
  if (note.length > MAX_LISTING_REVIEW_NOTE_LENGTH) {
    return {
      ok: false,
      status: 400,
      message: `The note must be ${MAX_LISTING_REVIEW_NOTE_LENGTH} characters or fewer`,
    }
  }
  // An approval never carries a note: review_listing clears it anyway.
  return { ok: true, decision, note: decision === 'approved' ? null : note }
}

export type SubmittedListingRow = {
  review_status?: string | null
  review_requested_at?: string | null
  review_notified_at?: string | null
}

/**
 * Whether the team still needs telling about this listing: it is waiting for
 * review and nobody has been emailed since it last entered the queue.
 */
export function needsSubmittedNotice(row: SubmittedListingRow): boolean {
  if (row.review_status !== 'pending') return false
  if (!row.review_notified_at) return true
  const notified = Date.parse(row.review_notified_at)
  const requested = Date.parse(row.review_requested_at ?? '')
  if (Number.isNaN(notified) || Number.isNaN(requested)) return false
  return notified < requested
}

/** A listing the team was told about before is back after the host's fix. */
export function isResubmission(row: SubmittedListingRow): boolean {
  return Boolean(row.review_notified_at)
}

/** What the host sees on Hosting for each state. */
export function listingReviewBadge(
  status: string | null | undefined,
): { label: string; tone: 'review' | 'changes' } | null {
  if (status === 'pending') return { label: 'In review', tone: 'review' }
  if (status === 'changes_requested') return { label: 'Changes needed', tone: 'changes' }
  return null
}
