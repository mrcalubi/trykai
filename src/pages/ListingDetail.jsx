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
import { BackRowActions } from '../components/BackButton'
import OverflowMenu from '../components/ui/OverflowMenu'
import Icon from '../components/ui/Icon'

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

function HostBioPreview({ bio, to }) {
  const { preview, truncated } = previewHostBio(bio)
  return (
    <p className="detail-host__bio">
      {preview}
      {truncated && to ? (
        <Link to={to} className="detail-host__more">
          … more
        </Link>
      ) : null}
    </p>
  )
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

function CheckoutForm({ totalAmount, bookingId, onSuccess, onCancel, onPaymentFailed }) {
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

    setLoading(false)

    if (confirmError || !checkoutCanLeaveForWebhook(paymentIntent?.status)) {
      setError(confirmError?.message || 'Payment was not completed. You have not been charged.')
      // A declined card can be retried on this same payment. Cancelling the
      // payment sheet, or Stripe cancelling the intent, closes the checkout.
      if (paymentIntent?.status === 'canceled') onPaymentFailed?.()
      return
    }

    onSuccess(paymentIntent.status)
  }

  return (
    <form onSubmit={handleSubmit} className="payment-form">
      <p className="payment-form__total">
        Total: <FormattedPrice cents={totalAmount} />
      </p>
      <PaymentElement />
      {error && <p className="error-message">{error}</p>}
      <div className="payment-form__actions">
        <button type="button" onClick={onCancel} className="btn btn--ghost">
          Cancel
        </button>
        <button type="submit" disabled={!stripe || loading} className="btn btn--primary">
          {loading ? 'Processing…' : 'Pay now'}
        </button>
      </div>
    </form>
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
          photo_urls,
          whats_provided,
          host_id,
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
      if (listingError && /group_pricing/.test(listingError.message ?? '')) {
        ;({ data: listingData, error: listingError } = await withIssuedAtRetry(() =>
          supabase
            .from('listings')
            .select(listingSelect.replace(/\s*group_pricing,\n/, '\n'))
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
        const { data: confirmedBookings } = await supabase
          .from('bookings')
          .select('id, sessions!inner(listing_id)')
          .eq('guest_id', userId)
          .eq('status', 'confirmed')
          .eq('sessions.listing_id', id)
          .limit(1)

        if (confirmedBookings?.length) {
          const { data: address } = await supabase.rpc('get_listing_address', {
            p_listing_id: id,
          })
          if (address) {
            setRevealedAddress(address)
          }
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
    return <p className="status-message">Loading…</p>
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
              <p className="session-card__meta">
                {formatDuration(session.duration_mins)} · {session.spots_remaining} spot
                {session.spots_remaining !== 1 ? 's' : ''} left
              </p>
            </div>
            <div className="session-card__actions">
              <span className="session-card__price">
                <FormattedPrice cents={guestFacingPriceCents(listing.price_per_person)} />
              </span>
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

  return (
    <div className={`page page--detail${showBookBar ? ' page--with-book-bar' : ''}`}>
      <BackRowActions>
        {isOwnListing ? null : (
          <OverflowMenu
            label="More actions"
            icon="⋮"
            className="ui-overflow--quiet"
            items={[
              {
                label: 'Report listing',
                href: reportMailto({
                  subject: listingReportSubject(listing.title),
                  url: typeof window === 'undefined' ? '' : window.location.href,
                  id: listing.id,
                }),
              },
            ]}
          />
        )}
      </BackRowActions>
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
            <div className="detail-gallery__dots" aria-hidden="true">
              {photos.map((url, i) => (
                <span
                  key={url}
                  className={`detail-gallery__dot${i === activePhoto ? ' detail-gallery__dot--active' : ''}`}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="detail-gallery__placeholder" />
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
          {areaLabel || listingRating ? (
            <div className="detail-facts">
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
            <HostAvatar host={host} to={listing.host_id ? `/u/${listing.host_id}` : null} />
            <div className="detail-host__copy">
              <p className="detail-host__name">
                Hosted by{' '}
                {listing.host_id ? (
                  <Link to={`/u/${listing.host_id}`} className="detail-host__link">
                    {publicName(host) || 'Anonymous'}
                  </Link>
                ) : (
                  publicName(host) || 'Anonymous'
                )}
              </p>
              {hostVerified ? (
                <p className="verified-badge">
                  <Icon name="shield" size={15} />
                  ID verified
                </p>
              ) : null}
              <HostRating reviews={hostReviews} />
              {typeof host?.bio === 'string' && host.bio.trim() ? (
                <HostBioPreview
                  bio={host.bio}
                  to={listing.host_id ? `/u/${listing.host_id}` : null}
                />
              ) : null}
            </div>
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

          {areaLabel ? (
            <section className="detail-section">
              <h2 className="detail-section__title">Where you&apos;ll be</h2>
              <div className="detail-location">
                <span className="detail-location__icon">
                  <Icon name="pin" size={22} />
                </span>
                <p className="detail-location__copy">
                  {revealedAddress
                    ? `Your booking is at ${areaLabel}.`
                    : `Sessions are held in ${areaLabel}. The exact address is shared once you have booked.`}
                </p>
              </div>
            </section>
          ) : null}

          <section className="detail-section">
            <h2 className="detail-section__title">
              Reviews{reviews.length > 0 ? ` (${reviews.length})` : ''}
            </h2>
            {reviews.length === 0 ? (
              <p className="empty-state empty-state--boxed">No reviews yet.</p>
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
        </div>

        <aside id="booking" ref={bookingRef} className="detail-sidebar">
          <div className="detail-booking-card">
            <p className="detail-booking-card__price">
              <FormattedPrice cents={checkoutPrice} />
              {!checkoutSessionId && (
                <span className="detail-booking-card__unit"> / person</span>
              )}
            </p>
            {!checkoutSessionId && sessionRange && (
              <p className="detail-booking-card__note">Pick a date, then a time</p>
            )}

            {paymentError && (
              <p className="error-message detail-booking-card__error">{paymentError}</p>
            )}

            {checkoutSessionId && (
              <div className="payment-panel">
                <h3 className="payment-panel__title">Complete your booking</h3>
                {checkoutSession && (
                  <div className="payment-panel__session">
                    <div>
                      <p className="session-card__date">
                        {formatSessionDay(checkoutSession.starts_at)}
                      </p>
                      <p className="session-card__meta">
                        {formatSessionTime(checkoutSession.starts_at)} ·{' '}
                        {formatDuration(checkoutSession.duration_mins)}
                      </p>
                    </div>
                    <span className="session-card__price">
                      <FormattedPrice cents={checkoutPrice} />
                    </span>
                  </div>
                )}
                {!clientSecret ? (
                  <div className="payment-rails">
                    {checkoutSession && (
                      <div className="guest-stepper">
                        <p className="guest-stepper__label">Guests</p>
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
                              Math.min(
                                checkoutSession.spots_remaining,
                                MAX_GUESTS_PER_BOOKING,
                              )
                            }
                            onClick={() => changeGuests(guestsCount + 1)}
                          >
                            +
                          </button>
                        </div>
                        <p className="guest-stepper__price">
                          {groupPriceLabel(
                            listing.price_per_person,
                            guestsCount,
                            groupPricing,
                            displayRail,
                          )}
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
                    <p className="payment-agree">
                      By booking, you agree to the{' '}
                      <Link to="/terms#part-3-booking">Booking terms</Link> and{' '}
                      <Link to="/cancellation-policy">Cancellation Policy</Link>
                    </p>
                    <button
                      type="button"
                      className="payment-rail payment-rail--paynow"
                      disabled={bookingLoading || paynowBlocked}
                      aria-pressed={!paynowBlocked && checkoutRail === 'paynow'}
                      onClick={() => startPayment('paynow')}
                    >
                      <span className="payment-rail__row">
                        <span className="payment-rail__name">PayNow</span>
                        <span className="paynow-badge">Save 5%</span>
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
                      disabled={bookingLoading}
                      aria-pressed={paynowBlocked || checkoutRail === 'card'}
                      onClick={() => startPayment('card')}
                    >
                      <span className="payment-rail__row">
                        <span className="payment-rail__name">Card</span>
                      </span>
                      <span className="payment-rail__amounts">
                        <span className="payment-rail__now">
                          <FormattedPrice cents={cardPrice} />
                        </span>
                      </span>
                    </button>
                    <button type="button" onClick={cancelPayment} className="btn btn--ghost">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <Elements stripe={stripePromise} options={{ clientSecret }}>
                    <CheckoutForm
                      totalAmount={totalAmount}
                      bookingId={bookingId}
                      onSuccess={handlePaymentSuccess}
                      onCancel={cancelPayment}
                      onPaymentFailed={() => void abandonUnpaidCheckout(bookingId)}
                    />
                  </Elements>
                )}
              </div>
            )}

            {!sessionRange && (
              <p className="empty-state">No upcoming sessions yet.</p>
            )}

            {sessionRange && !checkoutSessionId && (
              <>
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
      </div>

      {showBookBar ? (
        <div className={`book-bar${bookingInView ? ' book-bar--away' : ''}`}>
          <div className="book-bar__price">
            <p className="book-bar__amount">
              <FormattedPrice cents={cardPrice} />
              <span className="book-bar__unit"> / person</span>
            </p>
            <p className="book-bar__note">Save 5% with PayNow</p>
          </div>
          <a href="#booking" className="btn btn--primary">
            Choose a date
          </a>
        </div>
      ) : null}
    </div>
  )
}
