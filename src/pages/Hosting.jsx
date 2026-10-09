import { useEffect, useState, useCallback } from 'react'
import { useLocation, useSearchParams, Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import { edgeFunctionErrorMessage } from '../lib/edgeFunctionError'
import { formatCents } from '../lib/cancellationPolicy'
import Button from '../components/ui/Button'
import OverflowMenu from '../components/ui/OverflowMenu'

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

function activeBookingsOn(session) {
  return (session.bookings ?? []).filter(
    (b) => b.status === 'pending' || b.status === 'confirmed'
  )
}

function firstRow(data) {
  if (Array.isArray(data)) return data[0] ?? null
  return data ?? null
}

function listingUpcomingStats(listingId, hostSessions) {
  const sessions = hostSessions.filter((session) => session.listing_id === listingId)
  const bookings = sessions.flatMap((session) => activeBookingsOn(session))
  return { sessionCount: sessions.length, bookingCount: bookings.length }
}

function sessionLabel(count) {
  return count === 1 ? '1 upcoming session' : `${count} upcoming sessions`
}

function bookingLabel(count) {
  return count === 1 ? '1 upcoming booking' : `${count} upcoming bookings`
}

function ListingDeleteDialog({
  listing,
  sessionCount,
  bookingCount,
  loading,
  onClose,
  onConfirm,
}) {
  const blocked = bookingCount > 0
  const title = listing.title

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="confirm-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-delete-title"
      >
        <p id="listing-delete-title" className="cancel-confirm__warning">
          {blocked
            ? `'${title}' has ${bookingLabel(bookingCount)}. Cancel those sessions first. Guests are refunded in full.`
            : `Delete '${title}'? This can't be undone.${
                sessionCount > 0
                  ? ` Its ${sessionLabel(sessionCount)} will be removed too.`
                  : ''
              }`}
        </p>
        <div className="confirm-dialog__actions">
          {blocked ? (
            <Button variant="secondary" onClick={onClose}>
              OK
            </Button>
          ) : (
            <>
              <Button variant="destructive" disabled={loading} onClick={onConfirm}>
                {loading ? 'Deleting…' : 'Confirm delete'}
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Keep listing
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Hosting({ embedded = false }) {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const userId = useAuthedUserId()

  const [listings, setListings] = useState([])
  const [hostSessions, setHostSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isHost, setIsHost] = useState(false)

  const connectStatus = searchParams.get('connect')
  const [bookingStatusMessage, setBookingStatusMessage] = useState('')

  const [activeFormId, setActiveFormId] = useState(null)
  const [sessionDate, setSessionDate] = useState('')
  const [sessionTime, setSessionTime] = useState('')
  const [durationMins, setDurationMins] = useState('')
  const [spotsTotal, setSpotsTotal] = useState('')
  const [sessionError, setSessionError] = useState('')
  const [sessionLoading, setSessionLoading] = useState(false)

  const [confirmCancelSessionId, setConfirmCancelSessionId] = useState(null)
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState(null)
  const [confirmDeleteListingId, setConfirmDeleteListingId] = useState(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [deleteSessionLoading, setDeleteSessionLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [deleteSessionError, setDeleteSessionError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [payoutsEnabled, setPayoutsEnabled] = useState(true)
  const [payoutSetupLoading, setPayoutSetupLoading] = useState(false)
  const [payoutSetupError, setPayoutSetupError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  const loadData = useCallback(async () => {
    const listingColumns = 'id, title, area, category, photo_urls'
    const [profileResult, adminResult] = await Promise.all([
      supabase
        .from('users')
        .select('stripe_payouts_enabled, is_host')
        .eq('id', userId)
        .single(),
      supabase.rpc('my_verification'),
    ])

    let listingsResult = await supabase
      .from('listings')
      .select(`${listingColumns}, duration_mins`)
      .eq('host_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    // 00018 adds duration_mins. Until that migration is applied, asking for
    // the column fails the whole listings read and the host cannot add a session.
    if (listingsResult.error && /duration_mins/.test(listingsResult.error.message ?? '')) {
      listingsResult = await supabase
        .from('listings')
        .select(listingColumns)
        .eq('host_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
    }

    if (listingsResult.error) {
      setError(listingsResult.error.message)
      setListings([])
    } else {
      setError('')
      setListings(listingsResult.data ?? [])
    }

    if (!profileResult.error) {
      setPayoutsEnabled(Boolean(profileResult.data?.stripe_payouts_enabled))
      setIsHost(Boolean(profileResult.data?.is_host))
    }

    const adminRow = firstRow(adminResult.data)
    const admin = !adminResult.error && Boolean(adminRow?.is_admin)
    setIsAdmin(admin)
    setPendingCount(admin ? Number(adminRow?.pending_count) || 0 : 0)

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
        .neq('status', 'cancelled')
        .gt('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })

      if (sessionsError) {
        setError((prev) => prev || sessionsError.message)
      } else {
        setHostSessions(sessionsData ?? [])
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
    if (connectStatus !== 'return' && connectStatus !== 'refresh') return

    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      if (connectStatus === 'return') {
        setBookingStatusMessage(
          'Payout setup submitted. It can take a minute for Stripe to confirm.',
        )
      } else {
        setPayoutSetupError('Please finish payout setup to receive payments.')
      }
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('connect')
        return next
      }, { replace: true })
    })

    return () => {
      cancelled = true
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

    const spots = parseInt(spotsTotal, 10)
    const listing = listings.find((item) => item.id === listingId)
    const listingDuration = listing?.duration_mins
    const usesListingDuration = Number.isInteger(listingDuration) && listingDuration >= 1
    const duration = parseInt(durationMins, 10)

    if (!sessionDate || !sessionTime) {
      setSessionError('Please enter a date and time.')
      return
    }

    if (!usesListingDuration && (Number.isNaN(duration) || duration < 1)) {
      setSessionError('Duration must be at least 1 minute.')
      return
    }

    if (Number.isNaN(spots) || spots < 1) {
      setSessionError('Spots total must be at least 1.')
      return
    }

    const startsAtDate = new Date(`${sessionDate}T${sessionTime}:00+08:00`)
    if (Number.isNaN(startsAtDate.getTime()) || startsAtDate.getTime() <= Date.now()) {
      setSessionError('Choose a time in the future.')
      return
    }

    setSessionLoading(true)

    let data
    let rpcError
    if (usesListingDuration) {
      const result = await supabase.rpc('add_listing_session', {
        p_listing_id: listingId,
        p_starts_at: startsAtDate.toISOString(),
        p_spots: spots,
      })
      data = result.data
      rpcError = result.error
    } else {
      const result = await supabase.from('sessions').insert({
        listing_id: listingId,
        starts_at: startsAtDate.toISOString(),
        duration_mins: duration,
        spots_total: spots,
        spots_remaining: spots,
        status: 'open',
      })
      rpcError = result.error
    }

    setSessionLoading(false)

    if (rpcError) {
      setSessionError(rpcError.message)
      return
    }

    if (data?.action === 'merged') {
      const added = data.spots_added
      const left = data.spots_remaining
      const when = data.starts_at ? formatSessionDateTime(data.starts_at) : 'that time'
      setBookingStatusMessage(
        `Added ${added} spot${added === 1 ? '' : 's'} to the session on ${when}. ${left} spot${left === 1 ? '' : 's'} left.`
      )
    }

    closeSessionForm()
    await loadData()
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

    if (fnError || data?.error) {
      setPayoutSetupError(await edgeFunctionErrorMessage(fnError, data))
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

  async function handleHostCancelSession(session) {
    setCancelError('')
    setCancelLoading(true)

    const { data, error: fnError } = await invokeAuthed('cancel-booking', {
      session_id: session.id,
    })

    setCancelLoading(false)

    if (fnError || data?.error) {
      setCancelError(await edgeFunctionErrorMessage(fnError, data))
      return
    }

    setConfirmCancelSessionId(null)
    await loadData()
  }

  async function handleDeleteEmptySession(session) {
    setDeleteSessionError('')
    setDeleteSessionLoading(true)

    const { error: rpcError } = await supabase.rpc('delete_empty_session', {
      p_session_id: session.id,
    })

    setDeleteSessionLoading(false)

    if (rpcError) {
      setDeleteSessionError(rpcError.message)
      return
    }

    setConfirmDeleteSessionId(null)
    setHostSessions((prev) => prev.filter((s) => s.id !== session.id))
  }

  async function handleDeleteListing(listingId) {
    setDeleteError('')
    setDeleteLoading(true)

    const { error: rpcError } = await supabase.rpc('delete_listing', {
      p_listing_id: listingId,
    })

    setDeleteLoading(false)

    if (rpcError) {
      setDeleteError(rpcError.message)
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

  if (!isHost) {
    return <Navigate to="/bookings" replace />
  }

  const confirmListing = listings.find((listing) => listing.id === confirmDeleteListingId)
  const confirmStats = confirmListing
    ? listingUpcomingStats(confirmListing.id, hostSessions)
    : null

  return (
    <div className="page page--narrow">
      {embedded ? null : <h1 className="dashboard-heading">Dashboard</h1>}

      {location.state?.message && (
        <p className="success-message">{location.state.message}</p>
      )}

      {bookingStatusMessage && (
        <p className="success-message">{bookingStatusMessage}</p>
      )}

      {error && <p className="error-message" style={{ marginBottom: '20px' }}>{error}</p>}
      {cancelError && <p className="error-message" style={{ marginBottom: '20px' }}>{cancelError}</p>}
      {deleteSessionError && (
        <p className="error-message" style={{ marginBottom: '20px' }}>{deleteSessionError}</p>
      )}
      {deleteError && <p className="error-message" style={{ marginBottom: '20px' }}>{deleteError}</p>}
      {payoutSetupError && (
        <p className="error-message" style={{ marginBottom: '20px' }}>{payoutSetupError}</p>
      )}

      {isAdmin && pendingCount > 0 ? (
        <p className="verification-banner" role="status">
          {pendingCount} {pendingCount === 1 ? 'verification' : 'verifications'} waiting ·{' '}
          <Link to="/admin/verifications">Review</Link>
        </p>
      ) : null}

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
          <p className="empty-state">No upcoming sessions.</p>
        ) : (
          <div className="dashboard-list">
            {hostSessions.map((session) => {
              const activeBookings = activeBookingsOn(session)
              const hasActiveBookings = activeBookings.length > 0

              return (
              <div key={session.id} className="dashboard-card">
                <p className="dashboard-card__title">
                  {session.listings?.title || 'Unknown listing'}
                </p>
                <p className="dashboard-card__meta">
                  {session.starts_at ? formatSessionDateTime(session.starts_at) : 'Date TBC'}
                  {' · '}
                  {activeBookings.length}{' '}
                  active booking(s)
                </p>
                <div className="booking-card__actions">
                  {hasActiveBookings && confirmCancelSessionId !== session.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setCancelError('')
                        setConfirmDeleteSessionId(null)
                        setConfirmCancelSessionId(session.id)
                      }}
                      className="btn btn--ghost"
                      style={{ padding: '6px 14px', fontSize: '13px', color: 'var(--error)' }}
                    >
                      Cancel session
                    </button>
                  )}
                  {!hasActiveBookings && confirmDeleteSessionId !== session.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteSessionError('')
                        setConfirmCancelSessionId(null)
                        setConfirmDeleteSessionId(session.id)
                      }}
                      className="btn btn--ghost"
                      style={{ padding: '6px 14px', fontSize: '13px', color: 'var(--error)' }}
                    >
                      Delete
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
                      {activeBookings
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

                {confirmDeleteSessionId === session.id && (
                  <div className="cancel-confirm">
                    <p className="cancel-confirm__warning">
                      Are you sure? This will hide the session from your listing. Guests will
                      not be able to book it.
                    </p>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button
                        type="button"
                        disabled={deleteSessionLoading}
                        onClick={() => handleDeleteEmptySession(session)}
                        className="btn btn--primary"
                        style={{ padding: '10px 20px', fontSize: '14px', background: 'var(--error)' }}
                      >
                        {deleteSessionLoading ? 'Deleting…' : 'Confirm delete'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteSessionId(null)}
                        className="btn btn--ghost"
                        style={{ padding: '10px 20px', fontSize: '14px' }}
                      >
                        Keep session
                      </button>
                    </div>
                  </div>
                )}
              </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section__header">
          <h2 className="dashboard-section__title">My Listings</h2>
          <Link to="/create-listing" className="dashboard-section__action">
            + New listing
          </Link>
        </div>

        {listings.length === 0 ? (
          <p className="empty-state">
            No listings yet.{' '}
            <Link to="/create-listing">Create one</Link>
          </p>
        ) : (
          <div className="dashboard-list dashboard-list--listings">
            {listings.map((listing) => (
              <div key={listing.id} className="dashboard-card hosting-listing-card">
                <div className="hosting-listing">
                  <OverflowMenu
                    className="hosting-listing__menu"
                    items={[
                      { label: 'View listing', to: `/listings/${listing.id}` },
                      { label: 'Edit', to: `/edit-listing/${listing.id}` },
                      {
                        label: 'Delete',
                        destructive: true,
                        onSelect: () => {
                          setDeleteError('')
                          setConfirmDeleteListingId(listing.id)
                        },
                      },
                    ]}
                  />
                  <Link
                    to={`/edit-listing/${listing.id}`}
                    className="hosting-listing__main"
                  >
                    {listing.photo_urls?.[0] ? (
                      <img
                        src={listing.photo_urls[0]}
                        alt=""
                        className="hosting-listing__thumb"
                      />
                    ) : (
                      <div
                        className="hosting-listing__thumb hosting-listing__thumb--placeholder"
                        aria-hidden="true"
                      />
                    )}
                    <div className="hosting-listing__text">
                      <p className="dashboard-card__title">{listing.title}</p>
                      <p className="dashboard-card__meta">
                        {listing.category} · {listing.area}
                      </p>
                    </div>
                  </Link>
                  <Button
                    className="hosting-listing__add"
                    variant="secondary"
                    onClick={() =>
                      activeFormId === listing.id
                        ? closeSessionForm()
                        : openSessionForm(listing.id)
                    }
                  >
                    {activeFormId === listing.id ? 'Cancel' : 'Add session'}
                  </Button>
                </div>

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
                    {Number.isInteger(listing.duration_mins) && listing.duration_mins >= 1 ? (
                      <p className="hint">Each session is {listing.duration_mins} minutes.</p>
                    ) : (
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
                    )}
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

                    {sessionError && <p className="error-message">{sessionError}</p>}

                    <Button
                      type="submit"
                      variant="primary"
                      disabled={sessionLoading}
                    >
                      {sessionLoading ? 'Adding…' : 'Add session'}
                    </Button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {confirmListing && confirmStats ? (
        <ListingDeleteDialog
          listing={confirmListing}
          sessionCount={confirmStats.sessionCount}
          bookingCount={confirmStats.bookingCount}
          loading={deleteLoading}
          onClose={() => setConfirmDeleteListingId(null)}
          onConfirm={() => handleDeleteListing(confirmListing.id)}
        />
      ) : null}
    </div>
  )
}
