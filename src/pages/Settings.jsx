import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import PageLoader from '../components/PageLoader'
import Avatar from '../components/ui/Avatar'
import ProfilePhotoFlow from '../components/ProfilePhotoFlow'
import { firstAccountRow } from '../lib/myAccount'
import { hasAvatarPhoto } from '../lib/avatarPhoto'
import { PAGE_LOAD_ERROR, withIssuedAtRetry } from '../lib/pageLoad'

export default function Settings() {
  const userId = useAuthedUserId()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [nameError, setNameError] = useState('')
  const [displayNameError, setDisplayNameError] = useState('')
  const [error, setError] = useState('')
  const [saveStatus, setSaveStatus] = useState('')
  const [saveStatusKind, setSaveStatusKind] = useState('success')
  const [saveStatusFading, setSaveStatusFading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadProfile = useCallback(async () => {
    const { data, error: loadError } = await withIssuedAtRetry(() =>
      supabase.rpc('my_account')
    )
    const row = firstAccountRow(data)

    if (loadError || !row) {
      setError(PAGE_LOAD_ERROR)
      setLoading(false)
      return
    }

    setFullName(row.full_name || '')
    setDisplayName(row.display_name || '')
    setBio(row.bio || '')
    setEmail(row.email || '')
    setAvatarUrl(row.avatar_url || '')
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) loadProfile()
    })

    return () => {
      cancelled = true
    }
  }, [loadProfile])

  useEffect(() => {
    if (!saveStatus || saveStatusKind !== 'success') return undefined
    const fade = window.setTimeout(() => setSaveStatusFading(true), 4000)
    const clear = window.setTimeout(() => {
      setSaveStatus('')
      setSaveStatusFading(false)
    }, 4400)
    return () => {
      window.clearTimeout(fade)
      window.clearTimeout(clear)
    }
  }, [saveStatus, saveStatusKind])

  function clearSaveFeedback() {
    setSaveStatus('')
    setSaveStatusFading(false)
  }

  async function handleSave(event) {
    event.preventDefault()
    setError('')
    setSaveStatus('')
    setSaveStatusFading(false)
    setNameError('')
    setDisplayNameError('')

    const name = fullName.trim()
    const handle = displayName.trim()
    if (!name) {
      setNameError('Please enter your full name.')
      return
    }
    if (!handle) {
      setDisplayNameError('Please enter a display name.')
      return
    }
    if (handle.length > 40) {
      setDisplayNameError('Display name must be 40 characters or fewer.')
      return
    }

    setSaving(true)

    const payload = {
      full_name: name,
      display_name: handle,
      bio: bio.trim() || null,
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(payload)
      .eq('id', userId)

    setSaving(false)

    if (updateError) {
      setSaveStatusKind('error')
      setSaveStatus(updateError.message)
      return
    }

    setFullName(name)
    setDisplayName(handle)
    setBio(bio.trim())
    setSaveStatusKind('success')
    setSaveStatus('Saved')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  if (loading) {
    return <PageLoader />
  }

  const hasPhoto = hasAvatarPhoto(avatarUrl)

  return (
    <div className="page page--form settings-page">
      <div className="form-card">
        <h1 className="form-card__title">Settings</h1>
        <p className="form-card__subtitle">Your public profile and account.</p>

        {error ? (
          <p className="settings-banner settings-banner--error" role="alert">
            {error}
          </p>
        ) : null}

        <section className="settings-group" aria-labelledby="settings-profile-heading">
          <h2 id="settings-profile-heading" className="settings-group__title">
            Profile
          </h2>

          <form onSubmit={handleSave} className="form">
            <ProfilePhotoFlow userId={userId} onAvatarUrlChange={setAvatarUrl}>
              {({ changePhoto, removePhoto, status, statusKind, busy }) => (
                <div className="settings-photo">
                  <div className="settings-avatar">
                    <Avatar
                      avatarUrl={avatarUrl}
                      displayName={displayName}
                      size={72}
                      className={hasPhoto ? 'settings-avatar__image' : ''}
                    />
                  </div>
                  <div className="settings-photo__actions">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={changePhoto}
                      loading={busy}
                      loadingLabel="Updating photo"
                    >
                      Change photo
                    </Button>
                    {hasPhoto ? (
                      <Button type="button" variant="secondary" onClick={removePhoto} disabled={busy}>
                        Remove photo
                      </Button>
                    ) : null}
                    {status ? (
                      <p
                        className={[
                          'settings-photo-status',
                          statusKind === 'error' ? 'settings-photo-status--error' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        role={statusKind === 'error' ? 'alert' : 'status'}
                      >
                        {status}
                      </p>
                    ) : null}
                  </div>
                </div>
              )}
            </ProfilePhotoFlow>

            <Input
              id="settings-display-name"
              label="Display name"
              type="text"
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value)
                clearSaveFeedback()
              }}
              autoComplete="nickname"
              maxLength={40}
              hint="Shown on your profile and reviews."
              error={displayNameError}
            />

            <div className="settings-bio">
              <Input
                id="settings-bio"
                label="About you"
                type="textarea"
                value={bio}
                onChange={(event) => {
                  setBio(event.target.value)
                  clearSaveFeedback()
                }}
                maxLength={500}
                rows={4}
                hint="Tell guests a bit about yourself and what you love sharing."
              />
              <p className="settings-bio__count" aria-live="polite">
                {bio.length}/500
              </p>
            </div>

            <Input
              id="settings-full-name"
              label="Full name"
              type="text"
              value={fullName}
              onChange={(event) => {
                setFullName(event.target.value)
                clearSaveFeedback()
              }}
              autoComplete="name"
              hint="Private, never shown publicly."
              error={nameError}
            />

            <div className="settings-save">
              <Button type="submit" variant="primary" loading={saving} loadingLabel="Saving">
                Save changes
              </Button>
              {saveStatus ? (
                <p
                  className={[
                    'settings-save-status',
                    saveStatusKind === 'error' ? 'settings-save-status--error' : '',
                    saveStatusFading ? 'settings-save-status--fade' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role={saveStatusKind === 'error' ? 'alert' : 'status'}
                >
                  {saveStatus}
                </p>
              ) : null}
            </div>
          </form>
        </section>

        <section className="settings-group" aria-labelledby="settings-account-heading">
          <h2 id="settings-account-heading" className="settings-group__title">
            Account
          </h2>

          <div className="settings-email">
            <Input
              id="settings-email"
              label="Email"
              type="email"
              value={email}
              readOnly
              disabled
              autoComplete="email"
            />
            <p className="settings-hint">
              Email cannot be changed here. To change it, contact support at{' '}
              <a href="mailto:hello@trykai.sg">hello@trykai.sg</a>.
            </p>
          </div>

          <p className="settings-delete__copy">
            Account deletion is not available in the app yet. To delete your account, email{' '}
            <a href="mailto:hello@trykai.sg">hello@trykai.sg</a>. Transaction records may need
            to be kept for dispute and tax purposes while personal data is removed, and that
            process has not been designed.
          </p>
        </section>

        <div className="settings-logout">
          <Button type="button" variant="secondary" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </div>
    </div>
  )
}
