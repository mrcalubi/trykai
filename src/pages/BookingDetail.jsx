import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import { formatCents } from '../lib/cancellationPolicy'
import { formatDuration } from '../lib/duration'
import { edgeFunctionErrorMessage } from '../lib/edgeFunctionError'
import { guestBookingActions, guestCancellationNote } from '../lib/guestBookings'
import { publicName } from '../lib/publicName'
import { REPORT_EMAIL } from '../lib/reportMailto'
import { SHARE_NOTES, copyText, shareOrCopy } from '../lib/share'
import {
  bookingCountdown,
  bookingIcs,
  bookingStatusLabel,
  cancelNowCopy,
  cancelTiersSentence,
  dateTileParts,
  downloadIcs,
  formatBookingWhenDay,
  googleMapsUrl,
  appleMapsUrl,
  isBookingDayOf,
  isEligibleRescheduleSession,
  isMissingRescheduleColumn,
  listingShareUrl,
  providedItems,
  readBringChecks,
  rescheduleBlockCopy,
  rescheduleBlockReason,
  startsInCopy,
  writeBringChecks,
} from '../lib/bookingPage'
import { canReportProblem } from '../../supabase/functions/_shared/complaints.ts'
import { HostContactLinks } from '../components/BookingCutoffFields'
import {
  bookingReference,
  formatPaymentMethod,
  googleCalendarUrl,
  guestCountLabel,
  receiptRows,
} from '../../supabase/functions/_shared/email.ts'
import { PAGE_LOAD_ERROR, withIssuedAtRetry } from '../lib/pageLoad'
import { formatSessionDay, formatSessionTime } from '../lib/sessionDate'
import { sessionHasEnded } from '../lib/reviewGate'
import { sessionForReview } from '../lib/guestBookings'
import { addonLineLabel, loadBookingAddonRows } from '../lib/bookingAddons'
import Avatar from '../components/ui/Avatar'
import Button from '../components/ui/Button'
import Icon from '../components/ui/Icon'
import PageLoader from '../components/PageLoader'
import ReportProblem from '../components/ReportProblem'
import BioPreview from '../components/BioPreview'
import ReviewForm from '../components/ReviewForm'
import VerifiedBadge from '../components/VerifiedBadge'
import HostRating from '../components/HostRating'

const BOOKING_SELECT = `
  id,
  status,
  guest_id,
  guests_count,
  total_amount,
  platform_fee,
  payment_rail,
  created_at,
  refund_amount,
  stripe_refund_id,
  session_id,
  rescheduled_at,
  rescheduled_from_session_id,
  sessions (
    id,
    starts_at,
    duration_mins,
    listings (
      id,
      title,
      photo_urls,
      whats_provided,
      what_to_bring,
      duration_mins,
      host_id,
      area,
      price_per_person,
      group_pricing,
      booking_cutoff_hours,
      users:host_id (
        display_name,
        avatar_url,
        bio,
        is_id_verified
      )
    )
  )
`

const BOOKING_SELECT_FALLBACK = `
  id,
  status,
  guest_id,
  guests_count,
  total_amount,
  platform_fee,
  payment_rail,
  created_at,
  refund_amount,
  stripe_refund_id,
  session_id,
  sessions (
    id,
    starts_at,
    duration_mins,
    listings (
      id,
      title,
      photo_urls,
      whats_provided,
      what_to_bring,
      duration_mins,
      host_id,
      area,
      price_per_person,
      group_pricing,
      users:host_id (
        display_name,
        avatar_url
      )
    )
  )
`

function timeRange(startsAt, durationMins) {
  const start = formatSessionTime(startsAt)
  if (!start) return ''
  const mins = Number(durationMins)
  if (!Number.isFinite(mins) || mins < 1) return start
  const endIso = new Date(new Date(startsAt).getTime() + mins * 60 * 1000).toISOString()
  return `${start} – ${formatSessionTime(endIso)}`
}

function withHostLine(hostName, area, guestsCount) {
  return [hostName ? `with ${hostName}` : null, area, guestCountLabel(guestsCount)]
    .filter(Boolean)
    .join(' · ')
}

function bookingHelpMailto(bookingId) {
  return `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(`Help with booking ${bookingReference(bookingId)}`)}`
}

