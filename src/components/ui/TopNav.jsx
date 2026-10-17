import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import HamburgerMenu from './HamburgerMenu'
import { getInitials } from './getInitials'

const SCROLL_THRESHOLD = 48

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

/** Logged-in account control: photo if avatarUrl, otherwise initials from name. */
export function TopNavAccount({ avatarUrl, name, className = '' }) {
  const initials = getInitials(name)
  const classes = [
    'ui-topnav__account',
    avatarUrl ? 'ui-topnav__account--photo' : 'ui-topnav__account--initials',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          width="36"
          height="36"
          className="ui-topnav__avatar-img"
        />
      ) : (
        <span className="ui-topnav__avatar-initials" aria-hidden="true">
          {initials}
        </span>
      )}
    </span>
  )
}

export default function TopNav({
  isLoggedIn = false,
  isAdmin = false,
  isHost = false,
  userId,
  avatarUrl,
  name,
  onMenuClick,
  onLogOut,
  className = '',
}) {
  const location = useLocation()
  const [compact, setCompact] = useState(false)
  const [openedAt, setOpenedAt] = useState(null)
  const menuOpen = openedAt === location.key

  useEffect(() => {
    function updateCompact() {
      setCompact(window.scrollY > SCROLL_THRESHOLD)
    }

    updateCompact()
    window.addEventListener('scroll', updateCompact, { passive: true })
    return () => window.removeEventListener('scroll', updateCompact)
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
      <div className={shellClasses}>
        <header className={barClasses}>
          <button
            type="button"
            className="ui-topnav__menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="ui-hamburger-panel"
            onClick={handleMenuToggle}
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>

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
            <span className="ui-topnav__wordmark">TryKai</span>
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
          </div>
        </header>

        <HamburgerMenu
          open={menuOpen}
          onClose={handleMenuClose}
          onLogOut={onLogOut}
          isLoggedIn={isLoggedIn}
          isAdmin={isAdmin}
          isHost={isHost}
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
