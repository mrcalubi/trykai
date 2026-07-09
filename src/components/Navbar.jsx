import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Navbar() {
  const navigate = useNavigate()
  const dropdownRef = useRef(null)

  const [user, setUser] = useState(null)
  const [fullName, setFullName] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) {
      setFullName('')
      return
    }

    supabase
      .from('users')
      .select('full_name')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setFullName(data?.full_name || '')
      })
  }, [user])

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    setDropdownOpen(false)
    navigate('/')
  }

  const initial = fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'

  return (
    <nav className="navbar">
      <Link to="/" className="navbar__logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <img
            src="/trykai.png"
            alt="TryKai logo"
            width="70"
            height="70"
            style={{ objectFit: 'contain' }}
          />
          <span style={{ fontFamily: 'Bricolage Grotesque', fontWeight: 800, fontSize: '22px', letterSpacing: '-0.04em', color: '#16264B' }}>TryKai</span>
        </div>
      </Link>

      <div className="navbar__actions">
        {user ? (
          <>
            <Link to="/create-listing" className="navbar__link-btn">
              Create listing
            </Link>
            <Link to="/dashboard" className="navbar__link">
              Dashboard
            </Link>
            <div ref={dropdownRef} className="navbar__avatar-wrap">
              <button
                type="button"
                onClick={() => setDropdownOpen((open) => !open)}
                className="navbar__avatar"
                aria-label="Account menu"
              >
                {initial}
              </button>
              {dropdownOpen && (
                <div className="navbar__dropdown">
                  <button type="button" onClick={handleLogout} className="navbar__dropdown-item">
                    Logout
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <Link to="/login" className="navbar__login">
            Login
          </Link>
        )}
      </div>
    </nav>
  )
}
