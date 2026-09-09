import { describe, expect, it } from 'vitest'
import {
  canHost,
  canSubmitVerification,
  isVerificationMethod,
  isVerificationStatus,
  MAX_REJECTION_REASON_LENGTH,
  normalizeVerificationStatus,
  prepareVerificationReview,
  SIGNED_URL_TTL_SECONDS,
  verificationDocumentPaths,
  VERIFICATION_STATUSES,
} from './verification.ts'

describe('SIGNED_URL_TTL_SECONDS', () => {
  it('is long enough to review two documents and short enough to expire', () => {
    expect(SIGNED_URL_TTL_SECONDS).toBeGreaterThanOrEqual(60)
    expect(SIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(900)
  })
})

describe('isVerificationStatus', () => {
  it('accepts only the four statuses the column allows', () => {
    for (const status of VERIFICATION_STATUSES) {
      expect(isVerificationStatus(status)).toBe(true)
    }
    for (const value of ['approve', 'PENDING', '', null, undefined, 1, {}]) {
      expect(isVerificationStatus(value)).toBe(false)
    }
  })
})

describe('isVerificationMethod', () => {
  it('accepts manual and stripe_identity only', () => {
    expect(isVerificationMethod('manual')).toBe(true)
    expect(isVerificationMethod('stripe_identity')).toBe(true)
    expect(isVerificationMethod('veriff')).toBe(false)
    expect(isVerificationMethod(null)).toBe(false)
  })
})

describe('normalizeVerificationStatus', () => {
  it('treats a missing or unknown status as unverified', () => {
    expect(normalizeVerificationStatus(null)).toBe('unverified')
    expect(normalizeVerificationStatus(undefined)).toBe('unverified')
    expect(normalizeVerificationStatus('nonsense')).toBe('unverified')
    expect(normalizeVerificationStatus('approved')).toBe('approved')
  })
})

describe('canSubmitVerification', () => {
  it('allows a first submission and a resubmission after rejection', () => {
    expect(canSubmitVerification('unverified')).toBe(true)
    expect(canSubmitVerification('rejected')).toBe(true)
    expect(canSubmitVerification(null)).toBe(true)
  })

  it('refuses while a review is open or already approved', () => {
    expect(canSubmitVerification('pending')).toBe(false)
    expect(canSubmitVerification('approved')).toBe(false)
  })
})

describe('canHost', () => {
  it('requires an approved and unsuspended account', () => {
    expect(canHost({ verification_status: 'approved', is_suspended: false })).toBe(true)
    expect(canHost({ verification_status: 'approved' })).toBe(true)
  })

  it('refuses anyone unapproved or suspended', () => {
    expect(canHost({ verification_status: 'approved', is_suspended: true })).toBe(false)
    expect(canHost({ verification_status: 'pending', is_suspended: false })).toBe(false)
    expect(canHost({ verification_status: 'rejected' })).toBe(false)
    expect(canHost({})).toBe(false)
  })
})

describe('prepareVerificationReview', () => {
  it('maps approve to the approved status with no reason', () => {
    expect(prepareVerificationReview({ decision: 'approve' })).toEqual({
      ok: true,
      decision: 'approved',
      reason: null,
      method: 'manual',
    })
  })

  it('maps reject to the rejected status and keeps the trimmed reason', () => {
    expect(
      prepareVerificationReview({ decision: 'reject', reason: '  ID photo is unreadable  ' }),
    ).toEqual({
      ok: true,
      decision: 'rejected',
      reason: 'ID photo is unreadable',
      method: 'manual',
    })
  })

  it('carries the method through for automated decisions', () => {
    expect(
      prepareVerificationReview({ decision: 'approve', method: 'stripe_identity' }),
    ).toMatchObject({ ok: true, decision: 'approved', method: 'stripe_identity' })
  })

  it('requires a reason when rejecting', () => {
    expect(prepareVerificationReview({ decision: 'reject' })).toEqual({
      ok: false,
      status: 400,
      message: 'A rejection reason is required',
    })
    expect(prepareVerificationReview({ decision: 'reject', reason: '   ' })).toMatchObject({
      ok: false,
      status: 400,
    })
  })

  it('bounds the rejection reason, since it is emailed to the host', () => {
    const reason = 'x'.repeat(MAX_REJECTION_REASON_LENGTH + 1)
    expect(prepareVerificationReview({ decision: 'reject', reason })).toMatchObject({
      ok: false,
      status: 400,
    })
    expect(
      prepareVerificationReview({ decision: 'reject', reason: 'x'.repeat(MAX_REJECTION_REASON_LENGTH) }).ok,
    ).toBe(true)
  })

  it('rejects an unrecognised decision or method', () => {
    expect(prepareVerificationReview({ decision: 'approved' })).toMatchObject({ status: 400 })
    expect(prepareVerificationReview({})).toMatchObject({ status: 400 })
    expect(prepareVerificationReview({ decision: 'approve', method: 'veriff' })).toEqual({
      ok: false,
      status: 400,
      message: 'Invalid verification method',
    })
  })
})

describe('verificationDocumentPaths', () => {
  it('scopes both documents to the user folder the storage policy checks', () => {
    expect(verificationDocumentPaths('host-9')).toEqual({
      idPhoto: 'host-9/id-photo.jpg',
      selfie: 'host-9/selfie.jpg',
    })
  })
})
