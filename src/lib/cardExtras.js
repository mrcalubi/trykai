import { formatDuration } from './duration'

/**
 * Browse card price line: the total stays the headline, the length sits next
 * to it so a 2-hour class does not read as an expensive hour.
 * "S$32/person" + 120 mins -> "S$32/person · 2 hr".
 */
export function cardPriceLabel(price, durationMins) {
  const length = formatDuration(durationMins)
  return length ? `${price} · ${length}` : price
}

/**
 * One "included" line for the browse card, only when it adds value. Food and
 * drinks beat materials; equipment alone is expected and not worth the space.
 */
export function cardIncludedLabel(whatsProvided) {
  const items = Array.isArray(whatsProvided) ? whatsProvided : []
  if (items.includes('Food & drinks')) return 'Food & drinks included'
  if (items.includes('Materials')) return 'Materials included'
  return null
}
