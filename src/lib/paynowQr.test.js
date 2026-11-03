import { describe, expect, it, vi } from 'vitest'
import {
  CONFIRM_PAYNOW_PAYMENT_DATA,
  CONFIRM_PAYNOW_PAYMENT_OPTIONS,
  PAYNOW_QR_LIFETIME_SECONDS,
  formatPaynowCountdown,
  paynowDisplayQr,
  paynowPollOutcome,
  paynowQrDeadlineMs,
  saveFailureReason,
  savePaynowQr,
} from './paynowQr'

const PNG = 'https://stripe.test/paynow.png'

function qrIntent(overrides = {}) {
  return {
    status: 'requires_action',
    created: 1_700_000_000,
    next_action: {
      paynow_display_qr_code: {
        image_url_png: PNG,
        image_url_svg: 'https://stripe.test/paynow.svg',
        hosted_instructions_url: 'https://stripe.test/instructions',
      },
    },
    ...overrides,
  }
}

describe('paynowQr helpers', () => {
  it('confirms PayNow without a PaymentMethod and without Stripe handling the QR', () => {
    expect(CONFIRM_PAYNOW_PAYMENT_DATA).toEqual({
      payment_method: { billing_details: {} },
    })
    expect(CONFIRM_PAYNOW_PAYMENT_OPTIONS).toEqual({ handleActions: false })
  })

  it('reads the PNG QR from next_action.paynow_display_qr_code', () => {
    expect(paynowDisplayQr(qrIntent())).toEqual({
      imageUrlPng: PNG,
      imageUrlSvg: 'https://stripe.test/paynow.svg',
      hostedInstructionsUrl: 'https://stripe.test/instructions',
      expiresAt: null,
    })
  })

  it('returns null when the PayNow QR PNG is missing', () => {
    expect(paynowDisplayQr({ next_action: { paynow_display_qr_code: {} } })).toBeNull()
    expect(paynowDisplayQr(null)).toBeNull()
  })

  it('honours expires_at when Stripe sends it, otherwise created plus one hour', () => {
    const created = 1_700_000_000
    expect(paynowQrDeadlineMs({}, { created })).toBe((created + PAYNOW_QR_LIFETIME_SECONDS) * 1000)
    expect(paynowQrDeadlineMs({ expiresAt: created + 90 }, {})).toBe((created + 90) * 1000)
    expect(paynowQrDeadlineMs({ expires_at: created + 120 }, {})).toBe((created + 120) * 1000)
    expect(paynowQrDeadlineMs({ expiresAt: (created + 90) * 1000 }, {})).toBe((created + 90) * 1000)
    expect(paynowQrDeadlineMs({ expiresAt: '2024-01-01T00:00:00.000Z' }, {})).toBe(
      Date.parse('2024-01-01T00:00:00.000Z'),
    )
    const now = 1_800_000_000_000
    expect(paynowQrDeadlineMs({}, {}, now)).toBe(now + PAYNOW_QR_LIFETIME_SECONDS * 1000)
  })

  it('formats the remaining time as m:ss', () => {
    expect(formatPaynowCountdown(125_000)).toBe('2:05')
    expect(formatPaynowCountdown(0)).toBe('0:00')
    expect(formatPaynowCountdown(-1000)).toBe('0:00')
  })

  it('maps PaymentIntent status after the QR was shown', () => {
    expect(paynowPollOutcome('succeeded')).toBe('success')
    expect(paynowPollOutcome('processing')).toBe('success')
    expect(paynowPollOutcome('canceled')).toBe('failed')
    expect(paynowPollOutcome('requires_payment_method', { qrShown: true })).toBe('expired')
    expect(paynowPollOutcome('requires_payment_method')).toBe('wait')
    expect(paynowPollOutcome('requires_action', { qrShown: true })).toBe('wait')
  })

  it('strips URLs from save-failure reasons sent to Sentry', () => {
    expect(saveFailureReason(new Error(`Failed to fetch ${PNG}`), 'x')).toBe('Failed to fetch [url]')
    expect(saveFailureReason({ name: 'TypeError', message: 'Failed to fetch' })).toBe('Failed to fetch')
  })
})

describe('savePaynowQr', () => {
  it('shares a fetched PNG when the browser allows files', async () => {
    const share = vi.fn(async () => {})
    const open = vi.fn()
    const captureException = vi.fn()
    const result = await savePaynowQr(PNG, {
      fetchImpl: vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(['png'], { type: 'image/png' }),
      })),
      nav: {
        canShare: (payload) => payload.files?.length === 1,
        share,
      },
      open,
      captureException,
    })

    expect(result).toBe('shared')
    expect(share).toHaveBeenCalledOnce()
    expect(open).not.toHaveBeenCalled()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('treats a dismissed share sheet as cancelled', async () => {
    const abort = Object.assign(new Error('Share canceled'), { name: 'AbortError' })
    const result = await savePaynowQr(PNG, {
      fetchImpl: vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(['png'], { type: 'image/png' }),
      })),
      nav: {
        canShare: () => true,
        share: vi.fn(async () => {
          throw abort
        }),
      },
      open: vi.fn(),
      captureException: vi.fn(),
    })

    expect(result).toBe('cancelled')
  })

  it('opens the PNG in a new tab when share is not available', async () => {
    const open = vi.fn(() => ({}))
    const captureException = vi.fn()
    const result = await savePaynowQr(PNG, {
      fetchImpl: vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(['png'], { type: 'image/png' }),
      })),
      nav: { canShare: () => false },
      open,
      captureException,
    })

    expect(result).toBe('opened')
    expect(open).toHaveBeenCalledWith(PNG)
    expect(captureException).not.toHaveBeenCalled()
  })

  it('falls back to a new tab after a CORS fetch failure and reports the reason, not the URL', async () => {
    const open = vi.fn(() => ({}))
    const captureException = vi.fn()
    const result = await savePaynowQr(PNG, {
      fetchImpl: vi.fn(async () => {
        throw new Error(`Failed to fetch ${PNG}`)
      }),
      nav: {},
      open,
      captureException,
    })

    expect(result).toBe('opened')
    expect(open).toHaveBeenCalledWith(PNG)
    expect(captureException).toHaveBeenCalledOnce()
    const extra = captureException.mock.calls[0][1].extra
    expect(extra.reason).not.toContain('http')
    expect(JSON.stringify(captureException.mock.calls[0])).not.toContain(PNG)
  })

  it('shows a failure when fetch and open both fail', async () => {
    const captureException = vi.fn()
    const result = await savePaynowQr(PNG, {
      fetchImpl: vi.fn(async () => ({ ok: false, status: 500 })),
      nav: {},
      open: () => {
        throw new Error('blocked')
      },
      captureException,
    })

    expect(result).toBe('failed')
    expect(captureException).toHaveBeenCalled()
  })

  it('treats a blocked popup as a failed save', async () => {
    const result = await savePaynowQr(PNG, {
      fetchImpl: undefined,
      nav: {},
      open: () => null,
      captureException: vi.fn(),
    })
    expect(result).toBe('failed')
  })

  it('opens the PNG when canShare throws', async () => {
    const open = vi.fn(() => ({}))
    const result = await savePaynowQr(PNG, {
      fetchImpl: vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(['png'], { type: 'image/png' }),
      })),
      nav: {
        canShare: () => {
          throw new Error('no files')
        },
        share: vi.fn(),
      },
      open,
    })
    expect(result).toBe('opened')
    expect(open).toHaveBeenCalledWith(PNG)
  })
})
