import { supabase } from './supabase'

/**
 * Host replies to guest reviews (00055). One short public reply per review,
 * written by the host of that session once the review is public.
 */

export const REPLY_MAX_LENGTH = 600

/**
 * Replies for the reviews a page shows, as { [reviewId]: reply }. Empty when
 * there is nothing to ask for, 00055 is not applied, or the read fails: the
 * reviews still show, just without replies.
 */
export async function fetchReviewReplies(reviewIds) {
  const ids = [...new Set((reviewIds ?? []).filter(Boolean))]
  if (ids.length === 0) return {}
  try {
    const { data, error } = await supabase.rpc('review_replies', { p_review_ids: ids })
    if (error || !Array.isArray(data)) return {}
    return Object.fromEntries(data.filter((row) => row?.review_id).map((row) => [row.review_id, row]))
  } catch {
    return {}
  }
}

/**
 * Sets `reply` on the reviews that were asked about (askedIds) and leaves the
 * rest alone, so a late answer for an earlier page cannot wipe replies.
 */
export function mergeReplies(reviews, repliesById, askedIds) {
  const asked = new Set(askedIds ?? [])
  return (reviews ?? []).map((review) =>
    asked.has(review.id) ? { ...review, reply: repliesById?.[review.id] ?? null } : review,
  )
}

/**
 * Loads replies for `reviews` and calls `setReviews` with an updater. The
 * reviews show first; replies appear when they arrive.
 */
export async function loadRepliesInto(reviews, setReviews) {
  const askedIds = (reviews ?? []).map((review) => review.id).filter(Boolean)
  if (askedIds.length === 0) return
  const byId = await fetchReviewReplies(askedIds)
  setReviews((current) => mergeReplies(current, byId, askedIds))
}

/** Updater for one review's reply after the host saves or deletes it. */
export function replaceReply(reviewId, reply) {
  return (current) =>
    (current ?? []).map((review) => (review.id === reviewId ? { ...review, reply } : review))
}

/** Trimmed reply text, or an error message for the form. */
export function checkReplyBody(body) {
  const text = String(body ?? '').trim()
  if (!text) return { text, error: 'Write a reply first.' }
  if (text.length > REPLY_MAX_LENGTH) {
    return { text, error: `Keep it to ${REPLY_MAX_LENGTH} characters.` }
  }
  return { text, error: '' }
}

const SAVE_ERROR = "Couldn't save your reply. Try again."

/** { reply } on success, { error } otherwise. */
export async function saveReviewReply(reviewId, body) {
  const { text, error: invalid } = checkReplyBody(body)
  if (invalid) return { error: invalid }
  try {
    const { data, error } = await supabase.rpc('reply_to_review', {
      p_review_id: reviewId,
      p_body: text,
    })
    if (error) {
      const message = String(error.message ?? '')
      if (message.includes('once the review is public')) {
        return { error: 'You can reply once the review is public.' }
      }
      return { error: SAVE_ERROR }
    }
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return { error: SAVE_ERROR }
    return { reply: row }
  } catch {
    return { error: SAVE_ERROR }
  }
}

/** true when the reply was removed. */
export async function deleteReviewReply(reviewId) {
  try {
    const { data, error } = await supabase.rpc('delete_review_reply', { p_review_id: reviewId })
    return !error && data === true
  } catch {
    return false
  }
}
