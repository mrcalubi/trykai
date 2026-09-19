import { useEffect, useState, useCallback } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import { edgeFunctionErrorMessage } from '../lib/edgeFunctionError'
import StarPicker from '../components/StarPicker'
import { guestRefundDescription } from '../lib/cancellationPolicy'

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

export default function Bookings() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const userId = useAuthedUserId()

  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const pendingBookingId = searchParams.get('booking')
  const [bookingStatusMessage, setBookingStatusMessage] = useState('')

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
          sessions (
            starts_at,
            spots_remaining,
            listings (
              id,
              title,
              host_id
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
    let attempts = 0
    const maxAttempts = 15

    async function pollBookingStatus() {
      setBookingStatusMessage('Processing your booking…')

      while (!cancelled && attempts < maxAttempts) {
        const { data, error: fetchError } = await supabase
          .from('bookings')
          .select('status')
          .eq('id', pendingBookingId)
          .eq('guest_id', userId)
          .single()

        if (cancelled) return

        if (fetchError || !data) {
          setBookingStatusMessage('Could not verify your booking. Check My Bookings below.')
          setSearchParams({}, { replace: true })
          return
        }

        if (data.status === 'confirmed') {
          setBookingStatusMessage('Booking confirmed! Your payment was successful.')
          setSearchParams({}, { replace: true })
          await loadData()
          return
        }

        if (data.status === 'cancelled') {
          setBookingStatusMessage('This booking was not completed. You can try booking again.')
          setSearchParams({}, { replace: true })
          return
        }

        attempts += 1
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }

      if (!cancelled) {
        setBookingStatusMessage(
          'Payment received — your booking should appear shortly. Refresh if it does not update.'
        )
        setSearchParams({}, { replace: true })
      }
    }

    void Promise.resolve().then(() => {
      if (!cancelled) void pollBookingStatus()
    })

    return () => {
      cancelled = true
    }
  }, [pendingBookingId, userId, loadData, setSearchParams])

  function isUpcoming(startsAt) {
    return startsAt && new Date(startsAt) > new Date()
  }

  function isPastBooking(booking) {
    const startsAt = booking.sessions?.starts_at
    if (!startsAt) return false
    return new Date(startsAt) < new Date()
  }

  function canCancelBooking(booking) {
    return (
      isUpcoming(booking.sessions?.starts_at) &&
      (booking.status === 'pending' || booking.status === 'confirmed')
    )
  }

  function canLeaveReview(booking) {
    return (
      isPastBooking(booking) &&
      (booking.status === 'pending' || booking.status === 'confirmed') &&
      !reviewedBookingIds.has(booking.id)
    )
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

  return (
    <div className="page page--narrow">
      <h1 className="dashboard-heading">Dashboard</h1>

      {location.state?.message && (
        <p className="success-message">{location.state.message}</p>
      )}

      {bookingStatusMessage && (
        <p className="success-message">{bookingStatusMessage}</p>
      )}

      {error && <p className="error-message" style={{ marginBottom: '20px' }}>{error}</p>}
      {cancelError && <p className="error-message" style={{ marginBottom: '20px' }}>{cancelError}</p>}

      <section className="dashboard-section">
        <h2 className="dashboard-section__title">My Bookings</h2>

        {bookings.length === 0 ? (
          <p className="empty-state">No bookings yet.</p>
        ) : (
          <div className="dashboard-list">
            {bookings.map((booking) => (
              <div key={booking.id} className="dashboard-card">
                <p className="dashboard-card__title">
                  {booking.sessions?.listings?.title || 'Unknown listing'}
                </p>
                <p className="dashboard-card__meta">
                  {booking.sessions?.starts_at
                    ? formatSessionDateTime(booking.sessions.starts_at)
                    : 'Date TBC'}
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
                  {canLeaveReview(booking) && activeReviewBookingId !== booking.id && (
                    <button
                      type="button"
                      onClick={() => openReviewForm(booking.id)}
                      className="btn btn--secondary"
                      style={{ padding: '6px 14px', fontSize: '13px' }}
                    >
                      Leave a review
                    </button>
                  )}
                  {canCancelBooking(booking) && confirmCancelBookingId !== booking.id && (
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
                      {guestRefundDescription(
                        booking.total_amount,
                        booking.sessions.starts_at,
                        booking.platform_fee
                      )}
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
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
