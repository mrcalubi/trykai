import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthedUserId } from '../lib/authedUser'
import { formatCents } from '../lib/cancellationPolicy'
import { formatDuration } from '../lib/duration'
import { edgeFunctionErrorMessage } from '../lib/edgeFunctionError'
import { guestBookingActions, guestCancellationNote } from '../lib/guestBookings'
import { publicName } from '../lib/publicName'
import {
  bookingReference,
  googleCalendarUrl,
  guestCountLabel,
} from '../../supabase/functions/_shared/email.ts'
import { PAGE_LOAD_ERROR, withIssuedAtRetry } from '../lib/pageLoad'
import { formatSessionDay, formatSessionTime } from '../lib/sessionDate'
import Button from '../components/ui/Button'
import ReportProblem from '../components/ReportProblem'

function googleMapsUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

function providedItems(items) {
  if (!Array.isArray(items)) return []
  return items.map((item) => String(item).trim()).filter((item) => item && item !== 'None')
}

export default function BookingDetail() {
  const { bookingId } = useParams()
  const userId = useAuthedUserId()
  const [booking, setBooking] = useState(null)
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notGuest, setNotGuest] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError] = useState('')

  const loadBooking = useCallback(async () => {
    const { data, error: loadError } = await withIssuedAtRetry(() =>
      supabase
        .from('bookings')
        .select(
          `
        id,
        status,
        guest_id,
        guests_count,
        total_amount,
        platform_fee,
        payment_rail,
        sessions (
          starts_at,
          duration_mins,
          listings (
            id,
            title,
            photo_urls,
            whats_provided,
            duration_mins,
            host_id,
            users:host_id (
              display_name,
              avatar_url
            )
          )
        )
      `,
        )
        .eq('id', bookingId)
        .maybeSingle()
    )

    if (loadError) {
      setError(PAGE_LOAD_ERROR)
      setBooking(null)
      setLoading(false)
      return
    }

    if (!data) {
      setNotGuest(true)
      setBooking(null)
      setLoading(false)
      return
    }

    if (data.guest_id !== userId) {
      setNotGuest(true)
      setBooking(null)
      setLoading(false)
      return
    }

    setBooking(data)
    setNotGuest(false)

    const listingId = data.sessions?.listings?.id
    if (data.status === 'confirmed' && listingId) {
      const { data: revealed } = await supabase.rpc('listing_address', {
        listing_id: listingId,
      })
      setAddress(typeof revealed === 'string' ? revealed : '')
    } else {
      setAddress('')
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

  async function handleCancel() {
    setCancelError('')
    setCancelLoading(true)
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('cancel-booking', {
      body: { booking_id: booking.id },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    setCancelLoading(false)
    if (error || data?.error) {
      setCancelError(await edgeFunctionErrorMessage(error, data))
      return
    }
    setConfirmCancel(false)
    await loadBooking()
  }

  if (loading) {
    return <p className="status-message">Loading…</p>
  }

  if (error) {
    return <p className="status-message error-message">{error}</p>
  }

  if (notGuest || !booking) {
    return <Navigate to="/bookings" replace />
  }

  const session = booking.sessions
  const listing = session?.listings
  const host = listing?.users
  const hostName = publicName(host) || 'your host'
  const photo = listing?.photo_urls?.[0]
  const startsAt = session?.starts_at
  const duration = formatDuration(session?.duration_mins ?? listing?.duration_mins)
  const provided = providedItems(listing?.whats_provided)
  const calendar = startsAt
    ? googleCalendarUrl({
        title: listing?.title || 'TryKai session',
        startsAt,
        durationMins: session?.duration_mins ?? listing?.duration_mins,
        address,
      })
    : ''
  const canCancel = guestBookingActions(booking).cancel
  const paymentMethod = booking.payment_rail === 'paynow' ? 'PayNow' : 'Card'

  return (
    <div className="page page--narrow booking-detail">
      {listing?.id ? (
        <Link to={`/listings/${listing.id}`} className="booking-detail__listing">
          {photo ? (
            <img src={photo} alt="" className="booking-detail__photo" />
          ) : null}
          <h1 className="booking-detail__title">{listing.title || 'Untitled listing'}</h1>
        </Link>
      ) : (
        <h1 className="booking-detail__title">{listing?.title || 'Unknown listing'}</h1>
      )}

      {listing?.host_id ? (
        <Link to={`/u/${listing.host_id}`} className="detail-host booking-detail__host">
          {host?.avatar_url ? (
            <img src={host.avatar_url} alt="" className="detail-host__avatar" />
          ) : (
            <div className="detail-host__avatar-placeholder">
              {hostName[0]?.toUpperCase() || '?'}
            </div>
          )}
          <p className="detail-host__name">{hostName}</p>
        </Link>
      ) : null}

      {startsAt ? (
        <>
          <p className="booking-detail__row">
            <strong>Date</strong> {formatSessionDay(startsAt)}
          </p>
          <p className="booking-detail__row">
            <strong>Time</strong> {formatSessionTime(startsAt)}
          </p>
        </>
      ) : (
        <p className="booking-detail__row">
          <strong>Date</strong> Date TBC
        </p>
      )}
      {duration ? (
        <p className="booking-detail__row">
          <strong>Duration</strong> {duration}
        </p>
      ) : null}
      {calendar ? (
        <p className="booking-detail__row">
          <a href={calendar} className="booking-detail__link">
            Add to Google Calendar
          </a>
        </p>
      ) : null}

      {address ? (
        <p className="booking-detail__row">
          <strong>Address</strong> {address}
          {' · '}
          <a href={googleMapsUrl(address)} className="booking-detail__link">
            Open in Google Maps
          </a>
        </p>
      ) : null}

      {provided.length > 0 ? (
        <section className="booking-detail__section">
          <h2 className="booking-detail__section-title">What&apos;s provided</h2>
          <ul className="detail-list">
            {provided.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="booking-detail__row">
        <strong>Guests</strong> {guestCountLabel(booking.guests_count)}
      </p>
      <p className="booking-detail__row">
        <strong>Total paid</strong> {formatCents(booking.total_amount)}
      </p>
      <p className="booking-detail__row">
        <strong>Payment method</strong> {paymentMethod}
      </p>
      <p className="booking-detail__row">
        <strong>Booking reference</strong> {bookingReference(booking.id)}
      </p>
      <p className="booking-detail__row">
        <strong>Status</strong>{' '}
        <span className={`badge badge--${booking.status}`}>{booking.status}</span>
      </p>

      <ReportProblem booking={booking} />

      {cancelError ? <p className="error-message">{cancelError}</p> : null}

      {canCancel && !confirmCancel ? (
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
      ) : null}

      {confirmCancel ? (
        <div className="cancel-confirm">
          <p className="cancel-confirm__note">{guestCancellationNote(booking)}</p>
          <div className="booking-detail__actions">
            <button
              type="button"
              disabled={cancelLoading}
              onClick={handleCancel}
              className="btn btn--danger"
            >
              {cancelLoading ? 'Cancelling…' : 'Confirm cancellation'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className="btn btn--ghost"
            >
              Keep booking
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
