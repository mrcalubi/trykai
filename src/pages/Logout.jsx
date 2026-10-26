import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PageLoader from '../components/PageLoader'

/**
 * Signs out, then replaces the URL with Home. Controls only navigate here so
 * a dirty Settings / Edit listing form can still ask before the session goes.
 */
export default function Logout() {
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false

    async function leave() {
      const { error } = await supabase.auth.signOut()
      if (error) {
        await supabase.auth.signOut({ scope: 'local' })
      }
      if (!cancelled) navigate('/', { replace: true })
    }

    void leave()
    return () => {
      cancelled = true
    }
  }, [navigate])

  return <PageLoader />
}
