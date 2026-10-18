import { describe, expect, it } from 'vitest'
import {
  COMPLAINT_EVIDENCE_RETENTION_DAYS,
  COMPLAINT_HOLD_REASON,
  COMPLAINT_MAX_CHARS,
  COMPLAINT_MAX_PHOTO_BYTES,
  COMPLAINT_WINDOW_MS,
  canReportProblem,
  complaintDecision,
  complaintEvidenceCutoffIso,
  complaintPhotoPath,
  complaintWindow,
} from './complaints.ts'
import { validateComplaint } from './complaints.ts'
import { PAYOUT_HOLD_MS } from './payouts.ts'

const START = Date.UTC(2026, 9, 10, 10, 0)
const HOUR = 60 * 60 * 1000
const session = { starts_at: new Date(START).toISOString(), duration_mins: 90 }
const END = START + 90 * 60 * 1000

function booking(overrides = {}) {
  return { guest_id: 'guest-1', status: 'confirmed', sessions: session, ...overrides }
}

describe('complaintWindow', () => {
  it('closes 3 days after the session ends, exactly when the payout hold does', () => {
    expect(COMPLAINT_WINDOW_MS).toBe(PAYOUT_HOLD_MS)
    expect(COMPLAINT_WINDOW_MS).toBe(72 * HOUR)
    expect(complaintWindow(session)).toEqual({ opensAt: START, closesAt: END + 72 * HOUR })
  })

  it('falls back to the listing length, then two hours', () => {
    const starts_at = session.starts_at
    expect(complaintWindow({ starts_at, duration_mins: 0, listings: { duration_mins: 60 } })).toEqual({
      opensAt: START,
      closesAt: START + HOUR + 72 * HOUR,
    })
    expect(complaintWindow({ starts_at, duration_mins: null, listings: null })?.closesAt).toBe(
      START + 2 * HOUR + 72 * HOUR,
    )
  })

  it('has no window without a usable start', () => {
    expect(complaintWindow(null)).toBeNull()
    expect(complaintWindow({ starts_at: '' })).toBeNull()
    expect(complaintWindow({ starts_at: 'not a date' })).toBeNull()
  })
})

describe('canReportProblem', () => {
  it('is open from the session start until 3 days after the end', () => {
    expect(canReportProblem(booking(), START - 1)).toBe(false)
    expect(canReportProblem(booking(), START)).toBe(true)
    expect(canReportProblem(booking(), END + 72 * HOUR - 1)).toBe(true)
    expect(canReportProblem(booking(), END + 72 * HOUR)).toBe(false)
  })

  it('needs a confirmed booking with a session', () => {
    expect(canReportProblem(booking({ status: 'cancelled' }), START + HOUR)).toBe(false)
    expect(canReportProblem(booking({ sessions: null }), START + HOUR)).toBe(false)
    expect(canReportProblem(null, START + HOUR)).toBe(false)
  })

  it('defaults to now', () => {
    expect(canReportProblem(booking())).toBe(false)
  })
})

describe('complaintDecision', () => {
  const during = START + HOUR

  function decide(overrides = {}) {
    return complaintDecision({
      callerId: 'guest-1',
      booking: booking(),
      alreadyReported: false,
      nowMs: during,
      ...overrides,
    })
  }

  it('accepts the guest inside the window', () => {
    expect(decide()).toEqual({ ok: true })
  })

  it('refuses anyone but the signed-in guest', () => {
    expect(decide({ callerId: null })).toMatchObject({ ok: false, status: 401 })
    expect(decide({ callerId: 'host-1' })).toMatchObject({ ok: false, status: 403 })
  })

  it('refuses unconfirmed and already reported bookings', () => {
    expect(decide({ booking: booking({ status: 'pending' }) })).toMatchObject({ status: 409 })
    expect(decide({ alreadyReported: true })).toMatchObject({
      status: 409,
      error: "You've already reported this booking. Reply to our email to add anything.",
    })
  })

  it('refuses before the start and after the 3 days, pointing safety reports to email', () => {
    expect(decide({ nowMs: START - 1 })).toMatchObject({ status: 409, error: expect.stringMatching(/once the session has started/) })
    const late = decide({ nowMs: END + 72 * HOUR })
    expect(late).toMatchObject({ ok: false, status: 409 })
    expect(!late.ok && late.error).toBe(
      'Problems with a session have to be reported within 3 days after it ends. Safety concern? Email hello@trykai.sg at any time. Safety reports have no time limit.',
    )
    expect(decide({ booking: booking({ sessions: null }) })).toMatchObject({ status: 409 })
  })

  it('defaults to now', () => {
    expect(
      complaintDecision({ callerId: 'guest-1', booking: booking(), alreadyReported: false }),
    ).toMatchObject({ ok: false, status: 409 })
  })
})

describe('validateComplaint', () => {
  const text = 'The host arrived forty minutes late.'

  it('trims and accepts a description with valid photos', () => {
    expect(
      validateComplaint({
        description: `  ${text}  `,
        photos: [{ type: 'image/jpeg', size: 1000 }, { type: 'image/webp', size: 10 }],
      }),
    ).toEqual({ ok: true, description: text })
  })

  it('needs 20 to 2000 characters', () => {
    expect(validateComplaint({ description: 'too short', photos: [] })).toMatchObject({ status: 400 })
    expect(validateComplaint({ description: 42, photos: [] })).toMatchObject({ status: 400 })
    expect(
      validateComplaint({ description: 'x'.repeat(COMPLAINT_MAX_CHARS + 1), photos: [] }),
    ).toMatchObject({ status: 400, error: 'Please keep it under 2000 characters.' })
  })

  it('takes up to 3 small JPEG, PNG, or WebP photos', () => {
    const png = { type: 'image/png', size: 10 }
    expect(validateComplaint({ description: text, photos: [png, png, png, png] })).toMatchObject({
      error: 'Add up to 3 photos.',
    })
    expect(
      validateComplaint({ description: text, photos: [{ type: 'image/gif', size: 10 }] }),
    ).toMatchObject({ error: 'Photos must be JPEG, PNG, or WebP.' })
    expect(
      validateComplaint({
        description: text,
        photos: [{ type: 'image/png', size: COMPLAINT_MAX_PHOTO_BYTES + 1 }],
      }),
    ).toMatchObject({ error: 'Each photo must be 5 MB or smaller.' })
  })
})

describe('evidence storage', () => {
  it('stores photos under the booking and complaint', () => {
    expect(complaintPhotoPath('b-1', 'c-1', 0, 'image/png')).toBe('b-1/c-1/1.png')
    expect(complaintPhotoPath('b-1', 'c-1', 2, 'image/heic')).toBe('b-1/c-1/3.bin')
  })

  it('keeps photos for 180 days', () => {
    const now = Date.UTC(2026, 9, 19)
    expect(COMPLAINT_EVIDENCE_RETENTION_DAYS).toBe(180)
    expect(complaintEvidenceCutoffIso(now)).toBe(new Date(now - 180 * 24 * HOUR).toISOString())
    expect(typeof complaintEvidenceCutoffIso()).toBe('string')
  })

  it('uses a neutral hold reason the guest and host can safely read', () => {
    expect(COMPLAINT_HOLD_REASON).toBe('dispute')
  })
})
