import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'

const BackSlotContext = createContext({ slotEl: null, setSlotEl: () => {} })

export function BackSlotProvider({ children }) {
  const [slotEl, setSlotEl] = useState(null)
  const value = useMemo(() => ({ slotEl, setSlotEl }), [slotEl])
  return <BackSlotContext.Provider value={value}>{children}</BackSlotContext.Provider>
}

export function BackRowActions({ children }) {
  const { slotEl } = useContext(BackSlotContext)
  if (!slotEl || children == null) return null
  return createPortal(children, slotEl)
}

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

function BackChevron() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

export default function BackButton() {
  const navigate = useNavigate()
  const location = useLocation()
  const seenLocation = useRef(false)
  const { setSlotEl } = useContext(BackSlotContext)
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
        <BackChevron />
      </button>
      <div className="page-back__actions" ref={setSlotEl} />
    </div>
  )
}
