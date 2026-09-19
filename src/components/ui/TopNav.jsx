import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
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

function AccountMenu({ avatarUrl, name, onLogout, onOpen }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const menuId = useId()
  const buttonId = useId()

  function closeMenu({ restoreFocus = false } = {}) {
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }

  function openMenu() {
    onOpen?.()
    setOpen(true)
  }

  function toggleMenu() {
    if (open) {
      closeMenu()
      return
    }
    openMenu()
  }

  useLayoutEffect(() => {
    if (!open) return
    menuRef.current?.querySelector('[role="menuitem"]')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      if (wrapRef.current?.contains(event.target)) return
      const interactive =
        event.target instanceof Element &&
        event.target.closest(
          'a, button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])'
        )
      closeMenu({ restoreFocus: !interactive })
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu({ restoreFocus: true })
        return
      }

      if (event.key === 'Tab') {
        closeMenu({ restoreFocus: true })
        return
      }

      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return

      const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]') ?? [])]
      if (items.length === 0) return

      event.preventDefault()
      const currentIndex = items.indexOf(document.activeElement)
      const delta = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex =
        currentIndex === -1
          ? event.key === 'ArrowDown'
            ? 0
            : items.length - 1
          : (currentIndex + delta + items.length) % items.length
      items[nextIndex].focus()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  return (
    <div className="ui-account" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        id={buttonId}
        className="ui-account__trigger"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={toggleMenu}
        onKeyDown={(event) => {
          if (open) return
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            openMenu()
          }
        }}
      >
        <TopNavAccount avatarUrl={avatarUrl} name={name} />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          className="ui-account-menu"
          role="menu"
          aria-labelledby={buttonId}
        >
          <Link
            to="/settings"
            role="menuitem"
            className="ui-account-menu__item"
            onClick={() => closeMenu()}
          >
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            className="ui-account-menu__item"
            onClick={() => {
              closeMenu()
              onLogout?.()
            }}
          >
            Log out
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default function TopNav({
  isLoggedIn = false,
  isAdmin = false,
  isHost = false,
  avatarUrl,
  name,
  onMenuClick,
  onLogout,
  className = '',
}) {
  const [compact, setCompact] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountMenuKey, setAccountMenuKey] = useState(0)

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
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen])

  function handleMenuToggle() {
    setMenuOpen((open) => !open)
    setAccountMenuKey((key) => key + 1)
    onMenuClick?.()
  }

  function handleMenuClose() {
    setMenuOpen(false)
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
              <AccountMenu
                key={accountMenuKey}
                avatarUrl={avatarUrl}
                name={name}
                onLogout={onLogout}
                onOpen={handleMenuClose}
              />
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
          isLoggedIn={isLoggedIn}
          isAdmin={isAdmin}
          isHost={isHost}
        />
      </div>
      <div
        className={`ui-topnav-spacer${compact ? ' ui-topnav-spacer--compact' : ''}`}
        aria-hidden="true"
      />
    </>
  )
}
