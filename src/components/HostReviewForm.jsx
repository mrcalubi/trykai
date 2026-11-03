import { useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  HOST_REVIEW_COMMENT_MAX,
  HOST_REVIEW_COMMENT_MIN,
  daysLeftUntil,
  firstRow,
  notifyReviewEmails,
  reviewClosedOnLabel,
  reviewRpcErrorMessage,
} from '../lib/twoWayReviews'
import { formatSessionDay } from '../lib/sessionDate'
import StarPicker from './StarPicker'
import ReviewPrivateNote from './ReviewPrivateNote'
import Button from './ui/Button'

export default function HostReviewForm({ row, onSubmitted, onCancel }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
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
      const { data, error: rpcError } = await supabase.rpc('post_review', {
        p_booking_id: row.booking_id,
        p_reviewee_id: row.guest_id,
        p_rating: rating,
        p_comment: words,
        p_photo_paths: [],
        p_private_note: privateNote.trim() || null,
      })
      if (rpcError) {
        setError(reviewRpcErrorMessage(rpcError, { closedOn }))
        return
      }
      const posted = firstRow(data)
      void notifyReviewEmails(posted?.review_id)
      onSubmitted?.(posted)
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
      <ReviewPrivateNote
        id={`review-private-note-${row.booking_id}`}
        value={privateNote}
        onChange={setPrivateNote}
      />
      {error ? <p className="error-message">{error}</p> : null}
      <Button type="submit" loading={loading} loadingLabel="Posting" className="review-form__submit">
        Post review
      </Button>
      {onCancel ? (
        <button type="button" className="link-button" onClick={onCancel}>
          Cancel
        </button>
      ) : null}
    </form>
  )
}

export function HostReviewsDueList({ rows, now }) {
  const [openId, setOpenId] = useState(null)
  const [doneIds, setDoneIds] = useState(() => new Set())
  const [nowMs] = useState(() => Date.now())
  const at = now ?? nowMs
  const pending = (rows ?? []).filter((row) => !row.host_reviewed && !doneIds.has(row.booking_id))
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
          const done = row.host_reviewed || doneIds.has(row.booking_id)
          const days = daysLeftUntil(row.deadline, at)
          return (
            <li key={row.booking_id} className="hosting-reviews__item">
              <div className="hosting-reviews__row">
                <div>
                  <p className="hosting-reviews__name">{guestName}</p>
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
                </div>
                {done ? (
                  <span className="hosting-reviews__done">Done</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={() => setOpenId((current) => (current === row.booking_id ? null : row.booking_id))}
                  >
                    Review
                  </button>
                )}
              </div>
              {openId === row.booking_id && !done ? (
                <HostReviewForm
                  row={row}
                  onCancel={() => setOpenId(null)}
                  onSubmitted={() => {
                    setDoneIds((current) => new Set(current).add(row.booking_id))
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
