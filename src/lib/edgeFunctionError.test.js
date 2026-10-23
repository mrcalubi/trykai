import { describe, expect, it } from 'vitest'
import { edgeFunctionErrorMessage, isPayNowTooFarAheadError, functionReasonOrDefault } from './edgeFunctionError'
import {
  PAYNOW_TOO_FAR_AHEAD,
  PAYNOW_TOO_FAR_AHEAD_MESSAGE,
} from '../../supabase/functions/_shared/booking.ts'

describe('edgeFunctionErrorMessage', () => {
  it('prefers a JSON error already parsed into data', async () => {
    await expect(
      edgeFunctionErrorMessage({ message: 'Edge Function returned a non-2xx status code' }, {
        error: 'Profile not found',
      })
    ).resolves.toBe('Profile not found')
  })

  it('reads Stripe’s message from the FunctionsHttpError response body', async () => {
    const error = {
      message: 'Edge Function returned a non-2xx status code',
      context: {
        json: async () => ({
          error: 'You cannot create Account Links until your platform branding is configured.',
        }),
      },
    }
    await expect(edgeFunctionErrorMessage(error, null)).resolves.toBe(
      'You cannot create Account Links until your platform branding is configured.'
    )
  })

  it('reads a plain-text body such as Unauthorized', async () => {
    const error = {
      message: 'Edge Function returned a non-2xx status code',
      context: {
        text: async () => 'Unauthorized',
      },
    }
    await expect(edgeFunctionErrorMessage(error, null)).resolves.toBe('Unauthorized')
  })

  it('falls back to the generic invoke message', async () => {
    await expect(
      edgeFunctionErrorMessage({ message: 'Edge Function returned a non-2xx status code' }, null)
    ).resolves.toBe('Edge Function returned a non-2xx status code')
  })

  it('returns empty when there is no error', async () => {
    await expect(edgeFunctionErrorMessage(null, null)).resolves.toBe('')
  })

  it('recognises a PayNow-too-far code without treating it as a generic error', () => {
    expect(
      isPayNowTooFarAheadError(
        { error: PAYNOW_TOO_FAR_AHEAD_MESSAGE, code: PAYNOW_TOO_FAR_AHEAD },
        PAYNOW_TOO_FAR_AHEAD_MESSAGE,
      )
    ).toBe(true)
    expect(isPayNowTooFarAheadError({ error: PAYNOW_TOO_FAR_AHEAD }, '')).toBe(true)
    expect(isPayNowTooFarAheadError(null, PAYNOW_TOO_FAR_AHEAD_MESSAGE)).toBe(true)
    expect(isPayNowTooFarAheadError({ error: 'Not enough spots' }, 'Not enough spots')).toBe(false)
  })
})

describe('functionReasonOrDefault', () => {
  it("uses the function's own sentence from the body", async () => {
    expect(await functionReasonOrDefault(null, { error: 'Singpass is busy.' }, 'fallback')).toBe('Singpass is busy.')
  })

  it('falls back instead of showing a transport error', async () => {
    expect(await functionReasonOrDefault(new Error('Failed to send a request'), null, 'fallback')).toBe('fallback')
    expect(await functionReasonOrDefault(null, {}, 'fallback')).toBe('fallback')
  })
})
