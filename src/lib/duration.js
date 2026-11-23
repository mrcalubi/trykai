/**
 * Session length for every guest- and host-facing surface. Always in hours, so
 * every page reads the same way as the length chips hosts pick from: "1 hr",
 * "1.5 hr", "0.75 hr". A length that is not a whole quarter hour rounds to two
 * decimals: 80 minutes is "1.33 hr", never "80 min" or "1 hr 20 min".
 */
export function formatDuration(mins) {
  const total = Number(mins)
  if (!Number.isFinite(total) || total < 1) return ''
  const hours = Math.round((total / 60) * 100) / 100
  return `${hours} hr`
}
