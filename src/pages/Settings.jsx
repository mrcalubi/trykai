import { useCallback, useEffect, useId, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import PageLoader from '../components/PageLoader'
import Avatar from '../components/ui/Avatar'
import PhotoCropDialog from '../components/PhotoCropDialog'
import ProfilePhotoFlow from '../components/ProfilePhotoFlow'
import { ProfileBanner, SocialGlyph } from '../components/profile/ProfileBits'
import { firstAccountRow, notifyAccountUpdated } from '../lib/myAccount'
import { hasAvatarPhoto, uploadBannerFile } from '../lib/avatarPhoto'
import { compressImage } from '../lib/compressImage'
import { cropImageToBlob, loadImage, revokeIfBlobUrl } from '../lib/coverCrop'
import { HEIC_READ_ERROR, IMAGE_ACCEPT, isHeicFile, isHeicReadError, isImageFile } from '../lib/heicImage'
import { PAGE_LOAD_ERROR, withIssuedAtRetry } from '../lib/pageLoad'
import {
  BANNER_ASPECT,
  BANNER_PRESETS,
  DEFAULT_BANNER,
  clip,
  handleError,
  normalizeHandle,
  reviewerName,
  starsText,
} from '../lib/profileV2'
import { settingsDraft } from '../lib/unsavedDraft'
import { useUnsavedChangesGuard } from '../lib/useUnsavedChangesGuard'

const PROFILE_V2_COLUMNS =
  'banner_preset, banner_url, featured_review_id, instagram_handle, tiktok_handle'

const EMPTY_V2 = {
  bannerPreset: null,
  bannerUrl: '',
  instagram: '',
  tiktok: '',
  featuredReviewId: null,
}

function v2FromRow(row) {
  return {
    bannerPreset: row?.banner_preset ?? null,
    bannerUrl: row?.banner_url ?? '',
    instagram: row?.instagram_handle ?? '',
    tiktok: row?.tiktok_handle ?? '',
    featuredReviewId: row?.featured_review_id ?? null,
  }
}

export default function Settings() {
  const userId = useAuthedUserId()
  const location = useLocation()
  const bannerInputId = useId()

  const [fullName, setFullName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [isHost, setIsHost] = useState(false)
  const [v2Available, setV2Available] = useState(false)
  const [v2, setV2] = useState(EMPTY_V2)
  const [savedV2, setSavedV2] = useState(EMPTY_V2)
  const [reviews, setReviews] = useState([])
  const [nameError, setNameError] = useState('')
  const [displayNameError, setDisplayNameError] = useState('')
  const [socialErrors, setSocialErrors] = useState({ instagram: '', tiktok: '' })
  const [error, setError] = useState('')
  const [saveStatus, setSaveStatus] = useState('')
  const [saveStatusKind, setSaveStatusKind] = useState('success')
  const [saveStatusFading, setSaveStatusFading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedDraft, setSavedDraft] = useState(null)
  const [bannerCrop, setBannerCrop] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState(null)
  const [bannerBusy, setBannerBusy] = useState(false)
  const [bannerError, setBannerError] = useState('')

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

    // 00041 columns. Until the migration is applied the read fails and the
    // banner, socials and featured review sections stay hidden.
    const v2Result = await supabase
      .from('users')
      .select(PROFILE_V2_COLUMNS)
      .eq('id', userId)
      .single()
    const hasV2 = !v2Result.error
    const nextV2 = hasV2 ? v2FromRow(v2Result.data) : EMPTY_V2

    let hostReviews = []
    if (hasV2 && row.is_host) {
      const { data: reviewRows, error: reviewsError } = await supabase.rpc('reviews_for_host', {
        p_host_id: userId,
      })
      if (!reviewsError) hostReviews = reviewRows ?? []
    }

    const nextFullName = row.full_name || ''
    const nextDisplayName = row.display_name || ''
    const nextBio = row.bio || ''
    setFullName(nextFullName)
    setDisplayName(nextDisplayName)
    setBio(nextBio)
    setEmail(row.email || '')
    setAvatarUrl(row.avatar_url || '')
    setIsHost(Boolean(row.is_host))
    setV2Available(hasV2)
    setV2(nextV2)
    setSavedV2(nextV2)
    setReviews(hostReviews)
    setSavedDraft(
      settingsDraft({
        fullName: nextFullName,
        displayName: nextDisplayName,
        bio: nextBio,
        ...nextV2,
      }),
    )
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
    if (loading) return
    const target = location.hash.slice(1)
    if (!target) return
    if (target === 'bio') {
      document.getElementById('bio')?.focus()
      return
    }
    if (target === 'socials') {
      document.getElementById('settings-instagram')?.focus()
      return
    }
    document.getElementById(target)?.scrollIntoView?.({ block: 'start' })
  }, [loading, location.hash])

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

  useEffect(() => {
    return () => {
      if (bannerCrop?.url) revokeIfBlobUrl(bannerCrop.url)
    }
  }, [bannerCrop])

  function clearSaveFeedback() {
    setSaveStatus('')
    setSaveStatusFading(false)
  }

  function updateV2(patch) {
    setV2((current) => ({ ...current, ...patch }))
    clearSaveFeedback()
  }

  function closeBannerCrop() {
    setBannerCrop((current) => {
      if (current?.url) revokeIfBlobUrl(current.url)
      return null
    })
    setCroppedArea(null)
  }

  async function handleBannerFile(event) {
    const file = Array.from(event.target.files ?? []).find(isImageFile)
    event.target.value = ''
    if (!file) return
    setBannerBusy(true)
    setBannerError('')
    try {
      const ready = await compressImage(file)
      if (isHeicFile(ready)) throw new Error(HEIC_READ_ERROR)
      setBannerCrop({ url: URL.createObjectURL(ready) })
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedArea(null)
    } catch (fileError) {
      setBannerError(isHeicReadError(fileError) ? HEIC_READ_ERROR : fileError.message || HEIC_READ_ERROR)
    } finally {
      setBannerBusy(false)
    }
  }

  async function applyBannerCrop() {
    if (!bannerCrop || !croppedArea) return
    setBannerBusy(true)
    try {
      const image = await loadImage(bannerCrop.url)
      const blob = await cropImageToBlob(image, croppedArea)
      const file = new File([blob], 'banner.jpg', { type: 'image/jpeg', lastModified: Date.now() })
      const compressed = await compressImage(file)
      const publicUrl = await uploadBannerFile(compressed, userId)
      updateV2({ bannerUrl: publicUrl })
      closeBannerCrop()
    } catch (uploadError) {
      console.error('Banner upload failed', uploadError)
      setBannerError(uploadError.message || "We couldn't upload that photo. Try another one.")
    } finally {
      setBannerBusy(false)
    }
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
    const instagram = normalizeHandle('instagram', v2.instagram)
    const tiktok = normalizeHandle('tiktok', v2.tiktok)
    const nextSocialErrors = {
      instagram: handleError('instagram', instagram),
      tiktok: handleError('tiktok', tiktok),
    }
    setSocialErrors(nextSocialErrors)

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
    if (v2Available && (nextSocialErrors.instagram || nextSocialErrors.tiktok)) return

    setSaving(true)

    const nextV2 = { ...v2, instagram, tiktok }
    const payload = {
      full_name: name,
      display_name: handle,
      bio: bio.trim() || null,
    }
    if (v2Available) {
      // Only send what changed, so a profile saved before 00041 behaves the same.
      if (nextV2.bannerPreset !== savedV2.bannerPreset) payload.banner_preset = nextV2.bannerPreset
      if (nextV2.bannerUrl !== savedV2.bannerUrl) payload.banner_url = nextV2.bannerUrl || null
      if (nextV2.instagram !== savedV2.instagram) payload.instagram_handle = nextV2.instagram || null
      if (nextV2.tiktok !== savedV2.tiktok) payload.tiktok_handle = nextV2.tiktok || null
      if (nextV2.featuredReviewId !== savedV2.featuredReviewId) {
        payload.featured_review_id = nextV2.featuredReviewId
      }
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

    const nextBio = bio.trim()
    setFullName(name)
    setDisplayName(handle)
    setBio(nextBio)
    setV2(nextV2)
    setSavedV2(nextV2)
    setSavedDraft(settingsDraft({ fullName: name, displayName: handle, bio: nextBio, ...nextV2 }))
    setSaveStatusKind('success')
    setSaveStatus('Saved')
    notifyAccountUpdated()
  }

  const currentDraft = settingsDraft({ fullName, displayName, bio, ...v2 })
  const isDirty = !loading && !saving && savedDraft != null && currentDraft !== savedDraft
  const unsavedGuard = useUnsavedChangesGuard(isDirty)

  if (loading) {
    return <PageLoader />
  }

  const hasPhoto = hasAvatarPhoto(avatarUrl)
  const selectedPreset = v2.bannerPreset ?? DEFAULT_BANNER
  const reviewChoices = reviews
    .slice()
    .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0))
    .slice(0, 8)

  return (
    <div className="page settings-page">
      {unsavedGuard}
      <form onSubmit={handleSave} className="edit-profile" noValidate>
        <header className="edit-profile__head">
          <h1 className="edit-profile__title">Edit profile</h1>
          <p className="edit-profile__subtitle">
            Changes show on your public profile once you save.
          </p>
        </header>

        {error ? (
          <p className="settings-banner settings-banner--error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="edit-profile__grid">
          <div className="edit-profile__main">
            {v2Available ? (
              <section id="banner" className="edit-card" aria-labelledby="settings-banner-heading">
                <h2 id="settings-banner-heading" className="edit-card__title">
                  Banner
                </h2>
                <div className="banner-picker" role="group" aria-label="Banner colour">
                  {BANNER_PRESETS.map((preset) => {
                    const selected = !v2.bannerUrl && selectedPreset === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={selected ? 'banner-swatch banner-swatch--selected' : 'banner-swatch'}
                        style={{ '--swatch': preset.bg, '--swatch-a': preset.a }}
                        aria-label={`${preset.label} banner`}
                        aria-pressed={selected}
                        onClick={() => updateV2({ bannerPreset: preset.id, bannerUrl: '' })}
                      >
                        {selected ? (
                          <span className="banner-swatch__tick" aria-hidden="true">
                            <Icon name="check" size={12} strokeWidth={3} />
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                  {v2.bannerUrl ? (
                    <button
                      type="button"
                      className="banner-swatch banner-swatch--photo banner-swatch--selected"
                      aria-label="Your banner photo"
                      aria-pressed="true"
                      style={{ backgroundImage: `url("${v2.bannerUrl}")` }}
                      onClick={() => document.getElementById(bannerInputId)?.click()}
                    >
                      <span className="banner-swatch__tick" aria-hidden="true">
                        <Icon name="check" size={12} strokeWidth={3} />
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="banner-swatch banner-swatch--upload"
                      disabled={bannerBusy}
                      onClick={() => document.getElementById(bannerInputId)?.click()}
                    >
                      <Icon name="image" size={18} strokeWidth={2} />
                      Upload photo
                    </button>
                  )}
                </div>
                <input
                  id={bannerInputId}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  aria-label="Banner photo"
                  className="visually-hidden"
                  onChange={handleBannerFile}
                />
                {v2.bannerUrl ? (
                  <div className="edit-card__row">
                    <button
                      type="button"
                      className="profile-text-button"
                      onClick={() => document.getElementById(bannerInputId)?.click()}
                    >
                      Change banner photo
                    </button>
                    <button
                      type="button"
                      className="profile-text-button"
                      onClick={() => updateV2({ bannerUrl: '' })}
                    >
                      Use a colour instead
                    </button>
                  </div>
                ) : null}
                {bannerError ? (
                  <p className="settings-photo-status settings-photo-status--error" role="alert">
                    {bannerError}
                  </p>
                ) : null}
                <p className="edit-card__hint">
                  Pick a TryKai colour or use your own photo. Photos are cropped to a wide banner.
                </p>
              </section>
            ) : null}

            <section className="edit-card" aria-labelledby="settings-profile-heading">
              <h2 id="settings-profile-heading" className="edit-card__title">
                Profile
              </h2>

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
                  id="bio"
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

              {v2Available ? (
                <div id="socials" className="edit-socials">
                  <div className="edit-socials__grid">
                    <SocialField
                      kind="instagram"
                      id="settings-instagram"
                      label="Instagram"
                      value={v2.instagram}
                      error={socialErrors.instagram}
                      onChange={(value) => {
                        setSocialErrors((current) => ({ ...current, instagram: '' }))
                        updateV2({ instagram: value })
                      }}
                    />
                    <SocialField
                      kind="tiktok"
                      id="settings-tiktok"
                      label="TikTok"
                      value={v2.tiktok}
                      error={socialErrors.tiktok}
                      onChange={(value) => {
                        setSocialErrors((current) => ({ ...current, tiktok: '' }))
                        updateV2({ tiktok: value })
                      }}
                    />
                  </div>
                  <p className="edit-card__hint">
                    Handles only. Guests see them on your profile. Bookings and payments always
                    stay on TryKai.
                  </p>
                </div>
              ) : null}
            </section>

            {v2Available && isHost ? (
              <section
                id="featured-review"
                className="edit-card"
                aria-labelledby="settings-featured-heading"
              >
                <h2 id="settings-featured-heading" className="edit-card__title">
                  Featured review
                </h2>
                {reviewChoices.length ? (
                  <fieldset className="featured-choices">
                    <legend className="edit-card__hint">
                      Pick the one guests see first. Reviews are shown exactly as written.
                    </legend>
                    {reviewChoices.map((review) => (
                      <label
                        key={review.id}
                        className={
                          v2.featuredReviewId === review.id
                            ? 'featured-choice featured-choice--selected'
                            : 'featured-choice'
                        }
                      >
                        <input
                          type="radio"
                          name="featured-review"
                          checked={v2.featuredReviewId === review.id}
                          onChange={() => updateV2({ featuredReviewId: review.id })}
                        />
                        <span className="featured-choice__text">
                          <span className="featured-choice__quote">
                            “{clip(review.comment, 110) || 'No comment, just stars.'}”
                          </span>
                          <span className="featured-choice__by">
                            {reviewerName(review)} ·{' '}
                            <span aria-label={`${review.rating} out of 5 stars`}>
                              {starsText(review.rating)}
                            </span>
                            {review.listing_title ? ` · ${review.listing_title}` : ''}
                          </span>
                        </span>
                      </label>
                    ))}
                    <label
                      className={
                        v2.featuredReviewId == null
                          ? 'featured-choice featured-choice--selected'
                          : 'featured-choice'
                      }
                    >
                      <input
                        type="radio"
                        name="featured-review"
                        checked={v2.featuredReviewId == null}
                        onChange={() => updateV2({ featuredReviewId: null })}
                      />
                      <span className="featured-choice__text">
                        Let TryKai pick (your latest 5-star review)
                      </span>
                    </label>
                  </fieldset>
                ) : (
                  <p className="edit-card__hint">
                    Your best review shows on your profile after your first session. You choose
                    which one here.
                  </p>
                )}
              </section>
            ) : null}
          </div>

          <aside className="edit-profile__aside">
            {v2Available ? (
              <div className="edit-preview" aria-hidden="true">
                <p className="eyebrow">Preview</p>
                <div className="edit-preview__card">
                  <ProfileBanner
                    preset={v2.bannerPreset}
                    imageUrl={v2.bannerUrl}
                    className="edit-preview__banner"
                  />
                  <div className="edit-preview__body">
                    <span className="edit-preview__avatar">
                      <Avatar avatarUrl={avatarUrl} displayName={displayName} fill />
                    </span>
                    <span className="edit-preview__name">{displayName.trim() || 'Your name'}</span>
                    {bio.trim() ? <span className="edit-preview__bio">{clip(bio, 90)}</span> : null}
                    {v2.instagram || v2.tiktok ? (
                      <span className="edit-preview__socials">
                        {v2.instagram ? (
                          <span>
                            <SocialGlyph kind="instagram" size={13} />
                            {normalizeHandle('instagram', v2.instagram)}
                          </span>
                        ) : null}
                        {v2.tiktok ? (
                          <span>
                            <SocialGlyph kind="tiktok" size={13} />
                            {normalizeHandle('tiktok', v2.tiktok)}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            <section className="edit-card" aria-labelledby="settings-account-heading">
              <h2 id="settings-account-heading" className="edit-card__title">
                Private details
              </h2>
              <p className="edit-card__hint">Never shown on your profile.</p>

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

              <div className="settings-logout">
                <Link to="/logout" className="ui-button ui-button--secondary">
                  Log out
                </Link>
              </div>
            </section>
          </aside>
        </div>

        <div className="settings-save edit-profile__bar">
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
          <Link to={userId ? `/u/${userId}` : '/'} className="ui-button ui-button--secondary">
            {isDirty ? 'Cancel' : 'Back to profile'}
          </Link>
          <Button type="submit" variant="primary" loading={saving} loadingLabel="Saving">
            Save changes
          </Button>
        </div>
      </form>

      {bannerCrop ? (
        <PhotoCropDialog
          title="Crop your banner"
          image={bannerCrop.url}
          aspect={BANNER_ASPECT}
          crop={crop}
          zoom={zoom}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, area) => setCroppedArea(area)}
          onApply={applyBannerCrop}
          applyDisabled={!croppedArea || bannerBusy}
          applyLabel={bannerBusy ? 'Uploading' : 'Use this crop'}
          onCancel={closeBannerCrop}
        />
      ) : null}
    </div>
  )
}

function SocialField({ kind, id, label, value, error, onChange }) {
  const hintId = `${id}-error`
  return (
    <div className="social-field">
      <label htmlFor={id} className="social-field__label">
        {label}
      </label>
      <span className={error ? 'social-field__box social-field__box--error' : 'social-field__box'}>
        <SocialGlyph kind={kind} size={18} />
        <span className="social-field__at" aria-hidden="true">
          @
        </span>
        <input
          id={id}
          type="text"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={80}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? hintId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
      {error ? (
        <p id={hintId} className="social-field__error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
