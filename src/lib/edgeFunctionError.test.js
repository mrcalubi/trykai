import { describe, expect, it } from 'vitest'
import { edgeFunctionErrorMessage } from './edgeFunctionError'

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
})
