import { useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  HOST_REVIEW_COMMENT_MAX,
  HOST_REVIEW_COMMENT_MIN,
  daysLeftUntil,
  editReview,
  firstRow,
  isReviewRevealedError,
  notifyReviewEmails,
  reviewClosedOnLabel,
  reviewIsEditable,
  reviewRpcErrorMessage,
} from '../lib/twoWayReviews'
import { formatSessionDay } from '../lib/sessionDate'
import StarPicker from './StarPicker'
import ReviewPrivateNote from './ReviewPrivateNote'
import Button from './ui/Button'

/**
 * Host review of one guest. With `review`, edits that review while it is
 * hidden (edit_review, 00058); no private note then, it was sent on post.
 */
export default function HostReviewForm({ row, onSubmitted, onCancel, review = null, onRevealed }) {
  const editing = Boolean(review?.id)
  const [rating, setRating] = useState(() => (editing ? Number(review.rating) || 0 : 0))
  const [comment, setComment] = useState(() => (editing ? review.comment ?? '' : ''))
  const [privateNote, setPrivateNote] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const guestName = row.guest_display_name?.trim() || 'your guest'
  const closedOn = reviewClosedOnLabel(row.deadline)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (rating < 1 || rating > 5) {
      setError('Please select a star rating.')
      return
    }
    const words = comment.trim()
    if (words.length < HOST_REVIEW_COMMENT_MIN || words.length > HOST_REVIEW_COMMENT_MAX) {
      setError(`Write ${HOST_REVIEW_COMMENT_MIN} to ${HOST_REVIEW_COMMENT_MAX} characters.`)
      return
    }

    setLoading(true)
    try {
      const { data, error: rpcError } = editing
        ? await editReview({ reviewId: review.id, rating, comment: words, photoPaths: [] })
        : await supabase.rpc('post_review', {
            p_booking_id: row.booking_id,
            p_reviewee_id: row.guest_id,
            p_rating: rating,
            p_comment: words,
            p_photo_paths: [],
            p_private_note: privateNote.trim() || null,
          })
      if (rpcError) {
        const message = reviewRpcErrorMessage(rpcError, { closedOn, otherName: guestName })
        if (editing && onRevealed && isReviewRevealedError(rpcError)) {
          onRevealed(message)
          return
        }
        setError(message)
        return
      }
      const posted = firstRow(data)
      // An edit tells nobody: the guest was told when the review was posted.
      if (!editing) void notifyReviewEmails(posted?.review_id)
      onSubmitted?.(posted, { rating, comment: words, photo_paths: [] })
    } catch (caught) {
      setError(caught?.message || "That review didn't save. Try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form review-form host-review-form">
      <h3 className="host-review-form__title">How was {guestName}?</h3>
      <StarPicker value={rating} onChange={setRating} />
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value.slice(0, HOST_REVIEW_COMMENT_MAX))}
        placeholder="What were they like?"
        aria-label="Comment"
        rows={4}
        maxLength={HOST_REVIEW_COMMENT_MAX}
        required
        className="input input--textarea"
      />
      <p className="hint">
        Your words show on {guestName}&apos;s profile. Stars stay private.
      </p>
      {editing ? null : (
        <ReviewPrivateNote
          id={`review-private-note-${row.booking_id}-${row.guest_id}`}
          value={privateNote}
          onChange={setPrivateNote}
        />
      )}
      {error ? <p className="error-message">{error}</p> : null}
      <Button
        type="submit"
        loading={loading}
        loadingLabel={editing ? 'Saving' : 'Posting'}
        className="review-form__submit"
      >
        {editing ? 'Save changes' : 'Post review'}
      </Button>
      {onCancel ? (
        <button type="button" className="link-button" onClick={onCancel}>
          Cancel
        </button>
      ) : null}
    </form>
  )
}

