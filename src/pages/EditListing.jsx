import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import ListingLocationsEditor from '../components/ListingLocationsEditor'
import PhotoSkipDialog from '../components/PhotoSkipDialog'
import ListingPhotosEditor from '../components/ListingPhotosEditor'
import { revokePhotoUrls } from '../lib/coverCrop'
import { MAX_PHOTOS, photosFromUrls, uploadListingPhotos } from '../lib/listingPhotos'
import ListingAddonsEditor from '../components/ListingAddonsEditor'
import SessionTypesEditor from '../components/SessionTypesEditor'
import WhatsProvidedFields from '../components/WhatsProvidedFields'
import WhatToBringFields from '../components/WhatToBringFields'
import FieldHint from '../components/FieldHint'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Icon from '../components/ui/Icon'
import PageLoader from '../components/PageLoader'
import { foundingHostFromRpc } from '../lib/foundingHost'
import {
  GROUP_DISCOUNT_TIERS,
  MAX_PRICE_PER_PERSON_CENTS,
  discountedLessonCents,
  guestFacingPriceCents,
  hostPriceBreakdown,
  parsePriceInputCents,
} from '../lib/pricing'
import { formatSgd } from '../lib/hostingDashboard'
import { formatDuration } from '../lib/duration'
import {
  LISTING_FIELD_HINTS,
  PHOTO_UPLOAD_ERROR,
  listingSaveProblem,
} from '../lib/listingFieldHints'
import { changedListingColumns, listingColumns, savedPhotoUrls } from '../lib/listingSaveColumns'
import { formatListingSpotsMessage } from '../lib/listingSpots'
import { PAGE_LOAD_ERROR, withIssuedAtRetry } from '../lib/pageLoad'
import { LISTING_CATEGORIES } from '../lib/listingCategories'
import { notifyListingSubmitted } from '../lib/listingReview'
import { listingEditorDraft } from '../lib/unsavedDraft'
import {
  addonFieldHints,
  isMissingAddonsTable,
  loadListingAddons,
  saveListingAddons,
} from '../lib/listingAddons'
import {
  isMissingSessionTypes,
  loadSessionTypesForEditor,
  saveSessionTypes,
  sessionTypeFieldHints,
} from '../lib/sessionTypes'
import {
  datesByLocation,
  loadLocationsForEditor,
  locationFieldHints,
  locationSaveMessage,
  saveListingLocations,
} from '../lib/listingLocations'
import { useUnsavedChangesGuard } from '../lib/useUnsavedChangesGuard'
import ListingDeleteDialog from '../components/ListingDeleteDialog'
import {
  HOST_SESSIONS_SELECT,
  listingDeleteErrorMessage,
  listingUpcomingStats,
  upcomingSessionsFrom,
} from '../lib/listingDelete'
import { monthStartIso } from '../lib/hostingDashboard'
import { BookingCutoffFields } from '../components/BookingCutoffFields'
import {
  DEFAULT_BOOKING_CUTOFF_HOURS,
  bookingCutoffHours,
  isMissingCutoffColumn,
} from '../lib/bookingCutoff'
import {
  EDIT_SECTION_GROUPS,
  editSection,
  listingStatusLabel,
  nextDateLine,
  quickWinCount,
  sectionForHint,
  sectionSummaries,
  stepPriceDollars,
} from '../lib/editListingSections'
import { PHOTO_LIGHT_TIP, PHOTO_SLOTS } from '../lib/photoTips'
import { formatSessionDay } from '../lib/sessionDate'

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
  booking_cutoff_hours,
  multi_location,
  photo_urls,
  review_status,
  host_id
