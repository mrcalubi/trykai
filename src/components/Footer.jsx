import { Link } from 'react-router-dom'

const COLUMNS = [
  {
    title: 'Explore',
    links: [
      { label: 'Browse sessions', to: '/' },
      { label: 'Log in or sign up', to: '/login' },
    ],
  },
  {
    title: 'Hosting',
    links: [
      { label: 'Become a host', to: '/verify-identity' },
      { label: 'Hosting dashboard', to: '/hosting' },
    ],
  },
  {
    title: 'Policies',
    links: [
      { label: 'Refund Policy', to: '/refund-policy' },
      { label: 'Cancellation Policy', to: '/cancellation-policy' },
      { label: 'Dispute Policy', to: '/dispute-policy' },
      { label: 'Terms', to: '/terms' },
      { label: 'Privacy', to: '/privacy' },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <Link to="/" className="site-footer__logo">
            <img src="/trykai.png" alt="" width="40" height="40" />
            <span>
              TryKai<span className="site-footer__dot">.</span>
            </span>
          </Link>
          <p className="site-footer__tagline">
            Learn something real from your neighbours. Hands-on sessions with ID-verified hosts,
            all over Singapore.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} className="site-footer__column" aria-label={column.title}>
            <p className="site-footer__heading">{column.title}</p>
            {column.links.map((link) => (
              <Link key={link.label} to={link.to} className="site-footer__link">
                {link.label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <div className="site-footer__meta">
        <span>© {new Date().getFullYear()} TryKai · Singapore</span>
        <span>UEN 53526159D</span>
        <a href="mailto:privacy@trykai.sg">privacy@trykai.sg</a>
      </div>
    </footer>
  )
}
