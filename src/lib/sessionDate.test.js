import { describe, expect, it } from 'vitest'
import { formatSessionDateTime, formatSessionDay, formatSessionTime } from './sessionDate'

const THIS_YEAR = '2026-03-20T04:00:00.000Z'
const NEXT_YEAR = '2027-03-20T04:00:00.000Z'
const NOW = '2026-10-17T04:00:00.000Z'

describe('sessionDate', () => {
  it('omits the year when the session is this year', () => {
    expect(formatSessionDay(THIS_YEAR, NOW)).toBe('Fri, 20 Mar')
  })

  it('shows the year when the session is not this year', () => {
    expect(formatSessionDay(NEXT_YEAR, NOW)).toBe('Sat, 20 Mar 2027')
  })

  it('formats a Singapore time of day', () => {
    expect(formatSessionTime(THIS_YEAR)).toBe('12:00 pm')
  })

  it('joins day and time, keeping the year rule', () => {
    expect(formatSessionDateTime(THIS_YEAR, NOW)).toBe('Fri, 20 Mar at 12:00 pm')
    expect(formatSessionDateTime(NEXT_YEAR, NOW)).toBe('Sat, 20 Mar 2027 at 12:00 pm')
  })

  it('returns empty strings for an invalid instant', () => {
    expect(formatSessionDay('not-a-date')).toBe('')
    expect(formatSessionDateTime('not-a-date')).toBe('')
  })
})
