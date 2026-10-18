import { useEffect, useState, useCallback } from 'react'
import { useLocation, useSearchParams, Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import { edgeFunctionErrorMessage } from '../lib/edgeFunctionError'
import AddSessionsForm from '../components/AddSessionsForm'
import Button from '../components/ui/Button'
import OverflowMenu from '../components/ui/OverflowMenu'
import { hostCancelWarning } from '../lib/hostCancelCopy'
import { PAGE_LOAD_ERROR, withIssuedAtRetry } from '../lib/pageLoad'
import { formatSessionDateTime } from '../lib/sessionDate'
import {
  SESSION_HAS_BOOKINGS_MESSAGE,
  isSessionHasBookingsError,
} from '../lib/listingSpots'
import { firstAccountRow } from '../lib/myAccount'
import { formatBatchSummary, skipReasonFromRpcMessage, singaporeDateTime, singaporeTimeValue } from '../lib/sessionBatch'
import { singaporeDateKey } from '../lib/sessionCalendar'

function activeBookingsOn(session) {
  // Pending rows are unpaid checkouts, not guests the host has to refund.
  return (session.bookings ?? []).filter((b) => b.status === 'confirmed')
}

function firstRow(data) {
  return firstAccountRow(data)
}

function listingUpcomingStats(listingId, hostSessions) {
  const sessions = hostSessions.filter((session) => session.listing_id === listingId)
  const bookings = sessions.flatMap((session) => activeBookingsOn(session))
  return { sessionCount: sessions.length, bookingCount: bookings.length }
}

function sessionLabel(count) {
  return count === 1 ? '1 upcoming session' : `${count} upcoming sessions`
}

function emptySessionLabel(count) {
  return count === 1 ? '1 open session' : `${count} open sessions`
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

export default function Hosting({ embedded = false, onListingDeleted }) {
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
  const [selectedEmptyIds, setSelectedEmptyIds] = useState(() => new Set())
  const [expandedEmptyListingIds, setExpandedEmptyListingIds] = useState(() => new Set())
  const [confirmBulkDeleteListingId, setConfirmBulkDeleteListingId] = useState(null)

  const [confirmCancelSessionId, setConfirmCancelSessionId] = useState(null)
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState(null)
  const [confirmDeleteListingId, setConfirmDeleteListingId] = useState(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [deleteSessionLoading, setDeleteSessionLoading] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState(null)
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editError, setEditError] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [deleteSessionError, setDeleteSessionError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [payoutsEnabled, setPayoutsEnabled] = useState(true)
  const [payoutSetupLoading, setPayoutSetupLoading] = useState(false)
  const [payoutSetupError, setPayoutSetupError] = useState('')
  const [payoutSetupIncomplete, setPayoutSetupIncomplete] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  const loadData = useCallback(async () => {
    const listingColumns = 'id, title, area, category, photo_urls, max_guests'
    const [profileResult, adminResult] = await Promise.all([
      withIssuedAtRetry(() => supabase.rpc('my_account')),
      supabase.rpc('my_verification'),
    ])

    let listingsResult = await withIssuedAtRetry(() =>
      supabase
        .from('listings')
        .select(`${listingColumns}, duration_mins`)
        .eq('host_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
    )

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
      setError(PAGE_LOAD_ERROR)
      setListings([])
    } else {
      setError('')
      setListings(listingsResult.data ?? [])
    }

    if (!profileResult.error) {
      const account = firstAccountRow(profileResult.data)
      setPayoutsEnabled(Boolean(account?.stripe_payouts_enabled))
      setIsHost(Boolean(account?.is_host))
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
          duration_mins,
          listing_id,
          listings (title),
          bookings (id, status, guests_count)
        `
        )
        .in('listing_id', listingIds)
        .neq('status', 'cancelled')
        .gt('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })

      if (sessionsError) {
        setError((prev) => prev || PAGE_LOAD_ERROR)
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
    if (loading) return
    if (connectStatus !== 'return' && connectStatus !== 'refresh') return

    let cancelled = false

    async function refreshPayoutStatus() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const { data, error: fnError } = await supabase.functions.invoke('create-account-link', {
        body: { refresh: true },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (cancelled) return

      if (fnError || data?.error) {
        setPayoutSetupError(await edgeFunctionErrorMessage(fnError, data))
      } else if (data?.stripe_payouts_enabled) {
        setPayoutsEnabled(true)
        setPayoutSetupIncomplete(false)
        setBookingStatusMessage('Payouts are set up. Guests can now book you.')
      } else {
        setPayoutsEnabled(false)
        setPayoutSetupIncomplete(true)
      }

      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('connect')
          return next
        },
        { replace: true },
      )
    }

    void refreshPayoutStatus()
    return () => {
      cancelled = true
    }
  }, [loading, connectStatus, setSearchParams])

  function openSessionForm(listingId) {
    setActiveFormId(listingId)
  }

  function closeSessionForm() {
    setActiveFormId(null)
  }

  async function handleCreateSessions(
    listingId,
    { accepted, skipped, spots, duration, usesListingDuration },
  ) {
    const rejected = [...skipped]

    for (const item of accepted) {
      let rpcError
      if (usesListingDuration) {
        const result = await supabase.rpc('add_listing_session', {
          p_listing_id: listingId,
          p_starts_at: item.startsAt.toISOString(),
          p_spots: spots,
        })
        rpcError = result.error
      } else {
        const result = await supabase.from('sessions').insert({
          listing_id: listingId,
          starts_at: item.startsAt.toISOString(),
          duration_mins: duration,
          spots_total: spots,
          spots_remaining: spots,
          status: 'open',
        })
        rpcError = result.error
      }

      if (rpcError) {
        rejected.push({ ...item, reason: skipReasonFromRpcMessage(rpcError.message) })
      }
    }

    const created = accepted.length - (rejected.length - skipped.length)
    setBookingStatusMessage(formatBatchSummary({ created, skipped: rejected }))
    closeSessionForm()
    await loadData()
    return {}
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
      setPayoutSetupIncomplete(false)
      setBookingStatusMessage('Payouts are set up. Guests can now book you.')
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
    setSelectedEmptyIds((prev) => {
      const next = new Set(prev)
      next.delete(session.id)
      return next
    })
    setHostSessions((prev) => prev.filter((s) => s.id !== session.id))
  }

  async function handleDeleteSelectedEmpty(sessions) {
    setDeleteSessionError('')
    setDeleteSessionLoading(true)

    const failed = []
    const removedIds = []
    for (const session of sessions) {
      if (activeBookingsOn(session).length > 0) continue
      const { error: rpcError } = await supabase.rpc('delete_empty_session', {
        p_session_id: session.id,
      })
      if (rpcError) failed.push(rpcError.message)
      else removedIds.push(session.id)
    }

    setDeleteSessionLoading(false)

    if (failed.length > 0) {
      setDeleteSessionError(failed[0])
    }

    setConfirmBulkDeleteListingId(null)
    setSelectedEmptyIds((prev) => {
      const next = new Set(prev)
      for (const id of removedIds) next.delete(id)
      return next
    })
    setHostSessions((prev) => prev.filter((s) => !removedIds.includes(s.id)))
  }

  function toggleEmptySession(sessionId) {
    setSelectedEmptyIds((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  function clearSessionConfirms() {
    setConfirmCancelSessionId(null)
    setConfirmDeleteSessionId(null)
    setConfirmBulkDeleteListingId(null)
    setEditingSessionId(null)
    setEditError('')
  }

  function openSessionEdit(session) {
    setConfirmDeleteSessionId(null)
    setConfirmBulkDeleteListingId(null)
    setEditError('')
    setEditingSessionId(session.id)
    setEditDate(singaporeDateKey(session.starts_at))
    setEditTime(singaporeTimeValue(session.starts_at))
  }

  async function handleEditOpenSession(session) {
    setEditError('')
    const startsAt = singaporeDateTime(editDate, editTime)
    if (Number.isNaN(startsAt.getTime())) {
      setEditError('Please enter a date and time.')
      return
    }

    setEditLoading(true)
    const { error: rpcError } = await supabase.rpc('edit_open_session', {
      p_session_id: session.id,
      p_starts_at: startsAt.toISOString(),
    })
    setEditLoading(false)

    if (rpcError) {
      setEditError(
        isSessionHasBookingsError(rpcError.message)
          ? SESSION_HAS_BOOKINGS_MESSAGE
          : rpcError.message,
      )
      return
    }

    setEditingSessionId(null)
    await loadData()
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
    onListingDeleted?.(listingId)
    setListings((prev) => prev.filter((l) => l.id !== listingId))
    setHostSessions((prev) => prev.filter((s) => s.listing_id !== listingId))
    setSelectedEmptyIds((prev) => {
      const removed = new Set(
        hostSessions.filter((session) => session.listing_id === listingId).map((session) => session.id),
      )
      return new Set([...prev].filter((id) => !removed.has(id)))
    })
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
  const bookedHostSessions = hostSessions
    .filter((session) => activeBookingsOn(session).length > 0)
    .slice()
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))

  return (
    <div className="page page--narrow">
      {embedded ? null : <h1 className="dashboard-heading">Dashboard</h1>}

      {location.state?.message && (
        <p className="success-message">{location.state.message}</p>
      )}

      {bookingStatusMessage && (
        <p className="success-message">{bookingStatusMessage}</p>
      )}

      {error && <p className="error-message error-message--spaced">{error}</p>}
      {cancelError && <p className="error-message error-message--spaced">{cancelError}</p>}
      {deleteSessionError && (
        <p className="error-message error-message--spaced">{deleteSessionError}</p>
      )}
      {deleteError && <p className="error-message error-message--spaced">{deleteError}</p>}
      {payoutSetupError && (
        <p className="error-message error-message--spaced">{payoutSetupError}</p>
      )}

      {isAdmin && pendingCount > 0 ? (
        <p className="verification-banner" role="status">
          {pendingCount} {pendingCount === 1 ? 'verification' : 'verifications'} waiting ·{' '}
          <Link to="/admin/verifications">Review</Link>
        </p>
      ) : null}

      {payoutSetupIncomplete ? (
        <div className="payout-setup" role="status">
          <p className="payout-setup__copy">Your payout setup isn&apos;t finished yet.</p>
          <Button
            type="button"
            variant="primary"
            disabled={payoutSetupLoading}
            onClick={handlePayoutSetup}
          >
            {payoutSetupLoading ? 'Opening Stripe…' : 'Continue setup'}
          </Button>
        </div>
      ) : listings.length > 0 && !payoutsEnabled ? (
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
      ) : null}

      <section className="dashboard-section">
        <h2 className="dashboard-section__title">Upcoming</h2>
        {bookedHostSessions.length === 0 ? (
          <p className="empty-state">No upcoming bookings yet.</p>
        ) : (
          <div className="dashboard-list">
            {bookedHostSessions.map((session) => (
              <div key={session.id} className="dashboard-card">
                <SessionRow
                  session={session}
                  showListing
                  selectable={false}
                  selected={false}
                  confirmCancel={confirmCancelSessionId === session.id}
                  confirmDelete={false}
                  cancelLoading={cancelLoading}
                  deleteSessionLoading={deleteSessionLoading}
                  onAskCancel={(sessionId) => {
                    setCancelError('')
                    setConfirmDeleteSessionId(null)
                    setConfirmBulkDeleteListingId(null)
                    setConfirmCancelSessionId(sessionId)
                  }}
                  onAskDelete={() => {}}
                  onCancelSession={handleHostCancelSession}
                  onDeleteSession={handleDeleteEmptySession}
                  onKeep={clearSessionConfirms}
                />
              </div>
            ))}
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

                {activeFormId === listing.id ? (
                  <AddSessionsForm
                    listing={listing}
                    existingSessions={hostSessions}
                    onCancel={closeSessionForm}
                    onCreated={(payload) => handleCreateSessions(listing.id, payload)}
                  />
                ) : null}

                <ListingSessions
                  listingId={listing.id}
                  sessions={hostSessions.filter(
                    (session) =>
                      session.listing_id === listing.id &&
                      activeBookingsOn(session).length === 0,
                  )}
                  selectedIds={selectedEmptyIds}
                  expanded={expandedEmptyListingIds.has(listing.id)}
                  confirmDeleteSessionId={confirmDeleteSessionId}
                  confirmBulkDelete={confirmBulkDeleteListingId}
                  deleteSessionLoading={deleteSessionLoading}
                  onToggleSelect={toggleEmptySession}
                  onExpand={() =>
                    setExpandedEmptyListingIds((prev) => new Set(prev).add(listing.id))
                  }
                  onAskDelete={(sessionId) => {
                    setDeleteSessionError('')
                    setConfirmCancelSessionId(null)
                    setConfirmBulkDeleteListingId(null)
                    setConfirmDeleteSessionId(sessionId)
                  }}
                  onAskBulkDelete={(listingId) => {
                    setDeleteSessionError('')
                    setConfirmCancelSessionId(null)
                    setConfirmDeleteSessionId(null)
                    setConfirmBulkDeleteListingId(listingId)
                  }}
                  onDeleteSession={handleDeleteEmptySession}
                  onBulkDelete={handleDeleteSelectedEmpty}
                  onKeep={clearSessionConfirms}
                  editingSessionId={editingSessionId}
                  editDate={editDate}
                  editTime={editTime}
                  editError={editError}
                  editLoading={editLoading}
                  onAskEdit={openSessionEdit}
                  onEditDate={setEditDate}
                  onEditTime={setEditTime}
                  onSaveEdit={handleEditOpenSession}
                />
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

function ListingSessions({
  listingId,
  sessions,
  selectedIds,
  expanded,
  confirmDeleteSessionId,
  confirmBulkDelete,
  deleteSessionLoading,
  onToggleSelect,
  onExpand,
  onAskDelete,
  onAskBulkDelete,
  onDeleteSession,
  onBulkDelete,
  onKeep,
  editingSessionId,
  editDate,
  editTime,
  editError,
  editLoading,
  onAskEdit,
  onEditDate,
  onEditTime,
  onSaveEdit,
}) {
  const empty = sessions.filter((session) => activeBookingsOn(session).length === 0)
  const shownEmpty = expanded ? empty : empty.slice(0, 3)
  const selectedHere = empty.filter((session) => selectedIds.has(session.id))

  if (empty.length === 0) return null

  return (
    <div className="hosting-sessions">
      {shownEmpty.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          selectable
          selected={selectedIds.has(session.id)}
          confirmCancel={false}
          confirmDelete={confirmDeleteSessionId === session.id}
          cancelLoading={false}
          deleteSessionLoading={deleteSessionLoading}
          onToggleSelect={onToggleSelect}
          onAskCancel={() => {}}
          onAskDelete={onAskDelete}
          onCancelSession={() => {}}
          onDeleteSession={onDeleteSession}
          onKeep={onKeep}
          editing={editingSessionId === session.id}
          editDate={editDate}
          editTime={editTime}
          editError={editingSessionId === session.id ? editError : ''}
          editLoading={editLoading}
          onAskEdit={onAskEdit}
          onEditDate={onEditDate}
          onEditTime={onEditTime}
          onSaveEdit={onSaveEdit}
        />
      ))}
      {empty.length > 3 && !expanded ? (
        <button type="button" className="btn btn--ghost hosting-sessions__more" onClick={onExpand}>
          Show all {empty.length} open sessions
        </button>
      ) : null}
      {selectedHere.length > 0 ? (
        confirmBulkDelete === listingId ? (
          <div className="cancel-confirm">
            <p className="cancel-confirm__warning">
              Delete {emptySessionLabel(selectedHere.length)}? Guests will not be able to book
              them.
            </p>
            <div className="hosting-sessions__confirm-actions">
              <button
                type="button"
                disabled={deleteSessionLoading}
                onClick={() => onBulkDelete(selectedHere)}
                className="btn btn--primary hosting-sessions__danger"
              >
                {deleteSessionLoading ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button type="button" onClick={onKeep} className="btn btn--ghost">
                Keep sessions
              </button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="secondary" onClick={() => onAskBulkDelete(listingId)}>
            Delete selected
          </Button>
        )
      ) : null}
    </div>
  )
}

function SessionRow({
  session,
  showListing = false,
  selectable,
  selected,
  confirmCancel,
  confirmDelete,
  cancelLoading,
  deleteSessionLoading,
  onToggleSelect,
  onAskCancel,
  onAskDelete,
  onCancelSession,
  onDeleteSession,
  onKeep,
  editing = false,
  editDate = '',
  editTime = '',
  editError = '',
  editLoading = false,
  onAskEdit,
  onEditDate,
  onEditTime,
  onSaveEdit,
}) {
  const activeBookings = activeBookingsOn(session)
  const hasActiveBookings = activeBookings.length > 0
  const hasBlockingBookings = (session.bookings ?? []).some(
    (booking) => booking.status === 'pending' || booking.status === 'confirmed',
  )
  const guestTotal = activeBookings.reduce(
    (sum, booking) => sum + (booking.guests_count || 0),
    0,
  )
  const when = session.starts_at ? formatSessionDateTime(session.starts_at) : 'Date TBC'
  const title = showListing ? session.listings?.title || 'Unknown listing' : when
  const guestLabel = guestTotal === 1 ? '1 guest booked' : `${guestTotal} guests booked`

  return (
    <div className="hosting-session">
      <div className="hosting-session__main">
        {selectable ? (
          <label className="hosting-session__select">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(session.id)}
              aria-label={`Select ${when}`}
            />
          </label>
        ) : null}
        {selectable && editing ? (
          <div className="hosting-session__edit">
            <label className="label">
              Date
              <input
                type="date"
                className="input"
                value={editDate}
                onChange={(event) => onEditDate(event.target.value)}
              />
            </label>
            <label className="label">
              Time
              <input
                type="time"
                className="input"
                value={editTime}
                onChange={(event) => onEditTime(event.target.value)}
              />
            </label>
          </div>
        ) : (
          <div className="hosting-session__text">
            <p className="dashboard-card__title">{title}</p>
            {showListing ? (
              <p className="dashboard-card__meta">
                {when} · {guestLabel}
              </p>
            ) : null}
          </div>
        )}
      </div>
      <div className="booking-card__actions">
        {hasActiveBookings && !confirmCancel ? (
          <button
            type="button"
            onClick={() => onAskCancel(session.id)}
            className="btn btn--ghost hosting-session__action hosting-session__action--danger"
          >
            Cancel session
          </button>
        ) : null}
        {!hasBlockingBookings && selectable && !editing && onAskEdit ? (
          <button
            type="button"
            onClick={() => onAskEdit(session)}
            className="btn btn--ghost hosting-session__action"
          >
            Edit
          </button>
        ) : null}
        {selectable && editing ? (
          <>
            <button
              type="button"
              disabled={editLoading}
              onClick={() => onSaveEdit(session)}
              className="btn btn--ghost hosting-session__action"
            >
              {editLoading ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={onKeep} className="btn btn--ghost hosting-session__action">
              Cancel
            </button>
          </>
        ) : null}
        {!hasActiveBookings && !confirmDelete && !editing ? (
          <button
            type="button"
            onClick={() => onAskDelete(session.id)}
            className="btn btn--ghost hosting-session__action hosting-session__action--danger"
          >
            Delete
          </button>
        ) : null}
      </div>
      {editError ? <p className="error-message">{editError}</p> : null}

      {confirmCancel ? (
        <div className="cancel-confirm">
          <p className="cancel-confirm__warning">{hostCancelWarning(guestTotal)}</p>
          <div className="hosting-sessions__confirm-actions">
            <button
              type="button"
              disabled={cancelLoading}
              onClick={() => onCancelSession(session)}
              className="btn btn--primary hosting-sessions__danger"
            >
              {cancelLoading ? 'Cancelling…' : 'Confirm cancellation'}
            </button>
            <button type="button" onClick={onKeep} className="btn btn--ghost">
              Keep session
            </button>
          </div>
        </div>
      ) : null}

      {confirmDelete ? (
        <div className="cancel-confirm">
          <p className="cancel-confirm__warning">
            Are you sure? This will hide the session from your listing. Guests will not be able
            to book it.
          </p>
          <div className="hosting-sessions__confirm-actions">
            <button
              type="button"
              disabled={deleteSessionLoading}
              onClick={() => onDeleteSession(session)}
              className="btn btn--primary hosting-sessions__danger"
            >
              {deleteSessionLoading ? 'Deleting…' : 'Confirm delete'}
            </button>
            <button type="button" onClick={onKeep} className="btn btn--ghost">
              Keep session
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
