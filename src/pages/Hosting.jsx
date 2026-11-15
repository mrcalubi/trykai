import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams, Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import { edgeFunctionErrorMessage } from '../lib/edgeFunctionError'
import AddSessionsForm from '../components/AddSessionsForm'
import HostListingDates from '../components/HostListingDates'
import HostNextUp from '../components/HostNextUp'
import HostSessionPage from '../components/HostSessionPage'
import { querySessionTypes, typesByListing } from '../lib/sessionTypes'
import {
  clearSessionDraft,
  readOpenSessionForm,
  writeOpenSessionForm,
} from '../lib/sessionFormDraft'
import { hostBannerLine, hostInterestById, keenNotifiedLine, listingsWithOpenUpcoming } from '../lib/keen'
import { heldByTitleMap, isHeld, sharedBatchLine } from '../lib/sharedAvailability'
import PageLoader from '../components/PageLoader'
import WaitingState from '../components/WaitingState'
import OverflowMenu from '../components/ui/OverflowMenu'
import Icon from '../components/ui/Icon'
import { hostCancelGuestPhrase } from '../lib/hostCancelCopy'
import { PAGE_LOAD_ERROR, withIssuedAtRetry } from '../lib/pageLoad'
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
import { LISTING_STEPS, clearDraft, draftValues, isBlankDraft, readDraft } from '../lib/listingDraft'
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
import {
  PAYOUT_CHECKING_COPY,
  PAYOUT_PENDING_POLL_MS,
  PAYOUT_PENDING_WAIT_MS,
  PAYOUT_READY_COPY,
  PAYOUT_STILL_CHECKING_COPY,
} from '../lib/payoutReturn'
import { listingReviewBadge } from '../lib/listingReview'
import ListingDeleteDialog from '../components/ListingDeleteDialog'
import {
  HOST_SESSIONS_SELECT,
  listingDeleteErrorMessage,
  listingUpcomingStats,
} from '../lib/listingDelete'
import { loadBookingAddonRows, loadBookingNotes } from '../lib/bookingAddons'
import { HostReviewsDueList } from '../components/HostReviewForm'
import { groupGuestsBySession } from '../lib/companions'
import { bookedSeats, confirmedBookings, sessionDayLabel, sessionTimeRange } from '../lib/hostSessions'

// Pending rows are unpaid checkouts, not guests the host has to refund.
const activeBookingsOn = confirmedBookings

/** How long a removed date can be brought back before it is deleted. */
export const REMOVE_UNDO_MS = 6000

function firstRow(data) {
  return firstAccountRow(data)
}

