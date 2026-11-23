import { useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  IMAGE_ACCEPT,
  MAX_REVIEW_PHOTOS,
  REVIEW_PHOTO_CONSENT,
  filesToReviewPhotos,
  reviewPhotoPublicUrl,
  uploadReviewPhotos,
} from '../lib/reviewPhotos'
import {
  editReview,
  firstRow,
  isReviewRevealedError,
  notifyReviewEmails,
  reviewClosedOnLabel,
  reviewRpcErrorMessage,
} from '../lib/twoWayReviews'
import StarPicker from './StarPicker'
import ReviewPrivateNote from './ReviewPrivateNote'
import Button from './ui/Button'

function existingPhotos(review) {
  const paths = Array.isArray(review?.photo_paths) ? review.photo_paths.filter(Boolean) : []
  return paths.map((path) => ({
    id: path,
    path,
    previewUrl: reviewPhotoPublicUrl(path, supabase.storage),
    name: '',
  }))
}

/**
 * Guest review of the host. With `review`, edits that review (only while it
 * is hidden; edit_review refuses otherwise) and has no private note: the note
 * was already sent to TryKai when the review was posted.
 */
export default function ReviewForm({
  booking,
  userId,
  onSubmitted,
  onCancel,
  className = 'form review-form',
  closedOn,
  review = null,
  hostName,
  onRevealed,
}) {
  const editing = Boolean(review?.id)
  const [rating, setRating] = useState(() => (editing ? Number(review.rating) || 0 : 0))
  const [comment, setComment] = useState(() => (editing ? review.comment ?? '' : ''))
  const [privateNote, setPrivateNote] = useState('')
  const [photos, setPhotos] = useState(() => (editing ? existingPhotos(review) : []))
  const [error, setError] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handlePhotos(event) {
    const input = event.target
    const remaining = MAX_REVIEW_PHOTOS - photos.length
    const { photos: added, errors } = await filesToReviewPhotos(input.files, remaining)
    input.value = ''
    if (added.length > 0) setPhotos((current) => [...current, ...added].slice(0, MAX_REVIEW_PHOTOS))
    setPhotoError(errors[0]?.message || '')
  }

  function removePhoto(id) {
    setPhotos((current) => {
      const next = current.filter((photo) => photo.id !== id)
      const removed = current.find((photo) => photo.id === id)
      if (removed?.previewUrl && !removed.path) URL.revokeObjectURL(removed.previewUrl)
      return next
    })
    setPhotoError('')
  }

  async function photoPathsToSave() {
    const fresh = photos.filter((photo) => !photo.path)
    const uploaded = fresh.length > 0 ? await uploadReviewPhotos(fresh, userId, supabase.storage) : []
    let next = 0
    return photos.map((photo) => photo.path || uploaded[next++])
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (rating < 1 || rating > 5) {
      setError('Please select a star rating.')
      return
    }
    const hostId = booking.sessions?.listings?.host_id
    if (!editing && !hostId) {
      setError('Could not find host for this booking.')
      return
    }

    setLoading(true)
    try {
      const photoPaths = await photoPathsToSave()
      const { data, error: rpcError } = editing
        ? await editReview({
            reviewId: review.id,
            rating,
            comment: comment.trim() || null,
            photoPaths,
          })
        : await supabase.rpc('post_review', {
            p_booking_id: booking.id,
            p_reviewee_id: hostId,
            p_rating: rating,
            p_comment: comment.trim() || null,
            p_photo_paths: photoPaths,
            p_private_note: privateNote.trim() || null,
          })
      if (rpcError) {
        if (editing && onRevealed && isReviewRevealedError(rpcError)) {
          onRevealed(reviewRpcErrorMessage(rpcError, { otherName: hostName }))
          return
        }
        setError(
          reviewRpcErrorMessage(rpcError, {
            closedOn: closedOn || reviewClosedOnLabel(booking.sessions?.starts_at),
            otherName: hostName,
          }),
        )
        return
      }
      const posted = firstRow(data)
      // An edit tells nobody: the other side was told when the review was posted.
      if (!editing) void notifyReviewEmails(posted?.review_id)
      onSubmitted?.(posted, {
        rating,
        comment: comment.trim() || null,
        photo_paths: photoPaths,
      })
    } catch (caught) {
      setError(caught?.message || "That photo didn't upload. Try again or pick a different one.")
    } finally {
      setLoading(false)
    }
  }

  const remaining = MAX_REVIEW_PHOTOS - photos.length

  return (
    <form onSubmit={handleSubmit} className={className}>
      <StarPicker value={rating} onChange={setRating} />
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="What did you make? What was the host like?"
        aria-label="Comment"
        rows={3}
        className="input input--textarea"
      />
      <div className="review-form__photos">
        <div className="review-form__tiles">
          {photos.map((photo, index) => (
            <div key={photo.id} className="review-form__tile">
              <img src={photo.previewUrl} alt="" />
              <button
                type="button"
                className="review-form__remove"
                aria-label={`Remove ${photo.name || `photo ${index + 1}`}`}
                onClick={() => removePhoto(photo.id)}
              >
                ×
              </button>
            </div>
          ))}
          {remaining > 0 ? (
            <label className="review-form__add">
              <span aria-hidden="true">+</span>
              <input
                type="file"
                accept={IMAGE_ACCEPT}
                multiple
                aria-label="Add photos"
                onChange={handlePhotos}
                className="visually-hidden"
              />
            </label>
          ) : null}
        </div>
        <p className="review-form__consent">{REVIEW_PHOTO_CONSENT}</p>
        {photoError ? (
          <p className="error-message" role="status">
            {photoError}
          </p>
        ) : null}
      </div>
      {editing ? null : <ReviewPrivateNote value={privateNote} onChange={setPrivateNote} />}
      {error ? <p className="error-message">{error}</p> : null}
      <Button
        type="submit"
        loading={loading}
        loadingLabel={editing ? 'Saving' : 'Posting'}
        className="review-form__submit"
      >
        {editing ? 'Save changes' : 'Post review'}
      </Button>
      {editing && onCancel ? (
        <button type="button" className="link-button" onClick={onCancel}>
          Cancel
        </button>
      ) : null}
    </form>
  )
}
