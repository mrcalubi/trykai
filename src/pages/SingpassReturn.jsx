import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { functionReasonOrDefault } from '../lib/edgeFunctionError'
import { formatSingpassDob } from '../lib/singpass'

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
 * the host to confirm, as Myinfo requires.
 */
export default function SingpassReturn() {
  const location = useLocation()
  const navigate = useNavigate()
  const sent = useRef(false)
  const [view, setView] = useState({ phase: 'checking' })
  const [busy, setBusy] = useState(false)

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
      setView({ phase: 'review', review: data.review, state: data.state })
    }

    void exchange()
  }, [location.pathname, location.search, navigate])

  async function confirm() {
    setBusy(true)
    const { data, error } = await callSingpass({ action: 'confirm', state: view.state })
    setBusy(false)
    if (error || data?.error || !data?.ok) {
      setView({ phase: 'error', error: await functionReasonOrDefault(error, data, GENERIC_ERROR) })
      return
    }
    setView({ phase: 'done' })
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
    const { name, dob, mobile } = view.review
    return (
      <div className="page page--form">
        <div className="form-card">
          <h1 className="form-card__title">Check your details</h1>
          <p className="form-card__subtitle">
            This is what Singpass shared with TryKai. It can&apos;t be edited here; if something is
            wrong, update it with Singpass.
          </p>
          <dl className="singpass-details">
            <div>
              <dt>Name</dt>
              <dd>{name}</dd>
            </div>
            <div>
              <dt>Date of birth</dt>
              <dd>{formatSingpassDob(dob)}</dd>
            </div>
            <div>
              <dt>Mobile number</dt>
              <dd>{mobile || 'None registered with Singpass'}</dd>
            </div>
          </dl>
          <p className="hint">
            Only the TryKai team sees these. We use your mobile number to reach you about your
            sessions.
          </p>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={confirm}>
            {busy ? 'Submitting…' : 'Confirm and submit'}
          </button>
          <button type="button" className="link-button" disabled={busy} onClick={cancel}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (view.phase === 'done') {
    return (
      <div className="page page--form page--form-status">
        <div className="form-card">
          <h1 className="form-card__title">Under review</h1>
          <p className="success-message">
            Singpass confirmed who you are. The TryKai team will check what you&apos;d like to
            teach and get back to you by email, usually within 1 to 2 business days.
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
        <h1 className="form-card__title">Singpass didn&apos;t go through</h1>
        <p className="error-message error-message--spaced">{view.error}</p>
        <Link to="/verify-identity" className="btn btn--primary">
          Try again
        </Link>
      </div>
    </div>
  )
}
