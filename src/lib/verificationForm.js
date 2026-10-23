/**
 * What the verify form still needs, in the order it appears on the page, so
 * one message names everything instead of revealing one gap per tap.
 */
import { TEACHING_PLAN_MAX, TEACHING_PLAN_MIN } from '../../supabase/functions/_shared/verification.ts'

export { TEACHING_PLAN_MAX, TEACHING_PLAN_MIN }

export function missingVerificationItems({ plan, idPhoto, selfie, consent }) {
  const missing = []
  if (String(plan ?? '').trim().length < TEACHING_PLAN_MIN) missing.push("what you'd like to teach")
  if (!idPhoto) missing.push('a photo of your ID')
  if (!selfie) missing.push('a selfie')
  if (!consent) missing.push('a tick in the agreement box')
  return missing
}

export function missingItemsMessage(missing) {
  if (missing.length === 0) return ''
  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
  return `Still needed: ${list}.`
}
