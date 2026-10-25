import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { supabase } from '../lib/supabase'
import ReviewCard from '../components/ReviewCard'
import HostRating from '../components/HostRating'
import PhotoLightbox from '../components/PhotoLightbox'
import SessionCalendar from '../components/SessionCalendar'
import { GuestCancellationNote } from '../components/CancellationPolicy'
import FormattedPrice from '../components/FormattedPrice'
import PageLoader from '../components/PageLoader'
import WaitingState from '../components/WaitingState'
import {
  formatDayTitle,
  formatMonthTitle,
  groupSessionsByDay,
  monthBounds,
  sessionCountLabel,
  shiftMonth,
  singaporeDateKey,
  singaporeMonthKey,
} from '../lib/sessionCalendar'
import {
  checkoutPriceCents,
  groupPriceLabel,
  guestFacingPriceCents,
  isPayNowTooFarAhead,
  MAX_GUESTS_PER_BOOKING,
  nextGroupTierHint,
  PAYNOW_TOO_FAR_AHEAD_MESSAGE,
  paynowPriceCents,
} from '../lib/pricing'
import { formatDuration } from '../lib/duration'
import { edgeFunctionErrorMessage, isPayNowTooFarAheadError } from '../lib/edgeFunctionError'
import { checkoutCanLeaveForWebhook } from '../lib/paymentReturn'
import { publicName } from '../lib/publicName'
import { PAGE_LOAD_ERROR, withIssuedAtRetry } from '../lib/pageLoad'
import { listingReportSubject, reportMailto } from '../lib/reportMailto'
import { formatSessionDay, formatSessionTime } from '../lib/sessionDate'
import { SHARE_NOTES, shareOrCopy } from '../lib/share'
import { BackRowActions } from '../components/BackButton'
import Icon from '../components/ui/Icon'
import VerifiedBadge from '../components/VerifiedBadge'
import KeenPanel from '../components/KeenPanel'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

function upcomingSessions(listingId, columns) {
  return supabase
    .from('sessions')
    .select(columns)
    .eq('listing_id', listingId)
    .eq('status', 'open')
    .gt('starts_at', new Date().toISOString())
}

const HOST_BIO_PREVIEW_LINES = 2
const HOST_BIO_PREVIEW_CHARS = 160

function previewHostBio(bio) {
  const text = String(bio).trim()
  const lines = text.split('\n')
  let preview = lines.slice(0, HOST_BIO_PREVIEW_LINES).join('\n')
  let truncated = lines.length > HOST_BIO_PREVIEW_LINES
  if (preview.length > HOST_BIO_PREVIEW_CHARS) {
    const cut = preview.slice(0, HOST_BIO_PREVIEW_CHARS)
    preview = cut.replace(/\s+\S*$/, '').trimEnd() || cut.trimEnd()
    truncated = true
  }
  return { preview, truncated }
}

function HostAvatar({ host, to }) {
  const name = publicName(host) || 'Anonymous'
  const avatar = host?.avatar_url ? (
    <img src={host.avatar_url} alt="" className="detail-host__avatar" />
  ) : (
    <div className="detail-host__avatar-placeholder">{name[0]?.toUpperCase() || '?'}</div>
  )
  if (!to) return avatar
  return (
    <Link to={to} className="detail-host__avatar-link" aria-label={`${name}'s profile`}>
      {avatar}
    </Link>
  )
}

function HostBioPreview({ bio }) {
  const [open, setOpen] = useState(false)
  const { preview, truncated } = previewHostBio(bio)
  const text = String(bio).trim()

  return (
    <p className="detail-host__bio">
      {open || !truncated ? text : preview}
      {truncated ? (
        <button
          type="button"
          className="detail-host__more"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Less' : '… more'}
        </button>
      ) : null}
    </p>
  )
}

function googleMapsUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

function visibleAreaLabel(revealedAddress, area) {
  if (typeof revealedAddress === 'string' && revealedAddress.trim()) return revealedAddress.trim()
  if (typeof area === 'string' && area.trim()) return area.trim()
  return ''
}

async function attachReviewerIds(reviews) {
  if (!reviews.length) return reviews
  const { data } = await supabase
    .from('reviews')
    .select('id, reviewer_id')
    .in('id', reviews.map((review) => review.id))
  if (!data?.length) return reviews
  const byId = new Map(data.map((row) => [row.id, row.reviewer_id]))
  return reviews.map((review) => ({
    ...review,
    reviewer_id: review.reviewer_id ?? byId.get(review.id) ?? null,
  }))
}

