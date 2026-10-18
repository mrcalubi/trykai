import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import { CancellationPolicyInfo } from '../components/CancellationPolicy'
import PlanningAreaSelect from '../components/PlanningAreaSelect'
import PhotoTips from '../components/PhotoTips'
import Card from '../components/ui/Card'
import Icon from '../components/ui/Icon'
import { categoryIconName } from '../components/ui/categoryIcon'
import FormattedPrice from '../components/FormattedPrice'
import { foundingHostFromRpc } from '../lib/foundingHost'
import { formatGuestFacingPrice, hostPriceBreakdown, parsePriceInputCents } from '../lib/pricing'

const MAX_PHOTOS = 5
const MIN_GUESTS = 1
const MAX_GUESTS = 50

const CATEGORIES = ['Food', 'Fitness', 'Arts', 'Music', 'Language', 'Other']

const WHATS_PROVIDED_OPTIONS = ['Materials', 'Equipment', 'Food & drinks', 'None']

const DURATIONS = [
  { label: '1 hr', mins: 60 },
  { label: '1.5 hr', mins: 90 },
  { label: '2 hr', mins: 120 },
]

const STEPS = [
  {
    id: 'basics',
    label: 'Basics',
    title: 'The basics',
    intro: 'Say what guests will learn, in your own words.',
  },
  {
    id: 'photos',
    label: 'Photos',
    title: 'Add photos',
    intro: 'Real photos of your session, taken on your phone, are perfect.',
  },
  {
    id: 'price',
    label: 'Price',
    title: 'Price and group size',
    intro: 'Small, affordable sessions are what guests come to TryKai for.',
  },
  {
    id: 'location',
    label: 'Location',
    title: 'Where it happens',
    intro: 'Guests see only the area until they book.',
  },
  {
    id: 'finish',
    label: 'Publish',
    title: 'Final touches',
    intro: 'Say what you provide, check the cancellation policy and publish.',
  },
]

function draftKey(userId) {
  return `trykai:listing-draft:${userId}`
}

