import { describe, expect, it } from 'vitest'
import {
  canHost,
  canSubmitVerification,
  IDENTITY_FALLBACK_REASON,
  IDENTITY_FAILURE_REASONS,
  identityEventOutcome,
  identityFailureReason,
  identitySessionCreateParams,
  isVerificationMethod,
  isVerificationStatus,
  MAX_REJECTION_REASON_LENGTH,
  normalizeVerificationStatus,
  prepareVerificationReview,
  purgeCandidatePaths,
  REJECTED_DOCUMENT_RETENTION_DAYS,
  retentionCutoffIso,
  shouldPurgeDocuments,
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

describe('identitySessionCreateParams', () => {
  it('requires a live selfie matched against an NRIC or passport', () => {
    expect(
      identitySessionCreateParams({ userId: 'host-9', siteUrl: 'https://trykai.sg' }),
    ).toEqual({
      type: 'document',
      options: {
        document: {
          require_matching_selfie: true,
          require_live_capture: true,
          allowed_types: ['passport', 'id_card'],
        },
      },
      metadata: { user_id: 'host-9' },
      client_reference_id: 'host-9',
      return_url: 'https://trykai.sg/verify-identity?identity=return',
    })
  })

  it('does not double the slash when SITE_URL has a trailing one', () => {
    const params = identitySessionCreateParams({
      userId: 'host-9',
      siteUrl: 'https://staging.trykai.sg/',
    })
    expect(params.return_url).toBe('https://staging.trykai.sg/verify-identity?identity=return')
  })
})

describe('identityFailureReason', () => {
  it('prefers copy that says what to do next', () => {
    expect(identityFailureReason({ code: 'selfie_face_mismatch', reason: 'Selfie mismatch' })).toBe(
      IDENTITY_FAILURE_REASONS.selfie_face_mismatch,
    )
  })

  it('points a host who declined the biometric check at manual review', () => {
    expect(identityFailureReason({ code: 'consent_declined' })).toContain('manual review')
  })

  it('falls back to Stripe’s own reason for an unmapped code', () => {
    expect(identityFailureReason({ code: 'something_new', reason: 'Stripe said no' })).toBe(
      'Stripe said no',
    )
  })

  it('bounds Stripe’s reason to what the email column accepts', () => {
    const reason = identityFailureReason({ code: 'x', reason: 'y'.repeat(900) })
    expect(reason.length).toBe(MAX_REJECTION_REASON_LENGTH)
  })

  it('has something to say when Stripe sends neither', () => {
    expect(identityFailureReason(null)).toBe(IDENTITY_FALLBACK_REASON)
    expect(identityFailureReason({})).toBe(IDENTITY_FALLBACK_REASON)
  })
})

describe('identityEventOutcome', () => {
  it('approves on a verified session', () => {
    expect(identityEventOutcome('identity.verification_session.verified', {})).toEqual({
      action: 'approve',
    })
  })

  it('rejects a failed check with a reason the host can act on', () => {
    expect(
      identityEventOutcome('identity.verification_session.requires_input', {
        last_error: { code: 'document_expired' },
      }),
    ).toEqual({ action: 'reject', reason: IDENTITY_FAILURE_REASONS.document_expired })
  })

  it('ignores requires_input with no error, since that is a fresh session', () => {
    expect(
      identityEventOutcome('identity.verification_session.requires_input', { last_error: null }),
    ).toEqual({ action: 'ignore' })
    expect(identityEventOutcome('identity.verification_session.requires_input', {})).toEqual({
      action: 'ignore',
    })
  })

  it('ignores every other event', () => {
    expect(identityEventOutcome('identity.verification_session.created', {})).toEqual({
      action: 'ignore',
    })
    expect(identityEventOutcome('payment_intent.succeeded', null)).toEqual({ action: 'ignore' })
  })
})

describe('document retention', () => {
  const now = Date.parse('2026-09-30T00:00:00.000Z')
  const longAgo = '2026-08-01T00:00:00.000Z'
  const recently = '2026-09-25T00:00:00.000Z'

  function rejected(overrides = {}) {
    return {
      id: 'host-9',
      verification_status: 'rejected',
      verification_reviewed_at: longAgo,
      id_photo_url: 'host-9/id-photo.jpg',
      selfie_url: 'host-9/selfie.jpg',
      ...overrides,
    }
  }

  it('cuts off 30 days back', () => {
    expect(retentionCutoffIso(now)).toBe('2026-08-31T00:00:00.000Z')
    expect(REJECTED_DOCUMENT_RETENTION_DAYS).toBe(30)
  })

  it('purges a rejected host whose documents are past the window', () => {
    expect(shouldPurgeDocuments(rejected(), now)).toBe(true)
  })

  it('purges on the cutoff instant, not a millisecond early', () => {
    expect(
      shouldPurgeDocuments(rejected({ verification_reviewed_at: '2026-08-31T00:00:00.000Z' }), now),
    ).toBe(true)
    expect(
      shouldPurgeDocuments(rejected({ verification_reviewed_at: '2026-08-31T00:00:00.001Z' }), now),
    ).toBe(false)
  })

  it('keeps documents inside the window, so a resubmission still makes sense', () => {
    expect(shouldPurgeDocuments(rejected({ verification_reviewed_at: recently }), now)).toBe(false)
  })

  it('never touches a host who is not rejected', () => {
    for (const status of ['approved', 'pending', 'unverified']) {
      expect(shouldPurgeDocuments(rejected({ verification_status: status }), now)).toBe(false)
    }
  })

  it('skips a rejection with nothing stored, such as a Stripe Identity failure', () => {
    expect(
      shouldPurgeDocuments(rejected({ id_photo_url: null, selfie_url: null }), now),
    ).toBe(false)
  })

  it('skips a row with a missing or unparseable review date', () => {
    expect(shouldPurgeDocuments(rejected({ verification_reviewed_at: null }), now)).toBe(false)
    expect(shouldPurgeDocuments(rejected({ verification_reviewed_at: 'not a date' }), now)).toBe(
      false,
    )
  })

  it('collects the stored paths, dropping blanks and duplicates', () => {
    expect(purgeCandidatePaths(rejected())).toEqual(['host-9/id-photo.jpg', 'host-9/selfie.jpg'])
    expect(purgeCandidatePaths(rejected({ selfie_url: null }))).toEqual(['host-9/id-photo.jpg'])
    expect(purgeCandidatePaths(rejected({ selfie_url: 'host-9/id-photo.jpg' }))).toEqual([
      'host-9/id-photo.jpg',
    ])
    expect(purgeCandidatePaths(rejected({ id_photo_url: '', selfie_url: null }))).toEqual([])
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