function CheckoutForm({ totalAmount, bookingId, onSuccess, onPaymentFailed }) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!stripe || !elements) return

    setError('')
    setLoading(true)

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/dashboard?booking=${bookingId}`,
      },
      redirect: 'if_required',
    })

    if (confirmError || !checkoutCanLeaveForWebhook(paymentIntent?.status)) {
      setLoading(false)
      setError(confirmError?.message || 'Payment was not completed. You have not been charged.')
      // A declined card can be retried on this same payment. Cancelling the
      // payment sheet, or Stripe cancelling the intent, closes the checkout.
      if (paymentIntent?.status === 'canceled') onPaymentFailed?.()
      return
    }

    onSuccess(paymentIntent.status)
  }

  return (
    <div className="payment-form-wrap">
      {loading ? (
        <div className="payment-form-wrap__wait">
          <WaitingState
            title="Confirming your payment"
            message="PayNow and card payments both go through Stripe. Please keep this page open."
          />
        </div>
      ) : null}
      <form
        onSubmit={handleSubmit}
        className="payment-form"
        inert={loading || undefined}
        aria-hidden={loading || undefined}
      >
        <p className="payment-form__total">
          Total: <FormattedPrice cents={totalAmount} />
        </p>
        <PaymentElement />
        {error && <p className="error-message">{error}</p>}
        <div className="payment-form__actions">
          <button type="submit" disabled={!stripe || loading} className="btn btn--primary">
            Pay <FormattedPrice cents={totalAmount} />
          </button>
          <p className="payment-form__secure">Payments are processed securely by Stripe.</p>
        </div>
      </form>
    </div>
  )
}

export default function ListingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [listing, setListing] = useState(null)
  // { firstMonth, lastMonth, todayKey } when the listing has upcoming sessions, else null.
  const [sessionRange, setSessionRange] = useState(null)
  const [visibleMonth, setVisibleMonth] = useState(null)
  const [selectedDateKey, setSelectedDateKey] = useState(null)
  // Keyed by `${listingId}:${monthKey}` so a late reply never lands on another listing.
  const [sessionsByMonth, setSessionsByMonth] = useState({})
  const [monthError, setMonthError] = useState(null)
  const requestedMonths = useRef(new Set())
  const [reviews, setReviews] = useState([])
  const [hostReviews, setHostReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [checkoutSessionId, setCheckoutSessionId] = useState(null)
  const [guestsCount, setGuestsCount] = useState(1)
  const [checkoutRail, setCheckoutRail] = useState(null)
  const [clientSecret, setClientSecret] = useState(null)
  const [bookingId, setBookingId] = useState(null)
  const [totalAmount, setTotalAmount] = useState(null)
  const [bookingLoading, setBookingLoading] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [payNowBlockedByServer, setPayNowBlockedByServer] = useState(false)
  const [revealedAddress, setRevealedAddress] = useState(null)
  const [viewerId, setViewerId] = useState(null)
  const [activePhoto, setActivePhoto] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [hostVerified, setHostVerified] = useState(false)
  const bookingRef = useRef(null)
  const [bookingInView, setBookingInView] = useState(false)
  const [shareNote, setShareNote] = useState('')

  useEffect(() => {
    async function fetchListing() {
      setRevealedAddress(null)
      setSessionRange(null)
      setVisibleMonth(null)
      setSelectedDateKey(null)

      const listingSelect = `
          id,
          title,
          description,
          category,
          area,
          price_per_person,
          group_pricing,
          duration_mins,
          max_guests,
          photo_urls,
          whats_provided,
          what_to_bring,
          host_id,
          review_status,
          users!host_id (
            display_name,
            bio,
            avatar_url,
            stripe_payouts_enabled
          )
        `
      let { data: listingData, error: listingError } = await withIssuedAtRetry(() =>
        supabase.from('listings').select(listingSelect).eq('id', id).eq('is_active', true).single()
      )
      if (listingError && /group_pricing|what_to_bring/.test(listingError.message ?? '')) {
        let retrySelect = listingSelect
        if (/group_pricing/.test(listingError.message ?? '')) {
          retrySelect = retrySelect.replace(/\s*group_pricing,\n/, '\n')
        }
        if (/what_to_bring/.test(listingError.message ?? '')) {
          retrySelect = retrySelect.replace(/\s*what_to_bring,\n/, '\n')
        }
        ;({ data: listingData, error: listingError } = await withIssuedAtRetry(() =>
          supabase
            .from('listings')
            .select(retrySelect)
            .eq('id', id)
            .eq('is_active', true)
            .single()
        ))
      }

      if (listingError) {
        setError(PAGE_LOAD_ERROR)
        setLoading(false)
        return
      }

      setListing(listingData)

      // `is_id_verified` arrives with migration 00023; before that the column
      // is missing and the badge simply stays hidden.
      setHostVerified(false)
      if (listingData.host_id) {
        supabase
          .from('users')
          .select('is_id_verified')
          .eq('id', listingData.host_id)
          .maybeSingle()
          .then(({ data, error: verifiedError }) => {
            setHostVerified(!verifiedError && data?.is_id_verified === true)
          })
      }

      const [firstSessionResult, lastSessionResult, reviewsResult, hostReviewsResult, authResult] =
        await Promise.all([
          upcomingSessions(id, 'starts_at').order('starts_at', { ascending: true }).limit(1),
          upcomingSessions(id, 'starts_at').order('starts_at', { ascending: false }).limit(1),
          supabase.rpc('reviews_for_listing', { p_listing_id: id }),
          supabase
            .from('reviews')
            .select('rating')
            .eq('reviewee_id', listingData.host_id)
            .eq('role', 'guest'),
          supabase.auth.getSession(),
        ])

      const sessionRangeError = firstSessionResult.error || lastSessionResult.error
      if (sessionRangeError) {
        setError(PAGE_LOAD_ERROR)
      } else {
        const firstStart = firstSessionResult.data?.[0]?.starts_at
        const lastStart = lastSessionResult.data?.[0]?.starts_at ?? firstStart
        if (firstStart) {
          const first = singaporeMonthKey(firstStart)
          const last = singaporeMonthKey(lastStart)
          setSessionRange({
            firstMonth: first,
            lastMonth: last > first ? last : first,
            todayKey: singaporeDateKey(Date.now()),
          })
          setVisibleMonth(first)
        }
      }

      if (!reviewsResult.error) {
        setReviews(await attachReviewerIds(reviewsResult.data ?? []))
      }

      if (!hostReviewsResult.error) {
        setHostReviews(hostReviewsResult.data ?? [])
      }

      const userId = authResult.data?.session?.user?.id
      setViewerId(userId ?? null)
      if (userId) {
        const { data: address } = await supabase.rpc('listing_address', {
          listing_id: id,
        })
        if (address) {
          setRevealedAddress(address)
        }
      }

      setLoading(false)
    }

    fetchListing()
  }, [id])

  useEffect(() => {
    if (!visibleMonth) return
    const cacheKey = `${id}:${visibleMonth}`
    if (requestedMonths.current.has(cacheKey)) return
    requestedMonths.current.add(cacheKey)

    async function fetchMonth() {
      const { startIso, endIso } = monthBounds(visibleMonth)
      const { data, error: fetchError } = await withIssuedAtRetry(() =>
        upcomingSessions(id, 'id, starts_at, duration_mins, spots_remaining')
          .gte('starts_at', startIso)
          .lt('starts_at', endIso)
          .order('starts_at', { ascending: true })
      )

      if (fetchError) {
        requestedMonths.current.delete(cacheKey)
        setMonthError({ cacheKey, message: PAGE_LOAD_ERROR })
        return
      }
      setSessionsByMonth((prev) => ({ ...prev, [cacheKey]: data ?? [] }))
    }

    fetchMonth()
  }, [id, visibleMonth])

  // On phones checkout covers the screen, so the page behind it must not scroll.
  useEffect(() => {
    if (!checkoutSessionId) return undefined
    document.body.classList.add('checkout-open')
    return () => document.body.classList.remove('checkout-open')
  }, [checkoutSessionId])

  useEffect(() => {
    if (!shareNote) return undefined
    const timer = setTimeout(() => setShareNote(''), 2500)
    return () => clearTimeout(timer)
  }, [shareNote])

  async function shareListing() {
    const result = await shareOrCopy({
      url: `${window.location.origin}/listings/${id}`,
      title: listing?.title ?? 'TryKai',
    })
    if (SHARE_NOTES[result]) setShareNote(SHARE_NOTES[result])
  }

  // The phone booking bar steps aside once the booking card itself is on screen.
  useEffect(() => {
    const node = bookingRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(
      ([entry]) => setBookingInView(entry.isIntersecting),
      { rootMargin: '0px 0px -96px 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [loading, listing])

  // CSS scroll-snap does the swiping; this only keeps the position dots in step.
  function trackGalleryPosition(e) {
    const { scrollLeft, clientWidth } = e.currentTarget
    if (!clientWidth) return
    setActivePhoto(Math.round(scrollLeft / clientWidth))
  }

  async function abandonUnpaidCheckout(id) {
    if (!id) return
    const {
      data: { session },
    } = await supabase.auth.getSession()
    await supabase.functions.invoke('abandon-checkout', {
      body: { booking_id: id },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
  }

  function cancelPayment() {
    const unpaidId = bookingId
    setCheckoutSessionId(null)
    setGuestsCount(1)
    setCheckoutRail(null)
    setClientSecret(null)
    setBookingId(null)
    setTotalAmount(null)
    setPaymentError('')
    setPayNowBlockedByServer(false)
    void abandonUnpaidCheckout(unpaidId)
  }

  function showMonth(monthKey) {
    setVisibleMonth(monthKey)
    setSelectedDateKey(null)
  }

  function handlePaymentSuccess(paymentStatus) {
    const payment = paymentStatus === 'processing' ? 'processing' : 'succeeded'
    navigate(`/dashboard?booking=${bookingId}&payment=${payment}`)
  }

  function hostCanTakePayments() {
    return listing?.users?.stripe_payouts_enabled === true
  }

  function viewerIsHost() {
    return Boolean(viewerId) && listing?.host_id === viewerId
  }

  async function handleBook(sessionId) {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      navigate('/login', { state: { from: location } })
      return
    }

    if (session.user?.id && listing?.host_id === session.user.id) {
      setPaymentError('This is your own listing, so you cannot book it.')
      return
    }

    if (!hostCanTakePayments()) {
      setPaymentError('This host is still setting up payouts, so this session cannot be booked yet.')
      return
    }

    setPaymentError('')
    setClientSecret(null)
    setBookingId(null)
    setTotalAmount(null)
    setCheckoutRail(null)
    setGuestsCount(1)
    setPayNowBlockedByServer(false)
    setCheckoutSessionId(sessionId)
  }

  function changeGuests(next) {
    if (next === guestsCount) return
    if (clientSecret) {
      const unpaidId = bookingId
      setClientSecret(null)
      setBookingId(null)
      setTotalAmount(null)
      setCheckoutRail(null)
      void abandonUnpaidCheckout(unpaidId)
    }
    setGuestsCount(next)
  }

  function findCachedSession(sessionId) {
    if (!sessionId) return null
    for (const rows of Object.values(sessionsByMonth)) {
      const found = rows?.find((row) => row.id === sessionId)
      if (found) return found
    }
    return null
  }

  async function startPayment(paymentRail) {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session || !checkoutSessionId) return

    if (paymentRail === 'paynow' && isPayNowTooFarAhead(findCachedSession(checkoutSessionId)?.starts_at)) {
      setPayNowBlockedByServer(true)
      setCheckoutRail('card')
      return
    }

    const shownAmount = checkoutPriceCents(
      listing.price_per_person,
      paymentRail,
      guestsCount,
      groupPricing,
    )

    setCheckoutRail(paymentRail)
    setBookingLoading(true)
    setPaymentError('')

    const { data, error: fnError } = await supabase.functions.invoke('create-payment-intent', {
      body: {
        session_id: checkoutSessionId,
        guests_count: guestsCount,
        payment_rail: paymentRail,
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    setBookingLoading(false)

    if (fnError || data?.error) {
      const message = await edgeFunctionErrorMessage(fnError, data)
      if (isPayNowTooFarAheadError(data, message)) {
        setPayNowBlockedByServer(true)
        setCheckoutRail('card')
        setPaymentError('')
        return
      }
      setPaymentError(message)
      return
    }

    if (!data?.clientSecret || !data?.booking_id) {
      setPaymentError('Failed to start payment. Please try again.')
      return
    }

    if (data.total_amount !== shownAmount) {
      console.error('checkout price mismatch', {
        shown: shownAmount,
        server: data.total_amount,
      })
      setPaymentError('The price has changed. Please refresh.')
      void abandonUnpaidCheckout(data.booking_id)
      return
    }

    setClientSecret(data.clientSecret)
    setBookingId(data.booking_id)
    setTotalAmount(data.total_amount)
  }

  if (loading) {
    return <PageLoader />
  }

  if (error || !listing) {
    return (
      <div className="page page--narrow page--centered">
        <p className="error-message">{error || 'Listing not found.'}</p>
        <Link to="/" className="back-link">
          ← Back to browse
        </Link>
      </div>
    )
  }

  const host = listing.users
  const areaLabel = visibleAreaLabel(revealedAddress, listing.area)
  const photos = listing.photo_urls?.length ? listing.photo_urls : []
  const groupPricing = listing.group_pricing !== false
  const cardPrice = guestFacingPriceCents(listing.price_per_person, guestsCount, groupPricing)
  const paynowPrice = paynowPriceCents(listing.price_per_person, guestsCount, groupPricing)
  const canTakePayments = hostCanTakePayments()
  const isOwnListing = viewerIsHost()

  const monthCacheKey = visibleMonth ? `${id}:${visibleMonth}` : null
  const monthSessions = monthCacheKey ? sessionsByMonth[monthCacheKey] : undefined
  const sessionsByDay = monthSessions ? groupSessionsByDay(monthSessions, visibleMonth) : {}
  const countsByDay = Object.fromEntries(
    Object.entries(sessionsByDay).map(([dateKey, daySessions]) => [dateKey, daySessions.length])
  )
  const activeDateKey = sessionsByDay[selectedDateKey]
    ? selectedDateKey
    : (Object.keys(sessionsByDay).sort()[0] ?? null)
  const daySessions = activeDateKey ? sessionsByDay[activeDateKey] : []
  const checkoutSession = daySessions.find((session) => session.id === checkoutSessionId) ?? null
  const paynowBlocked =
    payNowBlockedByServer || isPayNowTooFarAhead(checkoutSession?.starts_at)
  const displayRail = paynowBlocked || checkoutRail !== 'paynow' ? 'card' : 'paynow'
  const checkoutPrice = checkoutPriceCents(
    listing.price_per_person,
    displayRail,
    guestsCount,
    groupPricing,
  )
  const listingRating =
    reviews.length > 0
      ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length
      : null
  const showBookBar = Boolean(sessionRange) && !checkoutSessionId && !isOwnListing
  const nextHint = checkoutSession
    ? nextGroupTierHint(
        guestsCount,
        groupPricing,
        Math.min(checkoutSession.spots_remaining, MAX_GUESTS_PER_BOOKING),
      )
    : ''

  function renderDaySessions() {
    if (!monthSessions) {
      return monthError?.cacheKey === monthCacheKey ? (
        <p className="error-message">{monthError.message}</p>
      ) : (
        <p className="hint">Loading sessions…</p>
      )
    }

    if (!activeDateKey) {
      return <p className="empty-state">No sessions in {formatMonthTitle(visibleMonth)}.</p>
    }

    return (
      <>
        <h3 className="session-day__title">
          {formatDayTitle(activeDateKey)} · {sessionCountLabel(daySessions.length)}
        </h3>
        {daySessions.map((session) => (
          <div key={session.id} className="session-card">
            <div className="session-card__info">
              <p id={`session-${session.id}-time`} className="session-card__date">
                {formatSessionTime(session.starts_at)}
              </p>
              <p
                className={`session-card__meta${
                  session.spots_remaining > 0 && session.spots_remaining <= 2
                    ? ' session-card__meta--low'
                    : ''
                }`}
              >
                {formatDuration(session.duration_mins)} · {session.spots_remaining} spot
                {session.spots_remaining !== 1 ? 's' : ''} left
              </p>
            </div>
            <div className="session-card__actions">
              <button
                type="button"
                onClick={() => handleBook(session.id)}
                disabled={session.spots_remaining === 0 || !canTakePayments || isOwnListing}
                aria-describedby={`session-${session.id}-time`}
                className="btn btn--book"
              >
                Book
              </button>
            </div>
          </div>
        ))}
      </>
    )
  }

  const hostName = publicName(host) || 'Anonymous'
  const hostProfile = listing.host_id ? `/u/${listing.host_id}` : null
  const reportHref = reportMailto({
    subject: listingReportSubject(listing.title),
    url: typeof window === 'undefined' ? '' : window.location.href,
    id: listing.id,
  })
  const duration = formatDuration(listing.duration_mins)
  const maxGuests = Number(listing.max_guests)
  const paynowSaving = cardPrice - paynowPrice
  const showPaynowSaving = displayRail === 'paynow' && paynowSaving > 0

  function renderCheckout() {
    return (
      <section className="checkout" aria-labelledby="checkout-title">
        <header className="checkout__header">
          <button type="button" className="checkout__back" aria-label="Cancel" onClick={cancelPayment}>
            <Icon name="chevronLeft" size={22} />
          </button>
          <h3 id="checkout-title" className="checkout__title">
            Confirm and pay
          </h3>
        </header>

        <div className="checkout__body">
          {paymentError && <p className="error-message checkout__error">{paymentError}</p>}

          {checkoutSession && (
            <div className="checkout-summary">
              {photos[0] ? (
                <img src={photos[0]} alt="" className="checkout-summary__photo" />
              ) : (
                <span className="checkout-summary__photo" aria-hidden="true" />
              )}
              <div className="checkout-summary__copy">
                <p className="checkout-summary__title">{listing.title}</p>
                <p className="checkout-summary__meta">
                  with {hostName}
                  {listing.area ? ` · ${listing.area}` : ''}
                </p>
                <p className="session-card__date">{formatSessionDay(checkoutSession.starts_at)}</p>
                <p className="session-card__meta">
                  {formatSessionTime(checkoutSession.starts_at)} ·{' '}
                  {formatDuration(checkoutSession.duration_mins)}
                </p>
              </div>
              <button type="button" className="checkout-summary__change" onClick={cancelPayment}>
                Change
              </button>
            </div>
          )}

          {!clientSecret ? (
            <>
              {checkoutSession && (
                <div className="guest-stepper">
                  <div className="guest-stepper__row">
                    <div>
                      <p className="guest-stepper__label">Guests</p>
                      <p className="guest-stepper__spots">
                        {checkoutSession.spots_remaining} spot
                        {checkoutSession.spots_remaining === 1 ? '' : 's'} left in this session
                      </p>
                    </div>
                    <div className="guest-stepper__controls">
                      <button
                        type="button"
                        className="guest-stepper__btn"
                        aria-label="Fewer guests"
                        disabled={guestsCount <= 1}
                        onClick={() => changeGuests(guestsCount - 1)}
                      >
                        −
                      </button>
                      <span className="guest-stepper__count" aria-live="polite">
                        {guestsCount}
                      </span>
                      <button
                        type="button"
                        className="guest-stepper__btn"
                        aria-label="More guests"
                        disabled={
                          guestsCount >=
                          Math.min(checkoutSession.spots_remaining, MAX_GUESTS_PER_BOOKING)
                        }
                        onClick={() => changeGuests(guestsCount + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <p className="guest-stepper__price">
                    {groupPriceLabel(listing.price_per_person, guestsCount, groupPricing, displayRail)}
                  </p>
                  {nextHint ? (
                    <button
                      type="button"
                      className="guest-stepper__hint"
                      onClick={() => changeGuests(guestsCount + 1)}
                    >
                      {nextHint}
                    </button>
                  ) : null}
                </div>
              )}

              {bookingLoading ? (
                <WaitingState
                  title="Confirm and pay"
                  message="Getting your payment ready, including PayNow."
                />
              ) : (
              <div className="payment-rails">
                <p className="checkout__label">Pay with</p>
                <button
                  type="button"
                  className="payment-rail payment-rail--paynow"
                  disabled={paynowBlocked}
                  aria-pressed={!paynowBlocked && checkoutRail === 'paynow'}
                  onClick={() => startPayment('paynow')}
                >
                  <span className="payment-rail__radio" aria-hidden="true" />
                  <span className="payment-rail__copy">
                    <span className="payment-rail__row">
                      <span className="payment-rail__name">PayNow</span>
                      {paynowBlocked ? null : <span className="paynow-badge">Save 5%</span>}
                    </span>
                    <span className="payment-rail__hint">Scan the QR in your banking app</span>
                  </span>
                  <span className="payment-rail__amounts">
                    {paynowBlocked ? (
                      <span className="payment-rail__now">
                        <FormattedPrice cents={cardPrice} />
                      </span>
                    ) : (
                      <>
                        <s className="payment-rail__was">
                          <FormattedPrice cents={cardPrice} />
                        </s>
                        <span className="payment-rail__now">
                          <FormattedPrice cents={paynowPrice} />
                        </span>
                      </>
                    )}
                  </span>
                </button>
                {paynowBlocked ? (
                  <p className="payment-rails__hint">{PAYNOW_TOO_FAR_AHEAD_MESSAGE}</p>
                ) : null}
                <button
                  type="button"
                  className="payment-rail"
                  aria-pressed={paynowBlocked || checkoutRail === 'card'}
                  onClick={() => startPayment('card')}
                >
                  <span className="payment-rail__radio" aria-hidden="true" />
                  <span className="payment-rail__copy">
                    <span className="payment-rail__row">
                      <span className="payment-rail__name">Card</span>
                    </span>
                  </span>
                  <span className="payment-rail__amounts">
                    <span className="payment-rail__now">
                      <FormattedPrice cents={cardPrice} />
                    </span>
                  </span>
                </button>
              </div>
              )}

              <div className="price-breakdown">
                <p className="price-breakdown__row">
                  <span>
                    {guestsCount} guest{guestsCount === 1 ? '' : 's'}, all in
                  </span>
                  <span className="price-breakdown__amount">
                    <FormattedPrice cents={cardPrice} />
                  </span>
                </p>
                {showPaynowSaving ? (
                  <p className="price-breakdown__row price-breakdown__row--saving">
                    <span>PayNow saving</span>
                    <span className="price-breakdown__amount">
                      −<FormattedPrice cents={paynowSaving} />
                    </span>
                  </p>
                ) : null}
                <p className="price-breakdown__row price-breakdown__row--total">
                  <span>Total</span>
                  <span className="price-breakdown__amount price-breakdown__total">
                    <FormattedPrice cents={checkoutPrice} />
                  </span>
                </p>
                <p className="price-breakdown__note">
                  Booking fee included. Nothing extra to pay at the door.
                </p>
              </div>

              <div className="checkout-promises">
                <p className="checkout-promises__item">
                  <Icon name="shield" size={18} />
                  Your host passed an ID check before listing on TryKai.
                </p>
                <p className="checkout-promises__item">
                  <Icon name="pin" size={18} />
                  The exact address is shared once your booking is confirmed.
                </p>
                <p className="checkout-promises__item">
                  <Icon name="wallet" size={18} />
                  Full refund if you cancel 48 or more hours before the session.
                </p>
              </div>

              <p className="payment-agree">
                By booking, you agree to the{' '}
                <Link to="/terms#part-3-booking">Booking terms</Link> and{' '}
                <Link to="/cancellation-policy">Cancellation Policy</Link>
              </p>
            </>
          ) : (
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <CheckoutForm
                totalAmount={totalAmount}
                bookingId={bookingId}
                onSuccess={handlePaymentSuccess}
                onPaymentFailed={() => void abandonUnpaidCheckout(bookingId)}
              />
            </Elements>
          )}
        </div>
      </section>
    )
  }

  return (
    <div
      className={`page page--detail page--listing${showBookBar ? ' page--with-book-bar' : ''}`}
    >
      <BackRowActions>
        <button type="button" className="share-button" aria-label="Share" onClick={shareListing}>
          <Icon name="share" size={18} />
        </button>
      </BackRowActions>
      {shareNote ? (
        <p className="share-note" role="status">
          {shareNote}
        </p>
      ) : null}

      {isOwnListing && listing.review_status && listing.review_status !== 'approved' ? (
        <div className="detail-review-banner" role="status">
          <p className="detail-review-banner__title">
            {listing.review_status === 'changes_requested'
              ? 'One thing to change before guests can see this'
              : 'Only you can see this for now'}
          </p>
          <p className="detail-review-banner__body">
            {listing.review_status === 'changes_requested' ? (
              <>
                See the note on your <Link to="/hosting">Hosting</Link> page, then{' '}
                <Link to={`/edit-listing/${listing.id}`}>edit your listing</Link>.
              </>
            ) : (
              "We're taking a quick look before it goes live. We'll email you when it does."
            )}
          </p>
        </div>
      ) : null}

      {photos.length > 0 ? (
        <div className="detail-gallery">
          <div
            className="detail-gallery__scroller"
            data-photo-count={Math.min(photos.length, 5)}
            onScroll={trackGalleryPosition}
          >
            {photos.map((url, i) => (
              <button
                key={url}
                type="button"
                className="detail-gallery__photo"
                aria-label={`View photo ${i + 1} of ${photos.length}`}
                onClick={() => setLightboxIndex(i)}
              >
                <img src={url} alt={`${listing.title} ${i + 1}`} />
              </button>
            ))}
          </div>
          {photos.length > 1 && (
            <>
              <div className="detail-gallery__dots" aria-hidden="true">
                {photos.map((url, i) => (
                  <span
                    key={url}
                    className={`detail-gallery__dot${i === activePhoto ? ' detail-gallery__dot--active' : ''}`}
                  />
                ))}
              </div>
              <span className="detail-gallery__count" aria-hidden="true">
                {activePhoto + 1} / {photos.length}
              </span>
            </>
          )}
        </div>
      ) : (
        <div className="detail-gallery__placeholder" aria-hidden="true">
          <Icon name="camera" size={56} strokeWidth={1.2} />
        </div>
      )}

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos}
          title={listing.title}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      <div className="detail-layout">
        <div className="detail-main">
          {listing.category ? <span className="detail-category">{listing.category}</span> : null}
          <h1 className="detail-title">{listing.title}</h1>
          {duration || maxGuests > 0 || areaLabel || listingRating ? (
            <div className="detail-facts">
              {duration ? (
                <p className="detail-fact">
                  <Icon name="clock" size={17} />
                  {duration}
                </p>
              ) : null}
              {maxGuests > 0 ? (
                <p className="detail-fact">
                  <Icon name="users" size={17} />
                  Up to {maxGuests} guest{maxGuests === 1 ? '' : 's'}
                </p>
              ) : null}
              {areaLabel ? (
                <p className="detail-fact detail-area">
                  <Icon name="pin" size={17} />
                  {areaLabel}
                </p>
              ) : null}
              {listingRating ? (
                <p className="detail-fact">
                  <Icon name="star" size={17} />
                  {listingRating.toFixed(1)} ({reviews.length} review{reviews.length === 1 ? '' : 's'})
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="detail-host">
            <div className="detail-host__top">
              <HostAvatar host={host} to={hostProfile} />
              <div className="detail-host__copy">
                <p className="detail-host__label">Your host</p>
                <p className="detail-host__name">
                  {hostProfile ? (
                    <Link to={hostProfile} className="detail-host__link">
                      {hostName}
                    </Link>
                  ) : (
                    hostName
                  )}
                </p>
                {hostVerified ? <VerifiedBadge /> : null}
                <HostRating reviews={hostReviews} />
              </div>
            </div>
            {typeof host?.bio === 'string' && host.bio.trim() ? (
              <HostBioPreview bio={host.bio} />
            ) : null}
            {hostProfile ? (
              <Link to={hostProfile} className="detail-host__profile">
                View {hostName}&apos;s profile
              </Link>
            ) : null}
          </div>

          <section className="detail-section">
            <h2 className="detail-section__title">About this experience</h2>
            <p className="detail-description">{listing.description}</p>
          </section>

          {listing.whats_provided?.length > 0 && (
            <section className="detail-section">
              <h2 className="detail-section__title">What&apos;s provided</h2>
              <ul className="detail-list detail-list--checks">
                {listing.whats_provided.map((item) => (
                  <li key={item}>
                    <Icon name="check" size={18} strokeWidth={2.4} />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {listing.what_to_bring?.length > 0 && (
            <section className="detail-section">
              <h2 className="detail-section__title">What to bring</h2>
              <ul className="detail-list detail-list--checks">
                {listing.what_to_bring.map((item) => (
                  <li key={item}>
                    <Icon name="check" size={18} strokeWidth={2.4} />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside id="booking" ref={bookingRef} className="detail-sidebar">
          <div className={`detail-booking-card${checkoutSessionId ? ' detail-booking-card--checkout' : ''}`}>
            <p className="detail-booking-card__price">
              <FormattedPrice cents={checkoutPrice} />
              {!checkoutSessionId && <span className="detail-booking-card__unit"> / person</span>}
            </p>
            {!checkoutSessionId && sessionRange && (
              <p className="detail-booking-card__note">Pick a date, then a time</p>
            )}

            {paymentError && !checkoutSessionId && (
              <p className="error-message detail-booking-card__error">{paymentError}</p>
            )}

            {checkoutSessionId && renderCheckout()}

            {!sessionRange && isOwnListing && (
              <p className="empty-state">No upcoming sessions yet. Add dates from your Hosting tab.</p>
            )}
            {!sessionRange && !isOwnListing && (
              <KeenPanel listingId={id} hostName={hostName} viewerId={viewerId} />
            )}

            {sessionRange && !checkoutSessionId && (
              <>
                <div className="detail-calendar">
                  <SessionCalendar
                    monthKey={visibleMonth}
                    countsByDay={countsByDay}
                    selectedDateKey={activeDateKey}
                    todayKey={sessionRange.todayKey}
                    onSelectDate={setSelectedDateKey}
                    onPrevMonth={() => showMonth(shiftMonth(visibleMonth, -1))}
                    onNextMonth={() => showMonth(shiftMonth(visibleMonth, 1))}
                    canGoPrev={visibleMonth > sessionRange.firstMonth}
                    canGoNext={visibleMonth < sessionRange.lastMonth}
                    loading={!monthSessions}
                  />
                </div>
                <div className="session-day">{renderDaySessions()}</div>
              </>
            )}

            {isOwnListing && sessionRange && (
              <p className="hint detail-booking-card__hint">
                This is your own listing. Hosts cannot book their own sessions.
              </p>
            )}

            {!isOwnListing && !canTakePayments && sessionRange && (
              <p className="hint detail-booking-card__hint">
                This host is still setting up payouts. Booking will open once that is complete.
              </p>
            )}

            <GuestCancellationNote />
          </div>
        </aside>

        <div className="detail-main detail-main--after">
          {areaLabel ? (
            <section className="detail-section">
              <h2 className="detail-section__title">Where you&apos;ll be</h2>
              <div className="detail-location">
                <div className="detail-location__row">
                  <span className="detail-location__icon">
                    <Icon name="pin" size={20} />
                  </span>
                  <div className="detail-location__copy">
                    {revealedAddress ? (
                      <>
                        <p className="detail-location__title">{areaLabel}</p>
                        <p className="detail-location__note">From your confirmed booking.</p>
                        <a
                          href={googleMapsUrl(areaLabel)}
                          target="_blank"
                          rel="noreferrer"
                          className="detail-location__link"
                        >
                          Open in Google Maps
                        </a>
                      </>
                    ) : (
                      <>
                        <p className="detail-location__title">{areaLabel}, Singapore</p>
                        <p className="detail-location__note">
                          Exact address sent once your booking is confirmed.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section className="detail-section">
            <h2 className="detail-section__title">
              Reviews{reviews.length > 0 ? ` (${reviews.length})` : ''}
            </h2>
            {reviews.length === 0 ? (
              <div className="empty-state empty-state--boxed">
                <p>No reviews yet.</p>
                <p>Your review will help the next guest decide.</p>
              </div>
            ) : (
              <div className="reviews-list">
                {reviews.map((review) => (
                  <ReviewCard
                    key={review.id}
                    review={review}
                    listingTitle={listing.title}
                    viewerId={viewerId}
                  />
                ))}
              </div>
            )}
          </section>

          {isOwnListing ? null : (
            <nav className="detail-links" aria-label="Reporting">
              <a href={reportHref} className="detail-links__row">
                Report this listing
                <Icon name="chevronRight" size={18} />
              </a>
            </nav>
          )}
        </div>
      </div>

      {showBookBar ? (
        <div className={`book-bar${bookingInView ? ' book-bar--away' : ''}`}>
          <div className="book-bar__price">
            <p className="book-bar__amount">
              <FormattedPrice cents={cardPrice} />
              <span className="book-bar__unit"> / person, all in</span>
            </p>
            <p className="book-bar__note">
              <FormattedPrice cents={paynowPrice} /> with PayNow
            </p>
          </div>
          <a href="#booking" className="btn btn--primary">
            Choose a date
          </a>
        </div>
      ) : null}
    </div>
  )
}
