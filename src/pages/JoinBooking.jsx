import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDuration } from '../lib/duration'
import { formatSessionDay, formatSessionTime } from '../lib/sessionDate'
import { publicName } from '../lib/publicName'
import { usePageTitle } from '../lib/pageTitle'
import { JOIN_PAID_LINE, JOIN_SIGN_IN_HINT, claimErrorState, joinStateMessage } from '../lib/companions'
import { firstRow } from '../lib/twoWayReviews'
import PageLoader from '../components/PageLoader'
import Button from '../components/ui/Button'

/**
 * /join/:code: a friend opens the booker's link (canvas: Who's coming, 2).
 * Public preview with no address or prices; taking the seat needs an account.
 */
export default function JoinBooking() {
  const { code } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [preview, setPreview] = useState(null)
  const [signedIn, setSignedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const [{ data: sessionData }, { data, error }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.rpc('join_preview', { p_code: code }),
    ])
    setSignedIn(Boolean(sessionData?.session))
    setPreview(error ? { state: 'error' } : firstRow(data) ?? { state: 'not_found' })
    setLoading(false)
  }, [code])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(async () => {
      if (!cancelled) await load()
    })
    return () => {
      cancelled = true
    }
  }, [load])

  const bookerName = publicName({ display_name: preview?.booker_display_name }) || ''
  usePageTitle(bookerName ? `${bookerName} saved you a seat` : 'Join a booking')

  async function takeSeat() {
    if (!signedIn) {
      navigate('/login', { state: { from: location } })
      return
    }
    setClaiming(true)
    setMessage('')
    const { data: bookingId, error } = await supabase.rpc('claim_booking_seat', { p_code: code })
    setClaiming(false)
    if (error || typeof bookingId !== 'string') {
      setMessage(joinStateMessage(claimErrorState(error), bookerName))
      return
    }
    navigate(`/bookings/${bookingId}`, { replace: true })
  }

  if (loading) return <PageLoader />

  const state = preview?.state ?? 'not_found'
  const hostName = publicName({ display_name: preview?.host_display_name }) || ''
  const hasSession = Boolean(preview?.starts_at)
  const when = hasSession
    ? `${formatSessionDay(preview.starts_at)}, ${formatSessionTime(preview.starts_at)}${
        preview.duration_mins ? ` · ${formatDuration(preview.duration_mins)}` : ''
      }`
    : ''
  const withLine = [hostName ? `with ${hostName}` : '', preview?.area].filter(Boolean).join(' · ')

  if (!hasSession || state === 'not_found' || state === 'error') {
    return (
      <div className="page join-page">
        <div className="join-card">
          <div className="join-card__body">
            <h1 className="join-card__title">{joinStateMessage(state === 'error' ? 'error' : 'not_found')}</h1>
            <Link to="/" className="ui-button ui-button--secondary booking-page__wrap-btn">
              Browse sessions
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page join-page">
      <div className="join-card">
        <div className="join-card__cover">{preview.listing_photo ? <img src={preview.listing_photo} alt="" /> : null}</div>
        <div className="join-card__body">
          <p className="join-card__eyebrow">{bookerName ? `${bookerName} saved you a seat` : 'A seat is saved for you'}</p>
          <h1 className="join-card__title">{preview.listing_title || 'TryKai session'}</h1>
          <p className="join-card__when">{when}</p>
          {withLine ? <p className="join-card__with">{withLine}</p> : null}

          {state === 'ok' ? (
            <>
              <p className="join-card__paid">{JOIN_PAID_LINE}</p>
              <Button loading={claiming} loadingLabel="Taking your seat" className="booking-page__wrap-btn" onClick={takeSeat}>
                Take my seat
              </Button>
              {!signedIn ? <p className="hint">{JOIN_SIGN_IN_HINT}</p> : null}
            </>
          ) : (
            <p className="join-card__state">{joinStateMessage(state, bookerName)}</p>
          )}

          {message ? (
            <p className="error-message" role="status">
              {message}
            </p>
          ) : null}
          {preview.listing_id ? (
            <Link to={`/listings/${preview.listing_id}`} className="join-card__listing">
              See the listing
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}
