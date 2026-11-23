import { StarDisplay } from './ReviewCard'
import ReviewPhotoThumbs from './ReviewPhotoThumbs'

/**
 * The author's own review while it is still hidden: what they wrote, when it
 * goes live, and an Edit button (edit_review, 00058).
 */
export default function MyHiddenReview({ review, hint, onEdit, title = 'Your review' }) {
  if (!review) return hint ? <p className="hint">{hint}</p> : null
  return (
    <div className="my-review">
      <div className="my-review__head">
        <StarDisplay rating={Number(review.rating) || 0} />
        {onEdit ? (
          <button type="button" className="link-button" onClick={onEdit}>
            Edit review
          </button>
        ) : null}
      </div>
      {review.comment ? <p className="my-review__comment">{review.comment}</p> : null}
      <ReviewPhotoThumbs paths={review.photo_paths} title={title} />
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  )
}
