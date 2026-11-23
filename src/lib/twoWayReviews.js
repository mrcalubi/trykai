import { formatSessionDay } from './sessionDate'
import { supabase } from './supabase'

export const REVIEW_WINDOW_DAYS = 7
export const HOST_REVIEW_COMMENT_MIN = 10
export const HOST_REVIEW_COMMENT_MAX = 1000
export const PRIVATE_NOTE_MAX = 2000

export const DUPLICATE_REVIEW = "You've already reviewed this booking."
export const PRIVATE_NOTE_LABEL = 'Anything TryKai should know?'
export const PRIVATE_NOTE_OPTIONAL = 'Optional'
export const PRIVATE_NOTE_PLACEHOLDER = 'A problem, or an idea to make TryKai better'
export const PRIVATE_NOTE_HINT = 'Only the TryKai team sees this.'

export function firstRow(data) {
  if (Array.isArray(data)) return data[0] ?? null
  return data && typeof data === 'object' ? data : null
}

export function reviewIsPublic(review, now = Date.now()) {
  if (!review) return false
  if (review.revealed_at) return true
  if (!review.reveal_after) return false
  const at = new Date(review.reveal_after).getTime()
  return Number.isFinite(at) && at <= new Date(now).getTime()
}

/**
 * A review its author can still change: posted, not revealed, and before
 * reveal_after. Without a reveal_after we cannot tell, so no.
 */
export function reviewIsEditable(review, now = Date.now()) {
  if (!review?.id || review.revealed_at || !review.reveal_after) return false
  return !reviewIsPublic(review, now)
}

export function isReviewRevealedError(error) {
  return /review_revealed/i.test(String(error?.message || error?.code || ''))
}

export function reviewRevealedMessage(otherName) {
  const name = otherName?.trim()
  return name
    ? `${name} reviewed you too, so your review is live now and can't be changed.`
    : "Your review is live now and can't be changed."
}

export function reviewClosedOnLabel(iso, now = Date.now()) {
  return formatSessionDay(iso, now)
}

export function reviewRpcErrorMessage(error, { closedOn, otherName } = {}) {
  const text = String(error?.message || error?.code || '')
  if (/already_reviewed/i.test(text)) return DUPLICATE_REVIEW
  if (isReviewRevealedError(error)) return reviewRevealedMessage(otherName)
  if (/review_window_closed/i.test(text)) {
    return closedOn
      ? `Reviews for this session closed on ${closedOn}.`
      : 'Reviews for this session have closed.'
  }
  if (/not_allowed/i.test(text)) return "You can't review this booking."
  return error?.message || "That review didn't save. Try again."
}

export function daysLeftUntil(iso, now = Date.now()) {
  const at = new Date(iso).getTime()
  if (!Number.isFinite(at)) return 0
  return Math.max(0, Math.ceil((at - new Date(now).getTime()) / (24 * 60 * 60 * 1000)))
}

export function hostRatingFromRpc(data, error) {
  if (error) return { average: null, reviewCount: 0 }
  const row = firstRow(data)
  const count = Math.max(0, Number(row?.review_count) || 0)
  if (!count) return { average: null, reviewCount: 0 }
  const average = Number(row.average)
  return {
    average: Number.isFinite(average) ? average : null,
    reviewCount: count,
  }
}

const MY_REVIEW_COLUMNS =
  'id, booking_id, reviewee_id, role, rating, comment, photo_paths, reveal_after, revealed_at'

/**
 * The caller's own reviews on these bookings (00049 lets a reviewer read only
 * their own rows). Used to show and edit a review while it is hidden.
 */
export async function fetchMyReviews(bookingIds, userId, role) {
  const ids = [...new Set((bookingIds ?? []).filter(Boolean))]
  if (!userId || ids.length === 0) return []
  const { data, error } = await supabase
    .from('reviews')
    .select(MY_REVIEW_COLUMNS)
    .eq('reviewer_id', userId)
    .eq('role', role)
    .in('booking_id', ids)
  if (error) return []
  return data ?? []
}

/** Only while the review is hidden; see edit_review (00058). */
export async function editReview({ reviewId, rating, comment, photoPaths = [] }) {
  return supabase.rpc('edit_review', {
    p_review_id: reviewId,
    p_rating: rating,
    p_comment: comment,
    p_photo_paths: photoPaths,
  })
}

/**
 * Tells the other party (and TryKai, when there is a private note).
 * Never awaited by the page and never throws: the review already saved.
 */
export async function notifyReviewEmails(reviewId) {
  if (!reviewId) return
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    await supabase.functions.invoke('review-emails', {
      body: { review_id: reviewId },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
  } catch {
    // Best effort; see above.
  }
}
