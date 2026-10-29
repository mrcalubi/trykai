import { useEffect } from 'react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { useNoIndex } from '../lib/pageTitle'

/**
 * React Router swallows render errors in production unless a route sets
 * errorElement. Capturing here is what makes those errors show up in Sentry.
 */
export default function RouteError() {
  const error = useRouteError()
  useNoIndex()

  useEffect(() => {
    if (isRouteErrorResponse(error)) return
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="page page--narrow page--centered">
      <h1>Something went wrong</h1>
      <p>Try again, or go back to browse.</p>
      <Link to="/" className="back-link">
        ← Back to browse
      </Link>
    </div>
  )
}
