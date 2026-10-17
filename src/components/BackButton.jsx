import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

function historyHasPreviousPage() {
  return (window.history.state?.idx ?? 0) > 0
}

function pageBackClassName(pathname) {
  if (pathname.startsWith('/listings/') || pathname.startsWith('/u/')) {
    return 'page-back page-back--detail'
  }
  if (
    pathname.startsWith('/bookings') ||
    pathname.startsWith('/hosting') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/edit-listing') ||
    pathname === '/cancellation-policy' ||
    pathname === '/refund-policy' ||
    pathname === '/dispute-policy' ||
    pathname === '/terms' ||
    pathname === '/privacy'
  ) {
    return 'page-back page-back--narrow'
  }
  return 'page-back'
}

export default function BackButton() {
  const navigate = useNavigate()
  const location = useLocation()
  const seenLocation = useRef(false)
  const [navigatedInApp, setNavigatedInApp] = useState(historyHasPreviousPage)

  useEffect(() => {
    if (seenLocation.current) setNavigatedInApp(true)
    seenLocation.current = true
  }, [location.key])

  if (location.pathname === '/') return null

  function handleClick() {
    if (navigatedInApp || historyHasPreviousPage()) {
      navigate(-1)
      return
    }
    navigate('/')
  }

  return (
    <div className={pageBackClassName(location.pathname)}>
      <button type="button" className="page-back__button" onClick={handleClick} aria-label="Back">
        <span aria-hidden="true">‹</span>
      </button>
    </div>
  )
}
