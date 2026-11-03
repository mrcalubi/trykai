import { useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  IMAGE_ACCEPT,
  MAX_REVIEW_PHOTOS,
  REVIEW_PHOTO_CONSENT,
  filesToReviewPhotos,
  uploadReviewPhotos,
} from '../lib/reviewPhotos'
import {
  firstRow,
  notifyReviewEmails,
  reviewClosedOnLabel,
  reviewRpcErrorMessage,
} from '../lib/twoWayReviews'
import StarPicker from './StarPicker'
import ReviewPrivateNote from './ReviewPrivateNote'
import Button from './ui/Button'

export default function ReviewForm({
  booking,
  userId,
  onSubmitted,
  className = 'form review-form',
  closedOn,
}) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [privateNote, setPrivateNote] = useState('')
  const [photos, setPhotos] = useState([])
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
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return next
    })
    setPhotoError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (rating < 1 || rating > 5) {
      setError('Please select a star rating.')
      return
    }
    const hostId = booking.sessions?.listings?.host_id
    if (!hostId) {
      setError('Could not find host for this booking.')
      return
    }

    setLoading(true)
    try {
      const photoPaths = photos.length > 0 ? await uploadReviewPhotos(photos, userId, supabase.storage) : []
      const { data, error: rpcError } = await supabase.rpc('post_review', {
        p_booking_id: booking.id,
        p_reviewee_id: hostId,
        p_rating: rating,
        p_comment: comment.trim() || null,
        p_photo_paths: photoPaths,
        p_private_note: privateNote.trim() || null,
      })
      if (rpcError) {
        setError(
          reviewRpcErrorMessage(rpcError, {
            closedOn: closedOn || reviewClosedOnLabel(booking.sessions?.starts_at),
          }),
        )
        return
      }
      const posted = firstRow(data)
      void notifyReviewEmails(posted?.review_id)
      onSubmitted?.(posted)
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
          {photos.map((photo) => (
            <div key={photo.id} className="review-form__tile">
              <img src={photo.previewUrl} alt="" />
              <button
                type="button"
                className="review-form__remove"
                aria-label={`Remove ${photo.name || 'photo'}`}
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
      <ReviewPrivateNote value={privateNote} onChange={setPrivateNote} />
      {error ? <p className="error-message">{error}</p> : null}
      <Button type="submit" loading={loading} loadingLabel="Posting" className="review-form__submit">
        Post review
      </Button>
    </form>
  )
}
