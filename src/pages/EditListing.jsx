import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import PostalAddressFields from '../components/PostalAddressFields'
import PhotoTips from '../components/PhotoTips'
import PhotoSkipDialog from '../components/PhotoSkipDialog'
import ListingPhotosEditor from '../components/ListingPhotosEditor'
import { revokePhotoUrls } from '../lib/coverCrop'
import { photosFromUrls, uploadListingPhotos } from '../lib/listingPhotos'
import ListingPricePanel from '../components/ListingPricePanel'
import WhatsProvidedFields from '../components/WhatsProvidedFields'
import WhatToBringFields from '../components/WhatToBringFields'
import FieldHint from '../components/FieldHint'
import Button from '../components/ui/Button'
import PageLoader from '../components/PageLoader'
import { foundingHostFromRpc } from '../lib/foundingHost'
import { groupDiscountExampleLine, hostPriceBreakdown, parsePriceInputCents } from '../lib/pricing'
import {
  LISTING_FIELD_HINTS,
  PHOTO_UPLOAD_ERROR,
  listingSaveProblem,
} from '../lib/listingFieldHints'
import { providedForSave } from '../lib/whatsProvided'
import { whatToBringForSave } from '../lib/whatToBring'
import { formatListingSpotsMessage } from '../lib/listingSpots'
import { PAGE_LOAD_ERROR, withIssuedAtRetry } from '../lib/pageLoad'
import { LISTING_CATEGORIES } from '../lib/listingCategories'
import { notifyListingSubmitted } from '../lib/listingReview'
import { listingEditorDraft } from '../lib/unsavedDraft'
import { useUnsavedChangesGuard } from '../lib/useUnsavedChangesGuard'
import ListingDeleteDialog from '../components/ListingDeleteDialog'
import { HOST_SESSIONS_SELECT, listingUpcomingStats, upcomingSessionsFrom } from '../lib/listingDelete'
import { monthStartIso } from '../lib/hostingDashboard'

const MAX_PHOTOS = 5

const LISTING_SELECT = `
  id,
  title,
  description,
  category,
  price_per_person,
  max_guests,
  duration_mins,
  group_pricing,
  area,
  whats_provided,
  what_to_bring,
  photo_urls,
  host_id
`

function centsToDollars(cents) {
  const dollars = cents / 100
  return dollars % 1 === 0 ? String(dollars) : dollars.toFixed(2)
}

