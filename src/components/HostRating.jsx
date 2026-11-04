function formatHostRatingCopy(average, reviewCount) {
  const count = Math.max(0, Number(reviewCount) || 0)
  if (!count) return null
  const value = Number(average)
  if (!Number.isFinite(value)) return null
  return `${value.toFixed(1)} · ${count} ${count === 1 ? 'review' : 'reviews'}`
}

export default function HostRating({ average, reviewCount }) {
  const copy = formatHostRatingCopy(average, reviewCount)
  if (!copy) return null

  return (
    <p className="detail-host__rating">
      <span className="detail-host__star" aria-hidden="true">★</span>
      {' '}
      {copy}
    </p>
  )
}
