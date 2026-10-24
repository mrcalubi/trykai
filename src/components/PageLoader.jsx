import { useEffect, useState } from 'react'

export const PAGE_LOADER_DELAY_MS = 400

export default function PageLoader({ label = 'Loading…' }) {
  const [showSpinner, setShowSpinner] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setShowSpinner(true), PAGE_LOADER_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <div className="page-loader" role="status">
      <span className="visually-hidden">{label}</span>
      {showSpinner ? <span className="tk-spinner page-loader__spinner" aria-hidden="true" /> : null}
    </div>
  )
}