function readDraft(userId) {
  if (!userId) return null
  try {
    const raw = window.localStorage.getItem(draftKey(userId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function clearDraft(userId) {
  try {
    window.localStorage.removeItem(draftKey(userId))
  } catch {
    // Storage can be blocked; then there is no draft to clear.
  }
}

export default function CreateListing() {
  const navigate = useNavigate()
  const userId = useAuthedUserId()

  const [verificationStatus, setVerificationStatus] = useState(null)
  const [verificationChecked, setVerificationChecked] = useState(false)
  const [step, setStep] = useState(0)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('')
  const [maxGuests, setMaxGuests] = useState(4)
  const [durationChoice, setDurationChoice] = useState(null)
  const [otherMins, setOtherMins] = useState('')
  const [area, setArea] = useState('')
  const [fullAddress, setFullAddress] = useState('')
  const [whatsProvided, setWhatsProvided] = useState([])
  const [photos, setPhotos] = useState([])
  const photosRef = useRef(photos)
  const [groupPricing, setGroupPricing] = useState(true)
  const [acceptedHostTerms, setAcceptedHostTerms] = useState(false)
  const [isFoundingHost, setIsFoundingHost] = useState(null)
  const [error, setError] = useState('')
  const [draftNote, setDraftNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [draftHandled, setDraftHandled] = useState(false)
  const headingRef = useRef(null)
  const movedStep = useRef(false)

  const priceCents = parsePriceInputCents(price)
  const breakdown = hostPriceBreakdown(priceCents, isFoundingHost, maxGuests)
  const durationMins = durationChoice === 'other' ? parseInt(otherMins, 10) : durationChoice

  useEffect(() => {
    photosRef.current = photos
  }, [photos])

  useEffect(() => {
    async function checkVerification() {
      // Gate on `my_verification()`. Founding-host status is a separate
      // caller-scoped RPC — `users.is_founding_host` has no client SELECT grant.
      const { data } = await supabase.rpc('my_verification')
      const row = Array.isArray(data) ? data[0] : data
      const status = row?.verification_status || 'unverified'
      setVerificationStatus(status)
      setVerificationChecked(true)

      if (status !== 'approved') {
        navigate('/verify-identity', {
          state:
            status === 'pending'
              ? undefined
              : {
                  message: 'You need to verify your identity before you can host on TryKai.',
                },
          replace: true,
        })
        return
      }

      const founding = await supabase.rpc('my_is_founding_host')
      setIsFoundingHost(foundingHostFromRpc(founding.data, founding.error))
    }

    checkVerification()
  }, [userId, navigate])

  useEffect(() => {
    return () => {
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
    }
  }, [])

  function restoreDraft() {
    const draft = readDraft(userId)
    setDraftHandled(true)
    if (!draft) return
    if (typeof draft.title === 'string') setTitle(draft.title)
    if (typeof draft.description === 'string') setDescription(draft.description)
    if (typeof draft.category === 'string') setCategory(draft.category)
    if (typeof draft.price === 'string') setPrice(draft.price)
    if (Number.isInteger(draft.maxGuests)) setMaxGuests(draft.maxGuests)
    if (draft.durationChoice !== undefined) setDurationChoice(draft.durationChoice)
    if (typeof draft.otherMins === 'string') setOtherMins(draft.otherMins)
    if (typeof draft.groupPricing === 'boolean') setGroupPricing(draft.groupPricing)
    if (typeof draft.area === 'string') setArea(draft.area)
    if (typeof draft.fullAddress === 'string') setFullAddress(draft.fullAddress)
    if (Array.isArray(draft.whatsProvided)) setWhatsProvided(draft.whatsProvided)
    setDraftNote('Draft restored. Photos are not kept in drafts, so add them again.')
  }

  function discardDraft() {
    clearDraft(userId)
    setDraftHandled(true)
  }

  // Each new step announces itself by moving focus to its heading.
  useEffect(() => {
    if (!movedStep.current) return
    headingRef.current?.focus()
  }, [step])

  function saveDraft() {
    const values = {
      title,
      description,
      category,
      price,
      maxGuests,
      durationChoice,
      otherMins,
      groupPricing,
      area,
      fullAddress,
      whatsProvided,
    }
    try {
      window.localStorage.setItem(draftKey(userId), JSON.stringify(values))
      setDraftHandled(true)
      setDraftNote('Draft saved on this device. Photos are not kept in drafts.')
    } catch {
      setDraftNote('Could not save a draft in this browser.')
    }
  }

  function handlePhotoChange(e) {
    const selected = Array.from(e.target.files).filter((file) =>
      file.type.startsWith('image/')
    )
    e.target.value = ''

    if (selected.length === 0) return

    setPhotos((prev) => {
      const remaining = MAX_PHOTOS - prev.length
      if (remaining <= 0) return prev

      const toAdd = selected.slice(0, remaining).map((file) => ({
        file,
        previewUrl: URL.createObjectURL(file),
      }))

      return [...prev, ...toAdd]
    })
  }

  function removePhoto(index) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  async function uploadPhotos() {
    const urls = []

    for (const photo of photos) {
      const ext = photo.file.name.split('.').pop() || 'jpg'
      const path = `${userId}/${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('listing-photos')
        .upload(path, photo.file)

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('listing-photos').getPublicUrl(path)
      urls.push(data.publicUrl)
    }

    return urls
  }

  function handleWhatsProvidedChange(option) {
    if (option === 'None') {
      setWhatsProvided((prev) => (prev.includes('None') ? [] : ['None']))
      return
    }

    setWhatsProvided((prev) => {
      const withoutNone = prev.filter((item) => item !== 'None')
      if (withoutNone.includes(option)) {
        return withoutNone.filter((item) => item !== option)
      }
      return [...withoutNone, option]
    })
  }

  /** The first problem with a step's answers, or '' when the step is complete. */
  function stepProblem(stepId) {
    if (stepId === 'basics') {
      if (!title.trim()) return 'Give your listing a title.'
      if (!category) return 'Choose a category.'
      if (!description.trim()) return 'Describe what guests will do.'
    }
    if (stepId === 'price') {
      if (priceCents == null) return 'Please enter a valid price.'
      if (!Number.isInteger(maxGuests) || maxGuests < MIN_GUESTS) {
        return 'Spots per session must be at least 1.'
      }
      if (durationChoice == null) return 'Choose how long each session lasts.'
      if (!Number.isInteger(durationMins) || durationMins < 1) {
        return 'Duration must be at least 1 minute.'
      }
    }
    if (stepId === 'location') {
      if (!area) return 'Pick the area from the list.'
      if (!fullAddress.trim()) return 'Enter the full address.'
    }
    if (stepId === 'finish' && !acceptedHostTerms) return 'Please agree to the Host terms.'
    return ''
  }

  function goTo(index) {
    movedStep.current = true
    setError('')
    setStep(index)
    window.scrollTo?.(0, 0)
  }

  function handleContinue(e) {
    e.preventDefault()
    const problem = stepProblem(STEPS[step].id)
    if (problem) {
      setError(problem)
      return
    }
    if (step < STEPS.length - 1) {
      goTo(step + 1)
      return
    }
    publish()
  }

  async function publish() {
    setError('')
    for (let index = 0; index < STEPS.length; index += 1) {
      const problem = stepProblem(STEPS[index].id)
      if (problem) {
        setStep(index)
        setError(problem)
        return
      }
    }

    const provided =
      whatsProvided.includes('None') || whatsProvided.length === 0
        ? []
        : whatsProvided

    setLoading(true)

    let photoUrls = []
    try {
      if (photos.length > 0) {
        photoUrls = await uploadPhotos()
      }
    } catch (uploadError) {
      setLoading(false)
      setError(uploadError.message)
      return
    }

    const listingPayload = {
      host_id: userId,
      title: title.trim(),
      description: description.trim(),
      category,
      price_per_person: priceCents,
      max_guests: maxGuests,
      duration_mins: durationMins,
      group_pricing: groupPricing,
      area,
      full_address: fullAddress.trim(),
      whats_provided: provided,
      photo_urls: photoUrls,
      is_active: true,
    }
    let { error: listingError } = await supabase.from('listings').insert(listingPayload)
    if (listingError && /duration_mins|group_pricing/.test(listingError.message ?? '')) {
      const retry = { ...listingPayload }
      if (/duration_mins/.test(listingError.message ?? '')) delete retry.duration_mins
      if (/group_pricing/.test(listingError.message ?? '')) delete retry.group_pricing
      ;({ error: listingError } = await supabase.from('listings').insert(retry))
    }

    if (listingError) {
      setLoading(false)
      setError(listingError.message)
      return
    }

    const { error: hostError } = await supabase
      .from('users')
      .update({ is_host: true })
      .eq('id', userId)

    setLoading(false)

    if (hostError) {
      setError(hostError.message)
      return
    }

    clearDraft(userId)
    navigate('/hosting', { replace: true })
  }

  if (!verificationChecked) {
    return <p className="status-message">Loading…</p>
  }

  if (verificationStatus !== 'approved') {
    return <p className="status-message">Loading…</p>
  }

  const current = STEPS[step]
  const next = STEPS[step + 1]
  const hasSavedDraft = !draftHandled && Boolean(readDraft(userId))
  const isLast = step === STEPS.length - 1

  const preview = (
    <Card
      mode="browse"
      image={photos[0]?.previewUrl}
      badge={category || 'Other'}
      title={title.trim() || 'Your listing title'}
      titleLevel={3}
      metaItems={[area || 'Your area']}
      price={priceCents ? `${formatGuestFacingPrice(priceCents)}/person` : '$—/person'}
      flag="New"
    />
  )

  function renderStep() {
    if (current.id === 'basics') {
      return (
        <>
          <label className="label">
            Title
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Learn latte art with me"
              className="input"
            />
          </label>

          <fieldset className="wizard-fieldset">
            <legend className="wizard-fieldset__legend">Category</legend>
            <div className="category-choices">
              {CATEGORIES.map((cat) => (
                <label
                  key={cat}
                  className={`category-choice${category === cat ? ' category-choice--on' : ''}`}
                >
                  <input
                    type="radio"
                    name="category"
                    value={cat}
                    checked={category === cat}
                    onChange={() => setCategory(cat)}
                    className="visually-hidden"
                  />
                  <Icon name={categoryIconName(cat)} size={24} strokeWidth={1.6} />
                  {cat}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="label">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will guests learn, make or do? Who is it for?"
              rows={6}
              className="input input--textarea"
            />
          </label>
        </>
      )
    }

    if (current.id === 'photos') {
      return (
        <>
          <PhotoTips />
          <div>
            <label className="photo-drop">
              <Icon name="camera" size={28} strokeWidth={1.5} />
              <span className="photo-drop__title">Photos</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoChange}
                disabled={photos.length >= MAX_PHOTOS}
                className="visually-hidden"
              />
            </label>
            <p className="hint photo-drop__count">
              Maximum of {MAX_PHOTOS} photos ({photos.length}/{MAX_PHOTOS})
            </p>

            {photos.length > 0 && (
              <div className="preview-grid">
                {photos.map((photo, index) => (
                  <div key={photo.previewUrl} className="preview-item">
                    <img src={photo.previewUrl} alt="" className="preview-image" />
                    {index === 0 ? <span className="preview-item__cover">Cover</span> : null}
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="preview-remove"
                      aria-label="Remove photo"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )
    }

    if (current.id === 'price') {
      return (
        <>
          <div className="price-field">
            <label htmlFor="listing-price" className="price-field__label">
              Your price per guest
            </label>
            <div className="price-field__control">
              <span className="price-field__currency" aria-hidden="true">
                S$
              </span>
              <input
                id="listing-price"
                type="number"
                inputMode="decimal"
                min="1"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="20"
                className="price-field__input"
                aria-describedby="listing-price-hint"
              />
            </div>
            <p id="listing-price-hint" className="hint">
              Sessions on TryKai usually run $10 to $40 per guest.
            </p>
          </div>

          {breakdown ? (
            <div className="price-panel" aria-live="polite">
              <p className="price-panel__row">
                <span>Guests pay</span>
                <span className="price-panel__amount">
                  <FormattedPrice cents={breakdown.guestsPayCents} />
                </span>
              </p>
              {breakdown.youReceiveCents != null ? (
                <p className="price-panel__row">
                  <span>You receive per guest</span>
                  <span className="price-panel__amount">
                    <FormattedPrice cents={breakdown.youReceiveCents} />
                  </span>
                </p>
              ) : null}
              {breakdown.afterFeeCents != null ? (
                <p className="price-panel__row price-panel__row--small">
                  <span>
                    After your first {breakdown.feeFreeBookings} bookings ({breakdown.feePercent}%
                    host fee)
                  </span>
                  <span className="price-panel__amount">
                    <FormattedPrice cents={breakdown.afterFeeCents} />
                  </span>
                </p>
              ) : null}
              {breakdown.fullSessionCents != null ? (
                <p className="price-panel__row price-panel__row--total">
                  <span>A full session of {maxGuests} pays you up to</span>
                  <span className="price-panel__amount">
                    <FormattedPrice cents={breakdown.fullSessionCents} />
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="wizard-row">
            <div>
              <p className="wizard-row__label" id="group-size-label">
                Spots per session
              </p>
              <p className="wizard-row__hint">The most guests in one session.</p>
            </div>
            <div
              className="guest-stepper__controls"
              role="group"
              aria-labelledby="group-size-label"
            >
              <button
                type="button"
                className="guest-stepper__btn"
                aria-label="Fewer guests"
                disabled={maxGuests <= MIN_GUESTS}
                onClick={() => setMaxGuests((n) => Math.max(MIN_GUESTS, n - 1))}
              >
                −
              </button>
              <output className="guest-stepper__count" aria-live="polite">
                {maxGuests}
              </output>
              <button
                type="button"
                className="guest-stepper__btn"
                aria-label="More guests"
                disabled={maxGuests >= MAX_GUESTS}
                onClick={() => setMaxGuests((n) => Math.min(MAX_GUESTS, n + 1))}
              >
                +
              </button>
            </div>
          </div>

          <fieldset className="wizard-fieldset">
            <legend className="wizard-fieldset__legend">How long is each session?</legend>
            <div className="choice-chips">
              {DURATIONS.map((option) => (
                <label
                  key={option.mins}
                  className={`choice-chip${durationChoice === option.mins ? ' choice-chip--on' : ''}`}
                >
                  <input
                    type="radio"
                    name="duration"
                    checked={durationChoice === option.mins}
                    onChange={() => setDurationChoice(option.mins)}
                    className="visually-hidden"
                  />
                  {option.label}
                </label>
              ))}
              <label
                className={`choice-chip${durationChoice === 'other' ? ' choice-chip--on' : ''}`}
              >
                <input
                  type="radio"
                  name="duration"
                  checked={durationChoice === 'other'}
                  onChange={() => setDurationChoice('other')}
                  className="visually-hidden"
                />
                Other
              </label>
            </div>
            {durationChoice === 'other' ? (
              <label className="label wizard-other">
                Minutes
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={otherMins}
                  onChange={(e) => setOtherMins(e.target.value)}
                  placeholder="45"
                  className="input"
                />
              </label>
            ) : null}
          </fieldset>

          <label className="toggle-card">
            <input
              type="checkbox"
              checked={groupPricing}
              onChange={(e) => setGroupPricing(e.target.checked)}
            />
            <span className="toggle-card__copy">
              <span className="toggle-card__title">Offer group discounts</span>
              <span className="toggle-card__hint">
                5% off for 2 guests, up to 20% for 5 or more. Helps friends and couples book
                together.
              </span>
            </span>
          </label>
        </>
      )
    }

    if (current.id === 'location') {
      return (
        <>
          <label className="label">
            Area
            <PlanningAreaSelect value={area} onChange={setArea} />
          </label>

          <label className="label">
            Full address
            <input
              type="text"
              value={fullAddress}
              onChange={(e) => setFullAddress(e.target.value)}
              placeholder="Block, street, unit and postal code"
              className="input"
            />
            <span className="hint">Hidden from browse. Revealed only after a confirmed booking.</span>
          </label>
        </>
      )
    }

    return (
      <>
        <fieldset className="fieldset">
          <legend className="fieldset__legend">What&apos;s provided</legend>
          <div className="checkboxes">
            {WHATS_PROVIDED_OPTIONS.map((option) => (
              <label key={option} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={whatsProvided.includes(option)}
                  onChange={() => handleWhatsProvidedChange(option)}
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="wizard-inline-preview">
          <p className="wizard-preview__label">How guests will see it</p>
          {preview}
        </div>

        <CancellationPolicyInfo />

        <label className="checkbox-label checkbox-label--agree">
          <input
            type="checkbox"
            checked={acceptedHostTerms}
            onChange={(e) => setAcceptedHostTerms(e.target.checked)}
          />
          <span>
            I agree to the <Link to="/terms#part-2-hosting">Host terms</Link>
          </span>
        </label>
      </>
    )
  }

  return (
    <div className="wizard">
      <div className="wizard__main">
        <header className="wizard__bar">
          <Link to="/hosting" className="wizard__close" aria-label="Close">
            <Icon name="close" size={20} />
          </Link>
          <p className="wizard__name">New listing</p>
          <button type="button" className="wizard__save" onClick={saveDraft}>
            Save draft
          </button>
        </header>

        <form onSubmit={handleContinue} className="wizard__form" noValidate>
          <div className="wizard__progress">
            <p className="wizard__step-count">
              <span>
                Step {step + 1} of {STEPS.length}
              </span>
              {next ? <span className="wizard__next">Next: {next.label}</span> : null}
            </p>
            <div
              className="wizard__segments"
              role="progressbar"
              aria-label="Listing progress"
              aria-valuemin={1}
              aria-valuemax={STEPS.length}
              aria-valuenow={step + 1}
            >
              {STEPS.map((item, index) => (
                <span
                  key={item.id}
                  className={`wizard__segment${index <= step ? ' wizard__segment--done' : ''}`}
                />
              ))}
            </div>
          </div>

          <div className="wizard__body">
            <div className="wizard__intro">
              <h1 className="wizard__title" ref={headingRef} tabIndex={-1}>
                {current.title}
              </h1>
              <p className="wizard__lede">{current.intro}</p>
            </div>

            {hasSavedDraft ? (
              <div className="wizard__note wizard__note--draft">
                <p>You have a saved draft on this device.</p>
                <div className="wizard__note-actions">
                  <button type="button" className="btn btn--small btn--primary" onClick={restoreDraft}>
                    Restore draft
                  </button>
                  <button type="button" className="btn btn--small btn--ghost" onClick={discardDraft}>
                    Discard
                  </button>
                </div>
              </div>
            ) : null}
            {draftNote ? (
              <p className="wizard__note" role="status">
                {draftNote}
              </p>
            ) : null}

            {renderStep()}

            {error && (
              <p className="error-message wizard__error" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="wizard__actions">
            {step > 0 ? (
              <button type="button" className="btn btn--ghost" onClick={() => goTo(step - 1)}>
                Back
              </button>
            ) : null}
            <button
              type="submit"
              className="btn btn--primary wizard__continue"
              disabled={loading || (isLast && !acceptedHostTerms)}
            >
              {isLast
                ? loading
                  ? photos.length > 0
                    ? 'Uploading…'
                    : 'Creating…'
                  : 'Create listing'
                : 'Continue'}
            </button>
          </div>
        </form>
      </div>

      <aside className="wizard__preview" aria-label="Listing preview">
        <p className="wizard-preview__label">How guests will see it</p>
        {preview}
        <p className="wizard-preview__hint">Updates as you fill in each step.</p>
      </aside>
    </div>
  )
}
