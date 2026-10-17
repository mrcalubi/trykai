import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

function BackArrow() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function historyHasPreviousPage() {
  return (window.history.state?.idx ?? 0) > 0
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
    <div className="page-back">
      <button type="button" className="page-back__button" onClick={handleClick} aria-label="Back">
        <BackArrow />
      </button>
    </div>
  )
}