export function HostReviewsDueList({ rows, now, myReviews = [] }) {
  const [openId, setOpenId] = useState(null)
  const [doneIds, setDoneIds] = useState(() => new Set())
  // Reviews posted or edited on this page, by person, over what was loaded.
  const [saved, setSaved] = useState(() => ({}))
  const [notices, setNotices] = useState(() => ({}))
  const [nowMs] = useState(() => Date.now())
  const at = now ?? nowMs
  // A booking can list the booker and friends who took a seat, so key by person.
  const keyOf = (row) => `${row.booking_id}:${row.guest_id}`
  const loaded = Object.fromEntries(
    (myReviews ?? []).map((review) => [`${review.booking_id}:${review.reviewee_id}`, review]),
  )
  const pending = (rows ?? []).filter((row) => !row.host_reviewed && !doneIds.has(keyOf(row)))
  const count = pending.length

  if (!rows?.length) return null

  return (
    <section className="hosting-reviews" aria-labelledby="hosting-reviews-title">
      <h2 id="hosting-reviews-title" className="hosting__section-title">
        {count} {count === 1 ? 'guest' : 'guests'} to review
      </h2>
      <ul className="hosting-reviews__list">
        {(rows ?? []).map((row) => {
          const guestName = row.guest_display_name?.trim() || 'Guest'
          const key = keyOf(row)
          const done = row.host_reviewed || doneIds.has(key)
          const days = daysLeftUntil(row.deadline, at)
          const mine = saved[key] ?? loaded[key] ?? null
          const editable = done && reviewIsEditable(mine, at)
          const open = openId === key
          return (
            <li key={key} className="hosting-reviews__item">
              <div className="hosting-reviews__row">
                <div>
                  <p className="hosting-reviews__name">
                    {guestName}
                    {row.booked_by ? <span className="hosting-reviews__with"> · with {row.booked_by}</span> : null}
                  </p>
                  <p className="hosting-reviews__meta">
                    {row.listing_title}
                    {row.starts_at ? (
                      <span className="hosting-reviews__date"> · {formatSessionDay(row.starts_at, at)}</span>
                    ) : null}
                  </p>
                  {!done && days > 0 ? (
                    <p className="hosting-reviews__status">
                      {row.guest_reviewed ? (
                        <span className="hosting-reviews__nudge">Reviewed you · </span>
                      ) : null}
                      {days} {days === 1 ? 'day' : 'days'} left
                    </p>
                  ) : null}
                  {editable && !open ? (
                    <p className="hosting-reviews__status">
                      You can change it until it goes live
                    </p>
                  ) : null}
                  {notices[key] ? <p className="hosting-reviews__status">{notices[key]}</p> : null}
                </div>
                {done && editable ? (
                  open ? null : (
                    <button
                      type="button"
                      className="btn btn--small"
                      aria-label={`Edit review of ${guestName}`}
                      onClick={() => setOpenId(key)}
                    >
                      Edit
                    </button>
                  )
                ) : done ? (
                  <span className="hosting-reviews__done">Done</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={() => setOpenId((current) => (current === key ? null : key))}
                  >
                    Review
                  </button>
                )}
              </div>
              {open && !done ? (
                <HostReviewForm
                  row={row}
                  onCancel={() => setOpenId(null)}
                  onSubmitted={(posted, values) => {
                    setDoneIds((current) => new Set(current).add(key))
                    if (posted?.review_id && !posted.revealed) {
                      setSaved((current) => ({
                        ...current,
                        [key]: {
                          id: posted.review_id,
                          reveal_after: posted.reveal_after,
                          revealed_at: null,
                          ...values,
                        },
                      }))
                    }
                    setOpenId(null)
                  }}
                />
              ) : null}
              {open && editable ? (
                <HostReviewForm
                  row={row}
                  review={mine}
                  onCancel={() => setOpenId(null)}
                  onRevealed={(message) => {
                    setSaved((current) => ({
                      ...current,
                      [key]: { ...mine, revealed_at: new Date(at).toISOString() },
                    }))
                    setNotices((current) => ({ ...current, [key]: message }))
                    setOpenId(null)
                  }}
                  onSubmitted={(_posted, values) => {
                    setSaved((current) => ({ ...current, [key]: { ...mine, ...values } }))
                    setOpenId(null)
                  }}
                />
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
