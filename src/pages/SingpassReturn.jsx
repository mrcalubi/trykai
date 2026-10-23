import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { functionReasonOrDefault } from '../lib/edgeFunctionError'
import { formatSingpassDob } from '../lib/singpass'
import { normalizeHostMobile } from '../../supabase/functions/_shared/singpass.ts'

const GENERIC_ERROR =
  'We could not confirm your identity with Singpass. Please try again, or upload your ID instead.'

async function callSingpass(body) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return supabase.functions.invoke('singpass-callback', {
    body,
    headers: { Authorization: `Bearer ${session?.access_token}` },
  })
}

/**
 * Where Singpass sends the host back (SINGPASS_REDIRECT_URI). Hands the query
 * string to singpass-callback once (the code works only once) and takes it
 * out of the address bar, then shows what Singpass returned, read-only, for
 * the host to confirm, as Myinfo requires. Confirming verifies the host on the
 * spot (00036); their first listing is what the TryKai team reviews.
 */
export default function SingpassReturn() {
  const location = useLocation()
  const navigate = useNavigate()
  const sent = useRef(false)
  const [view, setView] = useState({ phase: 'checking' })
  const [busy, setBusy] = useState(false)
  const [mobile, setMobile] = useState('')
  const [mobileError, setMobileError] = useState('')

  useEffect(() => {
    if (sent.current) return
    sent.current = true
    const query = location.search

    if (!query || !new URLSearchParams(query).get('state')) {
      navigate('/verify-identity', { replace: true })
      return
    }
    navigate(location.pathname, { replace: true })

    async function exchange() {
      const { data, error } = await callSingpass({ query })
      if (error || data?.error || !data?.review || !data?.state) {
        setView({ phase: 'error', error: await functionReasonOrDefault(error, data, GENERIC_ERROR) })
        return
      }
      setMobile(data.review.mobile || '')
      setView({ phase: 'review', review: data.review, state: data.state })
    }

    void exchange()
  }, [location.pathname, location.search, navigate])

  async function confirm() {
    const checked = normalizeHostMobile(mobile)
    if (!checked.ok) {
      setMobileError(checked.error)
      return
    }
    setMobileError('')
    setBusy(true)
    const { data, error } = await callSingpass({
      action: 'confirm',
      state: view.state,
      mobile: checked.mobile,
    })
    setBusy(false)
    if (data?.field === 'mobile' && data?.error) {
      setMobileError(data.error)
      return
    }
    if (error || data?.error || !data?.ok) {
      setView({ phase: 'error', error: await functionReasonOrDefault(error, data, GENERIC_ERROR) })
      return
    }
    setView({ phase: 'done', approved: data.status === 'approved' })
  }

  async function cancel() {
    setBusy(true)
    await callSingpass({ action: 'cancel', state: view.state })
    navigate('/verify-identity', { replace: true })
  }

  if (view.phase === 'checking') {
    return (
      <div className="page page--form page--form-status">
        <div className="form-card">
          <h1 className="form-card__title">Checking with Singpass</h1>
          <p className="form-card__subtitle" role="status">
            This takes a few seconds.
          </p>
        </div>
      </div>
    )
  }

  if (view.phase === 'review') {
    const { name, dob } = view.review
    return (
      <div className="page page--form">
        <div className="form-card">
          <h1 className="form-card__title">Check your details</h1>
          <p className="form-card__subtitle">
            Your name and date of birth come from Singpass and can&apos;t be changed here. If
            they&apos;re wrong, update them with the government first.
          </p>
          <div className="form">
            <label className="label">
              Name (from Singpass)
              <input className="input input--locked" value={name} readOnly aria-readonly="true" />
            </label>
            <label className="label">
              Date of birth (from Singpass)
              <input
                className="input input--locked"
                value={formatSingpassDob(dob)}
                readOnly
                aria-readonly="true"
              />
            </label>
            <label className="label">
              Mobile number
              <input
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="9123 4567"
                aria-invalid={mobileError ? 'true' : undefined}
              />
              <span className="hint">
                {view.review.mobile
                  ? 'From Singpass. Change it if another number is better for reaching you.'
                  : 'Singpass has no mobile number for you, so add the best one to reach you.'}
              </span>
            </label>
            {mobileError ? <p className="error-message">{mobileError}</p> : null}
          </div>
          <p className="hint singpass-privacy">
            Only the TryKai team sees these. We use your mobile number to reach you about your
            sessions.
          </p>
          <div className="singpass-actions">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={confirm}>
              {busy ? 'Confirming…' : 'Confirm and continue'}
            </button>
            <button type="button" className="btn btn--secondary" disabled={busy} onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (view.phase === 'done') {
    if (!view.approved) {
      return (
        <div className="page page--form page--form-status">
          <div className="form-card">
            <h1 className="form-card__title">Under review</h1>
            <p className="success-message">
              Singpass confirmed who you are. The TryKai team will get back to you by email,
              usually within 1 to 2 business days.
            </p>
            <Link to="/" className="btn btn--primary">
              Back to TryKai
            </Link>
          </div>
        </div>
      )
    }
    return (
      <div className="page page--form page--form-status">
        <div className="form-card">
          <h1 className="form-card__title">You&apos;re verified</h1>
          <p className="success-message">
            Singpass confirmed who you are, so you can create your listing now. The TryKai team
            takes a quick look at every new listing before guests can see it, and emails you
            when it&apos;s live.
          </p>
          <Link to="/create-listing" className="btn btn--primary">
            Create your listing
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page page--form page--form-status">
      <div className="form-card">
        <h1 className="form-card__title">Singpass didn&apos;t go through</h1>
        <p className="error-message error-message--spaced">{view.error}</p>
        <div className="singpass-actions">
          <Link to="/verify-identity" className="btn btn--primary">
            Try again
          </Link>
          <Link to="/verify-identity?upload=1" className="btn btn--secondary">
            Upload your ID instead
          </Link>
        </div>
      </div>
    </div>
  )
}
