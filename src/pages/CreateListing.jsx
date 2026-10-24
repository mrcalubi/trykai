import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import { CancellationPolicyInfo } from '../components/CancellationPolicy'
import PlanningAreaSelect from '../components/PlanningAreaSelect'
import PostalAddressFields from '../components/PostalAddressFields'
import PhotoTips from '../components/PhotoTips'
import PhotoSkipDialog from '../components/PhotoSkipDialog'
import ListingPhotosEditor from '../components/ListingPhotosEditor'
import { revokePhotoUrls } from '../lib/coverCrop'
import { uploadListingPhotos } from '../lib/listingPhotos'
import PageLoader from '../components/PageLoader'
import WaitingState from '../components/WaitingState'
import ListingPricePanel from '../components/ListingPricePanel'
import WhatsProvidedFields from '../components/WhatsProvidedFields'
import FieldHint from '../components/FieldHint'
import Card from '../components/ui/Card'
import Icon from '../components/ui/Icon'
import { categoryIconName } from '../components/ui/categoryIcon'
import { LISTING_CATEGORIES } from '../lib/listingCategories'
import {
  LISTING_FIELD_HINTS,
  PHOTO_UPLOAD_ERROR,
  listingSaveProblem,
} from '../lib/listingFieldHints'
import { providedForSave } from '../lib/whatsProvided'
import { foundingHostFromRpc } from '../lib/foundingHost'
import {
  formatGuestFacingPrice,
  groupDiscountExampleLine,
  hostPriceBreakdown,
  parsePriceInputCents,
} from '../lib/pricing'
import {
  LISTING_STEPS as STEPS,
  clearDraft,
  draftKey,
  draftValues,
  readDraft,
} from '../lib/listingDraft'
import { notifyListingSubmitted } from '../lib/listingReview'

const MAX_PHOTOS = 5
const DRAFT_RESTORED = 'Draft restored. Photos are not kept in drafts, so add them again.'
const MIN_GUESTS = 1
const MAX_GUESTS = 50

const DURATIONS = [
  { label: '1 hr', mins: 60 },
  { label: '1.5 hr', mins: 90 },
  { label: '2 hr', mins: 120 },
]

