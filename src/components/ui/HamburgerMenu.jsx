import { Link } from 'react-router-dom'

const LOGGED_OUT_LINKS = [
  { label: 'Log in or sign up', to: '/login' },
  { label: 'Browse', to: '/' },
  { label: 'Cancellation policy', to: '/cancellation-policy' },
  { label: 'Refund policy', to: '/refund-policy' },
  { label: 'Dispute policy', to: '/dispute-policy' },
]

function loggedInItems({ isAdmin, isHost, userId }) {
  return [
    { label: 'Browse', to: '/' },
    {
      label: isHost ? 'Create listing' : 'Become a host',
      to: '/create-listing',
    },
    ...(isAdmin ? [{ label: 'Verification review', to: '/admin/verifications' }] : []),
    ...(userId ? [{ label: 'Profile', to: `/u/${userId}` }] : []),
    { label: 'Settings', to: '/settings' },
    { label: 'Log out', action: 'logout' },
  ]
}

const STAGGER_MS = 45

export default function HamburgerMenu({
  open = false,
  onClose,
  onLogOut,
  isLoggedIn = false,
  isAdmin = false,
  isHost = false,
  userId,
  className = '',
}) {
  const items = isLoggedIn ? loggedInItems({ isAdmin, isHost, userId }) : LOGGED_OUT_LINKS

  function handleLinkClick() {
    onClose?.()
  }

  async function handleLogOut() {
    onClose?.()
    await onLogOut?.()
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
          {items.map((item, index) => {
            const delayMs = open
              ? index * STAGGER_MS
              : (items.length - 1 - index) * STAGGER_MS
            const itemClasses = [
              'ui-hamburger__item',
              item.action === 'logout' ? 'ui-hamburger__item--logout' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <li
                key={item.label}
                className={itemClasses}
                style={{ transitionDelay: `${delayMs}ms` }}
              >
                {item.action === 'logout' ? (
                  <button
                    type="button"
                    className="ui-hamburger__link"
                    tabIndex={open ? 0 : -1}
                    onClick={handleLogOut}
                  >
                    {item.label}
                  </button>
                ) : (
                  <Link
                    to={item.to}
                    className="ui-hamburger__link"
                    tabIndex={open ? 0 : -1}
                    onClick={handleLinkClick}
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