function BookingMenu({ label, variant = 'primary', items }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        rootRef.current?.querySelector('button')?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!items?.length) return null

  return (
    <div className="booking-menu" ref={rootRef}>
      <Button
        variant={variant}
        className="booking-page__wrap-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </Button>
      {open ? (
        <ul id={menuId} role="menu" className="booking-menu__list">
          {items.map((item) => (
            <li key={item.label} role="none">
              {item.href ? (
                <a
                  role="menuitem"
                  className="booking-menu__item"
                  href={item.href}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </a>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className="booking-menu__item"
                  onClick={() => {
                    setOpen(false)
                    item.onSelect?.()
                  }}
                >
                  {item.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default function BookingDetail() {
  const { bookingId } = useParams()
  const userId = useAuthedUserId()
  const [booking, setBooking] = useState(null)
  const [address, setAddress] = useState('')
  const [arrivalInstructions, setArrivalInstructions] = useState('')
  const [hostPhone, setHostPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notGuest, setNotGuest] = useState(false)
  const [bookingAddons, setBookingAddons] = useState([])
  const [hostReviews, setHostReviews] = useState([])
  const [alreadyReviewed, setAlreadyReviewed] = useState(false)
  const [upcomingCount, setUpcomingCount] = useState(0)
  const [bringChecked, setBringChecked] = useState([])
  const [note, setNote] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [moveList, setMoveList] = useState([])
  const [confirmMove, setConfirmMove] = useState(null)
  const [moveLoading, setMoveLoading] = useState(false)
  const [moveError, setMoveError] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [nowMs] = useState(() => Date.now())

  const loadBooking = useCallback(async () => {
    const run = (columns) =>
      withIssuedAtRetry(() =>
        supabase.from('bookings').select(columns).eq('id', bookingId).maybeSingle(),
      )
    let { data, error: loadError } = await run(BOOKING_SELECT)
    if (loadError && (isMissingRescheduleColumn(loadError) || /is_id_verified|42703|PGRST204/i.test(loadError.message ?? ''))) {
      ;({ data, error: loadError } = await run(BOOKING_SELECT_FALLBACK))
    }

    if (loadError) {
      setError(PAGE_LOAD_ERROR)
      setBooking(null)
      setLoading(false)
      return
    }
    if (!data || data.guest_id !== userId) {
      setNotGuest(true)
      setBooking(null)
      setLoading(false)
      return
    }

    setBooking(data)
    setNotGuest(false)
    setBringChecked(readBringChecks(data.id))
    const { rows } = await loadBookingAddonRows(supabase, [data.id])
    setBookingAddons(rows)

    const listing = data.sessions?.listings
    const listingId = listing?.id
    const hostId = listing?.host_id
    if (data.status === 'confirmed' && listingId) {
      const [{ data: revealed }, { data: arrival }, { data: contact }] = await Promise.all([
        supabase.rpc('listing_address', { listing_id: listingId }),
        supabase.rpc('listing_arrival_instructions', { listing_id: listingId }),
        supabase.rpc('booking_host_contact', { p_booking_id: data.id }),
      ])
      setAddress(typeof revealed === 'string' ? revealed : '')
      setArrivalInstructions(typeof arrival === 'string' ? arrival : '')
      setHostPhone(typeof contact === 'string' ? contact : '')
    } else {
      setAddress('')
      setArrivalInstructions('')
      setHostPhone('')
    }

    if (hostId) {
      const { data: reviews } = await supabase.from('reviews').select('rating').eq('reviewee_id', hostId)
      setHostReviews(reviews ?? [])
    }

    const { data: mine } = await supabase
      .from('reviews')
      .select('booking_id')
      .eq('reviewer_id', userId)
      .eq('booking_id', data.id)
      .eq('role', 'guest')
      .maybeSingle()
    setAlreadyReviewed(Boolean(mine?.booking_id))

    if (listingId) {
      const { data: open } = await supabase
        .from('sessions')
        .select('id')
        .eq('listing_id', listingId)
        .eq('status', 'open')
        .gt('starts_at', new Date().toISOString())
      setUpcomingCount((open ?? []).length)
    }

    setLoading(false)
  }, [bookingId, userId])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(async () => {
      if (!cancelled) await loadBooking()
    })
    return () => {
      cancelled = true
    }
  }, [loadBooking])

  async function invokeAuthed(name, body) {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return supabase.functions.invoke(name, {
      body,
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
  }

  async function handleCancel() {
    setCancelError('')
    setCancelLoading(true)
    const { data, error: fnError } = await invokeAuthed('cancel-booking', { booking_id: booking.id })
    setCancelLoading(false)
    if (fnError || data?.error) {
      setCancelError(await edgeFunctionErrorMessage(fnError, data))
      return
    }
    setConfirmCancel(false)
    setSheetOpen(false)
    await loadBooking()
  }

  async function openSheet() {
    setMoveError('')
    setCancelError('')
    setConfirmCancel(false)
    setConfirmMove(null)
    setSheetOpen(true)
    const listingId = booking?.sessions?.listings?.id
    if (!listingId || rescheduleBlockReason(booking, nowMs)) {
      setMoveList([])
      return
    }
    const { data } = await supabase
      .from('sessions')
      .select('id, starts_at, duration_mins, spots_remaining, status')
      .eq('listing_id', listingId)
      .eq('status', 'open')
      .gt('starts_at', new Date().toISOString())
      .order('starts_at')
    setMoveList((data ?? []).filter((session) => isEligibleRescheduleSession(session, booking, nowMs)))
  }

  async function handleMove(session) {
    setMoveError('')
    setMoveLoading(true)
    const { data, error: fnError } = await invokeAuthed('reschedule-booking', {
      booking_id: booking.id,
      session_id: session.id,
    })
    setMoveLoading(false)
    if (fnError || data?.error) {
      setMoveError(await edgeFunctionErrorMessage(fnError, data))
      return
    }
    setSheetOpen(false)
    setConfirmMove(null)
    await loadBooking()
  }

  function toggleBring(item) {
    const next = bringChecked.includes(item)
      ? bringChecked.filter((value) => value !== item)
      : [...bringChecked, item]
    setBringChecked(next)
    writeBringChecks(booking.id, next)
  }

  async function onInvite() {
    const listingId = booking.sessions?.listings?.id
    if (!listingId) return
    const result = await shareOrCopy({
      url: listingShareUrl(listingId),
      title: booking.sessions?.listings?.title || 'TryKai',
    })
    setNote(SHARE_NOTES[result] ?? '')
  }

  async function onCopy(text, success) {
    const result = await copyText(text)
    setNote(result === 'copied' ? success : 'Could not copy.')
  }

  if (loading) return <PageLoader />
  if (error) return <p className="status-message error-message">{error}</p>
  if (notGuest || !booking) return <Navigate to="/bookings" replace />

  const session = booking.sessions
  const listing = session?.listings
  const host = listing?.users
  const hostName = publicName(host)
  const hostLabel = hostName || 'your host'
  const photo = listing?.photo_urls?.[0]
  const startsAt = session?.starts_at
  const durationMins = session?.duration_mins ?? listing?.duration_mins
  const provided = providedItems(listing?.whats_provided)
  const bring = providedItems(listing?.what_to_bring)
  const statusLabel = bookingStatusLabel(booking, nowMs)
  const countdown = startsAt ? bookingCountdown(startsAt, nowMs) : ''
  const ended = sessionHasEnded(sessionForReview(session), nowMs)
  const dayOf = isBookingDayOf(startsAt, durationMins, nowMs)
  const cancelled = booking.status === 'cancelled'
  const canReview = guestBookingActions(booking, { alreadyReviewed, now: new Date(nowMs) }).review
  const canCancel = guestBookingActions(booking, { now: new Date(nowMs) }).cancel
  const blockReason = rescheduleBlockReason(booking, nowMs)
  const canManage = booking.status === 'confirmed' && !ended
  const tile = startsAt ? dateTileParts(startsAt) : null
  const calendar = startsAt
    ? googleCalendarUrl({
        title: listing?.title || 'TryKai session',
        startsAt,
        durationMins,
        address,
      })
    : ''
  const receipt = receiptRows({
    pricePerPersonCents: listing?.price_per_person ?? 0,
    guestsCount: booking.guests_count,
    groupPricing: listing?.group_pricing,
    paymentRail: booking.payment_rail,
    totalPaidCents: booking.total_amount,
    addons: bookingAddons.map((row) => ({
      name: row.name,
      quantity: row.quantity,
      unitGuestCents: row.unit_guest_cents ?? 0,
    })),
  })
  const paymentMethod = formatPaymentMethod({ paymentRail: booking.payment_rail })
  const ref = bookingReference(booking.id)
  const addonNote =
    bookingAddons.length > 0
      ? `${hostLabel} is preparing your extras: ${bookingAddons.map((row) => addonLineLabel(row.name, row.quantity)).join(', ')}`
      : ''
  const canReport = canReportProblem(booking, nowMs)
  const whenDay = startsAt ? formatBookingWhenDay(startsAt) : ''
  const whenTime = [timeRange(startsAt, durationMins), formatDuration(durationMins)].filter(Boolean).join(' · ')
  const pillClass = statusLabel ? `booking-pill booking-pill--${statusLabel.toLowerCase()}` : ''

  function downloadAppleCalendar() {
    const ics = bookingIcs({
      title: listing?.title || 'TryKai session',
      startsAt,
      durationMins,
      address,
      bookingId: booking.id,
    })
    if (ics) downloadIcs('trykai-booking.ics', ics)
  }

  const whenCard = (
    <section className="booking-card">
      <h2 className="booking-card__title">When</h2>
      {tile ? (
        <div className="booking-when">
          <div className="booking-date-tile" aria-hidden="true">
            <span className="booking-date-tile__day">{tile.day}</span>
            <span className="booking-date-tile__month">{tile.month}</span>
          </div>
          <div>
            <p className="booking-when__day">{whenDay}</p>
            {whenTime ? <p className="booking-when__time">{whenTime}</p> : null}
          </div>
        </div>
      ) : (
        <p>Date TBC</p>
      )}
      <div className="booking-card__btns">
        {calendar ? (
          <BookingMenu
            label="Add to calendar"
            items={[
              { label: 'Google Calendar', href: calendar },
              { label: 'Apple Calendar', onSelect: downloadAppleCalendar },
            ]}
          />
        ) : null}
        {listing?.id ? (
          <Button variant="secondary" className="booking-page__wrap-btn" onClick={onInvite}>
            Invite a friend
          </Button>
        ) : null}
      </div>
    </section>
  )

  const whereCard = address ? (
    <section className="booking-card booking-where">
      <div className="booking-where__head">
        <span className="booking-where__pin" aria-hidden="true">
          <Icon name="pin" size={18} />
        </span>
        <div>
          <h2 className="eyebrow">Where</h2>
          <p className="booking-where__address">{address}</p>
        </div>
      </div>
      {arrivalInstructions ? (
        <div className="booking-where__find">
          <p className="booking-where__find-label">How to find it</p>
          <p>{arrivalInstructions}</p>
        </div>
      ) : null}
      <div className="booking-card__btns">
        <BookingMenu
          label="Get directions"
          items={[
            { label: 'Google Maps', href: googleMapsUrl(address) },
            { label: 'Apple Maps', href: appleMapsUrl(address) },
          ]}
        />
        <Button variant="secondary" className="booking-page__wrap-btn" onClick={() => onCopy(address, 'Address copied')}>
          Copy address
        </Button>
      </div>
      {hostPhone ? <HostContactLinks phone={hostPhone} /> : null}
      <p className="hint">Only guests see the exact address.</p>
    </section>
  ) : null

  const packingCard =
    bring.length > 0 || provided.length > 0 || addonNote ? (
      <section className="booking-card">
        <h2 className="booking-card__title">Before you go</h2>
        {bring.length > 0 ? (
          <>
            <h3 className="booking-card__sub">Bring</h3>
            <ul className="booking-checklist">
              {bring.map((item) => (
                <li key={item}>
                  <label>
                    <input
                      type="checkbox"
                      checked={bringChecked.includes(item)}
                      onChange={() => toggleBring(item)}
                    />
                    {item}
                  </label>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {provided.length > 0 ? (
          <>
            <h3 className="booking-card__sub">Provided</h3>
            <ul className="booking-chips">
              {provided.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        ) : null}
        {addonNote ? <p className="booking-extras">{addonNote}</p> : null}
      </section>
    ) : null

  const hostCard = listing?.host_id ? (
    <section className="booking-card booking-host">
      <div className="booking-host__row">
        <Avatar avatarUrl={host?.avatar_url} displayName={hostName} className="detail-host__avatar" />
        <div>
          <p className="booking-host__name">{hostName ? `Your host, ${hostName}` : 'Your host'}</p>
          {host?.is_id_verified ? <VerifiedBadge /> : null}
          <HostRating reviews={hostReviews} />
        </div>
      </div>
      <BioPreview bio={host?.bio} lines={2} />
      <Link to={`/u/${listing.host_id}`} className="booking-detail__link">
        View profile
      </Link>
    </section>
  ) : null

  const manageRow = canManage ? (
    <button type="button" className="booking-manage" onClick={openSheet}>
      <span className="booking-manage__copy">
        <span className="booking-manage__title">Manage booking</span>
        <span className="booking-manage__hint">Move to another date, or cancel</span>
      </span>
      <Icon name="chevronRight" size={20} />
    </button>
  ) : null

  const helpLine = cancelled ? null : (
    <div className="booking-help">
      {canReport ? (
        <p className="booking-help__line">Something wrong with this booking?</p>
      ) : (
        <p className="booking-help__line">
          Need help with this booking?{' '}
          <a href={bookingHelpMailto(booking.id)}>Email {REPORT_EMAIL}</a>
        </p>
      )}
      <ReportProblem booking={booking} buttonLabel={canReport ? 'Report it within 3 days' : undefined} />
    </div>
  )

  const receiptCard = (
    <section className="booking-card">
      <h2 className="booking-card__title">Your booking</h2>
      {receipt.addsUp
        ? receipt.rows.map((row) => (
            <p
              key={row.label}
              className={
                row.amountCents != null && row.amountCents < 0
                  ? 'booking-receipt__row booking-receipt__row--save'
                  : 'booking-receipt__row'
              }
            >
              <span>{row.label}</span>
              <span>
                {row.amountCents == null
                  ? 'Included'
                  : row.amountCents < 0
                    ? `−${formatCents(-row.amountCents)}`
                    : formatCents(row.amountCents)}
              </span>
            </p>
          ))
        : null}
      <p className="booking-receipt__row booking-receipt__row--total">
        <span>Total paid</span>
        <span>{formatCents(booking.total_amount)}</span>
      </p>
      <p className="booking-receipt__pay">
        Paid with {paymentMethod} · Ref {ref}
        <button type="button" className="booking-action__link" onClick={() => onCopy(ref, 'Reference copied')}>
          Copy ref
        </button>
      </p>
    </section>
  )

  return (
    <div className="page booking-page">
      <Link to="/bookings" className="booking-page__back">
        <Icon name="chevronLeft" size={16} />
        Your bookings
      </Link>

      {note ? <p className="hint">{note}</p> : null}

      <div className="booking-page__grid">
        <div className="booking-page__main">
          <div className="booking-page__cover">
            {listing?.id ? (
              <Link to={`/listings/${listing.id}`} className="booking-page__cover-link" aria-label={listing.title || 'Listing'}>
                {photo ? <img src={photo} alt="" /> : null}
              </Link>
            ) : photo ? (
              <img src={photo} alt="" />
            ) : null}
            <div className="booking-page__pills">
              {statusLabel ? <span className={pillClass}>{statusLabel}</span> : <span />}
              {countdown && !cancelled ? <span className="booking-pill booking-pill--soon">{countdown}</span> : <span />}
            </div>
          </div>

          {listing?.id ? (
            <h1 className="booking-detail__title">
              <Link to={`/listings/${listing.id}`} className="booking-detail__listing">
                {listing.title || 'Untitled listing'}
              </Link>
            </h1>
          ) : (
            <h1 className="booking-detail__title">{listing?.title || 'Unknown listing'}</h1>
          )}
          <p className="booking-page__with">{withHostLine(hostLabel, listing?.area, booking.guests_count)}</p>

          {dayOf && !cancelled ? (
            <div className="booking-banner">
              <p>Today · {startsInCopy(startsAt, nowMs)}</p>
            </div>
          ) : null}

          {cancelled ? (
            <section className="booking-card">
              <h2 className="booking-card__title">
                {Number(booking.refund_amount) > 0
                  ? `${formatCents(booking.refund_amount)} on its way back`
                  : 'This booking was cancelled'}
              </h2>
              {booking.stripe_refund_id || Number(booking.refund_amount) > 0 ? (
                <p className="hint">Refunded to your {paymentMethod}.</p>
              ) : null}
              {listing?.id ? (
                <Link to={`/listings/${listing.id}`} className="ui-button ui-button--primary booking-page__wrap-btn">
                  Find another time
                </Link>
              ) : null}
            </section>
          ) : null}

          {ended && !cancelled ? (
            <section className="booking-card">
              <h2 className="booking-card__title">How was it with {hostLabel}?</h2>
              {alreadyReviewed ? (
                <p className="hint">Review submitted</p>
              ) : canReview ? (
                <ReviewForm
                  booking={booking}
                  userId={userId}
                  submitLabel="Leave a review"
                  onSubmitted={() => setAlreadyReviewed(true)}
                />
              ) : null}
              {listing?.id ? (
                <div className="booking-again">
                  <p>
                    {upcomingCount > 0
                      ? `${upcomingCount} upcoming ${upcomingCount === 1 ? 'date' : 'dates'}`
                      : 'No upcoming dates yet'}
                  </p>
                  <Link to={`/listings/${listing.id}`} className="ui-button ui-button--secondary booking-page__wrap-btn">
                    See dates
                  </Link>
                </div>
              ) : null}
            </section>
          ) : null}

          {whenCard}
          {whereCard}
          {packingCard}
        </div>
        <div className="booking-page__side">
          {hostCard}
          {receiptCard}
          {manageRow}
          {helpLine}
        </div>
      </div>

      {sheetOpen ? (
        <div className="confirm-dialog-backdrop confirm-dialog-backdrop--sheet">
          <div
            className="confirm-dialog confirm-dialog--sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-booking-title"
          >
            <div className="confirm-dialog__sheet-bar">
              <h2 id="manage-booking-title" className="confirm-dialog__sheet-title">
                Can&apos;t make it?
              </h2>
              <button type="button" className="wizard__close" aria-label="Close" onClick={() => setSheetOpen(false)}>
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="confirm-dialog__sheet-body">
              {blockReason ? (
                <p>{rescheduleBlockCopy(blockReason)}</p>
              ) : confirmMove ? (
                <>
                  <p>
                    Move to {formatSessionDay(confirmMove.starts_at)}? You can only move a booking once.
                  </p>
                  {moveError ? <p className="error-message">{moveError}</p> : null}
                  <Button
                    loading={moveLoading}
                    loadingLabel="Moving"
                    onClick={() => handleMove(confirmMove)}
                  >
                    Move booking
                  </Button>
                  <button type="button" className="btn btn--ghost" onClick={() => setConfirmMove(null)}>
                    Back
                  </button>
                </>
              ) : (
                <>
                  <p className="booking-card__sub">Move to another date</p>
                  {moveList.length === 0 ? (
                    <p className="hint">No other dates are open right now.</p>
                  ) : (
                    <ul className="booking-move-list">
                      {moveList.map((row) => (
                        <li key={row.id}>
                          <button type="button" className="btn btn--secondary booking-page__wrap-btn" onClick={() => setConfirmMove(row)}>
                            {formatSessionDay(row.starts_at)} · {formatSessionTime(row.starts_at)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              {canCancel ? (
                <div className="booking-sheet__cancel">
                  <p>{cancelNowCopy(booking.total_amount, startsAt, booking.platform_fee)}</p>
                  <p className="hint">{cancelTiersSentence()}</p>
                  {cancelError ? <p className="error-message">{cancelError}</p> : null}
                  {confirmCancel ? (
                    <>
                      <p className="cancel-confirm__note">{guestCancellationNote(booking)}</p>
                      <Button
                        variant="destructive"
                        loading={cancelLoading}
                        loadingLabel="Cancelling"
                        onClick={handleCancel}
                      >
                        Confirm cancellation
                      </Button>
                      <button type="button" className="btn btn--ghost" onClick={() => setConfirmCancel(false)}>
                        Keep booking
                      </button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setCancelError('')
                        setConfirmCancel(true)
                      }}
                    >
                      Cancel booking
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
