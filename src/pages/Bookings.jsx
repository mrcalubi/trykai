import { useEffect, useState, useCallback } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import { edgeFunctionErrorMessage } from '../lib/edgeFunctionError'
import StarPicker from '../components/StarPicker'
import Button from '../components/ui/Button'
import PageLoader from '../components/PageLoader'
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
import { PAGE_LOAD_ERROR, withIssuedAtRetry } from '../lib/pageLoad'
import { formatSessionDateTime, formatSessionDay, formatSessionTime } from '../lib/sessionDate'
import { guestCalendarMarks, splitGuestBookings } from '../lib/profileV2'
import { DateChip, TabCalendar } from '../components/profile/ProfileSections'
import { singaporeDateKey } from '../lib/sessionCalendar'
import { addonLineLabel, loadBookingAddonRows } from '../lib/bookingAddons'
import { isMissingRescheduleColumn } from '../lib/bookingPage'

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

export default function Bookings({ embedded = false, hostCta = null, withCalendar = false }) {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const userId = useAuthedUserId()

  const [bookings, setBookings] = useState([])
  const [bookingAddonsById, setBookingAddonsById] = useState({})
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
  const [movedFromById, setMovedFromById] = useState({})
  const [nowMs] = useState(() => Date.now())

  const loadData = useCallback(async () => {
    const bookingsSelect = `
          id,
          status,
          session_id,
          guests_count,
          total_amount,
          platform_fee,
          stripe_charge_id,
          stripe_refund_id,
          refund_amount,
          rescheduled_at,
          rescheduled_from_session_id,
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
    const bookingsSelectFallback = bookingsSelect.replace(
      /\s*rescheduled_at,\s*rescheduled_from_session_id,/,
      '',
    )
    let bookingsResult = await withIssuedAtRetry(() =>
      supabase.from('bookings').select(bookingsSelect).eq('guest_id', userId).order('created_at', { ascending: false }),
    )
    if (bookingsResult.error && isMissingRescheduleColumn(bookingsResult.error)) {
      bookingsResult = await withIssuedAtRetry(() =>
        supabase
          .from('bookings')
          .select(bookingsSelectFallback)
          .eq('guest_id', userId)
          .order('created_at', { ascending: false }),
      )
    }
    const [reviewsResult] = await Promise.all([
      supabase
        .from('reviews')
        .select('booking_id')
        .eq('reviewer_id', userId)
        .eq('role', 'guest'),
    ])

    if (bookingsResult.error) {
      setError(PAGE_LOAD_ERROR)
    } else {
      setBookings(bookingsResult.data)
      const { rows: addonRows } = await loadBookingAddonRows(
        supabase,
        (bookingsResult.data ?? []).map((booking) => booking.id),
      )
      const byId = {}
      for (const row of addonRows) {
        const list = byId[row.booking_id] ?? []
        list.push(row)
        byId[row.booking_id] = list
      }
      setBookingAddonsById(byId)

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
            const { data: address } = await supabase.rpc('listing_address', {
              listing_id: booking.sessions.listings.id,
            })
            return address ? [booking.id, address] : null
          })
      )

      setBookingAddresses(Object.fromEntries(addressEntries.filter(Boolean)))

      const fromIds = [...new Set(
        (bookingsResult.data ?? [])
          .map((booking) => booking.rescheduled_from_session_id)
          .filter(Boolean),
      )]
      if (fromIds.length > 0) {
        const { data: fromSessions } = await supabase
          .from('sessions')
          .select('id, starts_at')
          .in('id', fromIds)
        const bySession = {}
        for (const row of fromSessions ?? []) bySession[row.id] = row.starts_at
        const moved = {}
        for (const booking of bookingsResult.data ?? []) {
          const iso = bySession[booking.rescheduled_from_session_id]
          if (iso) moved[booking.id] = iso
        }
        setMovedFromById(moved)
      } else {
        setMovedFromById({})
      }
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
      }, { replace: true, preventScrollReset: true })
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
          await supabase.functions.invoke('abandon-checkout', {
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

  function chipTone(booking) {
    if (booking.status === 'cancelled') return 'muted'
    const startsAt = booking.sessions?.starts_at
    return startsAt && new Date(startsAt).getTime() > nowMs ? 'green' : 'muted'
  }

  function renderBookingCard(booking, { chip = false } = {}) {
    const actions = actionsFor(booking)
    return (
      <div key={booking.id} className={chip ? 'dashboard-card booking-row' : 'dashboard-card'}>
        {chip ? <DateChip iso={booking.sessions?.starts_at} tone={chipTone(booking)} /> : null}
        <div className="booking-row__body">
          <p className="dashboard-card__title">
            <Link to={`/bookings/${booking.id}`}>
              {booking.sessions?.listings?.title || 'Unknown listing'}
            </Link>
          </p>
          <p className="dashboard-card__meta">
            {booking.sessions?.starts_at
              ? formatSessionDateTime(booking.sessions.starts_at)
              : 'Date TBC'}
            {' · '}
            {booking.guests_count === 1
              ? '1 guest'
              : `${booking.guests_count} guests`}
            {(bookingAddonsById[booking.id] ?? []).length > 0
              ? ` · ${(bookingAddonsById[booking.id] ?? [])
                  .map((row) => addonLineLabel(row.name, row.quantity))
                  .join(', ')}`
              : ''}
            {bookingAddresses[booking.id] && (
              <>
                {' · '}
                {bookingAddresses[booking.id]}
              </>
            )}
            {movedFromById[booking.id] ? ` · Moved from ${formatSessionDay(movedFromById[booking.id])}` : ''}
          </p>
          <div className="booking-card__actions">
            <span className={`badge badge--${booking.status}`}>
              {booking.status}
            </span>
            {actions.review && activeReviewBookingId !== booking.id && (
              <Button
                type="button"
                variant="secondary"
                className="btn--small"
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
                className="btn btn--ghost btn--small btn--danger-quiet"
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
              <div className="button-row">
                <Button
                  variant="destructive"
                  loading={cancelLoading}
                  loadingLabel="Cancelling"
                  onClick={() => handleGuestCancelBooking(booking)}
                >
                  Confirm cancellation
                </Button>
                <button
                  type="button"
                  onClick={() => setConfirmCancelBookingId(null)}
                  className="btn btn--ghost"
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
              <div className="button-row">
                <Button
                  type="submit"
                  variant="primary"
                  loading={reviewLoading}
                  loadingLabel="Submitting"
                >
                  Submit review
                </Button>
                <button
                  type="button"
                  onClick={closeReviewForm}
                  className="btn btn--ghost"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return <PageLoader />
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

      {error && <p className="error-message error-message--spaced">{error}</p>}
      {cancelError && <p className="error-message error-message--spaced">{cancelError}</p>}

      <div className={withCalendar ? 'profile-tab-layout' : undefined}>
        {withCalendar ? (
          <aside className="profile-tab-layout__aside">
            <GuestCalendar bookings={visibleBookings} nowMs={nowMs} />
          </aside>
        ) : null}
        <section
          className={
            withCalendar ? 'dashboard-section profile-tab-layout__main' : 'dashboard-section'
          }
        >
          <h2 className={withCalendar ? 'visually-hidden' : 'dashboard-section__title'}>My Bookings</h2>

          {visibleBookings.length === 0 ? (
            <div className="empty-state">
              <p>No bookings yet.</p>
              {hostCta ? (
                <>
                  <p>Share a skill on TryKai.</p>
                  <Link to={hostCta.to}>{hostCta.label}</Link>
                </>
              ) : null}
            </div>
          ) : withCalendar ? (
            <BookingColumns
              groups={splitGuestBookings(visibleBookings, nowMs)}
              renderCard={(booking) => renderBookingCard(booking, { chip: true })}
            />
          ) : (
            <div className="listings-grid listings-grid--bookings">
              {visibleBookings.map((booking) => renderBookingCard(booking))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function BookingColumns({ groups, renderCard }) {
  return (
    <>
      <h3 className="booking-group__title">Upcoming</h3>
      {groups.upcoming.length ? (
        <div className="booking-group">{groups.upcoming.map(renderCard)}</div>
      ) : (
        <p className="booking-group__empty">
          Nothing booked yet. <Link to="/">Find something to try</Link>
        </p>
      )}
      {groups.past.length ? (
        <>
          <h3 className="booking-group__title">Past</h3>
          <div className="booking-group">{groups.past.map(renderCard)}</div>
        </>
      ) : null}
    </>
  )
}

function GuestCalendar({ bookings, nowMs }) {
  const marks = guestCalendarMarks(bookings, nowMs)
  const upcoming = bookings.filter(
    (booking) =>
      booking.status === 'confirmed' &&
      booking.sessions?.starts_at &&
      new Date(booking.sessions.starts_at).getTime() > nowMs,
  ).length

  return (
    <TabCalendar
      label="Your bookings calendar"
      marks={marks}
      summary={upcoming ? `${upcoming} upcoming` : 'Nothing coming up'}
      legend="guest"
      nowMs={nowMs}
      renderDay={(dateKey) =>
        bookings
          .filter(
            (booking) =>
              booking.status === 'confirmed' &&
              booking.sessions?.starts_at &&
              singaporeDateKey(booking.sessions.starts_at) === dateKey,
          )
          .map((booking) => (
            <li key={booking.id}>
              <Link to={`/bookings/${booking.id}`}>
                {formatSessionTime(booking.sessions.starts_at)} ·{' '}
                {booking.sessions?.listings?.title || 'Session'}
              </Link>
            </li>
          ))
      }
    />
  )
}