export default function CreateListing() {
  const navigate = useNavigate()
  const userId = useAuthedUserId()

  const [verificationStatus, setVerificationStatus] = useState(null)
  const [verificationChecked, setVerificationChecked] = useState(false)
  // Hosting's Continue on a draft opens the wizard with it already restored.
  const location = useLocation()
  const [resumed] = useState(() => (location.state?.resumeDraft ? readDraft(userId) : null))
  const start = draftValues(resumed)
  const [step, setStep] = useState(start.step)
  const [title, setTitle] = useState(start.title)
  const [description, setDescription] = useState(start.description)
  const [category, setCategory] = useState(start.category)
  const [price, setPrice] = useState(start.price)
  const [maxGuests, setMaxGuests] = useState(start.maxGuests)
  const [durationChoice, setDurationChoice] = useState(start.durationChoice)
  const [otherMins, setOtherMins] = useState(start.otherMins)
  const [area, setArea] = useState(start.area)
  const [fullAddress, setFullAddress] = useState(start.fullAddress)
  const [whatsProvided, setWhatsProvided] = useState(start.whatsProvided)
  const [photos, setPhotos] = useState([])
  const photosRef = useRef(photos)
  const [groupPricing, setGroupPricing] = useState(start.groupPricing)
  const [acceptedHostTerms, setAcceptedHostTerms] = useState(false)
  const [isFoundingHost, setIsFoundingHost] = useState(null)
  const [fieldHints, setFieldHints] = useState({})
  const [error, setError] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [draftNote, setDraftNote] = useState(resumed ? DRAFT_RESTORED : '')
  const [loading, setLoading] = useState(false)
  const [publishMessage, setPublishMessage] = useState('Saving your listing')
  const [draftHandled, setDraftHandled] = useState(Boolean(resumed))
  const [photoSkipOpen, setPhotoSkipOpen] = useState(false)
  const headingRef = useRef(null)
  const photoPickerRef = useRef(null)
  const movedStep = useRef(false)

  const priceCents = parsePriceInputCents(price)
  const breakdown = hostPriceBreakdown(priceCents, isFoundingHost, maxGuests, groupPricing)
  const discountExample = groupPricing ? groupDiscountExampleLine(priceCents, maxGuests) : ''
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
      photosRef.current.forEach(revokePhotoUrls)
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
    setDraftNote(DRAFT_RESTORED)
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
      step,
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

  function hintsForStep(stepId) {
    const hints = {}
    if (stepId === 'basics') {
      if (!title.trim()) hints.title = LISTING_FIELD_HINTS.title
      if (!category) hints.category = LISTING_FIELD_HINTS.category
      if (!description.trim()) hints.description = LISTING_FIELD_HINTS.description
    }
    if (stepId === 'price') {
      if (priceCents == null) hints.price = LISTING_FIELD_HINTS.price
      if (!Number.isInteger(maxGuests) || maxGuests < MIN_GUESTS) {
        hints.spots = LISTING_FIELD_HINTS.spots
      }
      if (durationChoice == null || !Number.isInteger(durationMins) || durationMins < 1) {
        hints.duration = LISTING_FIELD_HINTS.duration
      }
    }
    if (stepId === 'location') {
      if (!area) hints.area = LISTING_FIELD_HINTS.area
      if (!fullAddress.trim()) hints.fullAddress = LISTING_FIELD_HINTS.fullAddress
    }
    if (stepId === 'finish' && !acceptedHostTerms) hints.hostTerms = LISTING_FIELD_HINTS.hostTerms
    return hints
  }

  function goTo(index) {
    movedStep.current = true
    setError('')
    setFieldHints({})
    setStep(index)
    window.scrollTo?.(0, 0)
  }

  function handleContinue(e) {
    e.preventDefault()
    const hints = hintsForStep(STEPS[step].id)
    if (Object.keys(hints).length) {
      setFieldHints(hints)
      return
    }
    if (STEPS[step].id === 'photos' && photos.length === 0) {
      setPhotoSkipOpen(true)
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
    setPhotoError('')
    for (let index = 0; index < STEPS.length; index += 1) {
      const hints = hintsForStep(STEPS[index].id)
      if (Object.keys(hints).length) {
        setStep(index)
        setFieldHints(hints)
        return
      }
    }

    const provided = providedForSave(whatsProvided)

    setLoading(true)
    const uploadCount = photos.filter((photo) => photo.file).length
    setPublishMessage(
      uploadCount ? `Uploading photo 1 of ${uploadCount}` : 'Saving your listing'
    )

    let photoUrls = []
    try {
      if (photos.length > 0) {
        photoUrls = await uploadListingPhotos(photos, userId, supabase.storage, {
          onProgress: ({ index, total }) => {
            setPublishMessage(`Uploading photo ${index} of ${total}`)
          },
        })
      }
    } catch (uploadError) {
      console.error('Listing photo upload failed', uploadError)
      setLoading(false)
      setPhotoError(PHOTO_UPLOAD_ERROR)
      goTo(STEPS.findIndex((step) => step.id === 'photos'))
      return
    }

    setPublishMessage('Saving your listing')

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
      const problem = listingSaveProblem(listingError)
      if (problem.field === 'price') {
        goTo(STEPS.findIndex((item) => item.id === 'price'))
        setFieldHints({ price: problem.hint })
      }
      setError(problem.message)
      return
    }

    const { error: hostError } = await supabase
      .from('users')
      .update({ is_host: true })
      .eq('id', userId)

    setLoading(false)

    if (hostError) {
      setError(listingSaveProblem(hostError).message)
      return
    }

    clearDraft(userId)
    photosRef.current.forEach(revokePhotoUrls)
    void notifyListingSubmitted()
    navigate('/hosting', { replace: true })
  }

  if (!verificationChecked) {
    return <PageLoader />
  }

  if (verificationStatus !== 'approved') {
    return <PageLoader />
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
            <FieldHint>{fieldHints.title}</FieldHint>
          </label>

          <fieldset className="wizard-fieldset">
            <legend className="wizard-fieldset__legend">Category</legend>
            <div className="category-choices">
              {LISTING_CATEGORIES.map((cat) => (
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
            <FieldHint>{fieldHints.category}</FieldHint>
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
            <FieldHint>{fieldHints.description}</FieldHint>
          </label>
        </>
      )
    }

    if (current.id === 'photos') {
      return (
        <>
          <PhotoTips />
          <ListingPhotosEditor
            photos={photos}
            onChange={setPhotos}
            max={MAX_PHOTOS}
            pickerRef={photoPickerRef}
            error={photoError}
          />
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
            <FieldHint>{fieldHints.price}</FieldHint>
          </div>

          <ListingPricePanel breakdown={breakdown} groupSize={maxGuests} />

          <div className="wizard-row">
            <div>
              <p className="wizard-row__label" id="group-size-label">
                Spots per session
              </p>
              <p className="wizard-row__hint">The most guests in one session.</p>
              <FieldHint>{fieldHints.spots}</FieldHint>
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
            <FieldHint>{fieldHints.duration}</FieldHint>
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
          {discountExample ? <p className="hint group-discount-example">{discountExample}</p> : null}
        </>
      )
    }

    if (current.id === 'location') {
      return (
        <>
          <label className="label">
            Area
            <PlanningAreaSelect value={area} onChange={setArea} hideUninhabited />
            <FieldHint>{fieldHints.area}</FieldHint>
          </label>

          <PostalAddressFields value={fullAddress} onChange={setFullAddress} />
          <FieldHint>{fieldHints.fullAddress}</FieldHint>
        </>
      )
    }

    return (
      <>
        <WhatsProvidedFields value={whatsProvided} onChange={setWhatsProvided} />

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
        <FieldHint>{fieldHints.hostTerms}</FieldHint>
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

          {loading ? (
            <WaitingState title="Creating your listing" message={publishMessage} />
          ) : (
            <>
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

                {error ? (
                  <p className="wizard__note" role="status">
                    {error}
                  </p>
                ) : null}
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
                  disabled={isLast && !acceptedHostTerms}
                >
                  {isLast ? 'Create listing' : 'Continue'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>

      <aside className="wizard__preview" aria-label="Listing preview">
        <p className="wizard-preview__label">How guests will see it</p>
        {preview}
        <p className="wizard-preview__hint">Updates as you fill in each step.</p>
      </aside>

      {photoSkipOpen ? (
        <PhotoSkipDialog
          onAdd={() => {
            setPhotoSkipOpen(false)
            photoPickerRef.current?.click()
          }}
          onSkip={() => {
            setPhotoSkipOpen(false)
            goTo(step + 1)
          }}
        />
      ) : null}
    </div>
  )
}
