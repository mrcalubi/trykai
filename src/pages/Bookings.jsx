import { useEffect, useState, useCallback } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import { edgeFunctionErrorMessage } from '../lib/edgeFunctionError'
import StarPicker from '../components/StarPicker'
import Button from '../components/ui/Button'
import {
  awaitingPaidBookingId,
  guestBookingActions,
  guestCancellationNote,
  showGuestBooking,
} from '../lib/guestBookings'
import {
  bookingStatusMessage,
  paymentStatusFromIntent,
  paymentWasDeclined,
} from '../lib/paymentReturn'

const POLL_ATTEMPTS = 20
const POLL_INTERVAL_MS = 2000

let stripePromise
function getStripe() {
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  if (!key) return Promise.resolve(null)
  if (!stripePromise) {
    stripePromise = import('@stripe/stripe-js').then(({ loadStripe }) => loadStripe(key))
  }
  return stripePromise
}

function formatSessionDateTime(iso) {
  const date = new Intl.DateTimeFormat('en-SG', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Singapore',
  }).format(new Date(iso))
  const time = new Intl.DateTimeFormat('en-SG', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Singapore',
  }).format(new Date(iso))
  return `${date} at ${time}`
}

export default function Bookings({ embedded = false }) {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const userId = useAuthedUserId()

  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const pendingBookingId = searchParams.get('booking')
  const redirectStatus = searchParams.get('redirect_status')
  const clientPaymentStatus = searchParams.get('payment')
  const stripeClientSecret = searchParams.get('payment_intent_client_secret')
  const [bookingNotice, setBookingNotice] = useState(null)
  // The bookings list can still say pending after the guest cancels checkout.
  // Once we know the real outcome, keep showing it even if a slower read lands.
  const [settledBooking, setSettledBooking] = useState(null)

  const [reviewedBookingIds, setReviewedBookingIds] = useState(new Set())
  const [activeReviewBookingId, setActiveReviewBookingId] = useState(null)
  const [reviewRating, setReviewRating] = useState(0)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewError, setReviewError] = useState('')
  const [reviewLoading, setReviewLoading] = useState(false)

  const [confirmCancelBookingId, setConfirmCancelBookingId] = useState(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [bookingAddresses, setBookingAddresses] = useState({})

  const loadData = useCallback(async () => {
    const [bookingsResult, reviewsResult] = await Promise.all([
      supabase
        .from('bookings')
        .select(
          `
          id,
          status,
          session_id,
          guests_count,
          total_amount,
          platform_fee,
          stripe_charge_id,
          stripe_refund_id,
          refund_amount,
          sessions (
            starts_at,
            duration_mins,
            spots_remaining,
            listings (
              id,
              title,
              host_id,
              duration_mins
            )
          )
        `
        )
        .eq('guest_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('reviews')
        .select('booking_id')
        .eq('reviewer_id', userId)
        .eq('role', 'guest'),
    ])

    if (bookingsResult.error) {
      setError(bookingsResult.error.message)
    } else {
      setBookings(bookingsResult.data)

      const addressEntries = await Promise.all(
        (bookingsResult.data ?? [])
          .filter(
            (booking) =>
              booking.status === 'confirmed' &&
              booking.sessions?.starts_at &&
              new Date(booking.sessions.starts_at) > new Date() &&
              booking.sessions?.listings?.id
          )
          .map(async (booking) => {
            const { data: address } = await supabase.rpc('get_listing_address', {
              p_listing_id: booking.sessions.listings.id,
            })
            return address ? [booking.id, address] : null
          })
      )

      setBookingAddresses(Object.fromEntries(addressEntries.filter(Boolean)))
    }

    if (!reviewsResult.error && reviewsResult.data) {
      setReviewedBookingIds(new Set(reviewsResult.data.map((r) => r.booking_id)))
    }

    setLoading(false)
  }, [userId])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) loadData()
    })

    return () => {
      cancelled = true
    }
  }, [loadData])

  useEffect(() => {
    if (!pendingBookingId) return

    let cancelled = false
    let timer
    let wake

    function wait(ms) {
      return new Promise((resolve) => {
        wake = resolve
        timer = setTimeout(resolve, ms)
      })
    }

    function clearPaymentQuery() {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('booking')
        next.delete('payment')
        next.delete('payment_intent')
        next.delete('payment_intent_client_secret')
        next.delete('redirect_status')
        return next
      }, { replace: true })
    }

    function remember(status) {
      setSettledBooking((prev) => {
        if (prev?.id === pendingBookingId && prev.status === status) return prev
        if (prev?.id === pendingBookingId && prev.status === 'confirmed' && status !== 'confirmed') {
          return prev
        }
        return { id: pendingBookingId, status }
      })
    }

    async function pollBookingStatus() {
      let paymentStatus = clientPaymentStatus
      if (!paymentStatus && !redirectStatus && stripeClientSecret) {
        const stripe = await getStripe()
        if (cancelled) return
        if (stripe) {
          try {
            const { paymentIntent } = await stripe.retrievePaymentIntent(stripeClientSecret)
            paymentStatus = paymentStatusFromIntent(paymentIntent?.status)
          } catch {
            paymentStatus = null
          }
        }
      }

      if (cancelled) return

      const signals = { redirectStatus, paymentStatus }
      if (paymentWasDeclined(signals)) {
        remember('cancelled')
        void (async () => {
          const {
            data: { session },
          } = await supabase.auth.getSession()
          if (cancelled) return
          await supabase.functions.invoke('cancel-booking', {
            body: { booking_id: pendingBookingId },
            headers: { Authorization: `Bearer ${session?.access_token}` },
          })
        })()
      }

      setBookingNotice(bookingStatusMessage({ ...signals, timedOut: false }))

      let attempts = 0
      while (!cancelled && attempts < POLL_ATTEMPTS) {
        const { data, error: fetchError } = await supabase
          .from('bookings')
          .select('status')
          .eq('id', pendingBookingId)
          .eq('guest_id', userId)
          .single()

        if (cancelled) return

        if (fetchError || !data) {
          setBookingNotice({
            tone: 'error',
            text: 'Could not verify your booking. Check My Bookings below.',
          })
          clearPaymentQuery()
          return
        }

        if (data.status === 'confirmed' || data.status === 'cancelled') {
          remember(data.status)
          setBookingNotice(bookingStatusMessage({ bookingStatus: data.status, ...signals }))
          await loadData()
          if (!cancelled) clearPaymentQuery()
          return
        }

        attempts += 1
        const timedOut = attempts >= POLL_ATTEMPTS
        setBookingNotice(
          bookingStatusMessage({ bookingStatus: data.status, ...signals, timedOut })
        )
        if (timedOut) break
        await wait(POLL_INTERVAL_MS)
      }

      if (!cancelled) clearPaymentQuery()
    }

    void pollBookingStatus()

    return () => {
      cancelled = true
      clearTimeout(timer)
      wake?.()
    }
  }, [
    pendingBookingId,
    redirectStatus,
    clientPaymentStatus,
    stripeClientSecret,
    userId,
    loadData,
    setSearchParams,
  ])

  function presentBooking(booking) {
    if (booking.status !== 'pending') return booking
    if (settledBooking?.id === booking.id && settledBooking.status !== 'pending') {
      return { ...booking, status: settledBooking.status }
    }
    if (redirectStatus === 'failed' && booking.id === pendingBookingId) {
      return { ...booking, status: 'cancelled' }
    }
    return booking
  }

  function actionsFor(booking) {
    return guestBookingActions(booking, {
      alreadyReviewed: reviewedBookingIds.has(booking.id),
    })
  }

  function canLeaveReview(booking) {
    return actionsFor(booking).review
  }

  function openReviewForm(bookingId) {
    setActiveReviewBookingId(bookingId)
    setReviewRating(0)
    setReviewComment('')
    setReviewError('')
  }

  function closeReviewForm() {
    setActiveReviewBookingId(null)
    setReviewError('')
  }

  async function handleSubmitReview(e, booking) {
    e.preventDefault()
    setReviewError('')

    if (reviewRating < 1 || reviewRating > 5) {
      setReviewError('Please select a star rating.')
      return
    }

    if (!canLeaveReview(booking)) {
      setReviewError('You can only review a confirmed booking after the session ends.')
      return
    }

    const hostId = booking.sessions?.listings?.host_id
    if (!hostId) {
      setReviewError('Could not find host for this booking.')
      return
    }

    setReviewLoading(true)

    const { error: insertError } = await supabase.from('reviews').insert({
      booking_id: booking.id,
      reviewer_id: userId,
      reviewee_id: hostId,
      rating: reviewRating,
      comment: reviewComment.trim() || null,
      role: 'guest',
    })

    setReviewLoading(false)

    if (insertError) {
      setReviewError(insertError.message)
      return
    }

    setReviewedBookingIds((prev) => new Set([...prev, booking.id]))
    closeReviewForm()
  }

  async function invokeAuthed(name, body) {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return supabase.functions.invoke(name, {
      body,
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
  }

  async function handleGuestCancelBooking(booking) {
    setCancelError('')
    setCancelLoading(true)

    const { data, error: fnError } = await invokeAuthed('cancel-booking', {
      booking_id: booking.id,
    })

    setCancelLoading(false)

    if (fnError || data?.error) {
      setCancelError(await edgeFunctionErrorMessage(fnError, data))
      return
    }

    setConfirmCancelBookingId(null)
    await loadData()
  }

  if (loading) {
    return <p className="status-message">Loading…</p>
  }

  const awaitingBookingId = awaitingPaidBookingId({
    bookingId: pendingBookingId,
    redirectStatus,
    paymentStatus: clientPaymentStatus,
  })
  const visibleBookings = bookings
    .map((booking) => presentBooking(booking))
    .filter((booking) => showGuestBooking(booking, { awaitingBookingId }))

  return (
    <div className="page page--narrow">
      {embedded ? null : <h1 className="dashboard-heading">Dashboard</h1>}

      {location.state?.message && (
        <p className="success-message">{location.state.message}</p>
      )}

      {bookingNotice && (
        <p className={bookingNotice.tone === 'error' ? 'status-banner--error' : 'success-message'}>
          {bookingNotice.text}
        </p>
      )}

      {error && <p className="error-message" style={{ marginBottom: '20px' }}>{error}</p>}
      {cancelError && <p className="error-message" style={{ marginBottom: '20px' }}>{cancelError}</p>}

      <section className="dashboard-section">
        <h2 className="dashboard-section__title">My Bookings</h2>

        {visibleBookings.length === 0 ? (
          <p className="empty-state">No bookings yet.</p>
        ) : (
          <div className="dashboard-list">
            {visibleBookings.map((booking) => {
              const actions = actionsFor(booking)
              return (
              <div key={booking.id} className="dashboard-card">
                <p className="dashboard-card__title">
                  {booking.sessions?.listings?.title || 'Unknown listing'}
                </p>
                <p className="dashboard-card__meta">
                  {booking.sessions?.starts_at
                    ? formatSessionDateTime(booking.sessions.starts_at)
                    : 'Date TBC'}
                  {' · '}
                  {booking.guests_count === 1
                    ? '1 guest'
                    : `${booking.guests_count} guests`}
                  {bookingAddresses[booking.id] && (
                    <>
                      {' · '}
                      {bookingAddresses[booking.id]}
                    </>
                  )}
                </p>
                <div className="booking-card__actions">
                  <span className={`badge badge--${booking.status}`}>
                    {booking.status}
                  </span>
                  {actions.review && activeReviewBookingId !== booking.id && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => openReviewForm(booking.id)}
                    >
                      Leave a review
                    </Button>
                  )}
                  {actions.cancel && confirmCancelBookingId !== booking.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setCancelError('')
                        setConfirmCancelBookingId(booking.id)
                      }}
                      className="btn btn--ghost"
                      style={{ padding: '6px 14px', fontSize: '13px', color: 'var(--error)' }}
                    >
                      Cancel booking
                    </button>
                  )}
                  {reviewedBookingIds.has(booking.id) && (
                    <span className="hint">Review submitted</span>
                  )}
                </div>

                {confirmCancelBookingId === booking.id && (
                  <div className="cancel-confirm">
                    <p className="cancel-confirm__note">
                      {guestCancellationNote(booking)}
                    </p>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button
                        type="button"
                        disabled={cancelLoading}
                        onClick={() => handleGuestCancelBooking(booking)}
                        className="btn btn--primary"
                        style={{ padding: '10px 20px', fontSize: '14px', background: 'var(--error)' }}
                      >
                        {cancelLoading ? 'Cancelling…' : 'Confirm cancellation'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmCancelBookingId(null)}
                        className="btn btn--ghost"
                        style={{ padding: '10px 20px', fontSize: '14px' }}
                      >
                        Keep booking
                      </button>
                    </div>
                  </div>
                )}

                {activeReviewBookingId === booking.id && (
                  <form
                    onSubmit={(e) => handleSubmitReview(e, booking)}
                    className="dashboard-card__form form"
                  >
                    <label className="label">
                      Rating
                      <StarPicker value={reviewRating} onChange={setReviewRating} />
                    </label>
                    <label className="label">
                      Comment
                      <textarea
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        placeholder="Share your experience…"
                        rows={3}
                        className="input input--textarea"
                      />
                    </label>
                    {reviewError && <p className="error-message">{reviewError}</p>}
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button
                        type="submit"
                        disabled={reviewLoading}
                        className="btn btn--primary"
                        style={{ padding: '10px 20px', fontSize: '14px' }}
                      >
                        {reviewLoading ? 'Submitting…' : 'Submit review'}
                      </button>
                      <button
                        type="button"
                        onClick={closeReviewForm}
                        className="btn btn--ghost"
                        style={{ padding: '10px 20px', fontSize: '14px' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
