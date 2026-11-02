import { useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  IMAGE_ACCEPT,
  MAX_REVIEW_PHOTOS,
  REVIEW_PHOTO_CONSENT,
  filesToReviewPhotos,
  uploadReviewPhotos,
} from '../lib/reviewPhotos'
import StarPicker from './StarPicker'
import Button from './ui/Button'

export default function ReviewForm({
  booking,
  userId,
  submitLabel = 'Leave a review',
  loadingLabel = 'Submitting',
  onCancel,
  onSubmitted,
  className = 'form',
}) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
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
      const { error: insertError } = await supabase.from('reviews').insert({
        booking_id: booking.id,
        reviewer_id: userId,
        reviewee_id: hostId,
        rating,
        comment: comment.trim() || null,
        role: 'guest',
        photo_paths: photoPaths,
      })
      if (insertError) {
        setError(insertError.message)
        return
      }
      onSubmitted?.()
    } catch (caught) {
      setError(caught?.message || "That photo didn't upload. Try again or pick a different one.")
    } finally {
      setLoading(false)
    }
  }

  const remaining = MAX_REVIEW_PHOTOS - photos.length

  return (
    <form onSubmit={handleSubmit} className={className}>
      <label className="label">
        Rating
        <StarPicker value={rating} onChange={setRating} />
      </label>
      <label className="label">
        Comment
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Share your experience…"
          rows={3}
          className="input input--textarea"
        />
      </label>
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
              Add photos
              <input
                type="file"
                accept={IMAGE_ACCEPT}
                multiple
                aria-label="Photos"
                onChange={handlePhotos}
                className="visually-hidden"
              />
            </label>
          ) : null}
        </div>
        <p className="hint">{REVIEW_PHOTO_CONSENT}</p>
        {photoError ? (
          <p className="error-message" role="status">
            {photoError}
          </p>
        ) : null}
      </div>
      {error ? <p className="error-message">{error}</p> : null}
      <div className="button-row">
        <Button type="submit" loading={loading} loadingLabel={loadingLabel}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className="btn btn--ghost">
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  )
}
