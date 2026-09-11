import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { supabase } from '../lib/supabase'
import ReviewCard from '../components/ReviewCard'
import { CancellationPolicyCollapsible } from '../components/CancellationPolicy'
import { formatCents } from '../lib/cancellationPolicy'
import {
  checkoutPriceCents,
  formatGuestFacingPrice,
  guestFacingPriceCents,
  paynowPriceCents,
} from '../lib/pricing'
import { edgeFunctionErrorMessage } from '../lib/edgeFunctionError'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

function formatSessionDate(iso) {
  return new Intl.DateTimeFormat('en-SG', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Singapore',
  }).format(new Date(iso))
}

function formatSessionTime(iso) {
  return new Intl.DateTimeFormat('en-SG', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Singapore',
  }).format(new Date(iso))
}

function averageRating(reviews) {
  if (!reviews?.length) return null
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0)
  return (sum / reviews.length).toFixed(1)
}

function CheckoutForm({ totalAmount, bookingId, onSuccess, onCancel }) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!stripe || !elements) return

    setError('')
    setLoading(true)

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/dashboard?booking=${bookingId}`,
      },
      redirect: 'if_required',
    })

    setLoading(false)

    if (confirmError) {
      setError(confirmError.message)
      return
    }

    onSuccess()
  }

  return (
    <form onSubmit={handleSubmit} className="payment-form">
      <p className="payment-form__total">
        Total: {formatCents(totalAmount)}
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
  const [sessions, setSessions] = useState([])
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [checkoutSessionId, setCheckoutSessionId] = useState(null)
  const [checkoutRail, setCheckoutRail] = useState(null)
  const [clientSecret, setClientSecret] = useState(null)
  const [bookingId, setBookingId] = useState(null)
  const [totalAmount, setTotalAmount] = useState(null)
  const [bookingLoading, setBookingLoading] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [revealedAddress, setRevealedAddress] = useState(null)
  const [viewerId, setViewerId] = useState(null)
  const [activePhoto, setActivePhoto] = useState(0)

  useEffect(() => {
    async function fetchListing() {
      setRevealedAddress(null)

      const { data: listingData, error: listingError } = await supabase
        .from('listings')
        .select(
          `
          id,
          title,
          description,
          category,
          area,
          price_per_person,
          photo_urls,
          whats_provided,
          host_id,
          users!host_id (
            full_name,
            avatar_url,
            stripe_payouts_enabled
          )
        `
        )
        .eq('id', id)
        .eq('is_active', true)
        .single()

      if (listingError) {
        setError(listingError.message)
        setLoading(false)
        return
      }

      setListing(listingData)

      const [sessionsResult, reviewsResult, authResult] = await Promise.all([
        supabase
          .from('sessions')
          .select('id, starts_at, duration_mins, spots_remaining')
          .eq('listing_id', id)
          .eq('status', 'open')
          .gt('starts_at', new Date().toISOString())
          .order('starts_at', { ascending: true }),
        supabase
          .from('reviews')
          .select(
            `
            id,
            rating,
            comment,
            created_at,
            users!reviewer_id (
              full_name
            )
          `
          )
          .eq('reviewee_id', listingData.host_id)
          .eq('role', 'guest')
          .order('created_at', { ascending: false }),
        supabase.auth.getSession(),
      ])

      if (sessionsResult.error) {
        setError(sessionsResult.error.message)
      } else {
        setSessions(sessionsResult.data)
      }

      if (!reviewsResult.error) {
        setReviews(reviewsResult.data ?? [])
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

  // CSS scroll-snap does the swiping; this only keeps the position dots in step.
  function trackGalleryPosition(e) {
    const { scrollLeft, clientWidth } = e.currentTarget
    if (!clientWidth) return
    setActivePhoto(Math.round(scrollLeft / clientWidth))
  }

  function cancelPayment() {
    setCheckoutSessionId(null)
    setCheckoutRail(null)
    setClientSecret(null)
    setBookingId(null)
    setTotalAmount(null)
    setPaymentError('')
  }

  function handlePaymentSuccess() {
    navigate(`/dashboard?booking=${bookingId}`)
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
    setCheckoutSessionId(sessionId)
  }

  async function startPayment(paymentRail) {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session || !checkoutSessionId) return

    setCheckoutRail(paymentRail)
    setBookingLoading(true)
    setPaymentError('')

    const { data, error: fnError } = await supabase.functions.invoke('create-payment-intent', {
      body: {
        session_id: checkoutSessionId,
        guests_count: 1,
        payment_rail: paymentRail,
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    })

    setBookingLoading(false)

    if (fnError || data?.error) {
      setPaymentError(await edgeFunctionErrorMessage(fnError, data))
      return
    }

    if (!data?.clientSecret || !data?.booking_id) {
      setPaymentError('Failed to start payment. Please try again.')
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
  const photos = listing.photo_urls?.length ? listing.photo_urls : []
  const avgRating = averageRating(reviews)
  const cardPrice = guestFacingPriceCents(listing.price_per_person)
  const paynowPrice = paynowPriceCents(listing.price_per_person)
  const checkoutPrice = checkoutRail
    ? checkoutPriceCents(listing.price_per_person, checkoutRail)
    : cardPrice
  const canTakePayments = hostCanTakePayments()
  const isOwnListing = viewerIsHost()

  return (
    <div className="page page--detail">
      {photos.length > 0 ? (
        <div className="detail-gallery">
          <div
            className="detail-gallery__scroller"
            data-photo-count={Math.min(photos.length, 5)}
            onScroll={trackGalleryPosition}
          >
            {photos.map((url, i) => (
              <img key={url} src={url} alt={`${listing.title} ${i + 1}`} className="detail-gallery__photo" />
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

      <div className="detail-layout">
        <div className="detail-main">
          <span className="detail-category">{listing.category}</span>
          <h1 className="detail-title">{listing.title}</h1>
          <p className="detail-area">{revealedAddress || listing.area}</p>

          <div className="detail-host">
            {host?.avatar_url ? (
              <img src={host.avatar_url} alt="" className="detail-host__avatar" />
            ) : (
              <div className="detail-host__avatar-placeholder">
                {host?.full_name?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <div>
              <p className="detail-host__name">Hosted by {host?.full_name || 'Anonymous'}</p>
              <p className="detail-host__rating">
                {avgRating ? `★ ${avgRating} average rating` : 'No reviews yet'}
              </p>
            </div>
          </div>

          <section className="detail-section">
            <h2 className="detail-section__title">About this experience</h2>
            <p className="detail-description">{listing.description}</p>
          </section>

          {listing.whats_provided?.length > 0 && (
            <section className="detail-section">
              <h2 className="detail-section__title">What&apos;s provided</h2>
              <ul className="detail-list">
                {listing.whats_provided.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="detail-section">
            <h2 className="detail-section__title">
              Reviews{reviews.length > 0 ? ` (${reviews.length})` : ''}
            </h2>
            {reviews.length === 0 ? (
              <p className="empty-state">No reviews yet.</p>
            ) : (
              <div className="reviews-list">
                {reviews.map((review) => (
                  <ReviewCard key={review.id} review={review} />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="detail-sidebar">
          <div className="detail-booking-card">
            <p className="detail-booking-card__price">
              {formatCents(checkoutPrice)}
              <span className="detail-booking-card__unit"> / person</span>
            </p>
            <p className="detail-booking-card__note">
              {checkoutRail === 'paynow'
                ? 'PayNow · 5% off the advertised price'
                : 'Select a session to book'}
            </p>

            <CancellationPolicyCollapsible />

            {paymentError && (
              <p className="error-message detail-booking-card__error">{paymentError}</p>
            )}

            {checkoutSessionId && (
              <div className="payment-panel">
                <h3 className="payment-panel__title">Complete your booking</h3>
                {!clientSecret ? (
                  <div className="payment-rails">
                    <p className="payment-rails__hint">
                      Card is the price shown everywhere. PayNow is 5% off at checkout only.
                    </p>
                    <button
                      type="button"
                      className="payment-rail"
                      disabled={bookingLoading}
                      aria-pressed={checkoutRail === 'card'}
                      onClick={() => startPayment('card')}
                    >
                      <span>
                        <span className="payment-rail__label">Pay by card</span>
                        <span className="payment-rail__hint">The advertised price</span>
                      </span>
                      <span className="payment-rail__price">{formatCents(cardPrice)}</span>
                    </button>
                    <button
                      type="button"
                      className="payment-rail"
                      disabled={bookingLoading}
                      aria-pressed={checkoutRail === 'paynow'}
                      onClick={() => startPayment('paynow')}
                    >
                      <span>
                        <span className="payment-rail__label">
                          PayNow <span className="paynow-badge">5% off</span>
                        </span>
                        <span className="payment-rail__hint">Cheaper than the advertised price</span>
                      </span>
                      <span className="payment-rail__price">{formatCents(paynowPrice)}</span>
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
                    />
                  </Elements>
                )}
              </div>
            )}

            {sessions.length === 0 ? (
              <p className="empty-state">No upcoming sessions available.</p>
            ) : (
              <div>
                {sessions.map((session) => (
                  <div key={session.id} className="session-card">
                    <div>
                      <p className="session-card__date">{formatSessionDate(session.starts_at)}</p>
                      <p className="session-card__meta">
                        {formatSessionTime(session.starts_at)} · {session.duration_mins} mins ·{' '}
                        {session.spots_remaining} spot{session.spots_remaining !== 1 ? 's' : ''}{' '}
                        left
                      </p>
                    </div>
                    <div className="session-card__actions">
                      <span className="session-card__price">
                        {session.id === checkoutSessionId
                          ? formatCents(checkoutPrice)
                          : formatGuestFacingPrice(listing.price_per_person)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleBook(session.id)}
                        disabled={
                          session.spots_remaining === 0 ||
                          bookingLoading ||
                          !canTakePayments ||
                          isOwnListing
                        }
                        className="btn btn--book"
                      >
                        {bookingLoading ? 'Loading…' : 'Book'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isOwnListing && sessions.length > 0 && (
              <p className="hint detail-booking-card__hint">
                This is your own listing. Hosts cannot book their own sessions.
              </p>
            )}

            {!isOwnListing && !canTakePayments && sessions.length > 0 && (
              <p className="hint detail-booking-card__hint">
                This host is still setting up payouts. Booking will open once that is complete.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
