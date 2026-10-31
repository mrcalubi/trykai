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
