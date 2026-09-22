import { useEffect, useState, useCallback } from 'react'
import { useLocation, useSearchParams, Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import { edgeFunctionErrorMessage } from '../lib/edgeFunctionError'
import { formatCents } from '../lib/cancellationPolicy'

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

export default function Hosting() {
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
  const [confirmDeleteListingId, setConfirmDeleteListingId] = useState(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [payoutsEnabled, setPayoutsEnabled] = useState(true)
  const [payoutSetupLoading, setPayoutSetupLoading] = useState(false)
  const [payoutSetupError, setPayoutSetupError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  const loadData = useCallback(async () => {
    const [listingsResult, profileResult, adminResult] = await Promise.all([
      supabase
        .from('listings')
        .select('id, title, area, category')
        .eq('host_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('users')
        .select('stripe_payouts_enabled, is_host')
        .eq('id', userId)
        .single(),
      supabase.rpc('my_verification'),
    ])

    if (listingsResult.error) {
      setError(listingsResult.error.message)
    } else {
      setListings(listingsResult.data)
    }

    if (!profileResult.error) {
      setPayoutsEnabled(Boolean(profileResult.data?.stripe_payouts_enabled))
      setIsHost(Boolean(profileResult.data?.is_host))
    }

    const adminRow = Array.isArray(adminResult.data) ? adminResult.data[0] : adminResult.data
    setIsAdmin(!adminResult.error && Boolean(adminRow?.is_admin))

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
          session.bookings?.some((b) => b.status === 'pending' || b.status === 'confirmed')
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
      setSearchParams({}, { replace: true })
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

  if (!isHost) {
    return <Navigate to="/bookings" replace />
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

      {isAdmin && (
        <section className="dashboard-section" aria-label="Verification review">
          <div className="dashboard-card">
            <p className="dashboard-card__title">Host verification</p>
            <p className="dashboard-card__meta">
              Review pending ID and selfie submissions. Approve, or reject with a reason the host
              will see.
            </p>
            <div className="booking-card__actions">
              <Link to="/admin/verifications" className="btn btn--primary">
                Review verifications
              </Link>
            </div>
          </div>
        </section>
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
    </div>
  )
}