export default function EditListing() {
  const { id } = useParams()
  const navigate = useNavigate()
  const userId = useAuthedUserId()

  const [fetching, setFetching] = useState(true)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('')
  const [maxGuests, setMaxGuests] = useState('')
  const [durationMins, setDurationMins] = useState('')
  const [groupPricing, setGroupPricing] = useState(true)
  const [area, setArea] = useState('')
  const [fullAddress, setFullAddress] = useState('')
  const [whatsProvided, setWhatsProvided] = useState([])
  const [whatToBring, setWhatToBring] = useState([])
  const [photos, setPhotos] = useState([])
  const photosRef = useRef(photos)
  const photoPickerRef = useRef(null)
  const [isFoundingHost, setIsFoundingHost] = useState(null)
  const [fieldHints, setFieldHints] = useState({})
  const [photoSkipOpen, setPhotoSkipOpen] = useState(false)
  const [error, setError] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [loading, setLoading] = useState(false)
  const [savedDraft, setSavedDraft] = useState(null)
  const [listingTitle, setListingTitle] = useState('')
  const [upcomingSessions, setUpcomingSessions] = useState([])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [leaving, setLeaving] = useState(false)
  const priceCents = parsePriceInputCents(price)
  const guests = parseInt(maxGuests, 10)
  const guestCount = Number.isInteger(guests) ? guests : 1
  const breakdown = hostPriceBreakdown(
    priceCents,
    isFoundingHost,
    guestCount,
    groupPricing,
  )
  const discountExample = groupPricing ? groupDiscountExampleLine(priceCents, guestCount) : ''

  useEffect(() => {
    photosRef.current = photos
  }, [photos])

  useEffect(() => {
    async function fetchListing() {
      let listingResult = await withIssuedAtRetry(() =>
        supabase.from('listings').select(LISTING_SELECT).eq('id', id).eq('host_id', userId).single()
      )
      if (listingResult.error && /what_to_bring/.test(listingResult.error.message ?? '')) {
        listingResult = await withIssuedAtRetry(() =>
          supabase
            .from('listings')
            .select(LISTING_SELECT.replace(/\s*what_to_bring,\n/, '\n'))
            .eq('id', id)
            .eq('host_id', userId)
            .single()
        )
      }
      const [founding, addressResult, sessionsResult] = await Promise.all([
        supabase.rpc('my_is_founding_host'),
        supabase.rpc('listing_address', { listing_id: id }),
        supabase
          .from('sessions')
          .select(HOST_SESSIONS_SELECT)
          .eq('listing_id', id)
          .neq('status', 'cancelled')
          .gte('starts_at', monthStartIso())
          .order('starts_at', { ascending: true }),
      ])
      const { data, error: fetchError } = listingResult

      if (fetchError || !data) {
        setError(fetchError ? PAGE_LOAD_ERROR : 'Listing not found.')
        setFetching(false)
        return
      }

      if (addressResult.error) {
        setError(PAGE_LOAD_ERROR)
        setFetching(false)
        return
      }

      setIsFoundingHost(foundingHostFromRpc(founding.data, founding.error))
      setListingTitle(data.title)
      setUpcomingSessions(
        sessionsResult.error ? [] : upcomingSessionsFrom(sessionsResult.data),
      )

      const nextTitle = data.title
      const nextDescription = data.description
      const nextCategory = data.category
      const nextPrice = centsToDollars(data.price_per_person)
      const nextMaxGuests = String(data.max_guests)
      const nextDurationMins = data.duration_mins != null ? String(data.duration_mins) : ''
      const nextGroupPricing = data.group_pricing !== false
      const nextArea = data.area ?? ''
      const nextAddress = typeof addressResult.data === 'string' ? addressResult.data : ''
      const nextProvided = data.whats_provided?.length ? data.whats_provided : []
      const nextBring = data.what_to_bring?.length ? data.what_to_bring : []
      const nextPhotos = photosFromUrls(data.photo_urls)
      setTitle(nextTitle)
      setDescription(nextDescription)
      setCategory(nextCategory)
      setPrice(nextPrice)
      setMaxGuests(nextMaxGuests)
      setDurationMins(nextDurationMins)
      setGroupPricing(nextGroupPricing)
      setArea(nextArea)
      setFullAddress(nextAddress)
      setWhatsProvided(nextProvided)
      setWhatToBring(nextBring)
      setPhotos(nextPhotos)
      setSavedDraft(
        listingEditorDraft({
          title: nextTitle,
          description: nextDescription,
          category: nextCategory,
          price: nextPrice,
          maxGuests: nextMaxGuests,
          durationMins: nextDurationMins,
          groupPricing: nextGroupPricing,
          area: nextArea,
          fullAddress: nextAddress,
          whatsProvided: nextProvided,
          whatToBring: nextBring,
          photos: nextPhotos,
        }),
      )
      setFetching(false)
    }

    fetchListing()
  }, [userId, id])

  useEffect(() => {
    return () => {
      photosRef.current.forEach(revokePhotoUrls)
    }
  }, [])

  function collectHints() {
    const hints = {}
    if (!title.trim()) hints.title = LISTING_FIELD_HINTS.title
    if (!description.trim()) hints.description = LISTING_FIELD_HINTS.description
    if (!category) hints.category = LISTING_FIELD_HINTS.category
    if (priceCents == null) hints.price = LISTING_FIELD_HINTS.price
    if (Number.isNaN(guests) || guests < 1) hints.spots = LISTING_FIELD_HINTS.spots
    const duration = parseInt(durationMins, 10)
    if (Number.isNaN(duration) || duration < 1) hints.duration = LISTING_FIELD_HINTS.duration
    if (!area) hints.area = LISTING_FIELD_HINTS.area
    if (!fullAddress.trim()) hints.fullAddress = LISTING_FIELD_HINTS.fullAddress
    return hints
  }

  function showSaveProblem(saveError) {
    const problem = listingSaveProblem(saveError)
    if (problem.field) setFieldHints({ [problem.field]: problem.hint })
    setError(problem.message)
  }

  async function saveListing() {
    setError('')
    setPhotoError('')
    setFieldHints({})
    const duration = parseInt(durationMins, 10)
    const provided = providedForSave(whatsProvided)
    const bring = whatToBringForSave(whatToBring)

    setLoading(true)

    let photoUrls
    try {
      photoUrls = await uploadListingPhotos(photos, userId, supabase.storage)
    } catch (uploadError) {
      console.error('Listing photo upload failed', uploadError)
      setLoading(false)
      setPhotoError(PHOTO_UPLOAD_ERROR)
      return
    }

    const listingPayload = {
      title: title.trim(),
      description: description.trim(),
      category,
      price_per_person: priceCents,
      duration_mins: duration,
      group_pricing: groupPricing,
      area,
      full_address: fullAddress.trim(),
      whats_provided: provided,
      what_to_bring: bring,
      photo_urls: photoUrls,
    }
    let { error: updateError } = await supabase
      .from('listings')
      .update(listingPayload)
      .eq('id', id)
      .eq('host_id', userId)
    if (updateError && /duration_mins|group_pricing|what_to_bring/.test(updateError.message ?? '')) {
      const retry = { ...listingPayload }
      if (/duration_mins/.test(updateError.message ?? '')) delete retry.duration_mins
      if (/group_pricing/.test(updateError.message ?? '')) delete retry.group_pricing
      if (/what_to_bring/.test(updateError.message ?? '')) delete retry.what_to_bring
      ;({ error: updateError } = await supabase
        .from('listings')
        .update(retry)
        .eq('id', id)
        .eq('host_id', userId))
    }

    if (updateError) {
      setLoading(false)
      showSaveProblem(updateError)
      return
    }

    // After the update, not before: set_listing_spots writes this same row, and
    // the database re-checks every constraint on it. Run first, it tripped over
    // the old price (say one above the S$500 ceiling) the host was fixing here.
    const { data: spotsData, error: spotsError } = await supabase.rpc('set_listing_spots', {
      p_listing_id: id,
      p_spots: guests,
    })

    if (spotsError) {
      setLoading(false)
      showSaveProblem(spotsError)
      return
    }

    // Stay "saving" so the unsaved-changes guard does not fire on this leave.
    // Only does anything when this edit put the listing back in the queue.
    photosRef.current.forEach(revokePhotoUrls)
    void notifyListingSubmitted()
    navigate('/hosting', {
      replace: true,
      state: {
        message: `Listing updated successfully. ${formatListingSpotsMessage(spotsData)}`,
      },
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const hints = collectHints()
    if (Object.keys(hints).length) {
      setFieldHints(hints)
      return
    }
    if (photos.length === 0) {
      setPhotoSkipOpen(true)
      return
    }
    await saveListing()
  }

  async function handleDeleteListing() {
    setDeleteError('')
    setDeleteLoading(true)
    setLeaving(true)
    const { error: rpcError } = await supabase.rpc('delete_listing', {
      p_listing_id: id,
    })
    setDeleteLoading(false)

    if (rpcError) {
      setLeaving(false)
      setDeleteError(rpcError.message)
      return
    }

    photosRef.current.forEach(revokePhotoUrls)
    navigate('/hosting', { replace: true })
  }

  const currentDraft = listingEditorDraft({
    title,
    description,
    category,
    price,
    maxGuests,
    durationMins,
    groupPricing,
    area,
    fullAddress,
    whatsProvided,
    whatToBring,
    photos,
  })
  const isDirty =
    !fetching && !loading && !leaving && savedDraft != null && currentDraft !== savedDraft
  const deleteStats = listingUpcomingStats(id, upcomingSessions)
  const unsavedGuard = useUnsavedChangesGuard(isDirty)

  if (fetching) {
    return <PageLoader />
  }

  if (error && !title) {
    return (
      <div className="page page--narrow page--centered">
        <p className="error-message">{error}</p>
      </div>
    )
  }

  return (
    <div className="page page--form">
      {unsavedGuard}
      <div className="form-card form-card--wide">
        <h1 className="form-card__title">Edit listing</h1>
        <p className="form-card__subtitle">Update your experience details</p>

        <form onSubmit={handleSubmit} className="form" noValidate>
          <h2 className="form-section__title">The basics</h2>
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

          <label className="label">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will guests learn or experience?"
              rows={4}
              className="input input--textarea"
            />
            <FieldHint>{fieldHints.description}</FieldHint>
          </label>

          <label className="label">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input"
            >
              <option value="">Select a category</option>
              {LISTING_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <FieldHint>{fieldHints.category}</FieldHint>
          </label>

          <h2 className="form-section__title">Price and time</h2>
          <div className="form__row">
            <div>
              <label className="label">
                Price per person (SGD)
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="20"
                  min="1"
                  step="0.01"
                  className="input"
                />
              </label>
              <FieldHint>{fieldHints.price}</FieldHint>
            </div>

            <label className="label">
              Spots per session
              <input
                type="number"
                value={maxGuests}
                onChange={(e) => setMaxGuests(e.target.value)}
                placeholder="4"
                min="1"
                className="input"
              />
              <FieldHint>{fieldHints.spots}</FieldHint>
            </label>
          </div>

          <ListingPricePanel breakdown={breakdown} groupSize={guestCount} />

          <label className="label">
            Duration (mins)
            <input
              type="number"
              value={durationMins}
              onChange={(e) => setDurationMins(e.target.value)}
              placeholder="60"
              min="1"
              className="input"
            />
          </label>
          <span className="hint">
            New sessions use this length. Sessions already added keep theirs.
          </span>
          <FieldHint>{fieldHints.duration}</FieldHint>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={groupPricing}
              onChange={(e) => setGroupPricing(e.target.checked)}
            />
            Offer group discounts
          </label>
          <span className="hint">
            5% off for 2 guests, up to 20% for 5 or more. Applies to the lesson
            price per person.
          </span>
          {discountExample ? <p className="hint group-discount-example">{discountExample}</p> : null}

          <h2 className="form-section__title">Location</h2>
          <PostalAddressFields
            value={fullAddress}
            onChange={setFullAddress}
            area={area}
            onAreaChange={setArea}
            areaHint={<FieldHint>{fieldHints.area}</FieldHint>}
            allowChangeAddress
          />
          <FieldHint>{fieldHints.fullAddress}</FieldHint>

          <h2 className="form-section__title">Photos</h2>
          <PhotoTips />
          <ListingPhotosEditor
            photos={photos}
            onChange={setPhotos}
            max={MAX_PHOTOS}
            pickerRef={photoPickerRef}
            error={photoError}
          />

          <WhatsProvidedFields value={whatsProvided} onChange={setWhatsProvided} />
          <WhatToBringFields value={whatToBring} onChange={setWhatToBring} />

          {error ? (
            <p className="wizard__note" role="status">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            loading={loading}
            loadingLabel={photos.some((photo) => photo.file) ? 'Uploading' : 'Saving'}
          >
            Save changes
          </Button>
        </form>

        <div className="edit-listing-delete">
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              setDeleteError('')
              setDeleteOpen(true)
            }}
          >
            Delete listing
          </Button>
        </div>
      </div>

      {deleteOpen ? (
        <ListingDeleteDialog
          listing={{ title: listingTitle || title }}
          sessionCount={deleteStats.sessionCount}
          bookingCount={deleteStats.bookingCount}
          loading={deleteLoading}
          error={deleteError}
          onClose={() => setDeleteOpen(false)}
          onConfirm={handleDeleteListing}
        />
      ) : null}

      {photoSkipOpen ? (
        <PhotoSkipDialog
          onAdd={() => {
            setPhotoSkipOpen(false)
            photoPickerRef.current?.click()
          }}
          onSkip={() => {
            setPhotoSkipOpen(false)
            saveListing()
          }}
        />
      ) : null}
    </div>
  )
}
