import { Link } from 'react-router-dom'
import Icon from './ui/Icon'
import { GuestAvatar } from './HostSessionParts'
import { sessionGuestsLine } from '../lib/companions'
import {
  bookedSeats,
  relativeDayLabel,
  sessionCapacity,
  sessionDateTile,
  sessionDayLabel,
  sessionTimeRange,
} from '../lib/hostSessions'

/** The next date someone has booked, with a way into its session page. */
export default function HostNextUp({ session, listing, guestRows = [], note = '', href }) {
  const tile = sessionDateTile(session.starts_at)
  const capacity = sessionCapacity(session, listing)
  const names = sessionGuestsLine(guestRows)
  const avatars = guestRows.filter((row) => !row.is_companion).slice(0, 2)
  const title = listing?.title ?? session.listings?.title ?? 'Your session'

  return (
    <section className="hosting-upcoming next-up" aria-labelledby="next-up-title">
      <h2 id="next-up-title" className="hosting__section-title">
        Next up
      </h2>
      <article className="next-up__card">
        <span className="next-up__tile" aria-hidden="true">
          <span className="next-up__weekday">{tile.weekday}</span>
          <span className="next-up__day">{tile.day}</span>
          <span className="next-up__month">{tile.month}</span>
        </span>
        <div className="next-up__body">
          <p className="next-up__title">{title}</p>
          <p className="next-up__when">
            <span className="visually-hidden">{sessionDayLabel(session.starts_at)}, </span>
            {sessionTimeRange(session, listing)} · {relativeDayLabel(session.starts_at)}
          </p>
          <p className="next-up__guests">
            {avatars.length ? (
              <span className="next-up__avatars">
                {avatars.map((row) => (
                  <GuestAvatar key={row.booking_id ?? row.display_name} name={row.display_name} />
                ))}
              </span>
            ) : null}
            {names ? <strong className="next-up__names">{names}</strong> : null}
            <span>
              {names ? ' · ' : ''}
              {bookedSeats(session)} of {capacity} spots booked
            </span>
          </p>
          {note ? <p className="next-up__note">“{note}”</p> : null}
        </div>
        <Link className="btn btn--primary next-up__open" to={href}>
          View session
          <Icon name="chevron-right" size={16} strokeWidth={2.4} />
        </Link>
      </article>
    </section>
  )
}
