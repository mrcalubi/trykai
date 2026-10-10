/**
 * Session length for every guest-facing surface. 390 minutes is "6 hr 30 min",
 * never "390 mins".
 */
export function formatDuration(mins) {
  const total = Number(mins)
  if (!Number.isFinite(total) || total < 1) return ''
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  const parts = []
  if (hours) parts.push(`${hours} hr`)
  if (minutes) parts.push(`${minutes} min`)
  return parts.join(' ')
}
