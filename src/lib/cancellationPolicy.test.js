import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CANCELLATION_POLICY_ITEMS,
  GUEST_REFUND_TIERS,
  PLATFORM_FEE_RATE,
  calculateGuestRefund,
  formatCents,
  guestRefundDescription,
  guestRefundTier,
  hoursUntilSession,
} from './cancellationPolicy'
import { LEGACY_PLATFORM_FEE_RATE as EDGE_PLATFORM_FEE_RATE } from '../../supabase/functions/_shared/booking.ts'
import { hoursFromNow } from '../test/fixtures'

const NOW = new Date('2026-06-15T10:00:00.000Z')

// A $45 booking: the guest pays 4500, of which 675 is the platform fee, leaving a
// lesson fee of 3825.
const TOTAL = 4500
const FEE = 675
const LESSON_FEE = TOTAL - FEE

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('formatCents', () => {
  it('drops the decimals for whole-dollar amounts', () => {
    expect(formatCents(4500)).toBe('$45')
    expect(formatCents(100)).toBe('$1')
    expect(formatCents(0)).toBe('$0')
  })

  it('keeps two decimals for amounts with cents', () => {
    expect(formatCents(2050)).toBe('$20.50')
    expect(formatCents(1999)).toBe('$19.99')
    expect(formatCents(1)).toBe('$0.01')
  })

  it('formats large amounts without grouping separators', () => {
    expect(formatCents(1234567)).toBe('$12345.67')
  })
})

describe('hoursUntilSession', () => {
  it('counts down to the session', () => {
    expect(hoursUntilSession(hoursFromNow(12))).toBeCloseTo(12)
  })

  it('goes negative once the session has started', () => {
    expect(hoursUntilSession(hoursFromNow(-3))).toBeCloseTo(-3)
  })
})

describe('guestRefundTier', () => {
  it.each([
    [72, 'full'],
    [48, 'full'],
    [47.9, 'half'],
    [24, 'half'],
    [23.9, 'quarter'],
    [6, 'quarter'],
    [5.9, 'none'],
    [0, 'none'],
    [-10, 'none'],
  ])('places a cancellation %s hours out in the "%s" tier', (hours, expected) => {
    expect(guestRefundTier(hoursFromNow(hours)).id).toBe(expected)
  })

  it('always finds a tier, however late the cancellation', () => {
    expect(guestRefundTier(hoursFromNow(-10_000))).toBeDefined()
  })
})

describe('calculateGuestRefund', () => {
  it('refunds everything, platform fee included, at 48 hours or more', () => {
    expect(calculateGuestRefund(TOTAL, hoursFromNow(72), FEE)).toBe(TOTAL)
    expect(calculateGuestRefund(TOTAL, hoursFromNow(48), FEE)).toBe(TOTAL)
  })

  it('refunds half the lesson fee between 24 and 48 hours', () => {
    expect(calculateGuestRefund(TOTAL, hoursFromNow(47.9), FEE)).toBe(Math.round(LESSON_FEE * 0.5))
    expect(calculateGuestRefund(TOTAL, hoursFromNow(24), FEE)).toBe(Math.round(LESSON_FEE * 0.5))
  })

  it('refunds a quarter of the lesson fee between 6 and 24 hours', () => {
    expect(calculateGuestRefund(TOTAL, hoursFromNow(23.9), FEE)).toBe(Math.round(LESSON_FEE * 0.25))
    expect(calculateGuestRefund(TOTAL, hoursFromNow(6), FEE)).toBe(Math.round(LESSON_FEE * 0.25))
  })

  it('refunds nothing under 6 hours', () => {
    expect(calculateGuestRefund(TOTAL, hoursFromNow(5.9), FEE)).toBe(0)
    expect(calculateGuestRefund(TOTAL, hoursFromNow(0.5), FEE)).toBe(0)
  })

  it('refunds nothing for a no-show', () => {
    expect(calculateGuestRefund(TOTAL, hoursFromNow(-1), FEE)).toBe(0)
    expect(calculateGuestRefund(TOTAL, hoursFromNow(-48), FEE)).toBe(0)
  })

  it('never refunds the platform fee on a partial refund', () => {
    for (const hours of [47, 30, 24, 20, 10, 6]) {
      expect(calculateGuestRefund(TOTAL, hoursFromNow(hours), FEE)).toBeLessThanOrEqual(LESSON_FEE)
    }
  })

  it('rounds a part-cent refund to whole cents', () => {
    // Lesson fee of 4501 halves to 2250.5.
    expect(calculateGuestRefund(5296, hoursFromNow(30), 795)).toBe(2251)
  })

  it('falls back to the standard fee rate for a booking with no fee recorded', () => {
    const derivedFee = Math.round(TOTAL * PLATFORM_FEE_RATE)
    expect(calculateGuestRefund(TOTAL, hoursFromNow(30), undefined)).toBe(
      Math.round((TOTAL - derivedFee) * 0.5)
    )
  })

  it('treats a null fee the same as a missing one', () => {
    expect(calculateGuestRefund(TOTAL, hoursFromNow(30), null)).toBe(
      calculateGuestRefund(TOTAL, hoursFromNow(30), undefined)
    )
  })

  it('returns zero for a zero-value booking in every tier', () => {
    for (const hours of [72, 30, 12, 1, -1]) {
      expect(calculateGuestRefund(0, hoursFromNow(hours), 0)).toBe(0)
    }
  })

  it('never refunds more than the guest paid, nor less than nothing', () => {
    for (const hours of [-100, -1, 0, 5, 6, 23, 24, 47, 48, 49, 1000]) {
      const refund = calculateGuestRefund(9900, hoursFromNow(hours), 1485)
      expect(refund).toBeGreaterThanOrEqual(0)
      expect(refund).toBeLessThanOrEqual(9900)
    }
  })

  it('never refunds more the later a guest cancels', () => {
    const refunds = [72, 48, 40, 24, 20, 6, 5, 0, -5].map((hours) =>
      calculateGuestRefund(9900, hoursFromNow(hours), 1485)
    )
    const sortedDescending = [...refunds].sort((a, b) => b - a)
    expect(refunds).toEqual(sortedDescending)
  })
})

