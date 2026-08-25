import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

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

function PersonIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 19.5c1.6-3.2 4-4.8 6.5-4.8s4.9 1.6 6.5 4.8" />
    </svg>
  )
}

export default function TopNav({
  isLoggedIn = false,
  onMenuClick,
  className = '',
}) {
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    function updateCompact() {
      setCompact(window.scrollY > SCROLL_THRESHOLD)
    }

    updateCompact()
    window.addEventListener('scroll', updateCompact, { passive: true })
    return () => window.removeEventListener('scroll', updateCompact)
  }, [])

  const classes = [
    'ui-topnav',
    compact ? 'ui-topnav--compact' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <header className={classes}>
        <button
          type="button"
          className="ui-topnav__menu"
          aria-label="Open menu"
          onClick={onMenuClick}
        >
          <MenuIcon />
        </button>

        <Link to="/" className="ui-topnav__brand" aria-label="TryKai home">
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
          {isLoggedIn ? (
            <span className="ui-topnav__account" aria-label="Account">
              <PersonIcon />
            </span>
          ) : (
            <Link to="/login" className="ui-topnav__login">
              Log in
            </Link>
          )}
        </div>
      </header>
      <div
        className={`ui-topnav-spacer${compact ? ' ui-topnav-spacer--compact' : ''}`}
        aria-hidden="true"
      />
    </>
  )
}
