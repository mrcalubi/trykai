import { describe, expect, it } from 'vitest'
import {
  dayOfPhoneError,
  dayOfPhoneLocal,
  isDayOfContactWindow,
  parseDayOfPhone,
  telHref,
  whatsappHref,
} from './dayOfPhone'

describe('day-of Singapore numbers', () => {
  it('stores 8 digits starting 3, 6, 8 or 9 as +65', () => {
    expect(parseDayOfPhone('9123 4567')).toBe('+6591234567')
    expect(parseDayOfPhone('+65 8123 4567')).toBe('+6581234567')
    expect(parseDayOfPhone('6591234567')).toBe('+6591234567')
    expect(parseDayOfPhone('21234567')).toBeNull()
    expect(parseDayOfPhone('9123456')).toBeNull()
  })

  it('builds call and WhatsApp links', () => {
    expect(dayOfPhoneLocal('+6591234567')).toBe('91234567')
    expect(dayOfPhoneLocal('bad')).toBe('')
    expect(telHref('91234567')).toBe('tel:+6591234567')
    expect(telHref('bad')).toBe('')
    expect(whatsappHref('91234567')).toBe('https://wa.me/6591234567')
    expect(whatsappHref('')).toBe('')
  })

  it('requires a number only when sharing is on', () => {
    expect(dayOfPhoneError('', { required: false })).toBe('')
    expect(dayOfPhoneError('', { required: true })).toBe('Enter an 8-digit Singapore number.')
    expect(dayOfPhoneError('11111111')).toBe(
      'Use an 8-digit Singapore number starting with 3, 6, 8 or 9.',
    )
    expect(dayOfPhoneError('91234567')).toBe('')
    expect(dayOfPhoneError(null)).toBe('')
    expect(isDayOfContactWindow('2099-01-01T00:00:00.000Z', 90)).toBe(false)
  })

  it('opens the day-of window 24 hours before start and closes when the session ends', () => {
    const start = '2026-10-31T10:00:00.000Z'
    const startMs = Date.parse(start)
    expect(isDayOfContactWindow(start, 90, startMs - 24 * 60 * 60 * 1000 - 1)).toBe(false)
    expect(isDayOfContactWindow(start, 90, startMs - 24 * 60 * 60 * 1000)).toBe(true)
    expect(isDayOfContactWindow(start, 90, startMs)).toBe(true)
    expect(isDayOfContactWindow(start, 90, startMs + 90 * 60 * 1000)).toBe(true)
    expect(isDayOfContactWindow(start, 90, startMs + 90 * 60 * 1000 + 1)).toBe(false)
    expect(isDayOfContactWindow(start, 0, startMs + 120 * 60 * 1000)).toBe(true)
    expect(isDayOfContactWindow(start, null, startMs + 120 * 60 * 1000 + 1)).toBe(false)
    expect(isDayOfContactWindow('bad', 90, startMs)).toBe(false)
  })
})