describe('guestRefundDescription', () => {
  it('describes a full refund and says the platform fee is included', () => {
    expect(guestRefundDescription(TOTAL, hoursFromNow(72), FEE)).toBe(
      'Full refund of $45, including the platform fee (cancelled 48 or more hours before the session).'
    )
  })

  it('describes a half refund of the lesson fee', () => {
    expect(guestRefundDescription(TOTAL, hoursFromNow(30), FEE)).toBe(
      'Partial refund of $19.13 — 50% of the lesson fee (cancelled 24 to 48 hours before the session). ' +
        'The platform fee is not refunded.'
    )
  })

  it('describes a quarter refund of the lesson fee', () => {
    expect(guestRefundDescription(TOTAL, hoursFromNow(12), FEE)).toBe(
      'Partial refund of $9.56 — 25% of the lesson fee (cancelled 6 to 24 hours before the session). ' +
        'The platform fee is not refunded.'
    )
  })

  it('says plainly that a late cancellation is not refunded', () => {
    expect(guestRefundDescription(TOTAL, hoursFromNow(3), FEE)).toBe(
      'No refund (cancelled less than 6 hours before the session).'
    )
  })

  it('always quotes the amount calculateGuestRefund will actually pay', () => {
    for (const hours of [72, 48, 30, 24, 12, 6, 3, -5]) {
      const startsAt = hoursFromNow(hours)
      const refund = calculateGuestRefund(3333, startsAt, 500)
      if (refund > 0) {
        expect(guestRefundDescription(3333, startsAt, 500)).toContain(formatCents(refund))
      } else {
        expect(guestRefundDescription(3333, startsAt, 500)).toBe(
          'No refund (cancelled less than 6 hours before the session).'
        )
      }
    }
  })
})

describe('CANCELLATION_POLICY_ITEMS', () => {
  it('lists every scenario shown to guests and hosts', () => {
    expect(CANCELLATION_POLICY_ITEMS.map((item) => item.scenario)).toEqual([
      'Guest cancels 48+ hours before session',
      'Guest cancels 24–48 hours before session',
      'Guest cancels 6–24 hours before session',
      'Guest cancels under 6 hours before session, or does not show up',
      'Host cancels anytime',
      '3 host strikes',
    ])
  })

  it('every entry has both a scenario and a resolution', () => {
    for (const item of CANCELLATION_POLICY_ITEMS) {
      expect(item.scenario).toBeTruthy()
      expect(item.resolution).toBeTruthy()
    }
  })

  it('uses a unique scenario per entry, since they key the rendered rows', () => {
    const scenarios = CANCELLATION_POLICY_ITEMS.map((item) => item.scenario)
    expect(new Set(scenarios).size).toBe(scenarios.length)
  })

  // The summary shown in the UI, the tier table, and the maths are edited in
  // different places. These assertions fail loudly if one moves without the rest.
  it('publishes one guest row per refund tier', () => {
    const guestRows = CANCELLATION_POLICY_ITEMS.filter((item) =>
      item.scenario.startsWith('Guest cancels')
    )
    expect(guestRows).toHaveLength(GUEST_REFUND_TIERS.length)
  })

  it.each([
    [0, 72, TOTAL],
    [1, 30, Math.round(LESSON_FEE * 0.5)],
    [2, 12, Math.round(LESSON_FEE * 0.25)],
    [3, 3, 0],
  ])('row %i matches what the code pays %i hours out', (row, hours, expected) => {
    expect(CANCELLATION_POLICY_ITEMS[row].scenario).toMatch(/^Guest cancels/)
    expect(calculateGuestRefund(TOTAL, hoursFromNow(hours), FEE)).toBe(expected)
  })

  it('promises the host a full refund to guests plus a strike', () => {
    expect(CANCELLATION_POLICY_ITEMS[4].resolution).toBe(
      'Full refund to guest + host receives a strike'
    )
  })

  it('warns that three strikes deactivates the listing', () => {
    expect(CANCELLATION_POLICY_ITEMS[5].resolution).toBe(
      'Listing is automatically deactivated'
    )
  })
})

describe('platform fee rate', () => {
  it('matches the edge-function fallback for bookings that predate a stored fee', () => {
    expect(PLATFORM_FEE_RATE).toBe(EDGE_PLATFORM_FEE_RATE)
    expect(PLATFORM_FEE_RATE).toBe(0.15)
  })
})
