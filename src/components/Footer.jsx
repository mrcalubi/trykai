import { Link } from 'react-router-dom'
import { TRYKAI_SOCIALS } from '../lib/socials'
import { SocialGlyph } from './profile/ProfileBits'

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
          <div className="site-footer__socials">
            <a
              className="site-footer__social"
              href={TRYKAI_SOCIALS.instagram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="TryKai on Instagram"
            >
              <SocialGlyph kind="instagram" size={18} />
            </a>
            <a
              className="site-footer__social"
              href={TRYKAI_SOCIALS.tiktok}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="TryKai on TikTok"
            >
              <SocialGlyph kind="tiktok" size={18} />
            </a>
          </div>
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
