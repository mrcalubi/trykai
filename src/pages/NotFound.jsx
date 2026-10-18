import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="page page--narrow page--centered">
      <h1>Page not found</h1>
      <p>The link may be broken, or the page may have been removed.</p>
      <Link to="/" className="back-link">
        ← Back to browse
      </Link>
    </div>
  )
}
