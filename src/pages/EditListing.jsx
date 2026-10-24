import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import PlanningAreaSelect from '../components/PlanningAreaSelect'
import PostalAddressFields from '../components/PostalAddressFields'
import PhotoTips from '../components/PhotoTips'
import PhotoSkipDialog from '../components/PhotoSkipDialog'
import ListingPhotosEditor from '../components/ListingPhotosEditor'
import { revokePhotoUrls } from '../lib/coverCrop'
import { photosFromUrls, uploadListingPhotos } from '../lib/listingPhotos'
import ListingPricePanel from '../components/ListingPricePanel'
import WhatsProvidedFields from '../components/WhatsProvidedFields'
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
import { formatListingSpotsMessage } from '../lib/listingSpots'
import { PAGE_LOAD_ERROR, withIssuedAtRetry } from '../lib/pageLoad'
import { LISTING_CATEGORIES } from '../lib/listingCategories'
import { notifyListingSubmitted } from '../lib/listingReview'

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
  const [photos, setPhotos] = useState([])
  const photosRef = useRef(photos)
  const photoPickerRef = useRef(null)
  const [isFoundingHost, setIsFoundingHost] = useState(null)
  const [fieldHints, setFieldHints] = useState({})
  const [photoSkipOpen, setPhotoSkipOpen] = useState(false)
  const [error, setError] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [loading, setLoading] = useState(false)
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
      const [{ data, error: fetchError }, founding, addressResult] = await Promise.all([
        withIssuedAtRetry(() =>
          supabase.from('listings').select(LISTING_SELECT).eq('id', id).eq('host_id', userId).single()
        ),
        supabase.rpc('my_is_founding_host'),
        supabase.rpc('listing_address', { listing_id: id }),
      ])

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

      setTitle(data.title)
      setDescription(data.description)
      setCategory(data.category)
      setPrice(centsToDollars(data.price_per_person))
      setMaxGuests(String(data.max_guests))
      setDurationMins(data.duration_mins != null ? String(data.duration_mins) : '')
      setGroupPricing(data.group_pricing !== false)
      setArea(data.area ?? '')
      setFullAddress(typeof addressResult.data === 'string' ? addressResult.data : '')
      setWhatsProvided(data.whats_provided?.length ? data.whats_provided : [])
      setPhotos(photosFromUrls(data.photo_urls))
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
      photo_urls: photoUrls,
    }
    let { error: updateError } = await supabase
      .from('listings')
      .update(listingPayload)
      .eq('id', id)
      .eq('host_id', userId)
    if (updateError && /duration_mins|group_pricing/.test(updateError.message ?? '')) {
      const retry = { ...listingPayload }
      if (/duration_mins/.test(updateError.message ?? '')) delete retry.duration_mins
      if (/group_pricing/.test(updateError.message ?? '')) delete retry.group_pricing
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

    setLoading(false)

    if (spotsError) {
      showSaveProblem(spotsError)
      return
    }

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
          <label className="label">
            Area
            <PlanningAreaSelect value={area} onChange={setArea} hideUninhabited />
            <FieldHint>{fieldHints.area}</FieldHint>
          </label>

          <PostalAddressFields value={fullAddress} onChange={setFullAddress} />
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
      </div>

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
