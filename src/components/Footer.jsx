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
        <Link to="/terms" className="site-footer__link">
          Terms
        </Link>
        <Link to="/privacy" className="site-footer__link">
          Privacy
        </Link>
      </div>
      <div className="site-footer__meta">
        <span>UEN 53526159D</span>
        <a href="mailto:privacy@trykai.sg">privacy@trykai.sg</a>
      </div>
    </footer>
  )
}
