export {
  BOOKING_CUTOFF_HOURS,
  DEFAULT_BOOKING_CUTOFF_HOURS,
  bookingCutoffHours,
  isBookingClosed,
  bookingClosedMessage,
} from '../../supabase/functions/_shared/booking.ts'

export const ARRIVAL_INSTRUCTIONS_MAX = 200
export const ARRIVAL_INSTRUCTIONS_PLACEHOLDER =
  'Lift B to #04-56, ring the bell, door with the plants.'

export function arrivalInstructionsForSave(value) {
  const text = String(value ?? '')
    .trim()
    .slice(0, ARRIVAL_INSTRUCTIONS_MAX)
  return text || null
}

export function isMissingCutoffColumn(error) {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  return /booking_cutoff_hours|arrival_instructions|42703|PGRST204/i.test(text)
}

/** Chip text for a notice option: "3 hr", "1 day", "2 days". */
export function bookingCutoffLabel(hours) {
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24
    return days === 1 ? '1 day' : `${days} days`
  }
  return `${hours} hr`
}

/**
 * What the chosen notice means for one real session, so a host can see it
 * rather than work it out: "For a Saturday 7 pm session, the last booking is
 * at 4 pm that day."
 */
export function bookingCutoffExample(hours) {
  const SESSION_HOUR = 19
  const DAYS = ['Saturday', 'Friday', 'Thursday']
  const close = SESSION_HOUR - hours
  const dayBack = close >= 0 ? 0 : Math.ceil(-close / 24)
  const hour = ((close % 24) + 24) % 24
  const time = `${hour % 12 || 12} ${hour < 12 ? 'am' : 'pm'}`
  const when = dayBack === 0 ? `at ${time} that day` : `${DAYS[dayBack]} at ${time}`
  return `For a Saturday 7 pm session, the last booking is ${when}.`
}
