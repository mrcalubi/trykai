import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  appleMapsUrl,
  bookingCountdown,
  bookingIcs,
  bookingStatusLabel,
  bringStorageKey,
  cancelNowCopy,
  cancelTiersSentence,
  dateTileParts,
  downloadIcs,
  guestFirstName,
  googleMapsUrl,
  isBookingDayOf,
  isEligibleRescheduleSession,
  isMissingRescheduleColumn,
  listingShareUrl,
  providedItems,
  readBringChecks,
  rescheduleBlockCopy,
  rescheduleBlockReason,
  startsInCopy,
  writeBringChecks,
} from './bookingPage'

afterEach(() => {
  vi.useRealTimers()
})

describe('booking page helpers', () => {
  it('builds map and listing links', () => {
    expect(googleMapsUrl('12 Club Street')).toContain('google.com/maps')
    expect(googleMapsUrl('12 Club Street')).toContain('12%20Club%20Street')
    expect(appleMapsUrl('12 Club Street')).toBe('https://maps.apple.com/?q=12%20Club%20Street')
    expect(listingShareUrl('listing-1', 'https://trykai.sg')).toBe('https://trykai.sg/listings/listing-1')
    expect(providedItems(['Apron', 'None', '  '])).toEqual(['Apron'])
    expect(providedItems(null)).toEqual([])
    expect(guestFirstName('Mei Ling')).toBe('Mei')
    expect(guestFirstName('')).toBe('A guest')
  })

  it('labels status and the countdown in Singapore time', () => {
    const now = Date.parse('2026-10-31T04:00:00.000Z')
    expect(bookingStatusLabel({ status: 'cancelled' }, now)).toBe('Cancelled')
    expect(
      bookingStatusLabel(
        { status: 'confirmed', sessions: { starts_at: '2026-10-20T04:00:00.000Z', duration_mins: 60 } },
        now,
      ),
    ).toBe('Completed')
    expect(
      bookingStatusLabel(
        { status: 'confirmed', sessions: { starts_at: '2026-11-02T04:00:00.000Z', duration_mins: 60 } },
        now,
      ),
    ).toBe('Confirmed')
    expect(bookingStatusLabel({ status: 'pending' }, now)).toBe('')
    expect(bookingCountdown('2026-10-31T10:00:00.000Z', now)).toBe('Today')
    expect(bookingCountdown('2026-11-01T10:00:00.000Z', now)).toBe('Tomorrow')
    expect(bookingCountdown('2026-11-04T10:00:00.000Z', now)).toBe('In 4 days')
    expect(bookingCountdown('not-a-date', now)).toBe('')
  })

  it('treats day-of as midnight Singapore time until the session ends', () => {
    const morning = Date.parse('2026-10-31T00:30:00+08:00')
    const after = Date.parse('2026-10-31T16:00:00+08:00')
    expect(isBookingDayOf('2026-10-31T06:00:00.000Z', 90, morning)).toBe(true)
    expect(isBookingDayOf('2026-10-31T06:00:00.000Z', 90, after)).toBe(false)
    expect(isBookingDayOf('2026-11-01T06:00:00.000Z', 90, morning)).toBe(false)
    expect(startsInCopy('2026-10-31T06:30:00.000Z', Date.parse('2026-10-31T06:00:00.000Z'))).toBe(
      'starts in 30 min',
    )
    expect(startsInCopy('2026-10-31T08:00:00.000Z', Date.parse('2026-10-31T06:00:00.000Z'))).toBe(
      'starts in 2 hr',
    )
    expect(startsInCopy('2026-10-31T07:30:00.000Z', Date.parse('2026-10-31T06:00:00.000Z'))).toBe(
      'starts in 1 hr 30 min',
    )
    expect(startsInCopy('2026-10-31T05:00:00.000Z', Date.parse('2026-10-31T06:00:00.000Z'))).toBe(
      'started',
    )
    expect(startsInCopy('not-a-date')).toBe('')
  })

  it('builds a calendar tile and an Apple .ics file', () => {
    const iso = '2026-11-10T04:00:00.000Z'
    const tile = dateTileParts(iso)
    expect(tile.weekday).toBe('Tue')
    expect(tile.day).toBe('10')
    expect(tile.month).toBe('Nov')
    expect(dateTileParts('nope')).toBeNull()

    const ics = bookingIcs({
      title: 'Latte art, extra',
      startsAt: iso,
      durationMins: 90,
      address: '12 Club Street',
      bookingId: 'booking-1',
      now: Date.parse('2026-10-31T00:00:00.000Z'),
    })
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('SUMMARY:Latte art\\, extra')
    expect(ics).toContain('LOCATION:12 Club Street')
    expect(ics).toContain('DTSTART:20261110T040000Z')
    expect(ics).toContain('DTEND:20261110T053000Z')
    expect(ics).toContain('UID:booking-booking-1@trykai.sg')
    expect(bookingIcs({ startsAt: 'nope' })).toBe('')
  })

  it('downloads the .ics as a calendar file', () => {
    const clicks = []
    const revoked = []
    const created = []
    const doc = {
      body: {
        appendChild(node) {
          created.push(node)
        },
      },
      createElement() {
        return {
          href: '',
          download: '',
          rel: '',
          click() {
            clicks.push(this.download)
          },
          remove() {},
        }
      },
    }
    const urlApi = {
      createObjectURL: () => 'blob:ics',
      revokeObjectURL: (href) => revoked.push(href),
    }
    expect(downloadIcs('booking.ics', 'BEGIN:VCALENDAR', doc, urlApi)).toBe(true)
    expect(clicks).toEqual(['booking.ics'])
    expect(revoked).toEqual(['blob:ics'])
    expect(downloadIcs('booking.ics', 'x', null, urlApi)).toBe(false)
  })

  it('saves the packing list per booking and survives blocked storage', () => {
    const store = new Map()
    const storage = {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => store.set(key, value),
    }
    expect(bringStorageKey('b1')).toBe('trykai:bring:b1')
    expect(readBringChecks('b1', storage)).toEqual([])
    expect(writeBringChecks('b1', ['Apron'], storage)).toBe(true)
    expect(readBringChecks('b1', storage)).toEqual(['Apron'])

    const blocked = {
      getItem() {
        throw new Error('blocked')
      },
      setItem() {
        throw new Error('blocked')
      },
    }
    expect(readBringChecks('b1', blocked)).toEqual([])
    expect(writeBringChecks('b1', ['Apron'], blocked)).toBe(false)
    expect(readBringChecks('b1', { getItem: () => 'not-json' })).toEqual([])
  })

  it('hides ineligible move targets and names the block reason', () => {
    const now = Date.parse('2026-10-31T00:00:00.000Z')
    const booking = {
      status: 'confirmed',
      session_id: 'old',
      guests_count: 2,
      payment_rail: 'paynow',
      created_at: '2026-10-01T00:00:00.000Z',
      sessions: { starts_at: '2026-11-10T00:00:00.000Z' },
    }
    expect(rescheduleBlockReason(booking, now)).toBeNull()
    expect(rescheduleBlockReason({ ...booking, rescheduled_at: '2026-10-20T00:00:00.000Z' }, now)).toBe(
      'already',
    )
    expect(
      rescheduleBlockReason(
        { ...booking, sessions: { starts_at: '2026-11-01T00:00:00.000Z' } },
        now,
      ),
    ).toBe('too_late')
    expect(rescheduleBlockReason({ status: 'cancelled' }, now)).toBe('unavailable')
    expect(rescheduleBlockCopy('already')).toBe("You've already moved this booking once")
    expect(rescheduleBlockCopy('too_late')).toBe('Moving closes 48 hours before')
    expect(rescheduleBlockCopy('unavailable')).toBe('')

    const open = {
      id: 'new',
      status: 'open',
      starts_at: '2026-11-15T00:00:00.000Z',
      spots_remaining: 3,
    }
    expect(isEligibleRescheduleSession(open, booking, now)).toBe(true)
    expect(isEligibleRescheduleSession({ ...open, id: 'old' }, booking, now)).toBe(false)
    expect(isEligibleRescheduleSession({ ...open, status: 'held' }, booking, now)).toBe(false)
    expect(isEligibleRescheduleSession({ ...open, spots_remaining: 1 }, booking, now)).toBe(false)
    expect(
      isEligibleRescheduleSession(
        { ...open, starts_at: '2027-02-01T00:00:00.000Z' },
        booking,
        now,
      ),
    ).toBe(false)
    expect(
      isEligibleRescheduleSession(
        { ...open, starts_at: '2026-11-01T00:00:00.000Z' },
        { ...booking, sessions: { listings: { booking_cutoff_hours: 48 } } },
        now,
      ),
    ).toBe(false)
  })

  it('quotes the cancel-now refund and recognises a missing column', () => {
    expect(cancelNowCopy(1000, '2099-01-01T00:00:00.000Z', 150)).toMatch(/^If you cancel now: \$/)
    expect(cancelTiersSentence()).toMatch(/Everything except the booking fee 48\+ hours before/)
    expect(isMissingRescheduleColumn({ code: '42703', message: 'column bookings.rescheduled_at does not exist' })).toBe(
      true,
    )
    expect(isMissingRescheduleColumn({ message: 'ok' })).toBe(false)
  })
})
