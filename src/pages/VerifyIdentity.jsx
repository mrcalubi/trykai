import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import { verificationDocumentPaths } from '../../supabase/functions/_shared/verification.ts'
import {
  TEACHING_PLAN_MAX,
  missingItemsMessage,
  missingVerificationItems,
} from '../lib/verificationForm'

/** `my_verification` returns a table, so PostgREST hands back an array. */
function firstRow(data) {
  if (Array.isArray(data)) return data[0] ?? null
  return data ?? null
}

/**
 * Manual review is the only route (DECISIONS.md, 23 October): Stripe Identity
 * is not offered to Singapore-based businesses, so live sessions are refused.
 */

export default function VerifyIdentity() {
  const navigate = useNavigate()
  const location = useLocation()
  const userId = useAuthedUserId()

  const [statusChecked, setStatusChecked] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [teachingPlan, setTeachingPlan] = useState('')
  const [idPhoto, setIdPhoto] = useState(null)
  const [selfie, setSelfie] = useState(null)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

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

    const plan = teachingPlan.trim()
    const missing = missingVerificationItems({ plan, idPhoto, selfie, consent })
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
      p_teaching_plan: plan,
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

  if (verificationStatus === 'pending' || submitted) {
    return (
      <div className="page page--form page--form-status">
        <div className="form-card">
          <h1 className="form-card__title">Under review</h1>
          <p className="success-message">
            Thanks. The TryKai team will check your photos and get back to you by email, usually
            within 1 to 2 business days.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="page page--form">
      <div className="form-card">
        <h1 className="form-card__title">Verify your identity</h1>
        <p className="form-card__subtitle">
          Hosting on TryKai means meeting people in person, so we check every host. Tell us what
          you&apos;d like to teach, add a photo of your ID and a selfie, and the TryKai team will
          review it within 1 to 2 business days.
        </p>

        {location.state?.message && (
          <p className="error-message error-message--spaced">
            {location.state.message}
          </p>
        )}

        {verificationStatus === 'rejected' && rejectionReason && (
          <p className="error-message error-message--spaced">
            Your last submission was not approved: {rejectionReason}
          </p>
        )}

        <form onSubmit={handleSubmit} className="form">
          <label className="label">
            What would you like to teach?
            <textarea
              value={teachingPlan}
              onChange={(e) => setTeachingPlan(e.target.value)}
              maxLength={TEACHING_PLAN_MAX}
              rows={4}
              className="input input--textarea"
              placeholder="Latte art for beginners. I've been a barista for six years and pour at home every weekend."
            />
            <span className="hint">
              A sentence or two: what guests would do, and why you know it. You can change the
              details when you create your listing.
            </span>
          </label>

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

          {error && <p className="error-message">{error}</p>}

          <button type="submit" disabled={loading} className="btn btn--primary">
            {loading ? 'Submitting…' : 'Submit for review'}
          </button>
        </form>
      </div>
    </div>
  )
}
