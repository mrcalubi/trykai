import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function VerifyIdentity() {
  const navigate = useNavigate()
  const location = useLocation()

  const [authChecked, setAuthChecked] = useState(false)
  const [userId, setUserId] = useState(null)
  const [verificationStatus, setVerificationStatus] = useState(null)
  const [idPhoto, setIdPhoto] = useState(null)
  const [selfie, setSelfie] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        navigate('/login', { state: { from: location }, replace: true })
        return
      }

      setUserId(session.user.id)

      const { data } = await supabase
        .from('users')
        .select('verification_status')
        .eq('id', session.user.id)
        .single()

      setVerificationStatus(data?.verification_status || 'unverified')
      setAuthChecked(true)
    }

    checkAuth()
  }, [navigate, location])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!idPhoto || !selfie) {
      setError('Please upload both your ID photo and a selfie.')
      return
    }

    setLoading(true)

    const idPath = `${userId}/id-photo.jpg`
    const selfiePath = `${userId}/selfie.jpg`

    const { error: idUploadError } = await supabase.storage
      .from('verification-docs')
      .upload(idPath, idPhoto, { upsert: true })

    if (idUploadError) {
      setLoading(false)
      setError(idUploadError.message)
      return
    }

    const { error: selfieUploadError } = await supabase.storage
      .from('verification-docs')
      .upload(selfiePath, selfie, { upsert: true })

    if (selfieUploadError) {
      setLoading(false)
      setError(selfieUploadError.message)
      return
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({
        id_photo_url: idPath,
        selfie_url: selfiePath,
        verification_status: 'pending',
      })
      .eq('id', userId)

    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setVerificationStatus('pending')
    setSubmitted(true)
  }

  if (!authChecked) {
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

          {error && <p className="error-message">{error}</p>}

          <button type="submit" disabled={loading} className="btn btn--primary">
            {loading ? 'Submitting…' : 'Submit for review'}
          </button>
        </form>
      </div>
    </div>
  )
}
