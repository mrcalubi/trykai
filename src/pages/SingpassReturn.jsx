import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { functionReasonOrDefault } from '../lib/edgeFunctionError'

const GENERIC_ERROR =
  'We could not confirm your identity with Singpass. Please try again, or upload your ID instead.'

/**
 * Where Singpass sends the host back (SINGPASS_REDIRECT_URI). Hands the query
 * string to singpass-callback once (the code works only once), then takes it
 * out of the address bar.
 */
export default function SingpassReturn() {
  const location = useLocation()
  const navigate = useNavigate()
  const sent = useRef(false)
  const [state, setState] = useState({ phase: 'checking', error: '' })

  useEffect(() => {
    if (sent.current) return
    sent.current = true
    const query = location.search

    if (!query || !new URLSearchParams(query).get('state')) {
      navigate('/verify-identity', { replace: true })
      return
    }
    // The code is single use; keep it out of history and screenshots.
    navigate(location.pathname, { replace: true })

    async function finish() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('singpass-callback', {
        body: { query },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (error || data?.error || !data?.ok) {
        setState({ phase: 'error', error: await functionReasonOrDefault(error, data, GENERIC_ERROR) })
        return
      }
      setState({ phase: 'done', error: '' })
    }

    void finish()
  }, [location.pathname, location.search, navigate])

  if (state.phase === 'checking') {
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

  if (state.phase === 'done') {
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
        <p className="error-message error-message--spaced">{state.error}</p>
        <Link to="/verify-identity" className="btn btn--primary">
          Try again
        </Link>
      </div>
    </div>
  )
}
