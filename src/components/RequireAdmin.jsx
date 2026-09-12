import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Gate for the internal review routes. `is_admin` has no client SELECT grant,
 * so this asks `my_verification()`, which returns only the caller's own row.
 * The Edge Function checks admin status again server-side; this only decides
 * what to render.
 */
export default function RequireAdmin({ children }) {
  const [state, setState] = useState('checking')

  useEffect(() => {
    let cancelled = false

    async function checkAdmin() {
      const { data, error } = await supabase.rpc('my_verification')
      if (cancelled) return
      const row = Array.isArray(data) ? data[0] : data
      setState(!error && row?.is_admin ? 'allowed' : 'denied')
    }

    void checkAdmin()

    return () => {
      cancelled = true
    }
  }, [])

  if (state === 'checking') {
    return <p className="status-message">Loading…</p>
  }

  if (state === 'denied') {
    return (
      <div className="page page--narrow page--centered">
        <p className="error-message">This page is for the TryKai team only.</p>
      </div>
    )
  }

  return children
}