`

const DURATION_CHOICES = [
  { mins: 60, label: '1 hr' },
  { mins: 90, label: '1.5 hr' },
  { mins: 120, label: '2 hr' },
  { mins: 180, label: '3 hr' },
]
const MIN_SPOTS = 1
const MAX_SPOTS = 50
const MAX_PRICE_DOLLARS = MAX_PRICE_PER_PERSON_CENTS / 100

/** One line under each section's title, saying what changing it does. */
const SECTION_INTROS = {
  basics: 'What guests read first when they find your session.',
  price: 'Changes apply to new bookings. Existing bookings keep their price.',
  addons: 'Extras guests can add when they book.',
  types:
    'Teach more than one class under this listing? Add each one here. Every date you add is one of these classes, and guests pick a class by picking a date.',
  notice: 'How close to the start guests can still book.',
  location: 'Guests see only the area until they book.',
  photos: 'Real photos of your session, taken on your phone, are perfect.',
  provided: 'What guests get from you on the day.',
  bring: 'What guests should bring along.',
}

function centsToDollars(cents) {
  const dollars = cents / 100
  return dollars % 1 === 0 ? String(dollars) : dollars.toFixed(2)
}

export default function EditListing() {
  const { id } = useParams()
  const navigate = useNavigate()
  const userId = useAuthedUserId()
  const [searchParams] = useSearchParams()

  const [fetching, setFetching] = useState(true)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('')
  const [maxGuests, setMaxGuests] = useState('')
  const [durationMins, setDurationMins] = useState('')
  const [otherDuration, setOtherDuration] = useState(false)
  const [groupPricing, setGroupPricing] = useState(true)
  const [area, setArea] = useState('')
  const [fullAddress, setFullAddress] = useState('')
  const [arrivalInstructions, setArrivalInstructions] = useState('')
  const [bookingCutoff, setBookingCutoff] = useState(DEFAULT_BOOKING_CUTOFF_HOURS)
  const [whatsProvided, setWhatsProvided] = useState([])
  const [whatToBring, setWhatToBring] = useState([])
  const [photos, setPhotos] = useState([])
  const [addons, setAddons] = useState([])
  const [savedAddons, setSavedAddons] = useState([])
  const [addonsAvailable, setAddonsAvailable] = useState(false)
  const [addonsLoaded, setAddonsLoaded] = useState(false)
  const [sessionTypes, setSessionTypes] = useState([])
  const [savedSessionTypes, setSavedSessionTypes] = useState([])
  const [typesAvailable, setTypesAvailable] = useState(false)
  const [typesLoaded, setTypesLoaded] = useState(false)
  // Listing locations (00059). Location 1 is area / fullAddress / arrivalInstructions.
  const [multiLocation, setMultiLocation] = useState(false)
  const [primaryLabel, setPrimaryLabel] = useState('')
  const [extraLocations, setExtraLocations] = useState([])
  const [savedExtraLocations, setSavedExtraLocations] = useState([])
  const [primaryLocationId, setPrimaryLocationId] = useState(null)
  const [locationsAvailable, setLocationsAvailable] = useState(false)
  const [locationsLoaded, setLocationsLoaded] = useState(false)
  const photosRef = useRef(photos)
  const photoPickerRef = useRef(null)
  const [isFoundingHost, setIsFoundingHost] = useState(null)
  const [fieldHints, setFieldHints] = useState({})
  const [photoSkipOpen, setPhotoSkipOpen] = useState(false)
  const [error, setError] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [loading, setLoading] = useState(false)
  // The values as last loaded or saved: Discard goes back to these, and the
  // save bar compares against them.
  const [saved, setSaved] = useState(null)
  const [savedNote, setSavedNote] = useState('')
  const [listingTitle, setListingTitle] = useState('')
  const [reviewStatus, setReviewStatus] = useState(null)
  const [upcomingSessions, setUpcomingSessions] = useState([])
  const [sessionsFailed, setSessionsFailed] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [leaving, setLeaving] = useState(false)
  const priceCents = parsePriceInputCents(price)
  const guests = parseInt(maxGuests, 10)
  const guestCount = Number.isInteger(guests) ? guests : 1
  const breakdown = hostPriceBreakdown(priceCents, isFoundingHost, guestCount, groupPricing)

  const values = {
    title,
    description,
    category,
    price,
    maxGuests,
    durationMins,
    groupPricing,
    area,
    fullAddress,
    arrivalInstructions,
    bookingCutoffHours: bookingCutoff,
    whatsProvided,
    whatToBring,
    photos,
    addons,
    sessionTypes,
    multiLocation,
    primaryLabel,
    extraLocations,
  }

  function applyValues(next) {
    setTitle(next.title)
    setDescription(next.description)
    setCategory(next.category)
    setPrice(next.price)
    setMaxGuests(next.maxGuests)
    setDurationMins(next.durationMins)
    setOtherDuration(false)
    setGroupPricing(next.groupPricing)
    setArea(next.area)
    setFullAddress(next.fullAddress)
    setArrivalInstructions(next.arrivalInstructions)
    setBookingCutoff(next.bookingCutoffHours)
    setWhatsProvided(next.whatsProvided)
    setWhatToBring(next.whatToBring)
    setPhotos(next.photos)
    setAddons(next.addons)
    setSessionTypes(next.sessionTypes)
    setMultiLocation(next.multiLocation)
    setPrimaryLabel(next.primaryLabel)
    setExtraLocations(next.extraLocations)
  }

  useEffect(() => {
    photosRef.current = photos
  }, [photos])

  useEffect(() => {
    async function fetchListing() {
      let listingResult = await withIssuedAtRetry(() =>
        supabase.from('listings').select(LISTING_SELECT).eq('id', id).eq('host_id', userId).single()
      )
      if (
        listingResult.error &&
        /what_to_bring|booking_cutoff_hours|multi_location/.test(listingResult.error.message ?? '')
      ) {
        listingResult = await withIssuedAtRetry(() =>
          supabase
            .from('listings')
            .select(
              LISTING_SELECT.replace(/\s*what_to_bring,\n/, '\n')
                .replace(/\s*booking_cutoff_hours,\n/, '\n')
                .replace(/\s*multi_location,\n/, '\n'),
            )
            .eq('id', id)
            .eq('host_id', userId)
            .single()
        )
      }
      const [founding, addressResult, arrivalResult, sessionsResult] = await Promise.all([
        supabase.rpc('my_is_founding_host'),
        supabase.rpc('listing_address', { listing_id: id }),
        supabase.rpc('listing_arrival_instructions', { listing_id: id }),
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
      setReviewStatus(data.review_status ?? null)
      if (sessionsResult.error) {
        setUpcomingSessions([])
        setSessionsFailed(true)
      } else {
        setUpcomingSessions(upcomingSessionsFrom(sessionsResult.data))
        setSessionsFailed(false)
      }

      const addonResult = await loadListingAddons(supabase, id)
      setAddonsAvailable(addonResult.available)
      setAddonsLoaded(addonResult.loaded)
      setSavedAddons(addonResult.addons)
      const typeResult = await loadSessionTypesForEditor(supabase, id)
      setTypesAvailable(typeResult.available)
      setTypesLoaded(typeResult.loaded)
      setSavedSessionTypes(typeResult.types)
      const locationResult = await loadLocationsForEditor(supabase, id, {
        multiLocation: data.multi_location,
      })
      setLocationsAvailable(locationResult.available)
      setLocationsLoaded(locationResult.loaded)
      setPrimaryLocationId(locationResult.primaryId)
      setSavedExtraLocations(locationResult.extras)

      const loaded = {
        title: data.title,
        description: data.description,
        category: data.category,
        price: centsToDollars(data.price_per_person),
        maxGuests: String(data.max_guests),
        durationMins: data.duration_mins != null ? String(data.duration_mins) : '',
        groupPricing: data.group_pricing !== false,
        area: data.area ?? '',
        fullAddress: typeof addressResult.data === 'string' ? addressResult.data : '',
        arrivalInstructions:
          !arrivalResult.error && typeof arrivalResult.data === 'string' ? arrivalResult.data : '',
        bookingCutoffHours: bookingCutoffHours(data.booking_cutoff_hours),
        whatsProvided: data.whats_provided?.length ? data.whats_provided : [],
        whatToBring: data.what_to_bring?.length ? data.what_to_bring : [],
        photos: photosFromUrls(data.photo_urls),
        addons: addonResult.addons,
        sessionTypes: typeResult.types,
        multiLocation: locationResult.multiLocation,
        primaryLabel: locationResult.primaryLabel,
        extraLocations: locationResult.extras,
      }
      applyValues(loaded)
      setSaved(loaded)
      setFetching(false)
    }

    fetchListing()
  }, [userId, id])

  useEffect(() => {
    return () => {
      photosRef.current.forEach(revokePhotoUrls)
    }
  }, [])

  function sectionShown(sectionId) {
    if (sectionId === 'addons') return addonsAvailable
    if (sectionId === 'types') return typesAvailable
    return Boolean(editSection(sectionId))
  }

  const requested = searchParams.get('section')
  // On phones no section means the overview; on desktop the overview is the
  // list on the left and the first section is open beside it.
  const sectionId = requested && sectionShown(requested) ? requested : null
  const activeId = sectionId ?? 'basics'

  function openSection(next) {
    navigate({ search: `?section=${next}` })
  }

  function collectHints(typesToCheck = sessionTypes) {
    const hints = {}
    if (!title.trim()) hints.title = LISTING_FIELD_HINTS.title
    if (!description.trim()) hints.description = LISTING_FIELD_HINTS.description
    if (!category) hints.category = LISTING_FIELD_HINTS.category
    if (priceCents == null) hints.price = LISTING_FIELD_HINTS.price
    else if (price !== saved?.price && priceCents % 100 !== 0) {
      hints.price = LISTING_FIELD_HINTS.priceWhole
    }
    if (Number.isNaN(guests) || guests < 1) hints.spots = LISTING_FIELD_HINTS.spots
    const duration = parseInt(durationMins, 10)
    if (Number.isNaN(duration) || duration < 1) hints.duration = LISTING_FIELD_HINTS.duration
    if (!area) hints.area = LISTING_FIELD_HINTS.area
    if (!fullAddress.trim()) hints.fullAddress = LISTING_FIELD_HINTS.fullAddress
    if (addonsAvailable) Object.assign(hints, addonFieldHints(addons))
    if (typesAvailable) Object.assign(hints, sessionTypeFieldHints(typesToCheck))
    if (multiLocation) Object.assign(hints, locationFieldHints(extraLocations))
    return hints
  }

  function showSaveProblem(saveError) {
    const problem = listingSaveProblem(saveError)
    if (problem.field) {
      setFieldHints({ [problem.field]: problem.hint })
      if (sectionForHint(problem.field) !== activeId) openSection(sectionForHint(problem.field))
    }
    setError(problem.message)
  }

  async function saveListing(overrides = {}) {
    const typesToSave = overrides.sessionTypes ?? sessionTypes
    setError('')
    setPhotoError('')
    setSavedNote('')
    setFieldHints({})

    setLoading(true)

    let photoUrls
    try {
      photoUrls = await uploadListingPhotos(photos, userId, supabase.storage)
    } catch (uploadError) {
      console.error('Listing photo upload failed', uploadError)
      setLoading(false)
      setPhotoError(PHOTO_UPLOAD_ERROR)
      if (activeId !== 'photos') openSection('photos')
      return false
    }

    // Only what this host changed here, so a tab opened before another save
    // cannot write that save's fixes (say a corrected title) back to the old text.
    const listingPayload = changedListingColumns(
      listingColumns(values, photoUrls),
      saved ? listingColumns(saved, savedPhotoUrls(saved.photos)) : null,
    )
    let updateError = null
    if (Object.keys(listingPayload).length > 0) {
      ;({ error: updateError } = await supabase
        .from('listings')
        .update(listingPayload)
        .eq('id', id)
        .eq('host_id', userId))
    }
    if (
      updateError &&
      (/duration_mins|group_pricing|what_to_bring/.test(updateError.message ?? '') ||
        isMissingCutoffColumn(updateError))
    ) {
      const retry = { ...listingPayload }
      if (/duration_mins/.test(updateError.message ?? '')) delete retry.duration_mins
      if (/group_pricing/.test(updateError.message ?? '')) delete retry.group_pricing
      if (/what_to_bring/.test(updateError.message ?? '')) delete retry.what_to_bring
      if (/arrival_instructions/.test(updateError.message ?? '')) delete retry.arrival_instructions
      if (/booking_cutoff_hours/.test(updateError.message ?? '')) delete retry.booking_cutoff_hours
      ;({ error: updateError } = await supabase
        .from('listings')
        .update(retry)
        .eq('id', id)
        .eq('host_id', userId))
    }

    if (updateError) {
      setLoading(false)
      showSaveProblem(updateError)
      return false
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
      return false
    }

    let nextAddons = addons
    if (addonsAvailable && addonsLoaded) {
      const { error: addonError, insertedIds } = await saveListingAddons({
        client: supabase,
        listingId: id,
        addons,
        existing: savedAddons,
        userId,
        storage: supabase.storage,
      })
      nextAddons = addons.map((addon) =>
        insertedIds?.[addon.key] ? { ...addon, id: insertedIds[addon.key] } : addon,
      )
      if (addonError && !isMissingAddonsTable(addonError)) {
        // Keep what did save, so pressing Save again updates instead of duplicating.
        setAddons(nextAddons)
        const fresh = await loadListingAddons(supabase, id)
        if (fresh.loaded) setSavedAddons(fresh.addons)
        setLoading(false)
        showSaveProblem(addonError)
        return false
      }
    }

    let nextTypes = typesToSave
    if (typesAvailable && typesLoaded) {
      const { error: typesError, insertedIds } = await saveSessionTypes({
        client: supabase,
        listingId: id,
        types: typesToSave,
        existing: savedSessionTypes,
        userId,
        storage: supabase.storage,
      })
      nextTypes = typesToSave.map((type) =>
        insertedIds?.[type.key] ? { ...type, id: insertedIds[type.key] } : type,
      )
      if (typesError && !isMissingSessionTypes(typesError)) {
        // Keep what did save, so pressing Save again updates instead of duplicating.
        setSessionTypes(nextTypes)
        const fresh = await loadSessionTypesForEditor(supabase, id)
        if (fresh.loaded) setSavedSessionTypes(fresh.types)
        setLoading(false)
        showSaveProblem(typesError)
        return false
      }
    }

    let nextExtras = extraLocations
    if (locationsAvailable && locationsLoaded) {
      const { error: locationsError, insertedIds } = await saveListingLocations({
        client: supabase,
        listingId: id,
        multiLocation,
        savedMultiLocation: saved?.multiLocation === true,
        primaryId: primaryLocationId,
        primaryLabel,
        savedPrimaryLabel: saved?.primaryLabel ?? '',
        extras: multiLocation ? extraLocations : [],
        existing: savedExtraLocations,
      })
      nextExtras = extraLocations.map((location) =>
        insertedIds?.[location.key] ? { ...location, id: insertedIds[location.key] } : location,
      )
      if (locationsError) {
        // Keep what did save, so pressing Save again updates instead of duplicating.
        setExtraLocations(nextExtras)
        const { data: flag } = await supabase
          .from('listings')
          .select('multi_location')
          .eq('id', id)
          .eq('host_id', userId)
          .single()
        const fresh = await loadLocationsForEditor(supabase, id, { multiLocation: flag?.multi_location })
        if (fresh.loaded) {
          setSavedExtraLocations(fresh.extras)
          setSaved((prev) => (prev ? { ...prev, multiLocation: fresh.multiLocation, primaryLabel: fresh.primaryLabel } : prev))
        }
        setLoading(false)
        setError(locationSaveMessage(locationsError))
        if (activeId !== 'location') openSection('location')
        return false
      }
    }

    // Stay on the page: the saved photos are now the uploaded ones, and what
    // was inserted carries its id, so the next save updates rather than adds.
    const savedPhotos = photosFromUrls(photoUrls)
    photos.forEach(revokePhotoUrls)
    const nextSaved = {
      ...values,
      ...overrides,
      photos: savedPhotos,
      addons: nextAddons,
      sessionTypes: nextTypes,
      extraLocations: nextExtras,
    }
    setPhotos(savedPhotos)
    setAddons(nextAddons)
    setSessionTypes(nextTypes)
    setSavedAddons(nextAddons)
    setSavedSessionTypes(nextTypes)
    setExtraLocations(nextExtras)
    setSavedExtraLocations(nextExtras)
    setSaved(nextSaved)
    setListingTitle(title.trim())
    setSavedNote(`Saved. ${formatListingSpotsMessage(spotsData)}`.trim())
    setLoading(false)
    // Only does anything when this edit put the listing back in the queue.
    void notifyListingSubmitted()
    return true
  }

  /** A class card's Save (or Remove): the same save as the bar, from the card. */
  async function saveFromCard(overrides = {}) {
    const hints = collectHints(overrides.sessionTypes)
    const keys = Object.keys(hints)
    if (keys.length) {
      setFieldHints(hints)
      setSavedNote('')
      const target = sectionForHint(keys[0])
      setError(target === activeId ? '' : `Check ${editSection(target).label} before saving.`)
      return false
    }
    return saveListing(overrides)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const hints = collectHints()
    const keys = Object.keys(hints)
    if (keys.length) {
      setFieldHints(hints)
      setSavedNote('')
      const target = sectionForHint(keys[0])
      setError(target === activeId ? '' : `Check ${editSection(target).label} before saving.`)
      if (target !== activeId) openSection(target)
      return
    }
    // Only when this edit took the last photo away; a listing that never had
    // photos is nudged by the Photos dot instead of at every save.
    if (photos.length === 0 && saved?.photos.length > 0) {
      setPhotoSkipOpen(true)
      return
    }
    await saveListing()
  }

  function discardChanges() {
    if (!saved) return
    photos.filter((photo) => !saved.photos.includes(photo)).forEach(revokePhotoUrls)
    applyValues(saved)
    setFieldHints({})
    setError('')
    setPhotoError('')
    setSavedNote('')
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
      console.error('Listing delete failed', rpcError)
      setLeaving(false)
      setDeleteError(listingDeleteErrorMessage(rpcError))
      return
    }

    photosRef.current.forEach(revokePhotoUrls)
    navigate('/hosting', { replace: true })
  }

  const isDirty =
    !fetching &&
    !loading &&
    !leaving &&
    saved != null &&
    listingEditorDraft(values) !== listingEditorDraft(saved)
  const deleteStats = listingUpcomingStats(id, upcomingSessions)
  const unsavedGuard = useUnsavedChangesGuard(isDirty, { samePageOk: true })

  if (fetching) {
    return <PageLoader />
  }

  if (error && !saved) {
    return (
      <div className="page page--narrow page--centered">
        <p className="error-message">{error}</p>
      </div>
    )
  }

  const summaries = sectionSummaries(values)
  const wins = quickWinCount(summaries)
  const status = listingStatusLabel(reviewStatus)
  const nextLine = nextDateLine(upcomingSessions, maxGuests)
  const nextSession = upcomingSessions[0]
  const name = listingTitle || title
  const activeLabel = editSection(activeId)?.label ?? ''
  const durationChoice = DURATION_CHOICES.some((choice) => String(choice.mins) === durationMins)
    ? Number(durationMins)
    : otherDuration || durationMins
      ? 'other'
      : null

  function statusBadge() {
    return status ? (
      <span className={`edit-status edit-status--${status.tone}`}>{status.label}</span>
    ) : null
  }

  function renderPrice() {
    const wholeDollars = Number.parseFloat(price)
    return (
      <>
        <div className="edit-price">
          <div className="edit-field">
            <p className="edit-field__label" id="edit-price-label">
              Your price per guest
            </p>
            <p className="edit-field__hint">
              What you receive. Most sessions on TryKai are S$10 to S$40 a guest.
            </p>
            <div className="price-stepper" role="group" aria-label="Change your price">
              <button
                type="button"
                className="price-stepper__btn"
                aria-label="Lower price by S$1"
                disabled={!(wholeDollars > 1)}
                onClick={() => setPrice(stepPriceDollars(price, -1, { max: MAX_PRICE_DOLLARS }))}
              >
                −
              </button>
              <label className="price-stepper__box">
                <span className="price-stepper__currency" aria-hidden="true">
                  S$
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={MAX_PRICE_DOLLARS}
                  step="1"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  className="price-stepper__input"
                  aria-label="Your price per guest"
                />
              </label>
              <button
                type="button"
                className="price-stepper__btn"
                aria-label="Raise price by S$1"
                disabled={wholeDollars >= MAX_PRICE_DOLLARS}
                onClick={() => setPrice(stepPriceDollars(price, 1, { max: MAX_PRICE_DOLLARS }))}
              >
                +
              </button>
            </div>
            <FieldHint>{fieldHints.price}</FieldHint>
          </div>

          {breakdown ? (
            <dl className="edit-earnings" aria-live="polite">
              <div className="edit-earnings__row edit-earnings__row--lead">
                <dt>Guests see</dt>
                <dd>
                  {formatSgd(breakdown.guestsPayCents)} <span>/person</span>
                </dd>
              </div>
              {breakdown.afterFeeCents != null ? (
                <div className="edit-earnings__row">
                  <dt>
                    You get from your {ordinal(breakdown.feeFreeBookings + 1)} booking (
                    {breakdown.feePercent}% fee)
                  </dt>
                  <dd>{formatSgd(breakdown.afterFeeCents)}</dd>
                </div>
              ) : null}
              {breakdown.isFoundingHost ? (
                <div className="edit-earnings__row">
                  <dt>You get, as a founding host (no fee)</dt>
                  <dd>{formatSgd(breakdown.youReceiveCents)}</dd>
                </div>
              ) : null}
              <div className="edit-earnings__row edit-earnings__row--total">
                <dt>Full session of {guestCount}</dt>
                <dd>{formatSgd(breakdown.fullSessionCents)}</dd>
              </div>
            </dl>
          ) : null}
        </div>

        <div className="edit-split">
          <div className="edit-field">
            <div className="edit-field__row">
              <div>
                <p className="edit-field__label" id="edit-spots-label">
                  Spots per session
                </p>
                <p className="edit-field__hint">The most guests in one session.</p>
              </div>
              <div className="guest-stepper__controls" role="group" aria-label="Change spots">
                <button
                  type="button"
                  className="guest-stepper__btn"
                  aria-label="Fewer spots"
                  disabled={!(guests > MIN_SPOTS)}
                  onClick={() => setMaxGuests(String(Math.max(MIN_SPOTS, guestCount - 1)))}
                >
                  −
                </button>
                <output className="guest-stepper__count" aria-live="polite" aria-label="Spots per session">
                  {maxGuests}
                </output>
                <button
                  type="button"
                  className="guest-stepper__btn"
                  aria-label="More spots"
                  disabled={guests >= MAX_SPOTS}
                  onClick={() => setMaxGuests(String(Math.min(MAX_SPOTS, guestCount + 1)))}
                >
                  +
                </button>
              </div>
            </div>
            <FieldHint>{fieldHints.spots}</FieldHint>
          </div>

          <fieldset className="wizard-fieldset edit-field">
            <legend className="edit-field__label">Session length</legend>
            <p className="edit-field__hint">Dates you&apos;ve already added keep their length.</p>
            <div className="choice-chips edit-duration">
              {DURATION_CHOICES.map((choice) => (
                <label
                  key={choice.mins}
                  className={`choice-chip${durationChoice === choice.mins ? ' choice-chip--on' : ''}`}
                >
                  <input
                    type="radio"
                    name="edit-duration"
                    checked={durationChoice === choice.mins}
                    onChange={() => {
                      setOtherDuration(false)
                      setDurationMins(String(choice.mins))
                    }}
                    className="visually-hidden"
                  />
                  {choice.label}
                </label>
              ))}
              <label className={`choice-chip${durationChoice === 'other' ? ' choice-chip--on' : ''}`}>
                <input
                  type="radio"
                  name="edit-duration"
                  checked={durationChoice === 'other'}
                  onChange={() => {
                    setOtherDuration(true)
                    setDurationMins('')
                  }}
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
                  inputMode="numeric"
                  min="1"
                  value={durationMins}
                  onChange={(event) => setDurationMins(event.target.value)}
                  placeholder="45"
                  className="input"
                />
              </label>
            ) : null}
            <FieldHint>{fieldHints.duration}</FieldHint>
          </fieldset>
        </div>

        <div className="edit-field">
          <div className="edit-field__row">
            <div>
              <p className="edit-field__label" id="edit-discounts-label">
                Group discounts
              </p>
              <p className="edit-field__hint">
                Friends and couples get a little off when they book together. Never applies to
                add-ons.
              </p>
            </div>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              aria-labelledby="edit-discounts-label"
              checked={groupPricing}
              onChange={(event) => setGroupPricing(event.target.checked)}
            />
          </div>
          {groupPricing ? (
            <>
              <table className="discount-table">
                <caption className="visually-hidden">Group discount by group size</caption>
                <tbody>
                  {GROUP_DISCOUNT_TIERS.map((tier) => (
                    <tr key={tier.guests}>
                      <th scope="row">
                        {tier.guests === '5+' ? '5 or more' : `${tier.guests} guests`}
                      </th>
                      <td>−{tier.percent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {priceCents && guestCount > 1 ? (
                <p className="edit-field__hint">
                  A group of {guestCount} booking together pays you{' '}
                  {formatSgd(discountedLessonCents(priceCents, guestCount, true))} instead of{' '}
                  {formatSgd(priceCents * guestCount)}.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </>
    )
  }

  function renderSection(sectionKey) {
    if (sectionKey === 'basics') {
      return (
        <>
          <label className="label">
            Title
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Learn latte art with me"
              className="input"
            />
            <FieldHint>{fieldHints.title}</FieldHint>
          </label>
          <label className="label">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What will guests learn or experience?"
              rows={5}
              className="input input--textarea"
            />
            <FieldHint>{fieldHints.description}</FieldHint>
          </label>
          <label className="label">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
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
        </>
      )
    }
    if (sectionKey === 'price') return renderPrice()
    if (sectionKey === 'addons') {
      return <ListingAddonsEditor addons={addons} onChange={setAddons} fieldHints={fieldHints} />
    }
    if (sectionKey === 'types') {
      return (
        <SessionTypesEditor
          types={sessionTypes}
          savedTypes={savedSessionTypes}
          onChange={setSessionTypes}
          onSave={saveFromCard}
          saving={loading}
          fieldHints={fieldHints}
          upcomingSessions={upcomingSessions}
          listingId={id}
          priceLabel={priceCents ? formatSgd(guestFacingPriceCents(priceCents)) : ''}
        />
      )
    }
    if (sectionKey === 'notice') {
      return <BookingCutoffFields value={bookingCutoff} onChange={setBookingCutoff} />
    }
    if (sectionKey === 'location') {
      return (
        <ListingLocationsEditor
          area={area}
          onAreaChange={setArea}
          fullAddress={fullAddress}
          onFullAddressChange={setFullAddress}
          arrivalInstructions={arrivalInstructions}
          onArrivalChange={setArrivalInstructions}
          primaryId={primaryLocationId}
          primaryLabel={primaryLabel}
          onPrimaryLabelChange={setPrimaryLabel}
          multiLocation={multiLocation}
          onMultiLocationChange={setMultiLocation}
          extras={extraLocations}
          onExtrasChange={setExtraLocations}
          fieldHints={fieldHints}
          allowChangeAddress
          datesByLocationId={datesByLocation(upcomingSessions)}
          available={locationsAvailable && locationsLoaded}
        />
      )
    }
    if (sectionKey === 'photos') {
      return (
        <>
          <ListingPhotosEditor
            photos={photos}
            onChange={setPhotos}
            max={MAX_PHOTOS}
            pickerRef={photoPickerRef}
            error={photoError}
            slots={PHOTO_SLOTS}
          />
          <p className="edit-tip">
            <Icon name="sparkle" size={18} />
            {PHOTO_LIGHT_TIP}
          </p>
        </>
      )
    }
    if (sectionKey === 'provided') {
      return <WhatsProvidedFields value={whatsProvided} onChange={setWhatsProvided} showLegend={false} />
    }
    return <WhatToBringFields value={whatToBring} onChange={setWhatToBring} showLegend={false} />
  }

  const saveStatus = loading
    ? photos.some((photo) => photo.file)
      ? 'Uploading photos…'
      : 'Saving…'
    : error || (isDirty ? 'Unsaved changes' : savedNote || 'All changes saved')

  return (
    <div className={`page edit-page${sectionId ? ' edit-page--section' : ' edit-page--overview'}`}>
      {unsavedGuard}

      <header className="edit-head">
        <Link to="/hosting" className="edit-head__back">
          <Icon name="chevronLeft" size={16} />
          Back to hosting
        </Link>
        <div className="edit-head__name">
          <h1 className="edit-head__title">{name}</h1>
          {statusBadge()}
        </div>
        {/* Manage dates is about the schedule, so it sits with the next date. */}
        <p className="edit-head__meta">
          {nextLine ? <span className="edit-head__next">{nextLine}</span> : null}
          <Link to="/hosting" className="edit-head__dates">
            <Icon name="calendar" size={16} />
            Manage dates
          </Link>
        </p>
      </header>

      <div className="edit-layout">
        <div className="edit-overview">
          <div className="edit-bar">
            <Link to="/hosting" className="edit-bar__back" aria-label="Back to hosting">
              <Icon name="chevronLeft" size={22} />
            </Link>
            <h1 className="edit-bar__title">Edit listing</h1>
            <Link to={`/listings/${id}`} className="edit-bar__preview">
              <Icon name="eye" size={18} />
              Preview
            </Link>
          </div>

          <div className="edit-summary">
            {photos[0] ? (
              <img src={photos[0].previewUrl} alt="" className="edit-summary__cover" />
            ) : (
              <span className="edit-summary__cover edit-summary__cover--empty" aria-hidden="true">
                <Icon name="camera" size={22} />
              </span>
            )}
            <div className="edit-summary__copy">
              {statusBadge()}
              <p className="edit-summary__title">{name}</p>
              {nextLine ? <p className="edit-summary__next">{nextLine}</p> : null}
            </div>
            <Link to="/hosting" className="btn btn--secondary edit-summary__dates">
              <Icon name="calendar" size={18} />
              Manage dates
            </Link>
          </div>

          {wins ? (
            <p className="edit-wins">
              <Icon name="star" size={18} />
              <span>
                <strong>
                  {wins} quick win{wins === 1 ? '' : 's'}
                </strong>{' '}
                would make this listing easier to book. {wins === 1 ? "It's" : "They're"} marked
                below.
              </span>
            </p>
          ) : null}

          <nav className="edit-nav" aria-label="Listing sections">
            {EDIT_SECTION_GROUPS.map((group) => {
              const shown = group.sections.filter((section) => sectionShown(section.id))
              if (!shown.length) return null
              return (
                <div key={group.label} className="edit-nav__group">
                  <h2 className="edit-nav__heading">{group.label}</h2>
                  <ul className="edit-nav__list">
                    {shown.map((section) => {
                      const summary = summaries[section.id]
                      const on = section.id === activeId
                      return (
                        <li key={section.id}>
                          <Link
                            to={{ search: `?section=${section.id}` }}
                            className={`edit-nav__row${on ? ' edit-nav__row--on' : ''}${
                              summary.needsWork ? ' edit-nav__row--todo' : ''
                            }`}
                            aria-current={on ? 'page' : undefined}
                          >
                            <span className="edit-nav__copy">
                              <span className="edit-nav__label">{section.label}</span>
                              <span className="edit-nav__summary">{summary.text}</span>
                            </span>
                            {summary.needsWork ? (
                              <span className="edit-nav__dot" aria-hidden="true" />
                            ) : null}
                            <Icon name="chevronRight" size={18} className="edit-nav__chevron" />
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </nav>

          <div className="edit-danger">
            <h2 className="edit-nav__heading">Listing status</h2>
            <button
              type="button"
              className="edit-danger__delete"
              onClick={() => {
                setDeleteError('')
                setDeleteOpen(true)
              }}
            >
              Delete listing
            </button>
            <p className="edit-field__hint">
              You&apos;ll be asked to confirm first. A listing with upcoming bookings can&apos;t
              be deleted until those sessions are cancelled.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="edit-panel"
          aria-labelledby="edit-section-title"
          noValidate
        >
          <div className="edit-panel__bar">
            <Link to={{ search: '' }} className="edit-panel__back" aria-label="All sections">
              <Icon name="chevronLeft" size={22} />
            </Link>
            <div className="edit-panel__titles">
              <p className="edit-panel__listing">{name}</p>
              <h2 id="edit-section-title" className="edit-panel__title">
                {activeLabel}
              </h2>
            </div>
          </div>
          <p className="edit-panel__intro">{SECTION_INTROS[activeId]}</p>
          <div className="edit-panel__body">{renderSection(activeId)}</div>

          <div className="edit-savebar">
            <p
              className={`edit-savebar__status${
                error ? ' edit-savebar__status--error' : isDirty ? ' edit-savebar__status--dirty' : ''
              }`}
              role="status"
            >
              {saveStatus}
            </p>
            <div className="edit-savebar__actions">
              <button
                type="button"
                className="btn btn--secondary"
                disabled={!isDirty}
                onClick={discardChanges}
              >
                Discard
              </button>
              <Button
                type="submit"
                variant="primary"
                disabled={!isDirty && !loading}
                loading={loading}
                loadingLabel={photos.some((photo) => photo.file) ? 'Uploading' : 'Saving'}
              >
                Save changes
              </Button>
            </div>
          </div>
        </form>

        <aside className="edit-preview" aria-label="How guests see it">
          <p className="edit-nav__heading">How guests see it</p>
          <Card
            mode="browse"
            image={photos[0]?.previewUrl}
            badge={category || 'Other'}
            title={title.trim() || name}
            titleLevel={3}
            metaItems={[nextSession ? formatSessionDay(nextSession.starts_at) : '', area].filter(Boolean)}
            price={priceCents ? formatSgd(guestFacingPriceCents(priceCents)) : 'S$—'}
            priceUnit="/person"
            length={formatDuration(Number(durationMins))}
          />
          <p className="edit-field__hint">Updates as you edit. Only saved changes go live.</p>
          <Link to={`/listings/${id}`} className="btn btn--secondary edit-preview__open">
            <Icon name="eye" size={18} />
            Preview full listing
          </Link>
        </aside>
      </div>

      {deleteOpen ? (
        <ListingDeleteDialog
          listing={{ title: name }}
          sessionCount={deleteStats.sessionCount}
          bookingCount={deleteStats.bookingCount}
          loading={deleteLoading}
          error={deleteError}
          unavailable={sessionsFailed}
          onClose={() => setDeleteOpen(false)}
          onConfirm={handleDeleteListing}
        />
      ) : null}

      {photoSkipOpen ? (
        <PhotoSkipDialog
          onAdd={() => {
            setPhotoSkipOpen(false)
            if (activeId !== 'photos') openSection('photos')
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

function ordinal(n) {
  const rem10 = n % 10
  const rem100 = n % 100
  if (rem10 === 1 && rem100 !== 11) return `${n}st`
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`
  return `${n}th`
}
