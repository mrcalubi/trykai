import { Link } from 'react-router-dom'

const LOGGED_OUT_LINKS = [
  { label: 'Log in or sign up', to: '/login' },
  { label: 'Browse', to: '/' },
  { label: 'Cancellation policy', to: '/cancellation-policy' },
  { label: 'Refund policy', to: '/refund-policy' },
  { label: 'Dispute policy', to: '/dispute-policy' },
]

const LOGGED_IN_LINKS = [
  { label: 'Browse', to: '/' },
  { label: 'My bookings', to: '/dashboard' },
  { label: 'Create listing', to: '/create-listing' },
  { label: 'Profile', to: '#' },
  { label: 'Settings', to: '#' },
  { label: 'Log out', to: '#' },
]

export default function HamburgerMenu({
  open = false,
  onClose,
  isLoggedIn = false,
  className = '',
}) {
  const links = isLoggedIn ? LOGGED_IN_LINKS : LOGGED_OUT_LINKS
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
          {links.map((link) => (
            <li key={link.label}>
              <Link
                to={link.to}
                className="ui-hamburger__link"
                tabIndex={open ? 0 : -1}
                onClick={onClose}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
