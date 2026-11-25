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

/** Who is coming, and how full the session is. */
function GuestsLine({ session, listing, guestRows }) {
  const names = sessionGuestsLine(guestRows)
  const avatars = guestRows.filter((row) => !row.is_companion).slice(0, 2)
  return (
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
        {bookedSeats(session)} of {sessionCapacity(session, listing)} spots booked
      </span>
    </p>
  )
}

function ViewSession({ className, href, placeName }) {
  return (
    <Link className={className} to={href} aria-label={placeName ? `View session at ${placeName}` : undefined}>
      View session
      <Icon name="chevron-right" size={16} strokeWidth={2.4} />
    </Link>
  )
}

/**
 * The next date someone has booked, with a way into its session page. A
 * multi-location listing (00059) can run several places at once: each one
 * booked at that time gets its own row, named, with its own guests.
 *
 * `items`: [{ session, guestRows, note, placeName, href }], soonest first.
 */
export default function HostNextUp({ items = [], listing }) {
  const [first] = items
  if (!first) return null
  const { session } = first
  const tile = sessionDateTile(session.starts_at)
  const title = listing?.title ?? session.listings?.title ?? 'Your session'
  const grouped = items.length > 1
  const times = items.map((item) => sessionTimeRange(item.session, listing))
  const sharedTime = times.every((time) => time === times[0])

  return (
    <section className="hosting-upcoming next-up" aria-labelledby="next-up-title">
      <h2 id="next-up-title" className="hosting__section-title">
        Next up
      </h2>
      <article className={grouped ? 'next-up__card next-up__card--group' : 'next-up__card'}>
        <span className="next-up__tile" aria-hidden="true">
          <span className="next-up__weekday">{tile.weekday}</span>
          <span className="next-up__day">{tile.day}</span>
          <span className="next-up__month">{tile.month}</span>
        </span>
        <div className="next-up__body">
          <p className="next-up__title">{title}</p>
          <p className="next-up__when">
            <span className="visually-hidden">{sessionDayLabel(session.starts_at)}, </span>
            {sharedTime ? `${times[0]} · ` : ''}
            {relativeDayLabel(session.starts_at)}
          </p>
          {grouped ? null : (
            <>
              {first.placeName ? <p className="next-up__place">{first.placeName}</p> : null}
              <GuestsLine session={session} listing={listing} guestRows={first.guestRows ?? []} />
              {first.note ? <p className="next-up__note">“{first.note}”</p> : null}
            </>
          )}
        </div>
        {grouped ? (
          <ul className="next-up__places">
            {items.map((item, index) => (
              <li key={item.session.id} className="next-up__place-row">
                <div className="next-up__place-info">
                  {item.placeName ? <p className="next-up__place">{item.placeName}</p> : null}
                  {sharedTime ? null : <p className="next-up__place-time">{times[index]}</p>}
                  <GuestsLine session={item.session} listing={listing} guestRows={item.guestRows ?? []} />
                  {item.note ? <p className="next-up__note">“{item.note}”</p> : null}
                </div>
                <ViewSession
                  className="btn btn--secondary next-up__row-open"
                  href={item.href}
                  placeName={item.placeName}
                />
              </li>
            ))}
          </ul>
        ) : (
          <ViewSession className="btn btn--primary next-up__open" href={first.href} placeName={first.placeName} />
        )}
      </article>
    </section>
  )
}
