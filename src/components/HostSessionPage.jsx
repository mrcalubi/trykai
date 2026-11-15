import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Button from './ui/Button'
import Icon from './ui/Icon'
import { GuestAvatar, SpotBar } from './HostSessionParts'
import { hostCancelWarning } from '../lib/hostCancelCopy'
import { formatSessionTime } from '../lib/sessionDate'
import {
  bookedSeats,
  sessionCapacity,
  sessionDayLabel,
  sessionGuestCards,
  sessionSpotsLine,
  sessionTimeRange,
  spotsLabel,
} from '../lib/hostSessions'

function lockCopy(cards) {
  const who = cards.length === 1 ? cards[0].name : 'Guests'
  return `Once someone books, the date and time can't change. ${who} can move their own booking once, free, up to 48 hours before.`
}

function cancelCopy(cards, guestCount) {
  if (cards.length === 1 && guestCount <= 1) {
    return `${cards[0].name} gets a full refund, including the booking fee, and you get a strike.`
  }
  const who = guestCount === 2 ? 'Both guests' : `All ${guestCount} guests`
  return `${who} get a full refund, including the booking fee, and you get a strike.`
}

/**
 * One session, for the host: who's coming, their notes, why the time is
 * fixed, and the one way out (cancel, with a full refund for every guest).
 */
export default function HostSessionPage({
  session,
  listing,
  guestRows = [],
  addonsByBooking = {},
  notesByBooking = {},
  backHref,
  TitleTag = 'h1',
  confirmCancel,
  cancelLoading,
  cancelError,
  onAskCancel,
  onKeep,
  onCancelSession,
}) {
  const [hasDirections, setHasDirections] = useState(null)
  const rootRef = useRef(null)
  const listingId = listing?.id ?? session?.listing_id

  // Inside the profile the page sits below the profile card: start at its header.
  useEffect(() => {
    rootRef.current?.scrollIntoView?.({ block: 'start' })
  }, [session?.id])

  // Guests ask about parking and directions; the answer belongs in the listing.
  useEffect(() => {
    if (!listingId) return undefined
    let cancelled = false
    void supabase
      .rpc('listing_arrival_instructions', { listing_id: listingId })
      .then(({ data, error }) => {
        if (cancelled) return
        setHasDirections(!error && typeof data === 'string' && data.trim().length > 0)
      })
    return () => {
      cancelled = true
    }
  }, [listingId])

  if (!session) {
    return (
      <div className="host-session" ref={rootRef}>
        <Link to={backHref} className="host-session__back host-session__back--text">
          <Icon name="chevron-left" size={20} strokeWidth={2.2} />
          Back to Hosting
        </Link>
        <p className="empty-state">This session isn&apos;t on your schedule any more.</p>
      </div>
    )
  }

  const capacity = sessionCapacity(session, listing)
  const booked = bookedSeats(session)
  const cards = sessionGuestCards(session, { guestRows, addonsByBooking, notesByBooking })
  const anyNote = cards.some((card) => card.note)
  const title = listing?.title ?? session.listings?.title ?? ''
  const directionsLabel = hasDirections
    ? 'Update directions in your listing'
    : 'Add parking and directions to your listing'

  return (
    <div className="host-session" ref={rootRef}>
      <header className="host-session__head">
        <Link to={backHref} className="host-session__back" aria-label="Back to Hosting">
          <Icon name="chevron-left" size={22} strokeWidth={2.2} />
        </Link>
        <div className="host-session__heading">
          {title ? <p className="host-session__listing">{title}</p> : null}
          <TitleTag className="host-session__title">
            {sessionDayLabel(session.starts_at)} · {formatSessionTime(session.starts_at)}
          </TitleTag>
        </div>
      </header>

      <section className="host-session__card host-session__spots" aria-label="Spots">
        <div className="host-session__spots-row">
          <p className="host-session__spots-count">
            {booked} of {spotsLabel(capacity)} booked
          </p>
          <p className="host-session__time">{sessionTimeRange(session, listing)}</p>
        </div>
        <SpotBar booked={booked} capacity={capacity} className="spot-bar--wide" />
        <p className="host-session__hint">{sessionSpotsLine(session, listing)}</p>
      </section>

      <section className="host-session__guests" aria-labelledby="host-session-guests">
        <h2 id="host-session-guests" className="host-session__label">
          Guests
        </h2>
        {cards.length === 0 ? (
          <p className="host-session__card host-session__empty">No one has booked this date yet.</p>
        ) : (
          <ul className="host-session__guest-list">
            {cards.map((card) => (
              <li key={card.id} className="host-session__card host-guest">
                <div className="host-guest__row">
                  <GuestAvatar name={card.name} className="guest-avatar--large" />
                  <div className="host-guest__text">
                    <p className="host-guest__name">{card.name}</p>
                    <p className="host-guest__meta">
                      {[spotsLabel(card.spots), 'paid', card.addons].filter(Boolean).join(' · ')}
                    </p>
                    {card.friends.length ? (
                      <p className="host-guest__meta">With {card.friends.join(', ')}</p>
                    ) : null}
                  </div>
                </div>
                {card.note ? (
                  <>
                    <div className="host-guest__note">
                      <p className="host-guest__note-label">Note from {card.name}</p>
                      <p className="host-guest__note-text">{card.note}</p>
                    </div>
                    <Link
                      to={`/edit-listing/${listingId}?section=location`}
                      className="host-guest__directions"
                    >
                      <Icon name="pin" size={16} />
                      {directionsLabel}
                    </Link>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {anyNote ? (
          <p className="host-session__hint host-session__hint--below">
            Notes are one-way. Answers in your listing reach every guest.
          </p>
        ) : null}
      </section>

      {cards.length > 0 ? (
        <>
          <section className="host-session__card host-session__lock">
            <span className="host-session__lock-icon" aria-hidden="true">
              <Icon name="lock" size={18} />
            </span>
            <div>
              <h2 className="host-session__lock-title">This time is fixed now</h2>
              <p className="host-session__lock-text">{lockCopy(cards)}</p>
            </div>
          </section>

          <section className="host-session__cancel" aria-labelledby="host-session-cancel">
            <h2 id="host-session-cancel" className="host-session__cancel-title">
              Can&apos;t make it?
            </h2>
            {confirmCancel ? (
              <div className="cancel-confirm">
                <p className="cancel-confirm__warning">{hostCancelWarning(booked)}</p>
                <div className="hosting-sessions__confirm-actions">
                  <Button
                    variant="primary"
                    loading={cancelLoading}
                    loadingLabel="Cancelling"
                    onClick={() => onCancelSession(session)}
                    className="hosting-sessions__danger"
                  >
                    Confirm cancellation
                  </Button>
                  <button type="button" onClick={onKeep} className="btn btn--ghost">
                    Keep session
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="host-session__cancel-btn" onClick={onAskCancel}>
                Cancel this session
              </button>
            )}
            {cancelError ? <p className="error-message">{cancelError}</p> : null}
            <p className="host-session__hint">
              {cancelCopy(cards, booked)} You&apos;ll be asked to confirm.{' '}
              <Link to="/cancellation-policy">Cancellation policy</Link>
            </p>
          </section>
        </>
      ) : null}
    </div>
  )
}
