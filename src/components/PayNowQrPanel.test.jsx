import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/react'
import PayNowQrPanel from './PayNowQrPanel'
import { PAYNOW_QR_EXPIRED, PAYNOW_QR_SAVE_FALLBACK } from '../lib/paynowQr'

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))

const PNG = 'https://stripe.test/paynow.png'
const CLIENT_SECRET = 'cs_test_paynow'

function qrFields(overrides = {}) {
  return {
    imageUrlPng: PNG,
    imageUrlSvg: 'https://stripe.test/paynow.svg',
    hostedInstructionsUrl: 'https://stripe.test/instructions',
    expiresAt: null,
    ...overrides,
  }
}

function renderPanel(overrides = {}) {
  const props = {
    qr: qrFields(),
    paymentIntent: { created: Math.floor(Date.now() / 1000), status: 'requires_action' },
    totalAmount: 4947,
    clientSecret: CLIENT_SECRET,
    stripe: {
      retrievePaymentIntent: vi.fn(async () => ({
        error: null,
        paymentIntent: { status: 'requires_action' },
      })),
    },
    onSuccess: vi.fn(),
    onPaymentFailed: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  }
  const utils = render(<PayNowQrPanel {...props} />)
  return { ...utils, props }
}

describe('PayNowQrPanel', () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear()
  })

  it('renders the QR from next_action PNG fields', () => {
    renderPanel()
    const image = screen.getByRole('img', { name: 'PayNow QR code' })
    expect(image).toHaveAttribute('src', PNG)
    expect(image).toHaveAttribute('width', '240')
    expect(screen.getByRole('heading', { name: /Pay \$49\.47 with PayNow/ })).toBeInTheDocument()
    expect(screen.getByText(/Save or screenshot this QR/)).toBeInTheDocument()
    expect(screen.getByText(/Open your bank app and scan it from your photos/)).toBeInTheDocument()
    expect(screen.getByText(/Come back here\. We'll confirm it for you/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/QR expires in \d+:\d{2}/)
  })

  it('calls onSuccess when polling returns succeeded', async () => {
    const { props } = renderPanel({
      stripe: {
        retrievePaymentIntent: vi.fn(async () => ({
          error: null,
          paymentIntent: { status: 'succeeded' },
        })),
      },
    })

    await waitFor(() => expect(props.onSuccess).toHaveBeenCalledWith('succeeded'))
    expect(props.onPaymentFailed).not.toHaveBeenCalled()
  })

  it('calls onSuccess when polling returns processing', async () => {
    const { props } = renderPanel({
      stripe: {
        retrievePaymentIntent: vi.fn(async () => ({
          error: null,
          paymentIntent: { status: 'processing' },
        })),
      },
    })

    await waitFor(() => expect(props.onSuccess).toHaveBeenCalledWith('processing'))
  })

  it('calls onPaymentFailed when polling returns canceled', async () => {
    const { props } = renderPanel({
      stripe: {
        retrievePaymentIntent: vi.fn(async () => ({
          error: null,
          paymentIntent: { status: 'canceled' },
        })),
      },
    })

    await waitFor(() => expect(props.onPaymentFailed).toHaveBeenCalledOnce())
    expect(props.onSuccess).not.toHaveBeenCalled()
  })

  it('treats requires_payment_method after the QR as expired', async () => {
    const { props } = renderPanel({
      stripe: {
        retrievePaymentIntent: vi.fn(async () => ({
          error: null,
          paymentIntent: { status: 'requires_payment_method' },
        })),
      },
    })

    expect(await screen.findByText(PAYNOW_QR_EXPIRED)).toBeInTheDocument()
    expect(props.onSuccess).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Start again' }))
    expect(props.onDismiss).toHaveBeenCalledOnce()
  })

  it('shows the expired state from expires_at and Start again dismisses', async () => {
    const { props } = renderPanel({
      qr: qrFields({ expiresAt: Math.floor(Date.now() / 1000) - 10 }),
    })

    expect(screen.getByText(PAYNOW_QR_EXPIRED)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'PayNow QR code' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Start again' }))
    expect(props.onDismiss).toHaveBeenCalledOnce()
  })

  it('polls immediately when the tab becomes visible', async () => {
    const retrievePaymentIntent = vi.fn(async () => ({
      error: null,
      paymentIntent: { status: 'requires_action' },
    }))
    renderPanel({ stripe: { retrievePaymentIntent } })

    await waitFor(() => expect(retrievePaymentIntent).toHaveBeenCalledWith(CLIENT_SECRET))
    const afterMount = retrievePaymentIntent.mock.calls.length
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(retrievePaymentIntent.mock.calls.length).toBeGreaterThan(afterMount))
  })

  it('reports a retrieve failure to Sentry without the image URL and keeps the QR', async () => {
    renderPanel({
      stripe: {
        retrievePaymentIntent: vi.fn(async () => ({ error: { message: 'network' } })),
      },
    })

    await waitFor(() => expect(Sentry.captureException).toHaveBeenCalled())
    expect(screen.getByRole('img', { name: 'PayNow QR code' })).toBeInTheDocument()
    expect(JSON.stringify(Sentry.captureException.mock.calls[0])).not.toContain(PNG)
  })

  it('reports repeated retrieve failures to Sentry only once', async () => {
    const retrievePaymentIntent = vi.fn(async () => ({ error: { message: 'network' } }))
    renderPanel({ stripe: { retrievePaymentIntent } })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })

    await waitFor(() => expect(Sentry.captureException).toHaveBeenCalledTimes(1))
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(retrievePaymentIntent.mock.calls.length).toBeGreaterThanOrEqual(3))
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })

  it('shares the QR when the browser allows files', async () => {
    const share = vi.fn(async () => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(['png'], { type: 'image/png' }),
      })),
    )
    vi.stubGlobal('navigator', {
      ...navigator,
      canShare: () => true,
      share,
    })

    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Save QR' }))

    await waitFor(() => expect(share).toHaveBeenCalledOnce())
    expect(screen.queryByRole('link', { name: 'Open QR' })).not.toBeInTheDocument()
    expect(screen.queryByText(PAYNOW_QR_SAVE_FALLBACK)).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('falls back to a new-tab link when share is not allowed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(['png'], { type: 'image/png' }),
      })),
    )
    vi.stubGlobal('open', vi.fn(() => ({})))
    vi.stubGlobal('navigator', {
      ...navigator,
      canShare: () => false,
    })

    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Save QR' }))

    const link = await screen.findByRole('link', { name: 'Open QR' })
    expect(link).toHaveAttribute('href', PNG)
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.queryByText(PAYNOW_QR_SAVE_FALLBACK)).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('shows the long-press hint when save cannot open a tab either', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })))
    vi.stubGlobal('open', vi.fn(() => {
      throw new Error('blocked')
    }))

    renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Save QR' }))

    expect(await screen.findByText(PAYNOW_QR_SAVE_FALLBACK)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open QR' })).toHaveAttribute('href', PNG)
    vi.unstubAllGlobals()
  })

  it('Cancel uses the same dismiss path as closing Stripe’s pop-up', async () => {
    const { props } = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(props.onDismiss).toHaveBeenCalledOnce()
  })
})
