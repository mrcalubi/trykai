import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import { edgeFunctionErrorMessage } from '../lib/edgeFunctionError'
import { verificationDocumentPaths } from '../../supabase/functions/_shared/verification.ts'

/** `my_verification` returns a table, so PostgREST hands back an array. */
function firstRow(data) {
  if (Array.isArray(data)) return data[0] ?? null
  return data ?? null
}

// Stripe's checks are asynchronous, so a host returning from the hosted flow
// usually lands here before the webhook has recorded anything.
const POLL_ATTEMPTS = 12
const POLL_INTERVAL_MS = 2500

export default function VerifyIdentity() {
  const navigate = useNavigate()
  const location = useLocation()
  const userId = useAuthedUserId()
  const [searchParams] = useSearchParams()
  const returnedFromStripe = searchParams.get('identity') === 'return'

  const [statusChecked, setStatusChecked] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [idPhoto, setIdPhoto] = useState(null)
  const [selfie, setSelfie] = useState(null)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [stripeLoading, setStripeLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [awaitingResult, setAwaitingResult] = useState(false)
  const [showManual, setShowManual] = useState(false)

  const readStatus = useCallback(async () => {
    const { data } = await supabase.rpc('my_verification')
    const row = firstRow(data)
    return {
      status: row?.verification_status || 'unverified',
      reason: row?.verification_rejection_reason || '',
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadStatus() {
      const { status, reason } = await readStatus()
      if (cancelled) return
      setVerificationStatus(status)
      setRejectionReason(reason)
      setStatusChecked(true)
      // Only a host coming back from Stripe has a result on the way.
      if (returnedFromStripe && status !== 'approved' && status !== 'rejected') {
        setAwaitingResult(true)
      }
    }

    void Promise.resolve().then(() => {
      if (!cancelled) void loadStatus()
    })

    return () => {
      cancelled = true
    }
  }, [readStatus, returnedFromStripe])

  useEffect(() => {
    if (!awaitingResult) return

    let cancelled = false
    let attempts = 0

    async function poll() {
      while (!cancelled && attempts < POLL_ATTEMPTS) {
        attempts += 1
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        if (cancelled) return

        const { status, reason } = await readStatus()
        if (cancelled) return

        if (status === 'approved' || status === 'rejected') {
          setVerificationStatus(status)
          setRejectionReason(reason)
          setAwaitingResult(false)
          return
        }
      }

      if (!cancelled) setAwaitingResult(false)
    }

    void poll()

    return () => {
      cancelled = true
    }
  }, [awaitingResult, readStatus])

  async function startStripeCheck() {
    setError('')
    setStripeLoading(true)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    const { data, error: fnError } = await supabase.functions.invoke('create-identity-session', {
      body: {},
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })

    if (fnError || data?.error) {
      setStripeLoading(false)
      setError(await edgeFunctionErrorMessage(fnError, data))
      return
    }

    if (data?.already_verified) {
      setStripeLoading(false)
      setVerificationStatus('approved')
      return
    }

    if (!data?.url) {
      setStripeLoading(false)
      setError('Could not start the identity check. Please try again.')
      return
    }

    window.location.assign(data.url)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!idPhoto || !selfie) {
      setError('Please upload both your ID photo and a selfie.')
      return
    }

    if (!consent) {
      setError('Please confirm you agree to TryKai verifying your identity.')
      return
    }

    setLoading(true)

    const paths = verificationDocumentPaths(userId)

    const { error: idUploadError } = await supabase.storage
      .from('verification-docs')
      .upload(paths.idPhoto, idPhoto, { upsert: true })

    if (idUploadError) {
      setLoading(false)
      setError(idUploadError.message)
      return
    }

    const { error: selfieUploadError } = await supabase.storage
      .from('verification-docs')
      .upload(paths.selfie, selfie, { upsert: true })

    if (selfieUploadError) {
      setLoading(false)
      setError(selfieUploadError.message)
      return
    }

    const { error: submitError } = await supabase.rpc('submit_verification', {
      p_id_photo_url: paths.idPhoto,
      p_selfie_url: paths.selfie,
      p_consent: true,
    })

    setLoading(false)

    if (submitError) {
      setError(submitError.message)
      return
    }

    setVerificationStatus('pending')
    setSubmitted(true)
  }

  if (!statusChecked) {
    return <p className="status-message">Loading…</p>
  }

  if (verificationStatus === 'approved') {
    return (
      <div className="page page--form">
        <div className="form-card">
          <h1 className="form-card__title">Identity verified</h1>
          <p className="form-card__subtitle">
            Your identity has been approved. You can create listings on TryKai.
          </p>
          <button
            type="button"
            onClick={() => navigate('/create-listing')}
            className="btn btn--primary"
          >
            Create a listing
          </button>
        </div>
      </div>
    )
  }

  if (awaitingResult) {
    return (
      <div className="page page--form">
        <div className="form-card">
          <h1 className="form-card__title">Checking your documents</h1>
          <p className="success-message">
            Stripe is verifying what you submitted. This usually takes under a minute, and this
            page will update on its own.
          </p>
        </div>
      </div>
    )
  }

  if (verificationStatus === 'pending' || submitted) {
    return (
      <div className="page page--form">
        <div className="form-card">
          <h1 className="form-card__title">Under review</h1>
          <p className="success-message">
            Your verification documents have been submitted and are under review. We&apos;ll
            notify you once your identity is approved — usually within 1–2 business days.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="page page--form">
      <div className="form-card" style={{ maxWidth: '480px' }}>
        <h1 className="form-card__title">Verify your identity</h1>
        <p className="form-card__subtitle">
          Hosting on TryKai means meeting people in person, so we verify every host. The check is
          run by Stripe, takes about a minute, and TryKai never stores your ID.
        </p>

        {location.state?.message && (
          <p className="error-message" style={{ marginBottom: '20px' }}>
            {location.state.message}
          </p>
        )}

        {verificationStatus === 'rejected' && rejectionReason && (
          <p className="error-message" style={{ marginBottom: '20px' }}>
            Your last submission was not approved: {rejectionReason}
          </p>
        )}

        {error && <p className="error-message" style={{ marginBottom: '20px' }}>{error}</p>}

        <button
          type="button"
          className="btn btn--primary"
          disabled={stripeLoading}
          onClick={startStripeCheck}
        >
          {stripeLoading ? 'Opening Stripe…' : 'Verify with Stripe'}
        </button>

        <p className="hint" style={{ marginTop: '16px' }}>
          You will need your NRIC or passport and a phone or webcam for the selfie.
        </p>

        <div className="verify-fallback">
          {showManual ? (
            <>
              <p className="verify-fallback__intro">
                Upload your documents instead and the TryKai team will review them by hand. This
                takes 1 to 2 business days.
              </p>

              <form onSubmit={handleSubmit} className="form">
                <label className="label">
                  NRIC or passport photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setIdPhoto(e.target.files?.[0] || null)}
                    className="input"
                    style={{ padding: '10px' }}
                  />
                  <span className="hint">Clear photo of the front of your ID document</span>
                </label>

                <label className="label">
                  Selfie
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setSelfie(e.target.files?.[0] || null)}
                    className="input"
                    style={{ padding: '10px' }}
                  />
                  <span className="hint">A clear photo of your face, taken recently</span>
                </label>

                <label className="label label--inline">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    I agree to TryKai using these documents to verify my identity. They are stored
                    privately, are only seen by the TryKai team for this review, and are deleted
                    within 30 days if my application is not approved.
                  </span>
                </label>

                <button type="submit" disabled={loading} className="btn btn--primary">
                  {loading ? 'Submitting…' : 'Submit for review'}
                </button>
              </form>
            </>
          ) : (
            <button
              type="button"
              className="link-button"
              onClick={() => setShowManual(true)}
            >
              Having trouble? Upload your documents instead
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
