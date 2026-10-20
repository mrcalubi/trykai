import { describe, expect, it } from 'vitest'
import { PAYNOW_MAX_DAYS_AHEAD } from './pricing'
import {
  SESSION_BATCH_MAX,
  SESSION_BATCH_MAX_MESSAGE,
  SKIP_BATCH,
  SKIP_EXISTING,
  SKIP_PAST,
  addSingaporeDays,
  buildSessionStarts,
  formatBatchSummary,
  formatBatchWhen,
  generateRecurringDates,
  intervalsOverlap,
  isSelectableDateKey,
  previewSessionBatch,
  selectableDateWindow,
  singaporeDateTime,
  singaporeTimeValue,
  singaporeWeekday,
  skipReasonFromRpcMessage,
  SKIP_BOOKED,
} from './sessionBatch'

const NOW = Date.parse('2026-10-17T04:00:00.000Z') // Sat 17 Oct 2026, 12:00 in Singapore

describe('Singapore date keys', () => {
  it('adds days across month ends and leap day', () => {
    expect(addSingaporeDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addSingaporeDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addSingaporeDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(addSingaporeDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addSingaporeDays('2028-02-29', 1)).toBe('2028-03-01')
  })

  it('reads ISO weekdays in Singapore, not UTC', () => {
    expect(singaporeWeekday('2026-10-17')).toBe(6)
    expect(singaporeWeekday('2026-10-18')).toBe(7)
    expect(singaporeWeekday('2026-10-19')).toBe(1)
  })
})

describe('80-day window', () => {
  it('starts tomorrow and includes today + 80 days', () => {
    expect(PAYNOW_MAX_DAYS_AHEAD).toBe(80)
    expect(selectableDateWindow(NOW)).toEqual({
      todayKey: '2026-10-17',
      minDateKey: '2026-10-18',
      maxDateKey: '2027-01-05',
    })
  })

  it('allows 79 and 80 days ahead and blocks 81', () => {
    expect(isSelectableDateKey('2027-01-04', NOW)).toBe(true)
    expect(isSelectableDateKey('2027-01-05', NOW)).toBe(true)
    expect(isSelectableDateKey('2027-01-06', NOW)).toBe(false)
    expect(isSelectableDateKey('2026-10-17', NOW)).toBe(false)
    expect(isSelectableDateKey('2026-10-18', NOW)).toBe(true)
  })
})

describe('generateRecurringDates', () => {
  it('selects Sat and Sun for two weeks from tomorrow', () => {
    expect(
      generateRecurringDates({
        weekdays: [6, 7],
        everyWeeks: 1,
        forWeeks: 2,
        now: NOW,
      })
    ).toEqual(['2026-10-18', '2026-10-24', '2026-10-25', '2026-10-31'])
  })

  it('steps every two weeks from the next weekday', () => {
    expect(
      generateRecurringDates({
        weekdays: [6, 7],
        everyWeeks: 2,
        forWeeks: 2,
        now: NOW,
      })
    ).toEqual(['2026-10-18', '2026-10-24', '2026-11-01', '2026-11-07'])
  })

  it('crosses a month end when the next weekday is in the next month', () => {
    const endOfMonth = Date.parse('2026-10-30T04:00:00.000Z')
    expect(
      generateRecurringDates({
        weekdays: [6],
        everyWeeks: 1,
        forWeeks: 2,
        now: endOfMonth,
      })
    ).toEqual(['2026-10-31', '2026-11-07'])
  })

  it('clips dates past the 80-day window', () => {
    const dates = generateRecurringDates({
      weekdays: [6],
      everyWeeks: 1,
      forWeeks: 20,
      now: NOW,
    })
    expect(dates[0]).toBe('2026-10-24')
    expect(dates.at(-1)).toBe('2027-01-02')
    expect(dates.every((dateKey) => isSelectableDateKey(dateKey, NOW))).toBe(true)
    expect(dates).not.toContain('2027-01-09')
  })
})

describe('previewSessionBatch', () => {
  const durationMins = 60

  it('builds one start per date × time', () => {
    expect(buildSessionStarts(['2026-10-18', '2026-10-24'], ['10:00', '14:00'])).toHaveLength(4)
    expect(singaporeDateTime('2026-10-18', '10:30').toISOString()).toBe('2026-10-18T02:30:00.000Z')
    expect(singaporeTimeValue('2026-10-18T02:30:00.000Z')).toBe('10:30')
  })

  it('allows back-to-back sessions and treats an overlap as a clash', () => {
    expect(
      intervalsOverlap(
        Date.parse('2026-10-18T02:00:00.000Z'),
        60,
        Date.parse('2026-10-18T03:00:00.000Z'),
        60,
      )
    ).toBe(false)
    expect(
      intervalsOverlap(
        Date.parse('2026-10-18T02:00:00.000Z'),
        60,
        Date.parse('2026-10-18T02:30:00.000Z'),
        60,
      )
    ).toBe(true)
  })

  it('skips a time that is already in the past', () => {
    const preview = previewSessionBatch({
      dateKeys: ['2026-10-16'],
      times: ['10:00'],
      durationMins,
      now: NOW,
    })
    expect(preview.accepted).toHaveLength(0)
    expect(preview.skipped[0].reason).toBe(SKIP_PAST)
  })

  it('skips a proposed session that overlaps another in the same batch', () => {
    const preview = previewSessionBatch({
      dateKeys: ['2026-10-18'],
      times: ['10:00', '10:30'],
      durationMins,
      now: NOW,
    })
    expect(preview.accepted).toHaveLength(1)
    expect(preview.accepted[0].time).toBe('10:00')
    expect(preview.skipped).toEqual([
      expect.objectContaining({ time: '10:30', reason: SKIP_BATCH }),
    ])
  })

  it('skips a proposed session that overlaps any existing session of this host', () => {
    const preview = previewSessionBatch({
      dateKeys: ['2026-10-18'],
      times: ['10:00', '14:00'],
      durationMins,
      now: NOW,
      existingSessions: [
        {
          starts_at: '2026-10-18T02:00:00.000Z',
          duration_mins: 90,
          listing_id: 'other-listing',
        },
      ],
    })
    expect(preview.accepted.map((item) => item.time)).toEqual(['14:00'])
    expect(preview.skipped).toEqual([
      expect.objectContaining({ time: '10:00', reason: SKIP_EXISTING }),
    ])
  })

  it('ignores cancelled existing sessions', () => {
    const preview = previewSessionBatch({
      dateKeys: ['2026-10-18'],
      times: ['10:00'],
      durationMins,
      now: NOW,
      existingSessions: [
        {
          starts_at: '2026-10-18T02:00:00.000Z',
          duration_mins: 60,
          status: 'cancelled',
        },
      ],
    })
    expect(preview.accepted).toHaveLength(1)
    expect(preview.skipped).toHaveLength(0)
  })

  it('refuses a batch over the 40-session cap', () => {
    const dateKeys = Array.from({ length: 21 }, (_, index) =>
      addSingaporeDays('2026-10-18', index),
    )
    const preview = previewSessionBatch({
      dateKeys,
      times: ['10:00', '14:00'],
      durationMins,
      now: NOW,
    })
    expect(dateKeys.length * 2).toBe(42)
    expect(preview).toMatchObject({
      ok: false,
      error: SESSION_BATCH_MAX_MESSAGE,
      accepted: [],
    })
    expect(SESSION_BATCH_MAX).toBe(40)
  })

  it('accepts exactly 40 sessions', () => {
    const dateKeys = Array.from({ length: 20 }, (_, index) =>
      addSingaporeDays('2026-10-18', index),
    )
    const preview = previewSessionBatch({
      dateKeys,
      times: ['10:00', '14:00'],
      durationMins,
      now: NOW,
    })
    expect(preview.ok).toBe(true)
    expect(preview.accepted).toHaveLength(40)
  })
})

describe('formatBatchSummary', () => {
  it('lists skipped times with reasons', () => {
    const skipped = [
      {
        startsAt: new Date('2026-11-08T02:00:00.000Z'),
        reason: SKIP_EXISTING,
      },
      {
        startsAt: new Date('2026-11-08T06:00:00.000Z'),
        reason: SKIP_BATCH,
      },
    ]
    expect(formatBatchWhen(skipped[0].startsAt, NOW)).toBe('Sun 8 Nov 10:00 am')
    expect(formatBatchSummary({ created: 10, skipped }, NOW)).toBe(
      'Created 10 sessions. Skipped 2: Sun 8 Nov 10:00 am (clashes with an existing session), Sun 8 Nov 2:00 pm (clashes with another session in this batch)',
    )
  })

  it('says Created 1 session when nothing was skipped', () => {
    expect(formatBatchSummary({ created: 1, skipped: [] })).toBe('Created 1 session.')
  })

  it('maps overlap RPC copy to the existing-clash reason', () => {
    expect(
      skipReasonFromRpcMessage('That time overlaps the session on Fri, 9 Oct at 11:11 am (90 mins).')
    ).toBe(SKIP_EXISTING)
    expect(skipReasonFromRpcMessage('Choose a time in the future.')).toBe(SKIP_PAST)
  })
})

describe('previewSessionBatch with shared availability (listingId)', () => {
  const dateKey = '2099-06-06'
  const base = { dateKeys: [dateKey], times: ['10:00'], durationMins: 60, now: Date.parse('2099-01-01T00:00:00Z') }
  const at = (listingId, extra = {}) => ({
    starts_at: '2099-06-06T02:30:00.000Z',
    duration_mins: 60,
    listing_id: listingId,
    status: 'open',
    listings: { title: listingId === 'l-2' ? 'Pottery' : 'Latte art' },
    bookings: [],
    ...extra,
  })

  it('shares a time with an unbooked session on another listing', () => {
    const result = previewSessionBatch({ ...base, listingId: 'l-1', existingSessions: [at('l-2')] })
    expect(result.accepted).toHaveLength(1)
    expect(result.accepted[0].sharedWith).toEqual(['Pottery'])
  })

  it('still skips a clash on the same listing', () => {
    const result = previewSessionBatch({ ...base, listingId: 'l-1', existingSessions: [at('l-1')] })
    expect(result.skipped[0].reason).toBe(SKIP_EXISTING)
  })

  it('skips a time the host is already booked for elsewhere', () => {
    const booked = at('l-2', { bookings: [{ status: 'confirmed' }] })
    const result = previewSessionBatch({ ...base, listingId: 'l-1', existingSessions: [booked] })
    expect(result.skipped[0].reason).toBe(SKIP_BOOKED)
  })

  it('ignores cancelled sessions and keeps the old host-wide rule without listingId', () => {
    expect(
      previewSessionBatch({ ...base, listingId: 'l-1', existingSessions: [at('l-1', { status: 'cancelled' })] }).accepted,
    ).toHaveLength(1)
    expect(previewSessionBatch({ ...base, existingSessions: [at('l-2')] }).skipped[0].reason).toBe(SKIP_EXISTING)
  })

  it('does not mark a free time as shared', () => {
    const result = previewSessionBatch({ ...base, listingId: 'l-1', existingSessions: [] })
    expect(result.accepted[0].sharedWith).toBeUndefined()
  })
})
