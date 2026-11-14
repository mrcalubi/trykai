import { describe, expect, it } from 'vitest'
import {
  ARRIVAL_INSTRUCTIONS_MAX,
  arrivalInstructionsForSave,
  bookingClosedMessage,
  bookingCutoffExample,
  bookingCutoffHours,
  bookingCutoffLabel,
  isBookingClosed,
  isMissingCutoffColumn,
} from './bookingCutoff'

describe('booking cutoff', () => {
  it('defaults unknown values to 3 hours', () => {
    expect(bookingCutoffHours(6)).toBe(6)
    expect(bookingCutoffHours(null)).toBe(3)
    expect(bookingCutoffHours(7)).toBe(3)
  })

  it('closes a session inside the host cutoff', () => {
    const start = '2026-10-31T10:00:00.000Z'
    expect(isBookingClosed(start, 3, Date.parse('2026-10-31T06:59:00.000Z'))).toBe(false)
    expect(isBookingClosed(start, 3, Date.parse('2026-10-31T07:00:00.000Z'))).toBe(true)
    expect(bookingClosedMessage(12)).toBe(
      'Bookings for this session closed 12 hours before it starts.',
    )
  })

  it('trims arrival copy and flags a missing column', () => {
    expect(arrivalInstructionsForSave('  Lift B  ')).toBe('Lift B')
    expect(arrivalInstructionsForSave('   ')).toBeNull()
    expect(arrivalInstructionsForSave('x'.repeat(ARRIVAL_INSTRUCTIONS_MAX + 8)).length).toBe(
      ARRIVAL_INSTRUCTIONS_MAX,
    )
    expect(arrivalInstructionsForSave(null)).toBeNull()
    expect(arrivalInstructionsForSave(undefined)).toBeNull()
    expect(isMissingCutoffColumn({ code: 'PGRST204', message: 'booking_cutoff_hours' })).toBe(true)
    expect(isMissingCutoffColumn({ message: 'arrival_instructions' })).toBe(true)
    expect(isMissingCutoffColumn(null)).toBe(false)
  })
})

describe('booking notice copy', () => {
  it('labels hours and whole days', () => {
    expect([3, 6, 12, 24, 48].map(bookingCutoffLabel)).toEqual([
      '3 hr',
      '6 hr',
      '12 hr',
      '1 day',
      '2 days',
    ])
  })

  it('shows what each notice means for a Saturday 7 pm session', () => {
    expect(bookingCutoffExample(3)).toBe(
      'For a Saturday 7 pm session, the last booking is at 4 pm that day.',
    )
    expect(bookingCutoffExample(12)).toMatch(/at 7 am that day\.$/)
    expect(bookingCutoffExample(19)).toMatch(/at 12 am that day\.$/)
    expect(bookingCutoffExample(24)).toMatch(/Friday at 7 pm\.$/)
    expect(bookingCutoffExample(48)).toMatch(/Thursday at 7 pm\.$/)
  })
})
