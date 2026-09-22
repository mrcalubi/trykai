import { Navigate, useLocation, useSearchParams } from 'react-router-dom'

/**
 * Legacy path used by emails, Stripe return_url, and older in-app links.
 * Guest payment returns keep `?booking=`; Connect onboarding keeps `?connect=`.
 */
export default function Dashboard() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const pathname = searchParams.has('connect') ? '/hosting' : '/bookings'

  return (
    <Navigate
      to={{ pathname, search: location.search, hash: location.hash }}
      replace
      state={location.state}
    />
  )
}
