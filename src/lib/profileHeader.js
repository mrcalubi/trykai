export function hostProfileStats(reviews, listings) {
  const listingCount = listings?.length ?? 0
  if (listingCount === 0) return null
  const reviewCount = reviews?.length ?? 0
  const average = reviewCount
    ? Number((reviews.reduce((sum, review) => sum + Number(review.rating), 0) / reviewCount).toFixed(1))
    : null
  return { average, reviewCount, listingCount }
}

export function teachCategories(listings) {
  const seen = []
  for (const listing of listings ?? []) {
    const category = typeof listing.category === 'string' ? listing.category.trim() : ''
    if (category && !seen.includes(category)) seen.push(category)
  }
  return seen
}
