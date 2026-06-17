function formatReviewDate(iso) {
  return new Intl.DateTimeFormat('en-SG', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Singapore',
  }).format(new Date(iso))
}

function StarDisplay({ rating }) {
  return (
    <span className="star-display" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= rating ? 'star-display__filled' : 'star-display__empty'}>
          ★
        </span>
      ))}
    </span>
  )
}

export default function ReviewCard({ review }) {
  const name = review.users?.full_name || 'Guest'
  const initial = name[0]?.toUpperCase() || '?'

  return (
    <div className="review-card">
      <div className="review-card__header">
        <div className="review-card__avatar">{initial}</div>
        <div>
          <p className="review-card__name">{name}</p>
          <div className="review-card__meta">
            <StarDisplay rating={review.rating} />
            <span className="review-card__date">{formatReviewDate(review.created_at)}</span>
          </div>
        </div>
      </div>
      {review.comment && <p className="review-card__comment">{review.comment}</p>}
    </div>
  )
}
