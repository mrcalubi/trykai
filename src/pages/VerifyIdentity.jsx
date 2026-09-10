import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import { verificationDocumentPaths } from '../../supabase/functions/_shared/verification.ts'

/** `my_verification` returns a table, so PostgREST hands back an array. */
function firstRow(data) {
  if (Array.isArray(data)) return data[0] ?? null
  return data ?? null
}

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

  useEffect(() => {
    async function loadStatus() {
      const { data } = await supabase.rpc('my_verification')
      const row = firstRow(data)

      setVerificationStatus(row?.verification_status || 'unverified')
      setRejectionReason(row?.verification_rejection_reason || '')
      setStatusChecked(true)
    }

    loadStatus()
  }, [userId])

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
          To host on TryKai, we need to verify your identity. Upload a photo of your NRIC or
          passport, plus a clear selfie.
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

          {error && <p className="error-message">{error}</p>}

          <button type="submit" disabled={loading} className="btn btn--primary">
            {loading ? 'Submitting…' : 'Submit for review'}
          </button>
        </form>
      </div>
    </div>
  )
}
