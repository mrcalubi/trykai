import { describe, expect, it, vi } from 'vitest'
import {
  codeErrorMessage,
  isCodeComplete,
  isEmailNotConfirmed,
  isExistingAccount,
  normalizeCode,
  resendErrorMessage,
  resendLabel,
  verifySignupCode,
} from './emailConfirm'

describe('email confirmation helpers', () => {
  it('keeps digits only, up to 10', () => {
    expect(normalizeCode(' 12 34-56 ')).toBe('123456')
    expect(normalizeCode('12345678901234')).toBe('1234567890')
    expect(normalizeCode(null)).toBe('')
    expect(isCodeComplete('12345')).toBe(false)
    expect(isCodeComplete('123456')).toBe(true)
  })

  it('spots an unconfirmed login by code or message', () => {
    expect(isEmailNotConfirmed({ code: 'email_not_confirmed' })).toBe(true)
    expect(isEmailNotConfirmed({ message: 'Email not confirmed' })).toBe(true)
    expect(isEmailNotConfirmed({ message: 'Invalid login credentials' })).toBe(false)
    expect(isEmailNotConfirmed(null)).toBe(false)
  })

  it('treats a user with no identities as an existing account', () => {
    expect(isExistingAccount({ user: { identities: [] } })).toBe(true)
    expect(isExistingAccount({ user: { identities: [{ id: 'x' }] } })).toBe(false)
    expect(isExistingAccount({ user: {} })).toBe(false)
  })

  it('words rate limits and other failures', () => {
    expect(codeErrorMessage({ status: 429 })).toMatch(/wait a minute/)
    expect(codeErrorMessage({ code: 'over_request_rate_limit' })).toMatch(/wait a minute/)
    expect(codeErrorMessage({ message: 'Token has expired or is invalid' })).toMatch(/didn't work/)
    expect(codeErrorMessage(undefined)).toMatch(/didn't work/)
    expect(resendErrorMessage({ code: 'over_email_send_rate_limit' })).toMatch(/just sent one/)
    expect(resendErrorMessage({ message: 'boom' })).toBe('Could not send a new code. Please try again.')
    expect(resendLabel(12)).toBe('Send a new code in 12s')
    expect(resendLabel(0)).toBe('Send a new code')
  })

  it('does not retry with the signup type after a rate limit', async () => {
    const auth = { verifyOtp: vi.fn(async () => ({ data: {}, error: { status: 429 } })) }
    const result = await verifySignupCode(auth, 'a@b.co', '123456')
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1)
    expect(result.error.status).toBe(429)
  })

  it('returns the first error when both types fail', async () => {
    const auth = {
      verifyOtp: vi
        .fn()
        .mockResolvedValueOnce({ data: {}, error: { message: 'first' } })
        .mockResolvedValueOnce({ data: {}, error: { message: 'second' } }),
    }
    const result = await verifySignupCode(auth, 'a@b.co', '123456')
    expect(result.error.message).toBe('first')
  })
})
