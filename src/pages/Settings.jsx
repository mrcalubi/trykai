import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import { getInitials } from '../components/ui/getInitials'

export default function Settings() {
  const userId = useAuthedUserId()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('')
  const [nameError, setNameError] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadProfile = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('users')
      .select('full_name, email, avatar_url')
      .eq('id', userId)
      .single()

    if (loadError) {
      setError(loadError.message)
      setLoading(false)
      return
    }

    setFullName(data?.full_name || '')
    setEmail(data?.email || '')
    setAvatarUrl(data?.avatar_url || '')
    setLoading(false)
  }, [userId])

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
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl)
    }
  }, [avatarPreviewUrl])

  function handleAvatarChange(event) {
    const file = Array.from(event.target.files ?? []).find((candidate) =>
      candidate.type.startsWith('image/')
    )
    event.target.value = ''
    if (!file) return

    setAvatarPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return URL.createObjectURL(file)
    })
    setAvatarFile(file)
  }

  async function uploadAvatar() {
    const ext = avatarFile.name.split('.').pop() || 'jpg'
    const path = `${userId}/avatar-${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('listing-photos')
      .upload(path, avatarFile)

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from('listing-photos').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleSave(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setNameError('')

    const name = fullName.trim()
    if (!name) {
      setNameError('Please enter your full name.')
      return
    }

    setSaving(true)

    let nextAvatarUrl = avatarUrl
    if (avatarFile) {
      try {
        nextAvatarUrl = await uploadAvatar()
      } catch (uploadError) {
        setSaving(false)
        setError(uploadError.message)
        return
      }
    }

    const payload = { full_name: name }
    if (avatarFile) payload.avatar_url = nextAvatarUrl

    const { error: updateError } = await supabase
      .from('users')
      .update(payload)
      .eq('id', userId)

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setFullName(name)
    setAvatarUrl(nextAvatarUrl)
    setAvatarFile(null)
    setAvatarPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous)
      return ''
    })
    setSuccess('Your profile has been saved.')
  }

  if (loading) {
    return <p className="status-message">Loading…</p>
  }

  const previewSrc = avatarPreviewUrl || avatarUrl
  const initials = getInitials(fullName)

  return (
    <div className="page page--form settings-page">
      <div className="form-card">
        <h1 className="form-card__title">Settings</h1>
        <p className="form-card__subtitle">Your name and photo, as they appear on TryKai.</p>

        {success && (
          <p className="settings-banner settings-banner--success" role="status">
            {success}
          </p>
        )}
        {error && (
          <p className="settings-banner settings-banner--error" role="alert">
            {error}
          </p>
        )}

        <form onSubmit={handleSave} className="form">
          <div className="settings-avatar">
            {previewSrc ? (
              <img src={previewSrc} alt="" className="settings-avatar__image" />
            ) : (
              <span className="settings-avatar__initials" aria-hidden="true">
                {initials || '?'}
              </span>
            )}
          </div>

          <Input
            id="settings-full-name"
            label="Full name"
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoComplete="name"
            error={nameError}
          />

          <Input
            id="settings-avatar"
            label="Profile photo"
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
          />

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

          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </form>

        <section className="settings-delete" aria-labelledby="settings-delete-heading">
          <h2 id="settings-delete-heading" className="settings-delete__title">
            Delete your account
          </h2>
          <p className="settings-delete__copy">
            Account deletion is not available in the app yet. To delete your account, email{' '}
            <a href="mailto:hello@trykai.sg">hello@trykai.sg</a>. Transaction records may need
            to be kept for dispute and tax purposes while personal data is removed, and that
            process has not been designed.
          </p>
        </section>
      </div>
    </div>
  )
}