export default function Hosting({ embedded = false, onListingDeleted, onSessionsChange }) {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const userId = useAuthedUserId()

  const [listings, setListings] = useState([])
  const [hostSessions, setHostSessions] = useState([])
  const [sessionTypeRows, setSessionTypeRows] = useState([])
  const [addonsByBooking, setAddonsByBooking] = useState({})
  const [notesByBooking, setNotesByBooking] = useState({})
  const [monthSessions, setMonthSessions] = useState([])
  const [verificationStatus, setVerificationStatus] = useState(null)
  const [draft, setDraft] = useState(() => {
    const stored = readDraft(userId)
    return stored && !isBlankDraft(stored) ? stored : null
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isHost, setIsHost] = useState(false)

  const connectStatus = searchParams.get('connect')
  const [bookingStatusMessage, setBookingStatusMessage] = useState('')
  const [interestByListing, setInterestByListing] = useState({})

  // Reopens Add sessions after the host steps away (e.g. to change spots).
  const [activeFormId, setActiveFormId] = useState(() => readOpenSessionForm())
  const restoredFormId = useRef(activeFormId)
  const [selectedEmptyIds, setSelectedEmptyIds] = useState(() => new Set())
  const [expandedEmptyListingIds, setExpandedEmptyListingIds] = useState(() => new Set())
  const [selectingListingId, setSelectingListingId] = useState(null)
  // A removed date waits here so it can be undone, then is deleted.
  const [pendingRemoval, setPendingRemoval] = useState(null)
  const pendingRemovalRef = useRef(null)
  const removalTimerRef = useRef(0)

  const [confirmCancelSessionId, setConfirmCancelSessionId] = useState(null)
  const [confirmDeleteListingId, setConfirmDeleteListingId] = useState(null)
  const [cancelLoading, setCancelLoading] = useState(false)
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
  const [payoutChecking, setPayoutChecking] = useState(false)
  const [payoutPendingCopy, setPayoutPendingCopy] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [reviewsDue, setReviewsDue] = useState([])
  const [guestsBySession, setGuestsBySession] = useState({})

  // The profile's calendar mirrors this tab's sessions. Keep the callback in
  // a ref so a new function each render does not reload the page.
  const onSessionsChangeRef = useRef(onSessionsChange)
  const hostSessionsRef = useRef([])
  const listingsRef = useRef([])
  const interestByListingRef = useRef({})
  const notifiedListingIdsRef = useRef(new Set())
  useEffect(() => {
    onSessionsChangeRef.current = onSessionsChange
  }, [onSessionsChange])

  const notifyWaitingGuests = useCallback(async ({ payoutsOn, listings, interest, sessions }) => {
    listingsRef.current = listings
    interestByListingRef.current = interest
    if (!payoutsOn) return

    const upcomingIds = new Set(listingsWithOpenUpcoming(sessions))
    const pending = []
    for (const listing of listings) {
      const id = listing.id
      if (!interest[id] || !upcomingIds.has(id) || notifiedListingIdsRef.current.has(id)) continue
      notifiedListingIdsRef.current.add(id)
      pending.push(id)
    }
    if (pending.length === 0) return

    const {
      data: { session: authSession },
    } = await supabase.auth.getSession()
    for (const listingId of pending) {
      try {
        const { error: notifyError } = await supabase.functions.invoke('notify-interested', {
          body: { listing_id: listingId },
          headers: { Authorization: `Bearer ${authSession?.access_token}` },
        })
        if (notifyError) {
          console.error('notify-interested after payouts failed', listingId, notifyError)
        }
      } catch (notifyError) {
        console.error('notify-interested after payouts failed', listingId, notifyError)
      }
    }

    const { data: refreshed } = await supabase.rpc('host_listing_interest')
    const next = hostInterestById(refreshed)
    interestByListingRef.current = next
    setInterestByListing(next)
  }, [])

  const loadData = useCallback(async () => {
    const listingColumns =
      'id, title, area, category, photo_urls, price_per_person, max_guests, review_status, review_note'
    const extraColumns = 'duration_mins, booking_cutoff_hours'
    const [profileResult, adminResult] = await Promise.all([
      withIssuedAtRetry(() => supabase.rpc('my_account')),
      supabase.rpc('my_verification'),
    ])

    let listingsResult = await withIssuedAtRetry(() =>
      supabase
        .from('listings')
        .select(`${listingColumns}, ${extraColumns}`)
        .eq('host_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
    )

    // 00018 adds duration_mins and 00046 booking_cutoff_hours. Until those are
    // applied, asking for them fails the whole read and the host cannot add a session.
    if (listingsResult.error && /duration_mins|booking_cutoff_hours/.test(listingsResult.error.message ?? '')) {
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

    const account = profileResult.error ? null : firstAccountRow(profileResult.data)
    if (account) {
      setPayoutsEnabled(Boolean(account.stripe_payouts_enabled))
      setIsHost(Boolean(account.is_host))
      setVerificationStatus(account.verification_status ?? null)
    }

    const adminRow = firstRow(adminResult.data)
    const admin = !adminResult.error && Boolean(adminRow?.is_admin)
    setIsAdmin(admin)
    setPendingCount(admin ? Number(adminRow?.pending_count) || 0 : 0)

    const loadedListings = listingsResult.error ? [] : (listingsResult.data ?? [])
    const listingIds = loadedListings.map((l) => l.id)
    // Session types (00056); none until it is applied.
    const { rows: typeRows } = await querySessionTypes(supabase, listingIds)
    setSessionTypeRows(typeRows)
    // 00032. Until it is applied the RPC errors; the page simply shows no banner.
    const { data: interestRows } = await supabase.rpc('host_listing_interest')
    const interest = hostInterestById(interestRows)
    setInterestByListing(interest)

    let upcoming = []
    if (listingIds.length > 0) {
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('sessions')
        .select(HOST_SESSIONS_SELECT)
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
        upcoming = rows.filter((session) => new Date(session.starts_at).getTime() > now)
        hostSessionsRef.current = upcoming
        setHostSessions(upcoming)
        setMonthSessions(monthSessionsToCount(rows, now))
        onSessionsChangeRef.current?.(rows)
        // Names of bookers and friends who took a seat (00050).
        const bookedSessionIds = upcoming
          .filter((session) => (session.bookings ?? []).some((booking) => booking.status === 'confirmed'))
          .map((session) => session.id)
        if (bookedSessionIds.length) {
          const { data: guestRows } = await supabase.rpc('host_session_guests', {
            p_session_ids: bookedSessionIds,
          })
          setGuestsBySession(groupGuestsBySession(Array.isArray(guestRows) ? guestRows : []))
        } else {
          setGuestsBySession({})
        }
        const confirmedIds = upcoming.flatMap((session) =>
          (session.bookings ?? [])
            .filter((booking) => booking.status === 'confirmed')
            .map((booking) => booking.id),
        )
        const [{ rows: addonRows, available }, { notes }] = await Promise.all([
          loadBookingAddonRows(supabase, confirmedIds),
          loadBookingNotes(supabase, confirmedIds),
        ])
        const grouped = {}
        if (available) {
          for (const row of addonRows) {
            grouped[row.booking_id] = [...(grouped[row.booking_id] ?? []), row]
          }
        }
        setAddonsByBooking(grouped)
        setNotesByBooking(notes)
      }
    } else {
      hostSessionsRef.current = []
      setHostSessions([])
      setAddonsByBooking({})
      setNotesByBooking({})
      setMonthSessions([])
      onSessionsChangeRef.current?.([])
    }

    const { data: dueRows } = await supabase.rpc('host_reviews_due')
    setReviewsDue(dueRows ?? [])

    setLoading(false)
    // Emails can take a few seconds; never hold the Hosting page for them.
    void notifyWaitingGuests({
      payoutsOn: Boolean(account?.stripe_payouts_enabled),
      listings: loadedListings,
      interest,
      sessions: upcoming,
    })
  }, [userId, notifyWaitingGuests])

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
    let timeoutId = 0
    const startedAt = Date.now()

    function clearConnectParam() {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('connect')
          return next
        },
        { replace: true, preventScrollReset: true },
      )
    }

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
        setPayoutChecking(false)
        setPayoutPendingCopy('')
        setPayoutSetupError(await edgeFunctionErrorMessage(fnError, data))
        clearConnectParam()
        return
      }
      if (data?.stripe_payouts_enabled) {
        setPayoutsEnabled(true)
        setPayoutSetupIncomplete(false)
        setPayoutChecking(false)
        setPayoutPendingCopy('')
        setBookingStatusMessage(PAYOUT_READY_COPY)
        clearConnectParam()
        await notifyWaitingGuests({
          payoutsOn: true,
          listings: listingsRef.current,
          interest: interestByListingRef.current,
          sessions: hostSessionsRef.current,
        })
        return
      }
      if (data?.pending) {
        if (Date.now() - startedAt >= PAYOUT_PENDING_WAIT_MS) {
          setPayoutsEnabled(false)
          setPayoutSetupIncomplete(false)
          setPayoutChecking(false)
          setPayoutPendingCopy(PAYOUT_STILL_CHECKING_COPY)
          clearConnectParam()
          return
        }
        setPayoutsEnabled(false)
        setPayoutSetupIncomplete(false)
        setPayoutChecking(true)
        setPayoutPendingCopy(PAYOUT_CHECKING_COPY)
        timeoutId = window.setTimeout(refreshPayoutStatus, PAYOUT_PENDING_POLL_MS)
        return
      }

      setPayoutsEnabled(false)
      setPayoutSetupIncomplete(true)
      setPayoutChecking(false)
      setPayoutPendingCopy('')
      clearConnectParam()
    }

    void refreshPayoutStatus()
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [loading, connectStatus, setSearchParams, notifyWaitingGuests])

  // Coming back to a restored form: bring that listing's card into view once.
  useEffect(() => {
    const listingId = restoredFormId.current
    if (loading || !listingId) return
    restoredFormId.current = null
    if (!listings.some((listing) => listing.id === listingId)) {
      writeOpenSessionForm(null)
      setActiveFormId(null)
      return
    }
    document
      .getElementById(`hosting-listing-${listingId}`)
      ?.scrollIntoView?.({ block: 'start' })
  }, [loading, listings])

  function openSessionForm(listingId) {
    setActiveFormId(listingId)
    writeOpenSessionForm(listingId)
  }

  /** Cancel, a successful create, or deleting the listing: the draft is done with. */
  function closeSessionForm() {
    if (activeFormId) clearSessionDraft(activeFormId)
    setActiveFormId(null)
    writeOpenSessionForm(null)
  }

  async function handleCreateSessions(
    listingId,
    { accepted, skipped, spots, duration, usesListingDuration, alsoListingIds = [], typeId = null },
  ) {
    const rejected = [...skipped]

    for (const item of accepted) {
      let rpcError
      if (usesListingDuration) {
        const result = await supabase.rpc('add_listing_session', {
          p_listing_id: listingId,
          p_starts_at: item.startsAt.toISOString(),
          p_spots: spots,
          ...(typeId ? { p_type_id: typeId } : {}),
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
          ...(typeId ? { type_id: typeId } : {}),
        })
        rpcError = result.error
      }

      if (rpcError) {
        rejected.push({ ...item, reason: skipReasonFromRpcMessage(rpcError.message) })
      }
    }

    const created = accepted.length - (rejected.length - skipped.length)
    const summaries = [formatBatchSummary({ created, skipped: rejected })]
    const listingsWithNewDates = created > 0 ? [listingId] : []

    // Shared availability (00033): the same times on the host's other listings,
    // each with its own spots and length. The database refuses a time that
    // clashes with that listing's own sessions.
    for (const otherId of alsoListingIds) {
      const other = listings.find((item) => item.id === otherId)
      if (!other) continue
      let otherCreated = 0
      for (const item of accepted) {
        const { error: otherError } = await supabase.rpc('add_listing_session', {
          p_listing_id: otherId,
          p_starts_at: item.startsAt.toISOString(),
          p_spots: Number(other.max_guests) || spots,
        })
        if (!otherError) otherCreated += 1
      }
      summaries.push(sharedBatchLine(other.title, otherCreated, accepted.length))
      if (otherCreated > 0) listingsWithNewDates.push(otherId)
    }

    let notified = 0
    for (const id of listingsWithNewDates) {
      // Tell everyone who tapped "I'm keen" that a date opened. Never blocks the host.
      const { data: notifyData } = await invokeAuthed('notify-interested', { listing_id: id })
      notified += Number(notifyData?.notified) || 0
    }
    if (notified > 0) summaries.push(keenNotifiedLine(notified))

    setBookingStatusMessage(summaries.join(' '))
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

    if (fnError || data?.error) {
      setPayoutSetupLoading(false)
      setPayoutSetupError(await edgeFunctionErrorMessage(fnError, data))
      return
    }
    if (data?.stripe_payouts_enabled) {
      setPayoutSetupLoading(false)
      setPayoutsEnabled(true)
      setPayoutSetupIncomplete(false)
      setBookingStatusMessage(PAYOUT_READY_COPY)
      return
    }
    if (data?.url) {
      window.location.assign(data.url)
      return
    }
    setPayoutSetupLoading(false)
    setPayoutSetupError('Could not start payout setup. Please try again.')
  }

  async function handleHostCancelSession(session) {
    setCancelError('')
    setCancelLoading(true)
    const guests = bookedSeats(session)

    const { data, error: fnError } = await invokeAuthed('cancel-booking', {
      session_id: session.id,
    })

    setCancelLoading(false)

    if (fnError || data?.error) {
      setCancelError(await edgeFunctionErrorMessage(fnError, data))
      return
    }

    setConfirmCancelSessionId(null)
    setBookingStatusMessage(`Session cancelled. We're refunding ${hostCancelGuestPhrase(guests)} in full.`)
    leaveSessionPage()
    await loadData()
  }

  /** Delete dates that were removed and not undone. */
  const commitRemoval = useCallback(async (removal) => {
    const removedIds = []
    const failed = []
    for (const session of removal.sessions) {
      const { error: rpcError } = await supabase.rpc('delete_empty_session', {
        p_session_id: session.id,
      })
      if (rpcError) failed.push(rpcError.message)
      else removedIds.push(session.id)
    }
    if (failed.length > 0) setDeleteSessionError(failed[0])
    if (removedIds.length === 0) return
    hostSessionsRef.current = hostSessionsRef.current.filter((s) => !removedIds.includes(s.id))
    setHostSessions((prev) => prev.filter((s) => !removedIds.includes(s.id)))
    setMonthSessions((prev) => prev.filter((s) => !removedIds.includes(s.id)))
  }, [])

  const flushRemoval = useCallback(() => {
    window.clearTimeout(removalTimerRef.current)
    const current = pendingRemovalRef.current
    pendingRemovalRef.current = null
    setPendingRemoval(null)
    if (current) void commitRemoval(current)
  }, [commitRemoval])

  // Leaving the page deletes what is waiting rather than dropping it.
  useEffect(() => flushRemoval, [flushRemoval])

  function removeDates(listingId, sessions) {
    flushRemoval()
    setDeleteSessionError('')
    const removable = sessions.filter((session) => activeBookingsOn(session).length === 0)
    if (removable.length === 0) return
    const [only] = removable
    const label =
      removable.length === 1
        ? `Removed ${sessionDayLabel(only.starts_at)}, ${sessionTimeRange(
            only,
            listings.find((listing) => listing.id === listingId),
          )}.`
        : `Removed ${removable.length} dates.`
    const removal = { listingId, sessions: removable, label }
    pendingRemovalRef.current = removal
    setPendingRemoval(removal)
    setSelectedEmptyIds((prev) => {
      const next = new Set(prev)
      for (const session of removable) next.delete(session.id)
      return next
    })
    setSelectingListingId(null)
    setEditingSessionId(null)
    removalTimerRef.current = window.setTimeout(flushRemoval, REMOVE_UNDO_MS)
  }

  function undoRemoval() {
    window.clearTimeout(removalTimerRef.current)
    pendingRemovalRef.current = null
    setPendingRemoval(null)
  }

  function toggleEmptySession(sessionId) {
    setSelectedEmptyIds((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  function toggleSelecting(listingId) {
    setEditingSessionId(null)
    setSelectedEmptyIds(new Set())
    setSelectingListingId((current) => (current === listingId ? null : listingId))
  }

  function clearSessionConfirms() {
    setConfirmCancelSessionId(null)
    setEditingSessionId(null)
    setEditError('')
  }

  function sessionHref(sessionId) {
    const params = new URLSearchParams(searchParams)
    params.set('session', sessionId)
    return `${location.pathname}?${params.toString()}`
  }

  function hostingHref() {
    const params = new URLSearchParams(searchParams)
    params.delete('session')
    const query = params.toString()
    return `${location.pathname}${query ? `?${query}` : ''}`
  }

  function leaveSessionPage() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('session')
        return next
      },
      { replace: true },
    )
  }

  function openSessionEdit(session) {
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
      console.error('Listing delete failed', rpcError)
      setDeleteError(listingDeleteErrorMessage(rpcError))
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

  // Which booked session (and listing) set aside each held session (00033).
  const heldByTitles = useMemo(() => heldByTitleMap(hostSessions), [hostSessions])

  if (loading) {
    return <PageLoader />
  }

  if (!isHost) {
    return <Navigate to="/bookings" replace />
  }

  const confirmListing = listings.find((listing) => listing.id === confirmDeleteListingId)
  const confirmStats = confirmListing
    ? listingUpcomingStats(confirmListing.id, hostSessions)
    : null
  const activeTypesByListing = typesByListing(sessionTypeRows)
  const typeNameById = Object.fromEntries(sessionTypeRows.map((row) => [row.id, row.name]))
  const removingIds = new Set(pendingRemoval?.sessions.map((session) => session.id) ?? [])
  const visibleSessions = hostSessions.filter((session) => !removingIds.has(session.id))
  const bookedHostSessions = visibleSessions
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
  const sessionParam = searchParams.get('session')

  if (sessionParam) {
    const session = hostSessions.find((item) => item.id === sessionParam) ?? null
    return (
      <div className={embedded ? 'hosting' : 'page hosting'}>
        <HostSessionPage
          session={session}
          listing={listings.find((listing) => listing.id === session?.listing_id)}
          guestRows={guestsBySession[sessionParam] ?? []}
          addonsByBooking={addonsByBooking}
          notesByBooking={notesByBooking}
          backHref={hostingHref()}
          TitleTag={TitleTag}
          confirmCancel={confirmCancelSessionId === sessionParam}
          cancelLoading={cancelLoading}
          cancelError={cancelError}
          onAskCancel={() => {
            setCancelError('')
            setConfirmCancelSessionId(sessionParam)
          }}
          onKeep={clearSessionConfirms}
          onCancelSession={handleHostCancelSession}
        />
      </div>
    )
  }

  const nextUp = bookedHostSessions[0] ?? null
  const nextUpNote = nextUp
    ? activeBookingsOn(nextUp)
        .map((booking) => notesByBooking[booking.id]?.note)
        .find(Boolean) ?? ''
    : ''

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
        : payoutPendingCopy
          ? payoutPendingCopy
          : payoutSetupIncomplete
            ? "Your payout setup isn't finished yet."
            : 'No Stripe account needed. About 5 minutes: your phone, NRIC and bank details.',
      action:
        payoutPendingCopy ? null : (
          <button
            type="button"
            className="btn btn--secondary btn--small"
            disabled={payoutSetupLoading}
            onClick={handlePayoutSetup}
            aria-label={payoutSetupIncomplete ? 'Continue payout setup' : 'Set up payouts'}
          >
            {payoutSetupIncomplete ? 'Continue' : 'Set up'}
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
        {setupComplete ? null : payoutSetupLoading || payoutChecking ? (
          <section className="hosting-setup" aria-labelledby="hosting-setup-title">
            <WaitingState
              hold={payoutChecking}
              title={payoutChecking ? undefined : 'Setting up payouts'}
              message={
                payoutChecking
                  ? PAYOUT_CHECKING_COPY
                  : 'Opening Stripe so you can add your bank details.'
              }
            />
          </section>
        ) : (
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

        {nextUp ? (
          <HostNextUp
            session={nextUp}
            listing={listings.find((listing) => listing.id === nextUp.listing_id)}
            guestRows={guestsBySession[nextUp.id] ?? []}
            note={nextUpNote}
            href={sessionHref(nextUp.id)}
          />
        ) : null}

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

        <HostReviewsDueList rows={reviewsDue} />

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
                const upcoming = visibleSessions.filter(
                  (session) => session.listing_id === listing.id,
                )
                const bookedCount = upcoming.filter(
                  (session) => activeBookingsOn(session).length > 0,
                ).length
                const heldCount = upcoming.filter(
                  (session) => activeBookingsOn(session).length === 0 && isHeld(session),
                ).length
                const openCount = upcoming.length - bookedCount - heldCount
                const hasDates = openCount + bookedCount > 0
                const formOpen = activeFormId === listing.id
                const reviewBadge = listingReviewBadge(listing.review_status)
                return (
                  <article
                    key={listing.id}
                    id={`hosting-listing-${listing.id}`}
                    className="dashboard-card hosting-listing-card"
                  >
                    <div className="hosting-listing">
                      <div className="hosting-listing__main">
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
                          {reviewBadge ? (
                            <span
                              className={
                                reviewBadge.tone === 'changes'
                                  ? 'hosting-badge hosting-badge--hidden'
                                  : 'hosting-badge'
                              }
                            >
                              {reviewBadge.label}
                            </span>
                          ) : hasDates ? (
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
                        <div className="hosting-listing__tools">
                          <Link
                            to={`/edit-listing/${listing.id}`}
                            className="btn btn--secondary hosting-listing__edit"
                          >
                            Edit listing
                          </Link>
                          <OverflowMenu
                            className="ui-overflow--quiet hosting-listing__menu"
                            label={`More for ${listing.title}`}
                            items={[
                              { label: 'View listing', to: `/listings/${listing.id}` },
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
                        </div>
                      </div>
                      {listing.review_status === 'pending' ? (
                        <p className="hosting-review" role="status">
                          We&apos;re taking a quick look before guests can see it. Add your dates
                          now and we&apos;ll email you when it&apos;s live.
                        </p>
                      ) : null}
                      {listing.review_status === 'changes_requested' ? (
                        <div className="hosting-review hosting-review--changes">
                          <p className="hosting-review__label">One thing to change before it goes live</p>
                          {listing.review_note ? (
                            <p className="hosting-review__note">{listing.review_note}</p>
                          ) : null}
                          <Link to={`/edit-listing/${listing.id}`} className="hosting-review__link">
                            Edit listing
                          </Link>
                        </div>
                      ) : null}
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
                        otherListings={listings.filter((other) => other.id !== listing.id)}
                        sessionTypes={activeTypesByListing[listing.id] ?? []}
                        subtitle={`${listing.title} · ${listingDatesLine(openCount, bookedCount).replace(' · ', ', ')}`}
                        onCancel={closeSessionForm}
                        onCreated={(payload) => handleCreateSessions(listing.id, payload)}
                      />
                    ) : null}

                    <HostListingDates
                      listing={listing}
                      sessions={upcoming}
                      typeNameById={typeNameById}
                      heldByTitles={heldByTitles}
                      guestsBySession={guestsBySession}
                      sessionHref={sessionHref}
                      expanded={expandedEmptyListingIds.has(listing.id)}
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
                      selecting={selectingListingId === listing.id}
                      selectedIds={selectedEmptyIds}
                      onToggleSelecting={() => toggleSelecting(listing.id)}
                      onToggleSelect={toggleEmptySession}
                      onRemove={(sessions) => removeDates(listing.id, sessions)}
                      undo={
                        pendingRemoval?.listingId === listing.id
                          ? {
                              label: pendingRemoval.label,
                              onUndo: undoRemoval,
                              onDismiss: flushRemoval,
                            }
                          : null
                      }
                      onAddDates={() => openSessionForm(listing.id)}
                      editingSessionId={editingSessionId}
                      editDate={editDate}
                      editTime={editTime}
                      editError={editError}
                      editLoading={editLoading}
                      onAskEdit={openSessionEdit}
                      onEditDate={setEditDate}
                      onEditTime={setEditTime}
                      onSaveEdit={handleEditOpenSession}
                      onCancelEdit={clearSessionConfirms}
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
          error={deleteError}
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
