import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import {
  RESEND_COOLDOWN_SECONDS,
  codeErrorMessage,
  isCodeComplete,
  isEmailNotConfirmed,
  isExistingAccount,
  normalizeCode,
  resendErrorMessage,
  resendLabel,
  verifySignupCode,
} from '../lib/emailConfirm'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from?.pathname || '/'

  const [isSignup, setIsSignup] = useState(false)
  const [fullName, setFullName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  // Set once a confirmation code has been emailed; the page then asks for it.
  const [pendingEmail, setPendingEmail] = useState('')
  const [code, setCode] = useState('')
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return undefined
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  // Confirming through the link in another tab of this browser signs this tab in too.
  useEffect(() => {
    if (!pendingEmail) return undefined
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) navigate(redirectTo, { replace: true })
    })
    return () => subscription.unsubscribe()
  }, [pendingEmail, navigate, redirectTo])

  function askForCode(address, note = '') {
    setPendingEmail(address)
    setCode('')
    setError('')
    setMessage(note)
    setPassword('')
    setResendIn(RESEND_COOLDOWN_SECONDS)
    // The signup form is taller than this step; start the code step at the top.
    window.scrollTo(0, 0)
  }

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (isEmailNotConfirmed(authError)) {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: confirmRedirectUrl() },
      })
      setLoading(false)
      askForCode(
        email,
        resendError
          ? 'Confirm your email first. Use the code in the email we sent you.'
          : "Confirm your email first. We've sent you a new code."
      )
      return
    }

    setLoading(false)

    if (authError) {
      setError(authError.message)
      return
    }

    navigate(redirectTo, { replace: true })
  }

  function confirmRedirectUrl() {
    return `${window.location.origin}${redirectTo}`
  }

  async function handleSignup(e) {
    e.preventDefault()
    setError('')
    setMessage('')

    const name = fullName.trim()
    const handle = displayName.trim()
    if (!name) {
      setError('Please enter your full name.')
      return
    }
    if (!handle) {
      setError('Please enter a display name.')
      return
    }
    if (handle.length > 40) {
      setError('Display name must be 40 characters or fewer.')
      return
    }
    if (!acceptedTerms) {
      setError('Please confirm you are 18 or older and agree to the Terms and Privacy Policy.')
      return
    }

    setLoading(true)

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name, display_name: handle, terms_accepted: true },
        emailRedirectTo: confirmRedirectUrl(),
      },
    })

    setLoading(false)

    if (authError) {
      setError(authError.message)
      return
    }

    if (!data.user) {
      setError('Signup failed. Please try again.')
      return
    }

    if (data.session) {
      navigate(redirectTo, { replace: true })
      return
    }

    if (isExistingAccount(data)) {
      setIsSignup(false)
      setPassword('')
      setAcceptedTerms(false)
      setError('There is already an account with this email. Log in instead.')
      return
    }

    askForCode(email)
  }

  async function handleConfirm(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    if (!isCodeComplete(code)) {
      setError('Enter the 6-digit code from the email.')
      return
    }

    setLoading(true)
    const { data, error: verifyError } = await verifySignupCode(supabase.auth, pendingEmail, code)
    setLoading(false)

    if (verifyError || !data?.session) {
      setError(codeErrorMessage(verifyError))
      return
    }

    navigate(redirectTo, { replace: true })
  }

  async function handleResend() {
    if (resendIn > 0) return
    setError('')
    setMessage('')
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: pendingEmail,
      options: { emailRedirectTo: confirmRedirectUrl() },
    })
    if (resendError) {
      setError(resendErrorMessage(resendError))
      return
    }
    setCode('')
    setResendIn(RESEND_COOLDOWN_SECONDS)
    setMessage('New code sent. Use the latest email.')
  }

  function startAgain() {
    setPendingEmail('')
    setCode('')
    setError('')
    setMessage('')
    setResendIn(0)
    setIsSignup(true)
  }

  function handleSubmit(e) {
    if (isSignup) {
      handleSignup(e)
    } else {
      handleLogin(e)
    }
  }

  function toggleMode() {
    setIsSignup((prev) => !prev)
    setAcceptedTerms(false)
    setError('')
    setMessage('')
  }

  if (pendingEmail) {
    return (
      <div className="page page--form">
        <div className="form-card">
          <h1 className="form-card__title">Check your email</h1>
          <p className="form-card__subtitle">
            We sent a code to <strong>{pendingEmail}</strong>. Enter it here, or tap the
            button in the email.
          </p>

          <form onSubmit={handleConfirm} className="form">
            <Input
              id="login-code"
              label="Code"
              type="text"
              floatingLabel
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              placeholder="123456"
              required
              hint="Not there? Check spam or promotions."
            />

            {error && <p className="error-message">{error}</p>}
            {message && <p className="success-message">{message}</p>}

            <Button type="submit" variant="primary" loading={loading} loadingLabel="Please wait">
              Confirm email
            </Button>
          </form>

          <p className="form-card__footer">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendIn > 0}
              className="link-btn"
            >
              {resendLabel(resendIn)}
            </button>
          </p>
          <p className="form-card__footer">
            Wrong email?{' '}
            <button type="button" onClick={startAgain} className="link-btn">
              Start again
            </button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="page page--form">
      <div className="form-card">
        <h1 className="form-card__title">{isSignup ? 'Create account' : 'Welcome back'}</h1>
        <p className="form-card__subtitle">
          {isSignup
            ? 'Sign up to host or book experiences in Singapore'
            : 'Log in to your TryKai account'}
        </p>

        <form onSubmit={handleSubmit} className="form">
          {isSignup && (
            <>
              <Input
                id="login-full-name"
                label="Full name"
                type="text"
                floatingLabel
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                required
              />
              <Input
                id="login-display-name"
                label="What should we call you?"
                type="text"
                floatingLabel
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="A name"
                autoComplete="nickname"
                required
                maxLength={40}
                hint="Shown on your profile and reviews."
              />
            </>
          )}

          <Input
            id="login-email"
            label="Email"
            type="email"
            floatingLabel
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />

          <Input
            id="login-password"
            label="Password"
            type="password"
            floatingLabel
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
          />

          {isSignup && (
            <label className="checkbox-label checkbox-label--agree">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                required
              />
              <span>
                I&apos;m 18 or older and agree to the{' '}
                <Link to="/terms">Terms</Link> and{' '}
                <Link to="/privacy">Privacy Policy</Link>
              </span>
            </label>
          )}

          {!isSignup && (
            <p className="form-card__forgot">
              <Link to="/forgot-password" className="link-btn">
                Forgot password?
              </Link>
            </p>
          )}

          {error && <p className="error-message">{error}</p>}
          {message && <p className="success-message">{message}</p>}

          <Button
            type="submit"
            variant="primary"
            loading={loading}
            loadingLabel="Please wait"
            disabled={isSignup && !acceptedTerms}
          >
            {isSignup ? 'Sign up' : 'Log in'}
          </Button>
        </form>

        <p className="form-card__footer">
          {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button type="button" onClick={toggleMode} className="link-btn">
            {isSignup ? 'Log in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  )
}
