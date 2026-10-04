import { Navigate, useLocation } from 'react-router-dom'
import { useAuthedUserId } from '../lib/authedUser'

/**
 * Legacy `/bookings` and `/hosting` keep working for emails, payment return, and
 * Stripe Connect. They land on the signed-in user's profile with `tab` set and
 * every other query parameter left in place.
 */
export default function RedirectToOwnProfile({ tab }) {
  const location = useLocation()
  const userId = useAuthedUserId()
  const params = new URLSearchParams(location.search)
  params.set('tab', tab)
  const search = params.toString()

  return (
    <Navigate
      to={{
        pathname: `/u/${userId}`,
        search: search ? `?${search}` : '',
        hash: location.hash,
      }}
      replace
      state={location.state}
    />
  )
}
