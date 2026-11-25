import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { edgeFunctionErrorMessage } from '../lib/edgeFunctionError'
import { formatCents } from '../lib/cancellationPolicy'
import { formatDuration } from '../lib/duration'
import PageLoader from '../components/PageLoader'

const VIEWS = [
  { key: 'upcoming', label: 'Upcoming classes' },
  { key: 'recent', label: 'Latest bookings' },
]

function formatWhen(iso) {
  if (!iso) return 'Date unknown'
  return new Intl.DateTimeFormat('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Singapore',
  }).format(new Date(iso))
}

function people(count) {
  return count === 1 ? '1 guest' : `${count} guests`
}

function statusLine(booking) {
  if (booking.status === 'cancelled') {
    const who = booking.cancelled_by === 'host' ? 'host or TryKai' : 'guest'
    const refund = booking.refund_cents > 0 ? `, refunded S${formatCents(booking.refund_cents)}` : ''
    return `Cancelled by ${who}${refund}`
  }
  return 'Confirmed'
}

/**
 * Every confirmed or cancelled booking, for the team: who booked which class,
 * for when, with whom. Read only; refunds and holds stay in OPERATIONS.md.
 */
export default function AdminBookings() {
  const [data, setData] = useState({ upcoming: [], recent: [] })
  const [view, setView] = useState('upcoming')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const { data: result, error: fnError } = await supabase.functions.invoke('admin-bookings', {
      body: { action: 'list' },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    if (fnError || result?.error) {
      setError(await edgeFunctionErrorMessage(fnError, result))
    } else {
      setData({ upcoming: result?.upcoming ?? [], recent: result?.recent ?? [] })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void load()
    })
    return () => {
      cancelled = true
    }
  }, [load])

  const rows = view === 'upcoming' ? data.upcoming : data.recent
  const upcomingGuests = useMemo(
    () => data.upcoming.reduce((sum, b) => sum + (Number(b.guests_count) || 0), 0),
    [data.upcoming]
  )

  return (
    <div className="page page--narrow">
      <h1 className="dashboard-heading">Bookings</h1>
      <p className="form-card__subtitle">
        {data.upcoming.length} upcoming {data.upcoming.length === 1 ? 'booking' : 'bookings'},{' '}
        {people(upcomingGuests)}. Unpaid checkouts are left out.
      </p>

      <div className="filter-pills" role="group" aria-label="Bookings view">
        {VIEWS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`chip${view === option.key ? ' chip--active' : ''}`}
            aria-pressed={view === option.key}
            onClick={() => setView(option.key)}
          >
            {option.label}
          </button>
        ))}
        <button type="button" className="chip" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {error && <p className="error-message">{error}</p>}

      {loading ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <p className="empty-state">
          {view === 'upcoming' ? 'No upcoming bookings yet.' : 'No bookings yet.'}
        </p>
      ) : (
        <div className="admin-bookings">
          {rows.map((booking) => (
            <article
              key={booking.id}
              className={`dashboard-card admin-booking${booking.status === 'cancelled' ? ' admin-booking--cancelled' : ''}`}
            >
              <p className="dashboard-card__title">
                {booking.listing.id ? (
                  <Link to={`/listings/${booking.listing.id}`}>{booking.listing.title}</Link>
                ) : (
                  booking.listing.title
                )}
              </p>
              <p className="dashboard-card__meta">
                {formatWhen(booking.session.starts_at)}
                {booking.session.duration_mins ? ` · ${formatDuration(booking.session.duration_mins)}` : ''}
                {' · '}with {booking.host.name}
              </p>
              <p className="admin-booking__guest">
                <strong>{booking.guest.name}</strong>
                {booking.guest.email ? ` · ${booking.guest.email}` : ''}
                {' · '}
                {people(booking.guests_count)}
                {booking.friends.length > 0 ? ` (with ${booking.friends.join(', ')})` : ''}
              </p>
              <p className="dashboard-card__meta">
                {statusLine(booking)} · Paid S{formatCents(booking.paid_cents)}
                {booking.payment_rail === 'paynow' ? ' by PayNow' : ''} · TryKai fee S
                {formatCents(booking.fee_cents)} · Booked {formatWhen(booking.booked_at)} · Ref{' '}
                {booking.reference}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
