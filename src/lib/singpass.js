/**
 * Singpass Login for host verification (00035). Off unless the environment
 * turns it on, so production keeps the upload route until its Singpass app is
 * approved: set VITE_SINGPASS_ENABLED=true in Vercel for that environment.
 */
export function singpassEnabled(env = import.meta.env) {
  return env?.VITE_SINGPASS_ENABLED === 'true'
}

export const SINGPASS_RETURN_PATH = '/verify-identity/singpass'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Singpass dates are YYYY-MM-DD, or YYYY-MM / YYYY when only partly known. */
export function formatSingpassDob(dob) {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(String(dob ?? ''))
  if (!match) return String(dob ?? '')
  const [, year, month, day] = match
  if (!month) return year
  const name = MONTHS[Number(month) - 1] ?? month
  return day ? `${Number(day)} ${name} ${year}` : `${name} ${year}`
}

/** Whole years on `now`, for the review card. Partial dates give the lower bound. */
export function ageFromDob(dob, now = new Date()) {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(String(dob ?? ''))
  if (!match) return null
  const year = Number(match[1])
  const month = match[2] ? Number(match[2]) : 12
  const day = match[3] ? Number(match[3]) : 31
  let age = now.getFullYear() - year
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age -= 1
  return age
}
