import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { SHARE_NOTES, shareOrCopy } from '../lib/share'
import { COMPANION_SEND_HINT, companionSeats, joinUrl, seatsLabel } from '../lib/companions'
import Avatar from './ui/Avatar'
import Button from './ui/Button'

/**
 * Booker's "Who's coming" card on a group booking (canvas: Who's coming, 1).
 * One link per booking; Remove frees the seat and changes the link.
 */
export default function WhosComing({ booking, bookerName, companions, canRemove, onChanged }) {
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState('')
  const [removingId, setRemovingId] = useState(null)
  const seats = companionSeats(booking.guests_count)
  const people = companions ?? []
  const open = Math.max(0, seats - people.length)

  async function sendLink() {
    setSending(true)
    setNote('')
    const { data: code, error } = await supabase.rpc('booking_join_link', { p_booking_id: booking.id })
    if (error || typeof code !== 'string') {
      setSending(false)
      setNote("Couldn't make the link. Try again.")
      return
    }
    const result = await shareOrCopy({
      url: joinUrl(code),
      title: `Join me at ${booking.sessions?.listings?.title || 'TryKai'}`,
    })
    setSending(false)
    setNote(SHARE_NOTES[result] ?? '')
  }

  async function remove(userId) {
    setRemovingId(userId)
    setNote('')
    const { error } = await supabase.rpc('remove_booking_companion', {
      p_booking_id: booking.id,
      p_user_id: userId,
    })
    setRemovingId(null)
    if (error) {
      setNote("Couldn't remove them. Try again.")
      return
    }
    onChanged?.()
  }

  return (
    <section className="booking-card whos-coming" aria-labelledby="whos-coming-title">
      <div className="whos-coming__head">
        <h2 id="whos-coming-title" className="booking-card__title">
          Who&apos;s coming
        </h2>
        <span className="whos-coming__count">{seatsLabel(booking.guests_count, people.length)}</span>
      </div>
      <ul className="whos-coming__list">
        <li className="whos-coming__row">
          <Avatar displayName={bookerName} className="whos-coming__avatar" />
          <span className="whos-coming__name">
            {bookerName || 'You'} <span className="whos-coming__you">· you</span>
          </span>
        </li>
        {people.map((person) => (
          <li key={person.user_id} className="whos-coming__row">
            <Avatar
              avatarUrl={person.avatar_url}
              displayName={person.display_name}
              className="whos-coming__avatar"
            />
            <span className="whos-coming__name">{person.display_name || 'Friend'}</span>
            {canRemove ? (
              <button
                type="button"
                className="booking-action__link"
                disabled={removingId === person.user_id}
                onClick={() => remove(person.user_id)}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
        {Array.from({ length: open }, (_, index) => (
          <li key={`open-${index}`} className="whos-coming__row whos-coming__row--open">
            <span className="whos-coming__seat" aria-hidden="true" />
            <span className="whos-coming__name">Open seat</span>
          </li>
        ))}
      </ul>
      {open > 0 ? (
        <>
          <Button loading={sending} loadingLabel="Making link" className="booking-page__wrap-btn" onClick={sendLink}>
            Send your friends their seat
          </Button>
          <p className="hint whos-coming__hint">{COMPANION_SEND_HINT}</p>
        </>
      ) : null}
      {note ? (
        <p className="hint" role="status">
          {note}
        </p>
      ) : null}
    </section>
  )
}
