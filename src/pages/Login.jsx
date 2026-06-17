import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from?.pathname || '/'

  const [isSignup, setIsSignup] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (authError) {
      setError(authError.message)
      return
    }

    navigate(redirectTo, { replace: true })
  }

  async function handleSignup(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError) {
      setLoading(false)
      setError(authError.message)
      return
    }

    const user = data.user
    if (!user) {
      setLoading(false)
      setError('Signup failed. Please try again.')
      return
    }

    const { error: profileError } = await supabase.from('users').insert({
      id: user.id,
      email,
      full_name: fullName.trim() || null,
    })

    setLoading(false)

    if (profileError) {
      setError(profileError.message)
      return
    }

    if (data.session) {
      navigate(redirectTo, { replace: true })
    } else {
      setMessage('Check your email to confirm your account, then log in.')
      setIsSignup(false)
      setPassword('')
    }
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
    setError('')
    setMessage('')
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
            <label className="label">
              Full name
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                className="input"
              />
            </label>
          )}

          <label className="label">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="input"
            />
          </label>

          <label className="label">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              className="input"
            />
          </label>

          {error && <p className="error-message">{error}</p>}
          {message && <p className="success-message">{message}</p>}

          <button type="submit" disabled={loading} className="btn btn--primary">
            {loading ? 'Please wait…' : isSignup ? 'Sign up' : 'Log in'}
          </button>
        </form>

        <p style={{ marginTop: '24px', fontSize: '14px', textAlign: 'center', color: 'var(--text)' }}>
          {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button type="button" onClick={toggleMode} className="link-btn">
            {isSignup ? 'Log in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  )
}
