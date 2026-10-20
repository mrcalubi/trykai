/**
 * Email confirmation at signup (DECISIONS.md, 20 October). Supabase emails a
 * code and a link together; the code lets someone finish in the same tab on a
 * phone, where the link would often open in the mail app's own browser.
 */

/** Supabase's own limit on signup emails to one address. */
export const RESEND_COOLDOWN_SECONDS = 60

/** Digits only. Supabase codes are 6 by default and can be set up to 10. */
export function normalizeCode(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 10)
}

export function isCodeComplete(code) {
  return code.length >= 6
}

export function isEmailNotConfirmed(error) {
  if (!error) return false
  return error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message ?? '')
}

/**
 * With confirmation on, signing up with an address that already has an account
 * returns a user with no identities and sends nothing, so there is no code coming.
 */
export function isExistingAccount(data) {
  const identities = data?.user?.identities
  return Array.isArray(identities) && identities.length === 0
}

function isRateLimited(error) {
  return (
    error?.status === 429 ||
    /rate_limit/.test(error?.code ?? '') ||
    /rate limit|security purposes|only request this after/i.test(error?.message ?? '')
  )
}

export function codeErrorMessage(error) {
  if (isRateLimited(error)) return 'Too many tries. Please wait a minute and try again.'
  return "That code didn't work. Check it against the latest email, or send a new one."
}

export function resendErrorMessage(error) {
  if (isRateLimited(error)) return 'We just sent one. Please wait a minute before asking again.'
  return 'Could not send a new code. Please try again.'
}

export function resendLabel(secondsLeft) {
  return secondsLeft > 0 ? `Send a new code in ${secondsLeft}s` : 'Send a new code'
}

/**
 * Confirm with the code. 'email' is the current type for an emailed code; older
 * Auth servers only accept 'signup' for a signup code, so that is the fallback.
 */
export async function verifySignupCode(auth, email, token) {
  const first = await auth.verifyOtp({ email, token, type: 'email' })
  if (!first.error || isRateLimited(first.error)) return first
  const second = await auth.verifyOtp({ email, token, type: 'signup' })
  return second.error ? first : second
}
