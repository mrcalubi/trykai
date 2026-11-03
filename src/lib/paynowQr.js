/**
 * PayNow QR checkout. Stripe.js docs:
 * https://docs.stripe.com/js/payment_intents/confirm_paynow_payment
 *
 * `next_action.paynow_display_qr_code` fields from the PaymentIntent object:
 * `data`, `hosted_instructions_url`, `image_url_png`, `image_url_svg`.
 * There is no `expires_at` on that object. Stripe says the QR is valid for
 * 1 hour (https://docs.stripe.com/payments/paynow). We still read `expires_at`
 * if Stripe starts sending it.
 */

export const PAYNOW_QR_MISSING = "We couldn't load the PayNow QR. Try again or pay by card."
export const PAYNOW_QR_EXPIRED = 'This QR has expired.'
export const PAYNOW_QR_SAVE_FALLBACK = 'Long-press the QR to save it.'
export const PAYNOW_PHONE_HINT =
  'Paying on this phone? Save the QR, then scan it from your photos in your bank app.'
export const PAYNOW_QR_STEPS = [
  'Save or screenshot this QR.',
  'Open your bank app and scan it from your photos.',
  "Come back here. We'll confirm it for you.",
]
export const PAYNOW_QR_POLL_MS = 3000
export const PAYNOW_QR_LIFETIME_SECONDS = 3600

/**
 * ConfirmPayNowPaymentData when the PaymentIntent has
 * payment_method_types: ['paynow'] and no PaymentMethod attached.
 * Type is implied; pass billing_details (empty is allowed).
 */
export const CONFIRM_PAYNOW_PAYMENT_DATA = {
  payment_method: {
    billing_details: {},
  },
}

export const CONFIRM_PAYNOW_PAYMENT_OPTIONS = { handleActions: false }

export function paynowDisplayQr(paymentIntent) {
  const qr = paymentIntent?.next_action?.paynow_display_qr_code
  if (!qr?.image_url_png) return null
  return {
    imageUrlPng: qr.image_url_png,
    imageUrlSvg: qr.image_url_svg || '',
    hostedInstructionsUrl: qr.hosted_instructions_url || '',
    expiresAt: qr.expires_at ?? null,
  }
}

function unixToMs(value) {
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return value > 1e12 ? value : value * 1000
}

export function paynowQrDeadlineMs(qr, paymentIntent, now = Date.now()) {
  const fromQr = unixToMs(qr?.expiresAt) ?? unixToMs(qr?.expires_at)
  if (fromQr) return fromQr
  if (typeof paymentIntent?.created === 'number') {
    return (paymentIntent.created + PAYNOW_QR_LIFETIME_SECONDS) * 1000
  }
  return now + PAYNOW_QR_LIFETIME_SECONDS * 1000
}

export function formatPaynowCountdown(remainingMs) {
  const total = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function paynowPollOutcome(status, { qrShown } = {}) {
  if (status === 'succeeded' || status === 'processing') return 'success'
  if (status === 'canceled') return 'failed'
  if (qrShown && status === 'requires_payment_method') return 'expired'
  return 'wait'
}

export function saveFailureReason(error, fallback = 'save_failed') {
  const raw = error?.name === 'AbortError' ? error.name : error?.message || error?.name || fallback
  return String(raw).replace(/https?:\/\/\S+/gi, '[url]')
}

function reportSaveFailure(captureException, error, reason) {
  const safeReason = saveFailureReason(error, reason)
  const err = error instanceof Error ? error : new Error(safeReason)
  captureException?.(err, {
    tags: { area: 'paynow-qr-save' },
    extra: { reason: safeReason },
  })
}

/**
 * Try the iPhone share sheet (Save Image), then open the PNG in a new tab.
 * Never throws. Does not send the image URL to Sentry.
 */
export async function savePaynowQr(
  imageUrl,
  {
    fetchImpl = globalThis.fetch,
    nav = globalThis.navigator,
    open = (url) => globalThis.open(url, '_blank', 'noopener,noreferrer'),
    captureException,
  } = {},
) {
  if (typeof fetchImpl === 'function') {
    try {
      const response = await fetchImpl(imageUrl)
      if (!response?.ok) throw new Error(`fetch_${response?.status || 'failed'}`)
      const blob = await response.blob()
      const file = new File([blob], 'paynow-qr.png', { type: blob.type || 'image/png' })
      const payload = { files: [file], title: 'PayNow QR code' }
      let canShare = false
      try {
        canShare = typeof nav?.canShare === 'function' && nav.canShare(payload)
      } catch {
        canShare = false
      }
      if (canShare && typeof nav.share === 'function') {
        await nav.share(payload)
        return 'shared'
      }
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled'
      reportSaveFailure(captureException, error, 'share_or_fetch_failed')
    }
  } else {
    reportSaveFailure(captureException, new Error('fetch_unavailable'), 'fetch_unavailable')
  }

  try {
    const opened = open(imageUrl)
    if (opened === null) {
      reportSaveFailure(captureException, new Error('popup_blocked'), 'popup_blocked')
      return 'failed'
    }
    return 'opened'
  } catch (error) {
    reportSaveFailure(captureException, error, 'open_failed')
    return 'failed'
  }
}
