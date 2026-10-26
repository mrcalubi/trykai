import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ACCOUNT_UPDATED_EVENT, firstAccountRow } from '../lib/myAccount'
import TopNav from './ui/TopNav'

/**
 * Live chrome: the TopNav wired to the real session.
 *
 * Mounted once in App so every route gets the same bar. The style-guide renders
 * TopNav directly with made-up props; this is the only place it reads auth.
 */
export default function SiteNav() {
  const [user, setUser] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState(null)

  useEffect(() => {
    function applySession(session) {
      const nextUser = session?.user ?? null
      setUser(nextUser)
      if (!nextUser) {
        setDisplayName('')
        setAvatarUrl('')
        setIsAdmin(false)
        setVerificationStatus(null)
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return undefined

    function loadAccount() {
      supabase.rpc('my_account').then(({ data, error }) => {
        const row = firstAccountRow(data)
        setDisplayName(!error && row?.display_name ? row.display_name : '')
        setAvatarUrl(!error && row?.avatar_url ? row.avatar_url : '')
      })
    }

    loadAccount()

    // `is_admin` has no client SELECT grant, so the menu asks the same
    // caller-scoped function RequireAdmin uses. The review function checks
    // again server-side; this only decides whether to show the link.
    // `verification_status` here picks Host a session vs Become a host.
    supabase.rpc('my_verification').then(({ data, error }) => {
      const row = Array.isArray(data) ? data[0] : data
      setIsAdmin(!error && Boolean(row?.is_admin))
      setVerificationStatus(error ? null : row?.verification_status ?? null)
    })

    window.addEventListener(ACCOUNT_UPDATED_EVENT, loadAccount)
    return () => window.removeEventListener(ACCOUNT_UPDATED_EVENT, loadAccount)
  }, [user])

  return (
    <TopNav
      isLoggedIn={Boolean(user)}
      isAdmin={isAdmin}
      verificationStatus={verificationStatus}
      userId={user?.id}
      avatarUrl={avatarUrl || undefined}
      name={displayName}
    />
  )
}
