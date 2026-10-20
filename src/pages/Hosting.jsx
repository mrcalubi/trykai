import { useEffect, useState, useCallback } from 'react'
import { useLocation, useSearchParams, Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import { edgeFunctionErrorMessage } from '../lib/edgeFunctionError'
import AddSessionsForm from '../components/AddSessionsForm'
import { hostBannerLine, hostInterestById, keenNotifiedLine } from '../lib/keen'
import Button from '../components/ui/Button'
import OverflowMenu from '../components/ui/OverflowMenu'
import Icon from '../components/ui/Icon'
import { hostCancelWarning } from '../lib/hostCancelCopy'
import { PAGE_LOAD_ERROR, withIssuedAtRetry } from '../lib/pageLoad'
import { formatSessionDateTime } from '../lib/sessionDate'
import {
  SESSION_HAS_BOOKINGS_MESSAGE,
  isSessionHasBookingsError,
} from '../lib/listingSpots'
import { listingCategoryAreaLine } from '../lib/listingCategories'
import { firstAccountRow } from '../lib/myAccount'
import {
  formatBatchSummary,
  singaporeDateTime,
  singaporeTimeValue,
  skipReasonFromRpcMessage,
} from '../lib/sessionBatch'
import { singaporeDateKey } from '../lib/sessionCalendar'
import { LISTING_STEPS, clearDraft, draftValues, readDraft } from '../lib/listingDraft'
import {
  formatSgd,
  listingDatesLine,
  listingFacts,
  monthSessionsNote,
  monthSessionsToCount,
  monthStartIso,
  monthStats,
} from '../lib/hostingDashboard'
import { parsePriceInputCents } from '../lib/pricing'

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
  const [monthSessions, setMonthSessions] = useState([])
  const [verificationStatus, setVerificationStatus] = useState(null)
  const [draft, setDraft] = useState(() => readDraft(userId))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isHost, setIsHost] = useState(false)

  const connectStatus = searchParams.get('connect')
  const [bookingStatusMessage, setBookingStatusMessage] = useState('')
  const [interestByListing, setInterestByListing] = useState({})

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
    const listingColumns = 'id, title, area, category, photo_urls, price_per_person, max_guests'
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
      setVerificationStatus(account?.verification_status ?? null)
    }

    const adminRow = firstRow(adminResult.data)
    const admin = !adminResult.error && Boolean(adminRow?.is_admin)
    setIsAdmin(admin)
    setPendingCount(admin ? Number(adminRow?.pending_count) || 0 : 0)

    const listingIds = listingsResult.data?.map((l) => l.id) ?? []
    // 00032. Until it is applied the RPC errors; the page simply shows no banner.
    const { data: interestRows } = await supabase.rpc('host_listing_interest')
    setInterestByListing(hostInterestById(interestRows))

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
          bookings (id, status, guests_count, total_amount, platform_fee, host_payout_amount)
        `
        )
        .in('listing_id', listingIds)
        .neq('status', 'cancelled')
        .gte('starts_at', monthStartIso())
        .order('starts_at', { ascending: true })

      if (sessionsError) {
        setError((prev) => prev || PAGE_LOAD_ERROR)
      } else {
        // One read covers both: this month's sessions for the stats, and every
        // session still to come for the listings and Upcoming bookings.
        const now = Date.now()
        const rows = sessionsData ?? []
        setHostSessions(rows.filter((session) => new Date(session.starts_at).getTime() > now))
        setMonthSessions(monthSessionsToCount(rows, now))
      }
    } else {
      setHostSessions([])
      setMonthSessions([])
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
    let summary = formatBatchSummary({ created, skipped: rejected })
    if (created > 0) {
      // Tell everyone who tapped "I'm keen" that a date opened. Never blocks the host.
      const { data: notifyData } = await invokeAuthed('notify-interested', { listing_id: listingId })
      const notified = Number(notifyData?.notified) || 0
      if (notified > 0) summary = `${summary} ${keenNotifiedLine(notified)}`
    }
    setBookingStatusMessage(summary)
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
    setMonthSessions((prev) => prev.filter((s) => s.id !== session.id))
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
    setMonthSessions((prev) => prev.filter((s) => !removedIds.includes(s.id)))
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
    setMonthSessions((prev) => prev.filter((s) => s.listing_id !== listingId))
    setSelectedEmptyIds((prev) => {
      const removed = new Set(
        hostSessions.filter((session) => session.listing_id === listingId).map((session) => session.id),
      )
      return new Set([...prev].filter((id) => !removed.has(id)))
    })
  }

  function discardListingDraft() {
    clearDraft(userId)
    setDraft(null)
  }

  // "Add" on the checklist opens the session form on the first listing that has
  // no dates, then brings that card into view.
  function addFirstSession(listingId) {
    openSessionForm(listingId)
    document
      .getElementById(`hosting-listing-${listingId}`)
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
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
  const undatedListing = listings.find(
    (listing) => !hostSessions.some((session) => session.listing_id === listing.id),
  )
  // Listings come newest first, so the first one the host made is last.
  const firstListing = listings[listings.length - 1]
  const stats = monthStats(monthSessions)
  const sessionsNote = monthSessionsNote(stats)
  const TitleTag = embedded ? 'h2' : 'h1'

  const setupSteps = [
    verificationStatus === 'approved'
      ? { id: 'id', done: true, title: 'ID verified', hint: 'Done. Guests see your verified badge.' }
      : {
          id: 'id',
          done: false,
          title: 'Verify your ID',
          hint:
            verificationStatus === 'pending'
              ? 'We are checking your ID. This usually takes a day.'
              : 'Guests book hosts they can trust.',
          action:
            verificationStatus === 'pending' ? null : (
              <Link
                to="/verify-identity"
                className="btn btn--secondary btn--small"
                aria-label="Verify your ID"
              >
                Verify
              </Link>
            ),
        },
    firstListing
      ? { id: 'listing', done: true, title: 'First listing created', hint: firstListing.title }
      : {
          id: 'listing',
          done: false,
          title: 'Create your first listing',
          hint: 'It takes about five minutes.',
          action: (
            <Link
              to="/create-listing"
              className="btn btn--secondary btn--small"
              aria-label="Create your first listing"
            >
              Create
            </Link>
          ),
        },
    {
      id: 'payouts',
      done: payoutsEnabled,
      title: 'Set up payouts',
      hint: payoutsEnabled
        ? 'Done. Stripe pays your earnings into your bank.'
        : payoutSetupIncomplete
          ? "Your payout setup isn't finished yet."
          : 'Stripe needs your bank details to pay you.',
      action: (
        <button
          type="button"
          className="btn btn--secondary btn--small"
          disabled={payoutSetupLoading}
          onClick={handlePayoutSetup}
          aria-label={payoutSetupIncomplete ? 'Continue payout setup' : 'Set up payouts'}
        >
          {payoutSetupLoading ? 'Opening…' : payoutSetupIncomplete ? 'Continue' : 'Set up'}
        </button>
      ),
    },
    {
      id: 'session',
      done: hostSessions.length > 0 || monthSessions.length > 0,
      title: 'Add your first session',
      hint: 'Listings with no dates are hidden from browse.',
      action: listings.length ? (
        <button
          type="button"
          className="btn btn--secondary btn--small"
          onClick={() => addFirstSession((undatedListing ?? listings[0]).id)}
          aria-label="Add your first session"
        >
          Add
        </button>
      ) : null,
    },
  ]
  const stepsDone = setupSteps.filter((item) => item.done).length
  const setupComplete = stepsDone === setupSteps.length

  return (
    <div className={embedded ? 'hosting' : 'page hosting'}>
      <header className="hosting__head">
        <TitleTag className="hosting__title">Hosting</TitleTag>
        <Link to="/create-listing" className="btn btn--primary hosting__new">
          <Icon name="plus" size={18} strokeWidth={2.2} />
          New listing
        </Link>
      </header>

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

      <div className={setupComplete ? 'hosting__layout' : 'hosting__layout hosting__layout--setup'}>
        {setupComplete ? null : (
          <section className="hosting-setup" aria-labelledby="hosting-setup-title">
            <div className="hosting-setup__head">
              <h2 id="hosting-setup-title" className="hosting-setup__title">
                Get ready for guests
              </h2>
              <span className="hosting-setup__count">
                {stepsDone} of {setupSteps.length}
              </span>
            </div>
            <div
              className="hosting-setup__bar"
              role="progressbar"
              aria-label="Setup progress"
              aria-valuemin={0}
              aria-valuemax={setupSteps.length}
              aria-valuenow={stepsDone}
            >
              <span className={`hosting-setup__fill hosting-setup__fill--${stepsDone}`} />
            </div>
            <p className="hosting-setup__lede">Guests can only book once all four are done.</p>
            <ol className="hosting-setup__list">
              {setupSteps.map((item) => (
                <li
                  key={item.id}
                  className={item.done ? 'hosting-step hosting-step--done' : 'hosting-step'}
                >
                  <span className="hosting-step__mark" aria-hidden="true">
                    {item.done ? <Icon name="check" size={16} strokeWidth={2.6} /> : null}
                  </span>
                  <span className="hosting-step__copy">
                    <span className="hosting-step__title">
                      {item.title}
                      <span className="visually-hidden">{item.done ? ' (done)' : ' (to do)'}</span>
                    </span>
                    <span className="hosting-step__hint">{item.hint}</span>
                  </span>
                  {item.done ? null : item.action}
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="hosting-month" aria-labelledby="hosting-month-title">
          <h2 id="hosting-month-title" className="hosting__section-title">
            This month
          </h2>
          <dl className="hosting-month__stats">
            <div className="hosting-stat">
              <dt>Sessions</dt>
              <dd>{stats.sessions}</dd>
              {sessionsNote ? <dd className="hosting-stat__note">{sessionsNote}</dd> : null}
            </div>
            <div className="hosting-stat">
              <dt>Guests booked</dt>
              <dd>{stats.guests}</dd>
            </div>
            <div className="hosting-stat">
              <dt>Earned</dt>
              <dd>{formatSgd(stats.earnedCents)}</dd>
            </div>
          </dl>
        </section>

        {bookedHostSessions.length > 0 ? (
          <section className="hosting-upcoming" aria-labelledby="hosting-upcoming-title">
            <h2 id="hosting-upcoming-title" className="hosting__section-title">
              Upcoming bookings
            </h2>
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
          </section>
        ) : null}

        <section className="hosting-listings" aria-labelledby="hosting-listings-title">
          <h2 id="hosting-listings-title" className="hosting__section-title">
            Your listings
          </h2>

          {listings.length === 0 && !draft ? (
            <p className="empty-state hosting-listings__empty">
              No listings yet. <Link to="/create-listing">Create one</Link>
            </p>
          ) : (
            <div className="dashboard-list dashboard-list--listings">
              {listings.map((listing) => {
                const upcoming = hostSessions.filter(
                  (session) => session.listing_id === listing.id,
                )
                const hasDates = upcoming.length > 0
                const bookedCount = upcoming.filter(
                  (session) => activeBookingsOn(session).length > 0,
                ).length
                const formOpen = activeFormId === listing.id
                return (
                  <article
                    key={listing.id}
                    id={`hosting-listing-${listing.id}`}
                    className="dashboard-card hosting-listing-card"
                  >
                    <div className="hosting-listing">
                      <OverflowMenu
                        className="ui-overflow--quiet hosting-listing__menu"
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
                          {hasDates ? (
                            <span className="hosting-badge hosting-badge--live">Live</span>
                          ) : (
                            <span className="hosting-badge hosting-badge--hidden">
                              No dates yet
                            </span>
                          )}
                          <p className="dashboard-card__title">{listing.title}</p>
                          <p className="hosting-listing__facts">
                            {listingFacts({
                              priceCents: listing.price_per_person,
                              durationMins: listing.duration_mins,
                              maxGuests: listing.max_guests,
                            }) || listingCategoryAreaLine(listing.category, listing.area)}
                          </p>
                        </div>
                      </Link>
                      <div className="hosting-listing__foot">
                        <p
                          className={
                            hasDates
                              ? 'hosting-listing__status'
                              : 'hosting-listing__status hosting-listing__status--empty'
                          }
                        >
                          {listingDatesLine(upcoming.length - bookedCount, bookedCount)}
                        </p>
                        <Button
                          className="hosting-listing__add"
                          variant={hasDates || formOpen ? 'secondary' : 'primary'}
                          onClick={() =>
                            formOpen ? closeSessionForm() : openSessionForm(listing.id)
                          }
                        >
                          {formOpen ? 'Cancel' : 'Add sessions'}
                        </Button>
                      </div>
                      {!hasDates && interestByListing[listing.id] ? (
                        <p className="hosting-keen">
                          {hostBannerLine(interestByListing[listing.id])} Add a date and we&apos;ll
                          tell them.
                        </p>
                      ) : null}
                    </div>

                    {formOpen ? (
                      <AddSessionsForm
                        listing={listing}
                        existingSessions={hostSessions}
                        onCancel={closeSessionForm}
                        onCreated={(payload) => handleCreateSessions(listing.id, payload)}
                      />
                    ) : null}

                    <ListingSessions
                      listingId={listing.id}
                      sessions={upcoming.filter(
                        (session) => activeBookingsOn(session).length === 0,
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
                      onCollapse={() =>
                        setExpandedEmptyListingIds((prev) => {
                          const next = new Set(prev)
                          next.delete(listing.id)
                          return next
                        })
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
                  </article>
                )
              })}

              {draft ? <DraftListingCard draft={draft} onDiscard={discardListingDraft} /> : null}
            </div>
          )}
        </section>

      </div>

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

/** A listing saved part-way through the wizard on this device. */
function DraftListingCard({ draft, onDiscard }) {
  const values = draftValues(draft)
  const step = LISTING_STEPS[values.step]
  const durationMins =
    values.durationChoice === 'other' ? Number(values.otherMins) : values.durationChoice
  const facts = listingFacts({
    priceCents: parsePriceInputCents(values.price),
    durationMins,
    maxGuests: values.maxGuests,
  })
  const title = values.title.trim() || 'Untitled listing'

  return (
    <article className="dashboard-card hosting-listing-card hosting-listing-card--draft">
      <div className="hosting-listing">
        <OverflowMenu
          className="ui-overflow--quiet hosting-listing__menu"
          items={[{ label: 'Discard draft', destructive: true, onSelect: onDiscard }]}
        />
        <Link
          to="/create-listing"
          state={{ resumeDraft: true }}
          className="hosting-listing__main"
          tabIndex={-1}
        >
          <div
            className="hosting-listing__thumb hosting-listing__thumb--draft"
            aria-hidden="true"
          />
          <div className="hosting-listing__text">
            <span className="hosting-badge">Draft</span>
            <p className="dashboard-card__title">{title}</p>
            {facts ? <p className="hosting-listing__facts">{facts}</p> : null}
          </div>
        </Link>
        <div className="hosting-listing__foot">
          <p className="hosting-listing__status">
            Step {values.step + 1} of {LISTING_STEPS.length}: {step.title.toLowerCase()}
          </p>
          <Link
            to="/create-listing"
            state={{ resumeDraft: true }}
            className="btn btn--secondary hosting-listing__add"
            aria-label={`Continue ${title}`}
          >
            Continue
          </Link>
        </div>
      </div>
    </article>
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
  onCollapse,
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
      {empty.length > 3 ? (
        <button
          type="button"
          className="btn btn--ghost hosting-sessions__more"
          onClick={expanded ? onCollapse : onExpand}
        >
          {expanded ? 'Show fewer' : `Show all ${empty.length} open sessions`}
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
