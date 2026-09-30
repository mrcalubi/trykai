/**
 * Map listing_ratings RPC rows onto the Card props. Rows with no reviews are
 * omitted by the RPC; anything with a non-positive count is ignored so a card
 * never renders an empty star.
 */
export function ratingsByListingId(rows) {
  const byId = {}
  for (const row of rows ?? []) {
    const count = Number(row.review_count)
    const average = Number(row.average)
    if (!row.listing_id || count < 1 || !Number.isFinite(average) || average <= 0) {
      continue
    }
    byId[row.listing_id] = { rating: average, reviewCount: count }
  }
  return byId
}
