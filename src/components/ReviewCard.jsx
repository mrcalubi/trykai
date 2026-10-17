import { publicName } from '../lib/publicName'
import { reportMailto, reviewReportSubject } from '../lib/reportMailto'
import OverflowMenu from './ui/OverflowMenu'

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

export default function ReviewCard({ review, listingTitle, viewerId }) {
  const name = publicName({ display_name: review.users?.full_name }) || 'Guest'
  const initial = name[0]?.toUpperCase() || '?'
  const listing = listingTitle || review.listing_title || 'listing'
  const isOwnReview = Boolean(viewerId && review.reviewer_id && viewerId === review.reviewer_id)
  const reportHref = reportMailto({
    subject: reviewReportSubject(listing),
    url: typeof window === 'undefined' ? '' : window.location.href,
    id: review.id,
  })

  return (
    <div className="review-card">
      <div className="review-card__header">
        <div className="review-card__avatar">{initial}</div>
        <div className="review-card__author">
          <p className="review-card__name">{name}</p>
          {review.listing_title ? (
            <p className="review-card__listing">{review.listing_title}</p>
          ) : null}
          <div className="review-card__meta">
            <StarDisplay rating={review.rating} />
            <span className="review-card__date">{formatReviewDate(review.created_at)}</span>
          </div>
        </div>
        {!isOwnReview ? (
          <OverflowMenu
            label="More actions"
            icon="⋮"
            className="review-card__menu ui-overflow--quiet"
            items={[{ label: 'Report review', href: reportHref }]}
          />
        ) : null}
      </div>
      {review.comment && <p className="review-card__comment">{review.comment}</p>}
    </div>
  )
}
