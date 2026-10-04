import { describe, expect, it } from 'vitest'
import {
  formatDayLabel,
  formatDayTitle,
  formatMonthTitle,
  groupSessionsByDay,
  monthBounds,
  monthCells,
  sessionCountLabel,
  shiftMonth,
  singaporeDateKey,
  singaporeMonthKey,
} from './sessionCalendar'

describe('singaporeDateKey and singaporeMonthKey', () => {
  it('reads the calendar day in Singapore, not UTC', () => {
    expect(singaporeDateKey('2026-10-06T15:59:59.000Z')).toBe('2026-10-06')
    expect(singaporeDateKey('2026-10-06T16:00:00.000Z')).toBe('2026-10-07')
  })

  it('rolls the month over at Singapore midnight', () => {
    expect(singaporeMonthKey('2026-10-31T15:59:59.000Z')).toBe('2026-10')
    expect(singaporeMonthKey('2026-10-31T16:00:00.000Z')).toBe('2026-11')
  })

  it('accepts dates and epoch milliseconds as well as ISO strings', () => {
    const instant = Date.parse('2026-10-09T03:11:00.000Z')
    expect(singaporeDateKey(instant)).toBe('2026-10-09')
    expect(singaporeDateKey(new Date(instant))).toBe('2026-10-09')
  })
})

describe('shiftMonth', () => {
  it('moves forwards and backwards within a year', () => {
    expect(shiftMonth('2026-10', 1)).toBe('2026-11')
    expect(shiftMonth('2026-10', -3)).toBe('2026-07')
  })

  it('crosses year boundaries in both directions', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2027-01', -1)).toBe('2026-12')
    expect(shiftMonth('2026-10', 15)).toBe('2028-01')
  })
})

describe('monthBounds', () => {
  it('spans Singapore midnight on the 1st to Singapore midnight on the next 1st', () => {
    expect(monthBounds('2026-10')).toEqual({
      startIso: '2026-09-30T16:00:00.000Z',
      endIso: '2026-10-31T16:00:00.000Z',
    })
  })

  it('ends December on the 1st of January', () => {
    expect(monthBounds('2026-12').endIso).toBe('2026-12-31T16:00:00.000Z')
  })
})

describe('monthCells', () => {
  it('pads a month that starts on Sunday with six blanks in a Monday-first grid', () => {
    const cells = monthCells('2026-11')
    expect(cells.slice(0, 6)).toEqual([null, null, null, null, null, null])
    expect(cells[6]).toEqual({ dateKey: '2026-11-01', day: 1 })
    expect(cells).toHaveLength(6 + 30)
  })

  it('needs no padding when the month starts on Monday', () => {
    expect(monthCells('2026-06')[0]).toEqual({ dateKey: '2026-06-01', day: 1 })
  })

  it('knows February has 29 days in a leap year', () => {
    const days = monthCells('2028-02').filter(Boolean)
    expect(days).toHaveLength(29)
    expect(days.at(-1)).toEqual({ dateKey: '2028-02-29', day: 29 })
    expect(monthCells('2027-02').filter(Boolean)).toHaveLength(28)
  })
})

describe('groupSessionsByDay', () => {
  it('groups by Singapore day and orders each day by start time', () => {
    const evening = { id: 'evening', starts_at: '2026-10-09T11:00:00.000Z' }
    const morning = { id: 'morning', starts_at: '2026-10-09T01:00:00.000Z' }
    const lateNightUtc = { id: 'late', starts_at: '2026-10-09T17:00:00.000Z' }

    expect(groupSessionsByDay([evening, lateNightUtc, morning], '2026-10')).toEqual({
      '2026-10-09': [morning, evening],
      '2026-10-10': [lateNightUtc],
    })
  })

  it('leaves out sessions from other months', () => {
    const october = { id: 'oct', starts_at: '2026-10-31T15:00:00.000Z' }
    const november = { id: 'nov', starts_at: '2026-10-31T16:30:00.000Z' }

    expect(groupSessionsByDay([october, november], '2026-10')).toEqual({
      '2026-10-31': [october],
    })
    expect(groupSessionsByDay([], '2026-10')).toEqual({})
  })
})

describe('labels', () => {
  it('formats month titles and day labels in Singapore English', () => {
    expect(formatMonthTitle('2026-10')).toBe('October 2026')
    expect(formatDayLabel('2026-10-09')).toBe('Friday, 9 October')
    expect(formatDayTitle('2026-10-09')).toBe('Fri, 9 Oct')
  })

  it('counts sessions in words', () => {
    expect(sessionCountLabel(0)).toBe('no sessions')
    expect(sessionCountLabel(1)).toBe('1 session')
    expect(sessionCountLabel(12)).toBe('12 sessions')
  })
})
