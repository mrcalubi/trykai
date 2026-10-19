import { PAYOUT_HOLD_MS } from './payouts.ts'

// In-app quality complaints (report-booking-problem). Shared with the booking
// page so the button and the server agree on the window.

/** Dispute Policy: within 3 days after the session ends, the same as the payout hold. */
export const COMPLAINT_WINDOW_MS = PAYOUT_HOLD_MS
export const COMPLAINT_MIN_CHARS = 20
export const COMPLAINT_MAX_CHARS = 2000
export const COMPLAINT_MAX_PHOTOS = 3
export const COMPLAINT_MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const COMPLAINT_PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
/** Photos are deleted this long after the complaint; the text stays. */
export const COMPLAINT_EVIDENCE_RETENTION_DAYS = 180
/** Same fallback the review screen uses when no length was stored. */
const FALLBACK_SESSION_MINS = 120

export const SAFETY_REPORT_COPY =
  'Safety concern? Email hello@trykai.sg at any time. Safety reports have no time limit.'

export interface ComplaintSession {
  starts_at?: string | null
  duration_mins?: number | null
  listings?: { duration_mins?: number | null } | null
}

function sessionMinutes(session: ComplaintSession): number {
  for (const value of [session.duration_mins, session.listings?.duration_mins]) {
    const mins = Number(value)
    if (Number.isFinite(mins) && mins > 0) return mins
  }
  return FALLBACK_SESSION_MINS
}

/**
 * Opens when the session starts (a host no-show is reportable at once) and
 * closes 3 days after it ends.
 */
export function complaintWindow(
  session: ComplaintSession | null | undefined,
): { opensAt: number; closesAt: number } | null {
  if (!session?.starts_at) return null
  const start = new Date(session.starts_at).getTime()
  if (Number.isNaN(start)) return null
  const end = start + sessionMinutes(session) * 60 * 1000
  return { opensAt: start, closesAt: end + COMPLAINT_WINDOW_MS }
}

export function canReportProblem(
  booking: { status?: string | null; sessions?: ComplaintSession | null } | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (booking?.status !== 'confirmed') return false
  const window = complaintWindow(booking.sessions)
  if (!window) return false
  return nowMs >= window.opensAt && nowMs < window.closesAt
}

export type ComplaintRefusal = { ok: false; status: number; error: string }

export function complaintDecision(input: {
  callerId: string | null | undefined
  booking: { guest_id: string | null; status: string; sessions?: ComplaintSession | null }
  alreadyReported: boolean
  nowMs?: number
}): { ok: true } | ComplaintRefusal {
  const { callerId, booking, alreadyReported, nowMs = Date.now() } = input
  if (!callerId) return { ok: false, status: 401, error: 'Please sign in to report a problem.' }
  if (booking.guest_id !== callerId) {
    return { ok: false, status: 403, error: 'Only the guest on this booking can report a problem.' }
  }
  if (booking.status !== 'confirmed') {
    return { ok: false, status: 409, error: 'Only a confirmed booking can be reported.' }
  }
  if (alreadyReported) {
    return {
      ok: false,
      status: 409,
      error: "You've already reported this booking. Reply to our email to add anything.",
    }
  }
  const window = complaintWindow(booking.sessions)
  if (!window) return { ok: false, status: 409, error: 'This session has no date yet.' }
  if (nowMs < window.opensAt) {
    return {
      ok: false,
      status: 409,
      error: 'You can report a problem once the session has started. To cancel, use Cancel booking.',
    }
  }
  if (nowMs >= window.closesAt) {
    return {
      ok: false,
      status: 409,
      error: `Problems with a session have to be reported within 3 days after it ends. ${SAFETY_REPORT_COPY}`,
    }
  }
  return { ok: true }
}

export function validateComplaint(input: {
  description: unknown
  photos: { type: string; size: number }[]
}): { ok: true; description: string } | ComplaintRefusal {
  const description = typeof input.description === 'string' ? input.description.trim() : ''
  if (description.length < COMPLAINT_MIN_CHARS) {
    return {
      ok: false,
      status: 400,
      error: `Please tell us what happened in at least ${COMPLAINT_MIN_CHARS} characters.`,
    }
  }
  if (description.length > COMPLAINT_MAX_CHARS) {
    return {
      ok: false,
      status: 400,
      error: `Please keep it under ${COMPLAINT_MAX_CHARS} characters.`,
    }
  }
  if (input.photos.length > COMPLAINT_MAX_PHOTOS) {
    return { ok: false, status: 400, error: `Add up to ${COMPLAINT_MAX_PHOTOS} photos.` }
  }
  for (const photo of input.photos) {
    if (!COMPLAINT_PHOTO_TYPES[photo.type]) {
      return { ok: false, status: 400, error: 'Photos must be JPEG, PNG, or WebP.' }
    }
    if (photo.size > COMPLAINT_MAX_PHOTO_BYTES) {
      return { ok: false, status: 400, error: 'Each photo must be 5 MB or smaller.' }
    }
  }
  return { ok: true, description }
}

export function complaintPhotoPath(
  bookingId: string,
  complaintId: string,
  index: number,
  type: string,
): string {
  return `${bookingId}/${complaintId}/${index + 1}.${COMPLAINT_PHOTO_TYPES[type] ?? 'bin'}`
}

export function complaintEvidenceCutoffIso(now: number = Date.now()): string {
  return new Date(now - COMPLAINT_EVIDENCE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/** Neutral on purpose: the guest and host can both read payout_hold_reason. */
export const COMPLAINT_HOLD_REASON = 'dispute'
