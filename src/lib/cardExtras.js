import { formatDuration } from './duration'

/**
 * Small, quiet note after the price on a browse card: "for 2 hr". The total
 * stays the headline; the length tells a guest a long session is not an
 * expensive hour.
 */
export function cardLengthNote(durationMins) {
  const length = formatDuration(durationMins)
  return length ? `for ${length}` : null
}
