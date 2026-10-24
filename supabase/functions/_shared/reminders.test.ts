import { describe, expect, it } from 'vitest'
import {
  FRESH_BOOKING_MS,
  REMINDER_WINDOW_MAX_MS,
  REMINDER_WINDOW_MIN_MS,
  guestReminderSkipReason,
  groupBookingsBySession,
  hostReminderSkipReason,
  personWord,
  reminderWindowIso,
  sessionInReminderWindow,
  type GuestReminderCandidate,
} from './reminders.ts'

const NOW = Date.parse('2026-10-24T12:00:00.000Z')

function isoFromNow(ms: number): string {
  return new Date(NOW + ms).toISOString()
}

function guest(overrides: Partial<GuestReminderCandidate> = {}): GuestReminderCandidate {
  return {
    status: 'confirmed',
    sessionStatus: 'open',
    startsAt: isoFromNow(8 * 60 * 60 * 1000),
    guestReminderSentAt: null,
    confirmedAt: isoFromNow(-7 * 60 * 60 * 1000),
    ...overrides,
  }
}

describe('session reminder window', () => {
  it('includes the 2h and 24h edges and excludes just outside them', () => {
    expect(sessionInReminderWindow(isoFromNow(REMINDER_WINDOW_MIN_MS), NOW)).toBe(true)
    expect(sessionInReminderWindow(isoFromNow(REMINDER_WINDOW_MAX_MS), NOW)).toBe(true)
    expect(sessionInReminderWindow(isoFromNow(REMINDER_WINDOW_MIN_MS - 1), NOW)).toBe(false)
    expect(sessionInReminderWindow(isoFromNow(REMINDER_WINDOW_MAX_MS + 1), NOW)).toBe(false)
  })

  it('writes ISO bounds that match those edges', () => {
    const bounds = reminderWindowIso(NOW)
    expect(bounds.windowStart).toBe(isoFromNow(REMINDER_WINDOW_MIN_MS))
    expect(bounds.windowEnd).toBe(isoFromNow(REMINDER_WINDOW_MAX_MS))
    expect(bounds.confirmedBefore).toBe(isoFromNow(-FRESH_BOOKING_MS))
  })
})

describe('guest reminder eligibility', () => {
  it('sends a confirmed booking in the window that is older than 6h', () => {
    expect(guestReminderSkipReason(guest(), NOW)).toBeNull()
  })

  it('skips a booking confirmed less than 6h ago, and sends at the 6h edge', () => {
    expect(
      guestReminderSkipReason(guest({ confirmedAt: isoFromNow(-(FRESH_BOOKING_MS - 1)) }), NOW),
    ).toBe('fresh_booking')
    expect(
      guestReminderSkipReason(guest({ confirmedAt: isoFromNow(-FRESH_BOOKING_MS) }), NOW),
    ).toBeNull()
  })

  it('skips cancelled bookings and cancelled sessions', () => {
    expect(guestReminderSkipReason(guest({ status: 'cancelled' }), NOW)).toBe('not_confirmed')
    expect(guestReminderSkipReason(guest({ sessionStatus: 'cancelled' }), NOW)).toBe(
      'session_not_open',
    )
  })

  it('sends nothing on a second run once the claim timestamp is set', () => {
    const first = guest()
    expect(guestReminderSkipReason(first, NOW)).toBeNull()
    expect(
      guestReminderSkipReason({ ...first, guestReminderSentAt: isoFromNow(-60_000) }, NOW),
    ).toBe('already_sent')
  })

  it('skips a booking whose session start is not a date', () => {
    expect(guestReminderSkipReason(guest({ startsAt: 'soon' }), NOW)).toBe('invalid_starts_at')
    expect(guestReminderSkipReason(guest({ confirmedAt: 'yesterday' }), NOW)).toBe(
      'invalid_confirmed_at',
    )
  })
})

describe('host reminder eligibility', () => {
  it('sends one email per open session in the window that has confirmed guests', () => {
    expect(
      hostReminderSkipReason(
        {
          status: 'open',
          startsAt: isoFromNow(8 * 60 * 60 * 1000),
          hostReminderSentAt: null,
          confirmedBookingCount: 2,
        },
        NOW,
      ),
    ).toBeNull()
  })

  it('skips cancelled sessions, empty sessions, and a second run', () => {
    const base = {
      status: 'open',
      startsAt: isoFromNow(8 * 60 * 60 * 1000),
      hostReminderSentAt: null,
      confirmedBookingCount: 1,
    }
    expect(hostReminderSkipReason({ ...base, status: 'cancelled' }, NOW)).toBe('session_not_open')
    expect(hostReminderSkipReason({ ...base, confirmedBookingCount: 0 }, NOW)).toBe(
      'no_confirmed_bookings',
    )
    expect(
      hostReminderSkipReason({ ...base, hostReminderSentAt: isoFromNow(-60_000) }, NOW),
    ).toBe('already_sent')
  })
})

describe('groupBookingsBySession', () => {
  it('groups confirmed bookings per session and sums group sizes', () => {
    const groups = groupBookingsBySession([
      { sessionId: 's1', guestName: 'Mei', guestsCount: 2 },
      { sessionId: 's2', guestName: 'Alex', guestsCount: 1 },
      { sessionId: 's1', guestName: 'Sam', guestsCount: 3 },
    ])
    expect(groups.size).toBe(2)
    expect(groups.get('s1')).toEqual({
      guests: [
        { name: 'Mei', guestsCount: 2 },
        { name: 'Sam', guestsCount: 3 },
      ],
      totalGuests: 5,
    })
    expect(groups.get('s2')).toEqual({
      guests: [{ name: 'Alex', guestsCount: 1 }],
      totalGuests: 1,
    })
  })
})

describe('personWord', () => {
  it('uses person only for one guest', () => {
    expect(personWord(1)).toBe('person')
    expect(personWord(2)).toBe('people')
    expect(personWord(0)).toBe('people')
  })
})
