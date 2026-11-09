import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import HamburgerMenu from './HamburgerMenu'
import Avatar from './Avatar'

const SCROLL_THRESHOLD = 48
/** Phones only: hide the bar while scrolling down, bring it back on any scroll up. */
const HIDE_MEDIA = '(max-width: 767px)'
const HIDE_AFTER = 120
const SCROLL_JITTER = 6

function MenuIcon() {
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
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <span className="ui-topnav__close-icon" aria-hidden="true">
      ✕
    </span>
  )
}

/** Logged-in account control: photo if avatarUrl, otherwise the display-name initial. */
export function TopNavAccount({ avatarUrl, name, className = '' }) {
  const classes = [
    'ui-topnav__account',
    avatarUrl ? 'ui-topnav__account--photo' : 'ui-topnav__account--initials',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes}>
      <Avatar
        avatarUrl={avatarUrl}
        displayName={name}
        fill
        className={avatarUrl ? 'ui-topnav__avatar-img' : ''}
      />
    </span>
  )
}

export default function TopNav({
  isLoggedIn = false,
  isAdmin = false,
  verificationStatus,
  userId,
  avatarUrl,
  name,
  onMenuClick,
  className = '',
}) {
  const location = useLocation()
  const [compact, setCompact] = useState(false)
  // The location key the bar was hidden on, so a new page always starts with it showing.
  const [hiddenOn, setHiddenOn] = useState(null)
  const locationKey = useRef(location.key)
  const [focusInside, setFocusInside] = useState(false)
  const [openedAt, setOpenedAt] = useState(null)
  const menuOpen = openedAt === location.key
  // In Telegram's and other in-app browsers the page shows through their
  // see-through header above our bar; tucking the bar away while reading
  // makes that strip read as normal scrolling. Never while the menu is open
  // or the keyboard is in the bar.
  const hidden = hiddenOn === location.key && !menuOpen && !focusInside

  useEffect(() => {
    locationKey.current = location.key
  }, [location.key])

  useEffect(() => {
    const phone = typeof window.matchMedia === 'function' ? window.matchMedia(HIDE_MEDIA) : null
    let lastY = window.scrollY

    function onScroll() {
      const y = window.scrollY
      setCompact(y > SCROLL_THRESHOLD)
      if (!phone?.matches || y <= HIDE_AFTER) {
        setHiddenOn(null)
      } else if (y - lastY > SCROLL_JITTER) {
        setHiddenOn(locationKey.current)
      } else if (lastY - y > SCROLL_JITTER) {
        setHiddenOn(null)
      } else {
        return
      }
      lastY = y
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!menuOpen) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpenedAt(null)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen])

  function handleMenuToggle() {
    setOpenedAt((key) => (key === location.key ? null : location.key))
    onMenuClick?.()
  }

  function handleMenuClose() {
    setOpenedAt(null)
  }

  const shellClasses = [
    'ui-topnav-shell',
    compact ? 'ui-topnav-shell--compact' : '',
    hidden ? 'ui-topnav-shell--hidden' : '',
    menuOpen ? 'ui-topnav-shell--menu-open' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const barClasses = [
    'ui-topnav',
    compact ? 'ui-topnav--compact' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <div
        className={shellClasses}
        onFocus={() => setFocusInside(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocusInside(false)
        }}
      >
        <header className={barClasses}>
          <Link
            to="/"
            className="ui-topnav__brand"
            aria-label="TryKai home"
            onClick={handleMenuClose}
          >
            <img
              src="/trykai.png"
              alt=""
              width="40"
              height="40"
              className="ui-topnav__mark"
            />
            <span className="ui-topnav__wordmark">TryKai<span className="site-footer__dot">.</span></span>
          </Link>

          <div className="ui-topnav__end">
            {isLoggedIn && userId ? (
              <Link
                to={`/u/${userId}`}
                className="ui-topnav__account-link"
                aria-label="Your profile"
                onClick={handleMenuClose}
              >
                <TopNavAccount avatarUrl={avatarUrl} name={name} />
              </Link>
            ) : isLoggedIn ? (
              <TopNavAccount avatarUrl={avatarUrl} name={name} />
            ) : (
              <Link to="/login" className="ui-topnav__login">
                Log in
              </Link>
            )}
            <button
              type="button"
              className={`ui-topnav__menu${menuOpen ? ' ui-topnav__menu--open' : ''}`}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="ui-hamburger-panel"
              onClick={handleMenuToggle}
            >
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </header>

        <HamburgerMenu
          open={menuOpen}
          onClose={handleMenuClose}
          isLoggedIn={isLoggedIn}
          isAdmin={isAdmin}
          verificationStatus={verificationStatus}
          userId={userId}
        />
      </div>
      <div
        className={`ui-topnav-spacer${compact ? ' ui-topnav-spacer--compact' : ''}`}
        aria-hidden="true"
      />
    </>
  )
}
