import { useEffect, useRef, useState } from 'react'
import * as Sentry from '@sentry/react'
import FormattedPrice from './FormattedPrice'
import {
  PAYNOW_QR_EXPIRED,
  PAYNOW_QR_POLL_MS,
  PAYNOW_QR_SAVE_FALLBACK,
  PAYNOW_QR_STEPS,
  formatPaynowCountdown,
  paynowPollOutcome,
  paynowQrDeadlineMs,
  savePaynowQr,
} from '../lib/paynowQr'

export default function PayNowQrPanel({
  qr,
  paymentIntent,
  totalAmount,
  clientSecret,
  stripe,
  onSuccess,
  onPaymentFailed,
  onDismiss,
}) {
  const [now, setNow] = useState(() => Date.now())
  const [pollExpired, setPollExpired] = useState(false)
  const [saveHint, setSaveHint] = useState('')
  const [saveHref, setSaveHref] = useState('')
  const onSuccessRef = useRef(onSuccess)
  const onPaymentFailedRef = useRef(onPaymentFailed)
  const onDismissRef = useRef(onDismiss)

  useEffect(() => {
    onSuccessRef.current = onSuccess
  }, [onSuccess])
  useEffect(() => {
    onPaymentFailedRef.current = onPaymentFailed
  }, [onPaymentFailed])
  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  const deadline = paynowQrDeadlineMs(qr, paymentIntent, now)
  const remainingMs = deadline - now
  const timedOut = pollExpired || remainingMs <= 0

  useEffect(() => {
    if (timedOut) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [timedOut])

  useEffect(() => {
    if (!stripe || !clientSecret || timedOut) return undefined
    let stopped = false
    // A guest in their bank app or on a weak signal can fail every poll for
    // minutes. Report the first failure only, not one every 3 seconds.
    let reportedError = false

    async function poll() {
      if (stopped) return
      const { paymentIntent: latest, error } = await stripe.retrievePaymentIntent(clientSecret)
      if (stopped) return
      if (error) {
        if (reportedError) return
        reportedError = true
        Sentry.captureException(error instanceof Error ? error : new Error(error.message || 'retrieve_failed'), {
          tags: { area: 'paynow-qr-poll' },
          extra: { reason: error.message || 'retrieve_failed' },
        })
        return
      }
      const outcome = paynowPollOutcome(latest?.status, { qrShown: true })
      if (outcome === 'success') {
        stopped = true
        onSuccessRef.current?.(latest.status)
        return
      }
      if (outcome === 'failed') {
        stopped = true
        onPaymentFailedRef.current?.()
        return
      }
      if (outcome === 'expired') setPollExpired(true)
    }

    function onVisible() {
      if (document.visibilityState === 'visible') void poll()
    }

    void poll()
    const timer = window.setInterval(() => void poll(), PAYNOW_QR_POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [stripe, clientSecret, timedOut])

  async function handleSave() {
    const result = await savePaynowQr(qr.imageUrlPng, {
      captureException: Sentry.captureException,
    })
    if (result === 'shared' || result === 'cancelled') {
      setSaveHint('')
      setSaveHref('')
      return
    }
    setSaveHref(qr.imageUrlPng)
    setSaveHint(result === 'failed' ? PAYNOW_QR_SAVE_FALLBACK : '')
  }

  if (timedOut) {
    return (
      <div className="paynow-qr">
        <p className="error-message">{PAYNOW_QR_EXPIRED}</p>
        <button type="button" className="btn btn--primary" onClick={() => onDismiss?.()}>
          Start again
        </button>
      </div>
    )
  }

  return (
    <div className="paynow-qr">
      <h3 className="paynow-qr__title">
        Pay <FormattedPrice cents={totalAmount} /> with PayNow
      </h3>
      <img src={qr.imageUrlPng} alt="PayNow QR code" className="paynow-qr__image" width={240} height={240} />
      <ol className="paynow-qr__steps">
        {PAYNOW_QR_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="paynow-qr__expires" role="status">
        QR expires in {formatPaynowCountdown(remainingMs)}
      </p>
      <div className="paynow-qr__actions">
        <button type="button" className="btn btn--primary" onClick={() => void handleSave()}>
          Save QR
        </button>
        {saveHref ? (
          <a href={saveHref} target="_blank" rel="noopener noreferrer" className="paynow-qr__open">
            Open QR
          </a>
        ) : null}
        {saveHint ? (
          <p className="hint" role="status">
            {saveHint}
          </p>
        ) : null}
        <button type="button" className="paynow-qr__cancel" onClick={() => onDismiss?.()}>
          Cancel
        </button>
      </div>
    </div>
  )
}
