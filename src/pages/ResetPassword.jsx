import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase, authCallbackFromUrl, passwordRecoveryWasSeen } from '../lib/supabase'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'

const MIN_PASSWORD_LENGTH = 6
const EXPIRED_MESSAGE = 'This reset link has expired or is invalid.'

function readCallbackFromHref(href) {
  if (!href) {
    return { type: null, error: null, error_code: null, error_description: null }
  }

  const url = new URL(href, window.location.origin)
  const params = {}

  if (url.hash && url.hash.startsWith('#')) {
    new URLSearchParams(url.hash.slice(1)).forEach((value, key) => {
      params[key] = value
    })
  }

  url.searchParams.forEach((value, key) => {
    params[key] = value
  })

  return {
    type: params.type ?? null,
    error: params.error ?? null,
    error_code: params.error_code ?? null,
    error_description: params.error_description ?? null,
  }
}

function callbackHasError(callback) {
  return Boolean(callback?.error || callback?.error_code || callback?.error_description)
}

function callbackIsRecovery(callback) {
  return callback?.type === 'recovery'
}

function initialMode(location) {
  const fromUrl = authCallbackFromUrl ?? {}
  const fromWindow = readCallbackFromHref(window.location.href)
  const fromRouter = readCallbackFromHref(
    `${location.pathname}${location.search}${location.hash}`
  )

  if (
    callbackHasError(fromUrl) ||
    callbackHasError(fromWindow) ||
    callbackHasError(fromRouter)
  ) {
    return 'invalid'
  }

  if (
    callbackIsRecovery(fromUrl) ||
    callbackIsRecovery(fromWindow) ||
    callbackIsRecovery(fromRouter) ||
    passwordRecoveryWasSeen?.()
  ) {
    return 'recovery'
  }

  return 'pending'
}

export default function ResetPassword() {
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState(() => initialMode(location))
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (mode !== 'pending') return undefined

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('recovery')
      }
    })

    if (passwordRecoveryWasSeen?.()) {
      setMode('recovery')
      return () => subscription.unsubscribe()
    }

    supabase.auth.getSession().then(() => {
      window.setTimeout(() => {
        setMode((current) => {
          if (current !== 'pending') return current
          return passwordRecoveryWasSeen?.() ? 'recovery' : 'invalid'
        })
      }, 0)
    })

    return () => subscription.unsubscribe()
  }, [mode])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setMessage('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const { error: updateError } = await supabase.auth.updateUser({ password })

    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await supabase.auth.signOut({ scope: 'others' })
    setMessage('Password updated.')
    navigate('/bookings', { replace: true })
  }

  return (
    <div className="page page--form">
      <div className="form-card">
        <h1 className="form-card__title">Reset password</h1>
        {mode === 'pending' ? (
          <p className="form-card__subtitle">Checking your reset link…</p>
        ) : mode === 'recovery' ? (
          <>
            <p className="form-card__subtitle">Choose a new password for your TryKai account</p>
            <form onSubmit={handleSubmit} className="form">
              <Input
                id="reset-password-new"
                label="New password"
                type="password"
                floatingLabel
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
              />
              <Input
                id="reset-password-confirm"
                label="Confirm password"
                type="password"
                floatingLabel
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="••••••••"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
              />

              {error && <p className="error-message">{error}</p>}
              {message && <p className="success-message">{message}</p>}

              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? 'Please wait…' : 'Update password'}
              </Button>
            </form>
          </>
        ) : (
          <>
            <p className="form-card__subtitle">{EXPIRED_MESSAGE}</p>
            <p
              style={{
                marginTop: '24px',
                fontSize: '14px',
                textAlign: 'center',
                color: 'var(--text)',
              }}
            >
              <Link to="/forgot-password" className="link-btn">
                Request a new reset link
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
