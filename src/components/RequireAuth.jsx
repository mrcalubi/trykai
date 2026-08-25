import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AuthedUserContext } from '../lib/authedUser'

/**
 * Gate for routes that need a signed-in user.
 *
 * Children mount only once a session exists, so a page can take the user id
 * from `useAuthedUserId()` without repeating the lookup or rendering a
 * half-initialised state. Visitors without a session go to the login form,
 * which sends them back here afterwards.
 */
export default function RequireAuth({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [userId, setUserId] = useState(null)
  const checkStarted = useRef(false)

  useEffect(() => {
    // Redirecting changes both `location` and the identity of `navigate`, so
    // without this guard the effect re-runs from /login and stashes /login as
    // the place to return to after signing in.
    if (checkStarted.current) return
    checkStarted.current = true

    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        navigate('/login', { state: { from: location }, replace: true })
        return
      }

      setUserId(session.user.id)
    }

    checkAuth()
  }, [navigate, location])

  if (!userId) {
    return <p className="status-message">Loading…</p>
  }

  return <AuthedUserContext.Provider value={userId}>{children}</AuthedUserContext.Provider>
}
