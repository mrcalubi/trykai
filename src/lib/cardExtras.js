/**
 * The session length in the tag on a browse card's price row: "1 hr", "1.5 hr",
 * "45 min". Read next to the price, it tells a guest a long session is not an
 * expensive hour. Whole and half hours read like the length chips hosts pick
 * from; any other length stays in minutes ("80 min") so the tag stays short
 * enough to share a phone card's line with the price.
 */
export function cardLength(durationMins) {
  const total = Number(durationMins)
  if (!Number.isInteger(total) || total < 1) return null
  if (total >= 60 && total % 30 === 0) return `${total / 60} hr`
  return `${total} min`
}
