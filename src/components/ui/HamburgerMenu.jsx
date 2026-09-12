import { Link } from 'react-router-dom'

const LOGGED_OUT_LINKS = [
  { label: 'Log in or sign up', to: '/login' },
  { label: 'Browse', to: '/' },
  { label: 'Cancellation policy', to: '/cancellation-policy' },
  { label: 'Refund policy', to: '/refund-policy' },
  { label: 'Dispute policy', to: '/dispute-policy' },
]

function loggedInLinks(isAdmin) {
  return [
    { label: 'Browse', to: '/' },
    { label: 'My bookings', to: '/dashboard' },
    { label: 'Create listing', to: '/create-listing' },
    ...(isAdmin ? [{ label: 'Verification review', to: '/admin/verifications' }] : []),
    { label: 'Profile', to: '#' },
    { label: 'Settings', to: '#' },
    { label: 'Log out', to: '#', action: 'logout' },
  ]
}

const STAGGER_MS = 45

export default function HamburgerMenu({
  open = false,
  onClose,
  onLogout,
  isLoggedIn = false,
  isAdmin = false,
  className = '',
}) {
  const links = isLoggedIn ? loggedInLinks(isAdmin) : LOGGED_OUT_LINKS

  function handleLinkClick(event, link) {
    if (link.action === 'logout' && onLogout) {
      event.preventDefault()
      onLogout()
    }
    onClose?.()
  }
  const classes = [
    'ui-hamburger',
    open ? 'ui-hamburger--open' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} aria-hidden={!open}>
      <button
        type="button"
        className="ui-hamburger__backdrop"
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <nav
        id="ui-hamburger-panel"
        className="ui-hamburger__panel"
        aria-label="Main menu"
      >
        <ul className="ui-hamburger__list">
          {links.map((link, index) => {
            const delayMs = open
              ? index * STAGGER_MS
              : (links.length - 1 - index) * STAGGER_MS

            return (
              <li
                key={link.label}
                className="ui-hamburger__item"
                style={{ transitionDelay: `${delayMs}ms` }}
              >
                <Link
                  to={link.to}
                  className="ui-hamburger__link"
                  tabIndex={open ? 0 : -1}
                  onClick={(event) => handleLinkClick(event, link)}
                >
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
