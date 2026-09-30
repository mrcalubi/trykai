function formatHostRatingCopy(reviews) {
  if (!reviews?.length) return null
  const average = (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)
  const count = reviews.length
  return `${average} · ${count} ${count === 1 ? 'review' : 'reviews'}`
}

export default function HostRating({ reviews }) {
  const copy = formatHostRatingCopy(reviews)
  if (!copy) return null

  return (
    <p className="detail-host__rating">
      <span className="detail-host__star" aria-hidden="true">★</span>
      {' '}
      {copy}
    </p>
  )
}
