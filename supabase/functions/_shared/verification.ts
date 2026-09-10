/**
 * Host verification rules, kept free of Deno, Stripe and Supabase imports so
 * they can be exercised directly by the test suite. Anything that decides
 * whether someone may host, or what a reviewer is allowed to record, belongs
 * here rather than inline in a request handler.
 */

export const VERIFICATION_STATUSES = ['unverified', 'pending', 'approved', 'rejected'] as const
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]

export const VERIFICATION_METHODS = ['manual', 'stripe_identity'] as const
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number]

/** Free text reaches the host by email, so it is bounded. */
export const MAX_REJECTION_REASON_LENGTH = 500

export function isVerificationStatus(value: unknown): value is VerificationStatus {
  return VERIFICATION_STATUSES.includes(value as VerificationStatus)
}

export function isVerificationMethod(value: unknown): value is VerificationMethod {
  return VERIFICATION_METHODS.includes(value as VerificationMethod)
}

/** A missing status is treated as unverified, matching the column default. */
export function normalizeVerificationStatus(value: unknown): VerificationStatus {
  return isVerificationStatus(value) ? value : 'unverified'
}

/** Resubmission is allowed after a rejection, but not while a review is open. */
export function canSubmitVerification(status: unknown): boolean {
  const current = normalizeVerificationStatus(status)
  return current === 'unverified' || current === 'rejected'
}

/** The single question the listing and session gates ask. */
export function canHost(user: {
  verification_status?: unknown
  is_suspended?: boolean | null
}): boolean {
  return normalizeVerificationStatus(user?.verification_status) === 'approved' &&
    !user?.is_suspended
}

export type ReviewRejection = {
  ok: false
  status: number
  message: string
}

export type ReviewAcceptance = {
  ok: true
  decision: 'approved' | 'rejected'
  reason: string | null
  method: VerificationMethod
}

/**
 * The review UI sends `approve` or `reject`; the database function takes the
 * resulting status. Rejections must carry a reason because it is what the host
 * receives, and "rejected with no explanation" is not a resubmittable state.
 */
export function prepareVerificationReview(input: {
  decision?: unknown
  reason?: unknown
  method?: unknown
}): ReviewAcceptance | ReviewRejection {
  const method = input?.method ?? 'manual'
  if (!isVerificationMethod(method)) {
    return { ok: false, status: 400, message: 'Invalid verification method' }
  }

  if (input?.decision !== 'approve' && input?.decision !== 'reject') {
    return { ok: false, status: 400, message: 'Decision must be approve or reject' }
  }

  if (input.decision === 'approve') {
    return { ok: true, decision: 'approved', reason: null, method }
  }

  const reason = typeof input?.reason === 'string' ? input.reason.trim() : ''
  if (!reason) {
    return { ok: false, status: 400, message: 'A rejection reason is required' }
  }
  if (reason.length > MAX_REJECTION_REASON_LENGTH) {
    return {
      ok: false,
      status: 400,
      message: `Rejection reason must be ${MAX_REJECTION_REASON_LENGTH} characters or fewer`,
    }
  }

  return { ok: true, decision: 'rejected', reason, method }
}

/** Storage paths are derived server-side; never trust a client-supplied path. */
export function verificationDocumentPaths(userId: string): {
  idPhoto: string
  selfie: string
} {
  return {
    idPhoto: `${userId}/id-photo.jpg`,
    selfie: `${userId}/selfie.jpg`,
  }
}
