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

/**
 * Long enough for a reviewer to read both documents and decide, short enough
 * that a copied URL is useless soon after.
 */
export const SIGNED_URL_TTL_SECONDS = 300

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

// ===========================================================================
// Stripe Identity
//
// The point of routing verification through Stripe is that TryKai never
// receives the document images: Stripe holds them and reports an outcome.
// Nothing here reads a document, and nothing should.
// ===========================================================================

/** TryKai's stated policy is NRIC or passport. An NRIC is an `id_card`. */
export const IDENTITY_ALLOWED_DOCUMENT_TYPES = ['passport', 'id_card'] as const

export function identitySessionCreateParams(options: {
  userId: string
  siteUrl: string
}): {
  type: 'document'
  options: {
    document: {
      require_matching_selfie: true
      require_live_capture: true
      allowed_types: string[]
    }
  }
  metadata: { user_id: string }
  client_reference_id: string
  return_url: string
} {
  const base = options.siteUrl.replace(/\/$/, '')
  return {
    type: 'document',
    options: {
      document: {
        // A stolen document is useless without a matching live face, which is
        // the whole reason this is stronger than an emailed photo.
        require_matching_selfie: true,
        require_live_capture: true,
        allowed_types: [...IDENTITY_ALLOWED_DOCUMENT_TYPES],
      },
    },
    metadata: { user_id: options.userId },
    client_reference_id: options.userId,
    return_url: `${base}/verify-identity?identity=return`,
  }
}

/**
 * Stripe's `last_error.reason` is safe to show a user, but these are written
 * to say what to do next, and to point at manual review where the automated
 * check cannot help.
 */
export const IDENTITY_FAILURE_REASONS: Record<string, string> = {
  consent_declined:
    'You declined the automated identity check. You can upload your documents for manual review instead.',
  under_supported_age: 'Hosts must be 18 or older, and the check could not confirm your age.',
  country_not_supported:
    'Automated checks do not cover documents from that country. You can upload your documents for manual review instead.',
  document_expired: 'That identity document has expired. Please try again with a current one.',
  document_unverified_other:
    'The identity document could not be read. Please try again with a clearer photo.',
  document_type_not_supported: 'That document type is not accepted. Please use your NRIC or passport.',
  selfie_document_missing_photo:
    'The document does not show a photo of your face, so the selfie could not be matched.',
  selfie_face_mismatch: 'The selfie did not match the photo on the document.',
  selfie_unverified_other: 'The selfie could not be verified. Please try again in good lighting.',
  selfie_manipulated: 'The selfie could not be accepted. Please retake it without filters or edits.',
  id_number_unverified_other: 'The ID number could not be verified.',
  id_number_insufficient_document_data:
    'The document did not contain enough information to check the ID number.',
  id_number_mismatch: 'The details provided did not match the ID number.',
}

export const IDENTITY_FALLBACK_REASON =
  'The automated identity check did not pass. You can try again, or upload your documents for manual review.'

export function identityFailureReason(lastError: {
  code?: unknown
  reason?: unknown
} | null | undefined): string {
  const code = typeof lastError?.code === 'string' ? lastError.code : ''
  const mapped = IDENTITY_FAILURE_REASONS[code]
  if (mapped) return mapped

  const reason = typeof lastError?.reason === 'string' ? lastError.reason.trim() : ''
  if (reason) return reason.slice(0, MAX_REJECTION_REASON_LENGTH)

  return IDENTITY_FALLBACK_REASON
}

export type IdentityOutcome =
  | { action: 'approve' }
  | { action: 'reject'; reason: string }
  | { action: 'ignore' }

/**
 * A session is created in `requires_input`, so that status alone means
 * nothing. Only a `requires_input` event carrying a `last_error` is a real
 * failure; anything else is left alone rather than guessed at.
 */
export function identityEventOutcome(
  eventType: string,
  session: { last_error?: { code?: unknown; reason?: unknown } | null } | null | undefined,
): IdentityOutcome {
  if (eventType === 'identity.verification_session.verified') {
    return { action: 'approve' }
  }

  if (eventType === 'identity.verification_session.requires_input') {
    if (!session?.last_error) return { action: 'ignore' }
    return { action: 'reject', reason: identityFailureReason(session.last_error) }
  }

  return { action: 'ignore' }
}

// ===========================================================================
// Retention
//
// DECISIONS.md: rejected documents are deleted after 30 days, long enough for
// resubmission confusion and short enough to limit exposure. Approved hosts'
// documents are kept while the account is active.
// ===========================================================================

export const REJECTED_DOCUMENT_RETENTION_DAYS = 30

export function retentionCutoffIso(now: number = Date.now()): string {
  return new Date(now - REJECTED_DOCUMENT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export interface PurgeCandidate {
  id: string
  verification_status?: unknown
  verification_reviewed_at?: string | null
  id_photo_url?: string | null
  selfie_url?: string | null
}

/** A Stripe Identity rejection has no stored documents, so there is nothing to remove. */
export function purgeCandidatePaths(candidate: PurgeCandidate): string[] {
  const paths = [candidate?.id_photo_url, candidate?.selfie_url].filter(
    (path): path is string => typeof path === 'string' && path.length > 0,
  )
  return [...new Set(paths)]
}

/**
 * Belt and braces against the query: a row is only purged when it is rejected,
 * was reviewed long enough ago, and actually has something stored. Deleting a
 * pending or approved host's documents would be unrecoverable.
 */
export function shouldPurgeDocuments(
  candidate: PurgeCandidate,
  now: number = Date.now(),
): boolean {
  if (normalizeVerificationStatus(candidate?.verification_status) !== 'rejected') return false
  if (purgeCandidatePaths(candidate).length === 0) return false

  const reviewedAt = candidate?.verification_reviewed_at
  if (!reviewedAt) return false

  const reviewedMs = new Date(reviewedAt).getTime()
  if (Number.isNaN(reviewedMs)) return false

  return reviewedMs <= new Date(retentionCutoffIso(now)).getTime()
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
