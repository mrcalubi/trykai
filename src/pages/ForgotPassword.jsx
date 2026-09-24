import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'

const SUCCESS_MESSAGE = "If an account exists for that email, we've sent a reset link."

function shouldSurfaceResetError(error) {
  if (!error) return false

  const status = error.status ?? error.statusCode
  const code = String(error.code ?? '').toLowerCase()
  const message = String(error.message ?? '').toLowerCase()
  const name = String(error.name ?? '')

  if (status === 429) return true
  if (code.includes('rate_limit') || code === 'over_email_send_rate_limit') return true
  if (message.includes('rate limit') || message.includes('for security purposes')) return true
  if (name === 'AuthRetryableFetchError' || name === 'TypeError') return true
  if (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed')
  ) {
    return true
  }

  return false
}

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (resetError && shouldSurfaceResetError(resetError)) {
        setError(resetError.message)
        return
      }

      setMessage(SUCCESS_MESSAGE)
    } catch (requestError) {
      setError(requestError.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page page--form">
      <div className="form-card">
        <h1 className="form-card__title">Forgot password</h1>
        <p className="form-card__subtitle">Enter the email on your TryKai account</p>

        <form onSubmit={handleSubmit} className="form">
          <Input
            id="forgot-password-email"
            label="Email"
            type="email"
            floatingLabel
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />

          {error && <p className="error-message">{error}</p>}
          {message && <p className="success-message">{message}</p>}

          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Please wait…' : 'Send reset link'}
          </Button>
        </form>

        <p
          style={{
            marginTop: '24px',
            fontSize: '14px',
            textAlign: 'center',
            color: 'var(--text)',
          }}
        >
          <Link to="/login" className="link-btn">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  )
}
