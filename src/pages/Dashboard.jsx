import { useEffect, useState, useCallback } from 'react'
import { useLocation, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import StarPicker from '../components/StarPicker'
import {
  formatCents,
  guestRefundDescription,
} from '../lib/cancellationPolicy'

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

export default function Dashboard() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const userId = useAuthedUserId()

  const [listings, setListings] = useState([])
  const [bookings, setBookings] = useState([])
  const [hostSessions, setHostSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const pendingBookingId = searchParams.get('booking')
  const connectStatus = searchParams.get('connect')
  const [bookingStatusMessage, setBookingStatusMessage] = useState('')

  const [activeFormId, setActiveFormId] = useState(null)
  const [sessionDate, setSessionDate] = useState('')
  const [sessionTime, setSessionTime] = useState('')
  const [durationMins, setDurationMins] = useState('')
  const [spotsTotal, setSpotsTotal] = useState('')
  const [sessionError, setSessionError] = useState('')
  const [sessionLoading, setSessionLoading] = useState(false)

  const [reviewedBookingIds, setReviewedBookingIds] = useState(new Set())
  const [activeReviewBookingId, setActiveReviewBookingId] = useState(null)
  const [reviewRating, setReviewRating] = useState(0)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewError, setReviewError] = useState('')
  const [reviewLoading, setReviewLoading] = useState(false)

  const [confirmCancelBookingId, setConfirmCancelBookingId] = useState(null)
  const [confirmCancelSessionId, setConfirmCancelSessionId] = useState(null)
  const [confirmDeleteListingId, setConfirmDeleteListingId] = useState(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [bookingAddresses, setBookingAddresses] = useState({})
  const [payoutsEnabled, setPayoutsEnabled] = useState(true)
  const [payoutSetupLoading, setPayoutSetupLoading] = useState(false)
  const [payoutSetupError, setPayoutSetupError] = useState('')

  const loadData = useCallback(async () => {
    const [listingsResult, bookingsResult, reviewsResult, profileResult] = await Promise.all([
      supabase
        .from('listings')
        .select('id, title, area, category')
        .eq('host_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
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
      supabase
        .from('users')
        .select('stripe_payouts_enabled, is_host')
        .eq('id', userId)
        .single(),
    ])

    if (listingsResult.error) {
      setError(listingsResult.error.message)
    } else {
      setListings(listingsResult.data)
    }

    if (bookingsResult.error) {
      setError((prev) => prev || bookingsResult.error.message)
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

      setBookingAddresses(
        Object.fromEntries(addressEntries.filter(Boolean))
      )
    }

    if (!reviewsResult.error && reviewsResult.data) {
      setReviewedBookingIds(new Set(reviewsResult.data.map((r) => r.booking_id)))
    }

    if (!profileResult.error) {
      setPayoutsEnabled(Boolean(profileResult.data?.stripe_payouts_enabled))
    }

    const listingIds = listingsResult.data?.map((l) => l.id) ?? []
    if (listingIds.length > 0) {
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select(
          `
          id,
          starts_at,
          listing_id,
          listings (title),
          bookings (id, status, guests_count, total_amount)
        `
        )
        .in('listing_id', listingIds)
        .gt('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })

      if (sessionsError) {
        setError((prev) => prev || sessionsError.message)
      } else {
        const withBookings = (sessionsData ?? []).filter((session) =>
          session.bookings?.some(
            (b) => b.status === 'pending' || b.status === 'confirmed'
          )
        )
        setHostSessions(withBookings)
      }
    } else {
      setHostSessions([])
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

  useEffect(() => {
    if (connectStatus === 'return') {
      setBookingStatusMessage('Payout setup submitted. It can take a minute for Stripe to confirm.')
      setSearchParams({}, { replace: true })
    } else if (connectStatus === 'refresh') {
      setPayoutSetupError('Please finish payout setup to receive payments.')
      setSearchParams({}, { replace: true })
    }
  }, [connectStatus, setSearchParams])

  function openSessionForm(listingId) {
    setActiveFormId(listingId)
    setSessionDate('')
    setSessionTime('')
    setDurationMins('')
    setSpotsTotal('')
    setSessionError('')
  }

  function closeSessionForm() {
    setActiveFormId(null)
    setSessionError('')
  }

  async function handleAddSession(e, listingId) {
    e.preventDefault()
    setSessionError('')

    const duration = parseInt(durationMins, 10)
    const spots = parseInt(spotsTotal, 10)

    if (!sessionDate || !sessionTime) {
      setSessionError('Please enter a date and time.')
      return
    }

    if (Number.isNaN(duration) || duration < 1) {
      setSessionError('Duration must be at least 1 minute.')
      return
    }

    if (Number.isNaN(spots) || spots < 1) {
      setSessionError('Spots total must be at least 1.')
      return
    }

    const startsAt = new Date(`${sessionDate}T${sessionTime}:00+08:00`).toISOString()

    setSessionLoading(true)

    const { error: insertError } = await supabase.from('sessions').insert({
      listing_id: listingId,
      starts_at: startsAt,
      duration_mins: duration,
      spots_total: spots,
      spots_remaining: spots,
      status: 'open',
    })

    setSessionLoading(false)

    if (insertError) {
      setSessionError(insertError.message)
      return
    }

    closeSessionForm()
  }

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

  async function handlePayoutSetup() {
    setPayoutSetupError('')
    setPayoutSetupLoading(true)
    const { data, error: fnError } = await invokeAuthed('create-account-link', {})
    setPayoutSetupLoading(false)

    if (fnError) {
      setPayoutSetupError(fnError.message)
      return
    }
    if (data?.error) {
      setPayoutSetupError(data.error)
      return
    }
    if (data?.stripe_payouts_enabled) {
      setPayoutsEnabled(true)
      setBookingStatusMessage('Payouts are set up. You can take bookings.')
      return
    }
    if (data?.url) {
      window.location.assign(data.url)
      return
    }
    setPayoutSetupError('Could not start payout setup. Please try again.')
  }

  async function handleGuestCancelBooking(booking) {
    setCancelError('')
    setCancelLoading(true)

    const { data, error: fnError } = await invokeAuthed('cancel-booking', {
      booking_id: booking.id,
    })

    setCancelLoading(false)

    if (fnError) {
      setCancelError(fnError.message)
      return
    }
    if (data?.error) {
      setCancelError(data.error)
      return
    }

    setConfirmCancelBookingId(null)
    await loadData()
  }

  async function handleHostCancelSession(session) {
    setCancelError('')
    setCancelLoading(true)

    const { data, error: fnError } = await invokeAuthed('cancel-booking', {
      session_id: session.id,
    })

    setCancelLoading(false)

    if (fnError) {
      setCancelError(fnError.message)
      return
    }
    if (data?.error) {
      setCancelError(data.error)
      return
    }

    setConfirmCancelSessionId(null)
    await loadData()
  }

  async function handleDeleteListing(listingId) {
    setDeleteError('')
    setDeleteLoading(true)

    const { error: updateError } = await supabase
      .from('listings')
      .update({ is_active: false })
      .eq('id', listingId)
      .eq('host_id', userId)

    setDeleteLoading(false)

    if (updateError) {
      setDeleteError(updateError.message)
      return
    }

    setConfirmDeleteListingId(null)
    if (activeFormId === listingId) {
      closeSessionForm()
    }
    setListings((prev) => prev.filter((l) => l.id !== listingId))
    setHostSessions((prev) => prev.filter((s) => s.listing_id !== listingId))
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
      {deleteError && <p className="error-message" style={{ marginBottom: '20px' }}>{deleteError}</p>}
      {payoutSetupError && (
        <p className="error-message" style={{ marginBottom: '20px' }}>{payoutSetupError}</p>
      )}

      {listings.length > 0 && !payoutsEnabled && (
        <div className="payout-setup">
          <h2 className="payout-setup__title">Set up payouts</h2>
          <p className="payout-setup__copy">
            Stripe needs your identity and bank details before guests can book. This is
            separate from TryKai&apos;s own ID check, and it is how you get paid.
          </p>
          <button
            type="button"
            className="btn btn--primary"
            disabled={payoutSetupLoading}
            onClick={handlePayoutSetup}
          >
            {payoutSetupLoading ? 'Opening Stripe…' : 'Set up payouts'}
          </button>
        </div>
      )}

      <section className="dashboard-section">
        <h2 className="dashboard-section__title">Upcoming Hosted Sessions</h2>

        {hostSessions.length === 0 ? (
          <p className="empty-state">No upcoming sessions with active bookings.</p>
        ) : (
          <div className="dashboard-list">
            {hostSessions.map((session) => (
              <div key={session.id} className="dashboard-card">
                <p className="dashboard-card__title">
                  {session.listings?.title || 'Unknown listing'}
                </p>
                <p className="dashboard-card__meta">
                  {session.starts_at ? formatSessionDateTime(session.starts_at) : 'Date TBC'}
                  {' · '}
                  {(session.bookings ?? []).filter(
                    (b) => b.status === 'pending' || b.status === 'confirmed'
                  ).length}{' '}
                  active booking(s)
                </p>
                <div className="booking-card__actions">
                  {confirmCancelSessionId !== session.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setCancelError('')
                        setConfirmCancelSessionId(session.id)
                      }}
                      className="btn btn--ghost"
                      style={{ padding: '6px 14px', fontSize: '13px', color: 'var(--error)' }}
                    >
                      Cancel session
                    </button>
                  )}
                </div>

                {confirmCancelSessionId === session.id && (
                  <div className="cancel-confirm">
                    <p className="cancel-confirm__warning">
                      Cancelling this session will issue full refunds to all guests and add a
                      strike to your account. Three strikes will deactivate your listing.
                    </p>
                    <p className="cancel-confirm__note">
                      {(session.bookings ?? [])
                        .filter((b) => b.status === 'pending' || b.status === 'confirmed')
                        .map((b) => `Full refund of ${formatCents(b.total_amount)}`)
                        .join(' · ')}
                    </p>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button
                        type="button"
                        disabled={cancelLoading}
                        onClick={() => handleHostCancelSession(session)}
                        className="btn btn--primary"
                        style={{ padding: '10px 20px', fontSize: '14px', background: 'var(--error)' }}
                      >
                        {cancelLoading ? 'Cancelling…' : 'Confirm cancellation'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmCancelSessionId(null)}
                        className="btn btn--ghost"
                        style={{ padding: '10px 20px', fontSize: '14px' }}
                      >
                        Keep session
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section__title">My Listings</h2>

        {listings.length === 0 ? (
          <p className="empty-state">
            No listings yet.{' '}
            <Link to="/create-listing">Create one</Link>
          </p>
        ) : (
          <div className="dashboard-list">
            {listings.map((listing) => (
              <div key={listing.id} className="dashboard-card">
                <div className="dashboard-card__header">
                  <div>
                    <p className="dashboard-card__title">{listing.title}</p>
                    <p className="dashboard-card__meta">
                      {listing.category} · {listing.area}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <Link
                      to={`/edit-listing/${listing.id}`}
                      className="btn btn--ghost"
                      style={{ padding: '8px 16px', fontSize: '14px', textDecoration: 'none' }}
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() =>
                        activeFormId === listing.id
                          ? closeSessionForm()
                          : openSessionForm(listing.id)
                      }
                      className="btn btn--secondary"
                    >
                      {activeFormId === listing.id ? 'Cancel' : 'Add Session'}
                    </button>
                    {confirmDeleteListingId !== listing.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError('')
                          setConfirmDeleteListingId(listing.id)
                        }}
                        className="btn btn--ghost"
                        style={{ padding: '8px 16px', fontSize: '14px', color: 'var(--error)' }}
                      >
                        Delete listing
                      </button>
                    )}
                  </div>
                </div>

                {confirmDeleteListingId === listing.id && (
                  <div className="cancel-confirm">
                    <p className="cancel-confirm__warning">
                      Are you sure? This will hide your listing and cannot be undone easily.
                    </p>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button
                        type="button"
                        disabled={deleteLoading}
                        onClick={() => handleDeleteListing(listing.id)}
                        className="btn btn--primary"
                        style={{ padding: '10px 20px', fontSize: '14px', background: 'var(--error)' }}
                      >
                        {deleteLoading ? 'Deleting…' : 'Confirm delete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteListingId(null)}
                        className="btn btn--ghost"
                        style={{ padding: '10px 20px', fontSize: '14px' }}
                      >
                        Keep listing
                      </button>
                    </div>
                  </div>
                )}

                {activeFormId === listing.id && (
                  <form
                    onSubmit={(e) => handleAddSession(e, listing.id)}
                    className="dashboard-card__form form"
                  >
                    <div className="form__row">
                      <label className="label">
                        Date
                        <input
                          type="date"
                          value={sessionDate}
                          onChange={(e) => setSessionDate(e.target.value)}
                          required
                          className="input"
                        />
                      </label>
                      <label className="label">
                        Time
                        <input
                          type="time"
                          value={sessionTime}
                          onChange={(e) => setSessionTime(e.target.value)}
                          required
                          className="input"
                        />
                      </label>
                    </div>
                    <div className="form__row">
                      <label className="label">
                        Duration (mins)
                        <input
                          type="number"
                          value={durationMins}
                          onChange={(e) => setDurationMins(e.target.value)}
                          min="1"
                          placeholder="60"
                          required
                          className="input"
                        />
                      </label>
                      <label className="label">
                        Spots total
                        <input
                          type="number"
                          value={spotsTotal}
                          onChange={(e) => setSpotsTotal(e.target.value)}
                          min="1"
                          placeholder="4"
                          required
                          className="input"
                        />
                      </label>
                    </div>

                    {sessionError && <p className="error-message">{sessionError}</p>}

                    <button
                      type="submit"
                      disabled={sessionLoading}
                      className="btn btn--primary"
                      style={{ alignSelf: 'flex-start', padding: '10px 20px', fontSize: '14px' }}
                    >
                      {sessionLoading ? 'Adding…' : 'Add session'}
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

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
