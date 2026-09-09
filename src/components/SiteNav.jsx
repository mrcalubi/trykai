import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import TopNav from './ui/TopNav'

/**
 * Live chrome: the TopNav wired to the real session.
 *
 * Mounted once in App so every route gets the same bar. The style-guide renders
 * TopNav directly with made-up props; this is the only place it reads auth.
 */
export default function SiteNav() {
  const navigate = useNavigate()

  const [user, setUser] = useState(null)
  const [fullName, setFullName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')

  useEffect(() => {
    function applySession(session) {
      const nextUser = session?.user ?? null
      setUser(nextUser)
      if (!nextUser) {
        setFullName('')
        setAvatarUrl('')
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
    if (!user) return

    supabase
      .from('users')
      .select('full_name, avatar_url')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setFullName(data?.full_name || '')
        setAvatarUrl(data?.avatar_url || '')
      })
  }, [user])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <TopNav
      isLoggedIn={Boolean(user)}
      avatarUrl={avatarUrl || undefined}
      name={fullName || user?.email || ''}
      onLogout={handleLogout}
    />
  )
}
