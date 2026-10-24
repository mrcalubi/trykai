import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import { verificationDocumentPaths } from '../../supabase/functions/_shared/verification.ts'
import { missingItemsMessage, missingVerificationItems } from '../lib/verificationForm'
import { singpassEnabled } from '../lib/singpass'
import SingpassButton from '../components/SingpassButton'
import Button from '../components/ui/Button'
import PageLoader from '../components/PageLoader'
import WaitingState from '../components/WaitingState'
import { functionReasonOrDefault } from '../lib/edgeFunctionError'

/** `my_verification` returns a table, so PostgREST hands back an array. */
function firstRow(data) {
  if (Array.isArray(data)) return data[0] ?? null
  return data ?? null
}

/**
 * Two routes (DECISIONS.md, 23 October). Singpass Myinfo is the main one where
 * the environment turns it on: it verifies the host on the spot, TryKai stores
 * no documents, and the host goes straight on to create a listing (which the
 * team reviews before guests see it). Upload is the quiet fallback for anyone
 * without Singpass: an ID photo and a selfie, checked by hand. Stripe Identity
 * is not offered to Singapore businesses.
 */

export default function VerifyIdentity() {
  const navigate = useNavigate()
  const location = useLocation()
  const userId = useAuthedUserId()

  const [statusChecked, setStatusChecked] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [idPhoto, setIdPhoto] = useState(null)
  const [selfie, setSelfie] = useState(null)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [singpassLoading, setSingpassLoading] = useState(false)
  // ?upload=1 comes from the Singpass error page, so the fallback opens straight away.
  const [showUpload, setShowUpload] = useState(
    () => new URLSearchParams(location.search).get('upload') === '1'
  )
  const singpass = singpassEnabled()

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
      // An approved host has nothing to do here; send them on to create listing.
      if (status === 'approved') {
        navigate('/create-listing', { replace: true })
        return
      }
      setVerificationStatus(status)
      setRejectionReason(reason)
      setStatusChecked(true)
    }

    void Promise.resolve().then(() => {
      if (!cancelled) void loadStatus()
    })

    return () => {
      cancelled = true
    }
  }, [navigate, readStatus])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const missing = missingVerificationItems({ idPhoto, selfie, consent })
    if (missing.length > 0) {
      setError(missingItemsMessage(missing))
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

  async function startSingpass() {
    setError('')
    setSingpassLoading(true)
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const { data, error: fnError } = await supabase.functions.invoke('singpass-start', {
      body: {},
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })

    if (fnError || data?.error || !data?.url) {
      setSingpassLoading(false)
      setError(
        await functionReasonOrDefault(
          fnError,
          data,
          'Could not open Singpass. Please try again, or upload your ID instead.'
        )
      )
      return
    }

    window.location.assign(data.url)
  }

  if (!statusChecked) {
    return <PageLoader />
  }

  if (verificationStatus === 'pending' || submitted) {
    return (
      <div className="page page--form page--form-status">
        <div className="form-card">
          <h1 className="form-card__title">Under review</h1>
          <p className="success-message">
            Thanks. The TryKai team will check your details and get back to you by email, usually
            within 1 to 2 business days.
          </p>
        </div>
      </div>
    )
  }

  const uploadFields = (
    <>
      <label className="label">
        Passport or NRIC photo
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setIdPhoto(e.target.files?.[0] || null)}
          className="input input--file"
        />
        <span className="hint">
          The front, clear and readable. On an NRIC you can cover the number: we only need
          your name and photo.
        </span>
      </label>

      <label className="label">
        Selfie
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setSelfie(e.target.files?.[0] || null)}
          className="input input--file"
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
          I agree to TryKai using these photos to verify my identity. They are stored
          privately and seen only by the TryKai team. If I am not approved they are deleted
          within 30 days; if I am, they are kept while my account is active.
        </span>
      </label>
    </>
  )

  const notices = (
    <>
      {location.state?.message && (
        <p className="error-message error-message--spaced">{location.state.message}</p>
      )}
      {verificationStatus === 'rejected' && rejectionReason && (
        <p className="error-message error-message--spaced">
          Your last submission was not approved: {rejectionReason}
        </p>
      )}
    </>
  )

  if (!singpass) {
    return (
      <div className="page page--form">
        <div className="form-card">
          <h1 className="form-card__title">Verify your identity</h1>
          <p className="form-card__subtitle">
            Hosting on TryKai means meeting people in person, so we check every host. Add a photo
            of your ID and a selfie, and the TryKai team will review it within 1 to 2 business
            days.
          </p>
          {notices}
          <form onSubmit={handleSubmit} className="form">
            {uploadFields}
            {error && <p className="error-message">{error}</p>}
            <Button type="submit" variant="primary" loading={loading} loadingLabel="Submitting">
              Submit for review
            </Button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="page page--form">
      <div className="form-card">
        <h1 className="form-card__title">Verify your identity</h1>
        <p className="form-card__subtitle">
          Hosting on TryKai means meeting people in person, so every host confirms who they are.
          With Singpass it takes about a minute, there are no documents to upload, and you can
          create your listing straight after. Singpass is for Singapore citizens, PRs and pass
          holders.
        </p>
        {notices}

        <div className="verify-singpass">
          <SingpassButton busy={singpassLoading} onClick={startSingpass} />
          {singpassLoading ? (
            <WaitingState
              title="Opening Singpass"
              message="You'll confirm your details next."
            />
          ) : null}
          <p className="hint">
            Singpass shares your name, date of birth and mobile number with TryKai. You check them
            before confirming. We never see your NRIC number.
          </p>
        </div>

        {error && !showUpload && <p className="error-message">{error}</p>}

        <div className="verify-fallback">
          {showUpload ? (
            <form onSubmit={handleSubmit} className="form">
              <p className="verify-fallback__intro">
                No Singpass? Upload a photo of your passport or NRIC and a selfie. We check these
                by hand, usually within 1 to 2 business days.
              </p>
              {uploadFields}
              {error && <p className="error-message">{error}</p>}
              <Button type="submit" variant="secondary" loading={loading} loadingLabel="Submitting">
                Submit for review
              </Button>
            </form>
          ) : (
            <button
              type="button"
              className="link-button verify-fallback__toggle"
              onClick={() => {
                setError('')
                setShowUpload(true)
              }}
            >
              No Singpass? Upload your ID instead
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
