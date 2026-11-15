import { describe, expect, it } from 'vitest'
import {
  datesInMonth,
  firstOfDay,
  hasSeveralClasses,
  isBookable,
  landingFor,
  monthDatesLabel,
  monthsWithDates,
  sessionsOfClass,
} from './classCalendar'

const NOW = Date.parse('2026-11-16T04:00:00Z') // Mon 16 Nov, noon in Singapore

function session(id, startsAt, typeId, spots = 4) {
  return { id, starts_at: startsAt, type_id: typeId, spots_remaining: spots }
}

const SOON = session('soon', '2026-11-16T07:00:00Z', 't1') // 3:00 pm today: inside a 3-hour cutoff
const SAT = session('sat', '2026-11-21T06:00:00Z', 't1')
const SAT_MORNING = session('sat-am', '2026-11-21T02:00:00Z', 't2')
const FULL = session('full', '2026-11-22T02:00:00Z', 't2', 0)
const DEC = session('dec', '2026-12-05T06:00:00Z', 't2')
const ALL = [DEC, SAT, FULL, SOON, SAT_MORNING]

describe('class calendar', () => {
  it('sorts and filters by class', () => {
    expect(sessionsOfClass(ALL, null).map((item) => item.id)).toEqual(['soon', 'sat-am', 'sat', 'full', 'dec'])
    expect(sessionsOfClass(ALL, 't2').map((item) => item.id)).toEqual(['sat-am', 'full', 'dec'])
  })

  it('knows what a guest can still book', () => {
    expect(isBookable(SAT, 3, NOW)).toBe(true)
    expect(isBookable(SOON, 3, NOW)).toBe(false)
    expect(isBookable(FULL, 3, NOW)).toBe(false)
  })

  it('lists the months with dates and the dates in one month', () => {
    expect(monthsWithDates(ALL)).toEqual(['2026-11', '2026-12'])
    const november = datesInMonth(sessionsOfClass(ALL, null), '2026-11')
    expect(Object.keys(november).sort()).toEqual(['2026-11-16', '2026-11-21', '2026-11-22'])
    expect(november['2026-11-21'].map((item) => item.id)).toEqual(['sat-am', 'sat'])
    expect(hasSeveralClasses(november['2026-11-21'])).toBe(true)
    expect(hasSeveralClasses(november['2026-11-22'])).toBe(false)
  })

  it('picks the first time on a day a guest can book', () => {
    expect(firstOfDay([SOON], 3, NOW)).toBe(SOON)
    expect(firstOfDay([FULL, SAT], 3, NOW)).toBe(SAT)
    expect(firstOfDay([], 3, NOW)).toBeNull()
  })

  it('lands on the first bookable date, keeps a pick that fits, and copes with none', () => {
    expect(landingFor(ALL, null, { cutoffHours: 3, now: NOW })).toEqual({
      session: SAT_MORNING,
      dateKey: '2026-11-21',
      monthKey: '2026-11',
    })
    expect(landingFor(ALL, 't2', { keepId: 'sat', cutoffHours: 3, now: NOW }).session).toBe(SAT_MORNING)
    expect(landingFor(ALL, null, { keepId: 'dec', cutoffHours: 3, now: NOW }).monthKey).toBe('2026-12')
    expect(landingFor([], 't1', { cutoffHours: 3, now: NOW })).toEqual({ session: null, dateKey: null, monthKey: null })
  })

  it('counts dates in the month header', () => {
    expect(monthDatesLabel(1)).toBe('1 date this month')
    expect(monthDatesLabel(6)).toBe('6 dates this month')
  })
})
