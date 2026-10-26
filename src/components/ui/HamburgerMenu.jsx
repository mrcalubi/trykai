import { Link } from 'react-router-dom'
import { hostEntry } from '../../lib/hostEntry'
import Icon from './Icon'

// `divided` draws a rule above the row, so related rows read as groups.
const LOGGED_OUT_ITEMS = [
  { label: 'Log in or sign up', to: '/login', icon: 'login', strong: true },
  { label: 'Browse', to: '/', icon: 'search', divided: true },
  { label: 'Cancellation policy', to: '/cancellation-policy', icon: 'document', divided: true },
  { label: 'Refund policy', to: '/refund-policy', icon: 'document' },
  { label: 'Dispute policy', to: '/dispute-policy', icon: 'document' },
]

const HOST_BLURB = {
  'Become a host': 'Teach what you love, on your own schedule.',
  'Host a session': 'Create a listing or add new dates.',
}

function loggedInItems({ isAdmin, verificationStatus, userId }) {
  const host = hostEntry(verificationStatus)
  return [
    { label: 'Browse', to: '/', icon: 'search' },
    ...(userId ? [{ label: 'Profile', to: `/u/${userId}`, icon: 'user' }] : []),
    { label: 'Settings', to: '/settings', icon: 'settings' },
    { ...host, promo: HOST_BLURB[host.label], divided: true },
    ...(isAdmin
      ? [
          { label: 'Listing review', to: '/admin/listings', icon: 'document', divided: true },
          { label: 'Verification review', to: '/admin/verifications', icon: 'shield' },
        ]
      : []),
    { label: 'Log out', to: '/logout', icon: 'logout', divided: true },
  ]
}

const STAGGER_MS = 18

function itemId(label) {
  return `ui-hamburger-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

/**
 * The main menu: a card that drops down from the menu button at the right of
 * the top nav. A transparent backdrop behind it closes it on an outside click.
 */
export default function HamburgerMenu({
  open = false,
  onClose,
  isLoggedIn = false,
  isAdmin = false,
  verificationStatus,
  userId,
  className = '',
}) {
  const items = isLoggedIn
    ? loggedInItems({ isAdmin, verificationStatus, userId })
    : LOGGED_OUT_ITEMS

  function handleLinkClick() {
    onClose?.()
  }

  const classes = ['ui-hamburger', open ? 'ui-hamburger--open' : '', className]
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
      <nav id="ui-hamburger-panel" className="ui-hamburger__panel" aria-label="Main menu">
        <ul className="ui-hamburger__list">
          {items.map((item, index) => {
            const itemClasses = [
              'ui-hamburger__item',
              item.divided ? 'ui-hamburger__item--divided' : '',
              item.to === '/logout' ? 'ui-hamburger__item--logout' : '',
            ]
              .filter(Boolean)
              .join(' ')
            const linkClasses = [
              'ui-hamburger__link',
              item.strong ? 'ui-hamburger__link--strong' : '',
              item.promo ? 'ui-hamburger__link--promo' : '',
            ]
              .filter(Boolean)
              .join(' ')
            const id = itemId(item.label)

            return (
              <li
                key={item.label}
                className={itemClasses}
                style={{ transitionDelay: `${open ? index * STAGGER_MS : 0}ms` }}
              >
                {item.promo ? (
                  <Link
                    to={item.to}
                    className={linkClasses}
                    tabIndex={open ? 0 : -1}
                    onClick={handleLinkClick}
                    aria-labelledby={`${id}-title`}
                    aria-describedby={`${id}-blurb`}
                  >
                    <span className="ui-hamburger__promo-copy">
                      <span id={`${id}-title`} className="ui-hamburger__promo-title">
                        {item.label}
                      </span>
                      <span id={`${id}-blurb`} className="ui-hamburger__promo-blurb">
                        {item.promo}
                      </span>
                    </span>
                    <img src="/trykai.png" alt="" className="ui-hamburger__promo-art" />
                  </Link>
                ) : (
                  <Link
                    to={item.to}
                    className={linkClasses}
                    tabIndex={open ? 0 : -1}
                    onClick={handleLinkClick}
                  >
                    <Icon name={item.icon} size={20} />
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
