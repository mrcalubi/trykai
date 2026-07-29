import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <Link to="/refund-policy" className="site-footer__link">
          Refund Policy
        </Link>
        <Link to="/cancellation-policy" className="site-footer__link">
          Cancellation Policy
        </Link>
        <Link to="/dispute-policy" className="site-footer__link">
          Dispute Policy
        </Link>
      </div>
    </footer>
  )
}
