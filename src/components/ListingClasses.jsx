import Icon from './ui/Icon'
import { isBookingClosed } from '../lib/bookingCutoff'
import { sessionDayLabel, sessionTimeRange } from '../lib/hostSessions'
import { isLowSpots, spotsLabel } from '../lib/listingSpots'
import { classDates, datesLabel } from '../lib/sessionTypes'

const TIME_ZONE = 'Asia/Singapore'

function monthHeading(iso, now = Date.now()) {
  const date = new Date(iso)
  const sameYear =
    new Intl.DateTimeFormat('en-SG', { year: 'numeric', timeZone: TIME_ZONE }).format(date) ===
    new Intl.DateTimeFormat('en-SG', { year: 'numeric', timeZone: TIME_ZONE }).format(new Date(now))
  return new Intl.DateTimeFormat('en-SG', {
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: TIME_ZONE,
  }).format(date)
}

function tile(iso) {
  const date = new Date(iso)
  const part = (options) => new Intl.DateTimeFormat('en-SG', { ...options, timeZone: TIME_ZONE }).format(date)
  return { weekday: part({ weekday: 'short' }).toUpperCase(), day: part({ day: 'numeric' }) }
}

/**
 * "Pick what you'll make": one card per class. The cards and the chips above
 * the dates are the same filter, so picking either highlights both.
 */
export function ClassCards({ classes, sessions, filterId, onPick }) {
  return (
    <section className="detail-section class-pick" aria-labelledby="class-pick-title">
      <div className="class-pick__head">
        <h2 id="class-pick-title" className="detail-section__title">
          Pick what you&apos;ll make
        </h2>
        <span className="class-pick__meta">
          {classes.length === 1 ? '1 class' : `${classes.length} classes · same price`}
        </span>
      </div>
      <ul className="class-pick__list">
        {classes.map((type) => {
          const { count, next } = classDates(sessions, type.id)
          const on = filterId === type.id
          return (
            <li key={type.id} className={`class-pick__card${on ? ' class-pick__card--on' : ''}`}>
              {type.photoUrl ? (
                <img src={type.photoUrl} alt="" className="class-pick__photo" />
              ) : (
                <span className="class-pick__photo class-pick__photo--empty" aria-hidden="true">
                  {type.name}
                </span>
              )}
              <div className="class-pick__body">
                <h3 className="class-pick__name">{type.name}</h3>
                {type.description ? <p className="class-pick__desc">{type.description}</p> : null}
                <p className="class-pick__dates">
                  {count > 0 ? `${datesLabel(count)} · next ${sessionDayLabel(next.starts_at)}` : 'No dates yet'}
                </p>
                {classes.length > 1 ? (
                  <button
                    type="button"
                    className="class-pick__see"
                    aria-pressed={on}
                    aria-label={on ? `Showing ${type.name} dates` : `See ${type.name} dates`}
                    onClick={() => onPick(on ? null : type.id)}
                  >
                    {on ? (
                      <>
                        <Icon name="check" size={14} strokeWidth={2.6} />
                        Showing its dates
                      </>
                    ) : (
                      'See dates'
                    )}
                  </button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * The booking card for a listing with classes: chips that match the cards, and
 * every upcoming date in one list, so an empty month never shows.
 */
export function ClassDateList({
  listing,
  classes,
  classById,
  sessions,
  filterId,
  onFilter,
  pickedId,
  onPick,
  disabled = false,
}) {
  const shown = filterId ? sessions.filter((session) => session.type_id === filterId) : sessions
  const groups = []
  for (const session of shown) {
    const heading = monthHeading(session.starts_at)
    const last = groups[groups.length - 1]
    if (last?.heading === heading) last.sessions.push(session)
    else groups.push({ heading, sessions: [session] })
  }
  const filterName = classById[filterId]?.name

  return (
    <div className="class-dates">
      {classes.length > 1 ? (
        <div className="class-dates__chips" role="group" aria-label="Class">
          {[{ id: null, name: 'All classes' }, ...classes].map((type) => {
            const on = (filterId ?? null) === type.id
            const count = type.id ? sessions.filter((session) => session.type_id === type.id).length : sessions.length
            return (
              <button
                key={type.id ?? 'all'}
                type="button"
                className={`class-dates__chip${on ? ' class-dates__chip--on' : ''}`}
                aria-pressed={on}
                onClick={() => onFilter(type.id)}
              >
                {type.name}
                <span className="class-dates__chip-count" aria-hidden="true">
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      {shown.length === 0 ? (
        <p className="class-dates__empty">
          No {filterName ?? ''} dates yet.{' '}
          {filterId ? (
            <button type="button" className="class-dates__all" onClick={() => onFilter(null)}>
              Show all classes
            </button>
          ) : null}
        </p>
      ) : (
        <div className="class-dates__scroll">
        {groups.map((group) => (
          <div key={group.heading} className="class-dates__month">
            <p className="class-dates__heading">{group.heading}</p>
            <ul className="class-dates__list">
              {group.sessions.map((session) => {
                const day = sessionDayLabel(session.starts_at)
                const range = sessionTimeRange(session, listing)
                const className = classById[session.type_id]?.name ?? ''
                const closed = isBookingClosed(session.starts_at, listing.booking_cutoff_hours)
                const full = Number(session.spots_remaining) <= 0
                const { weekday, day: dayNumber } = tile(session.starts_at)
                const on = pickedId === session.id
                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      className={`class-date${on ? ' class-date--on' : ''}`}
                      aria-pressed={on}
                      aria-label={`${day}, ${range}${className ? `, ${className}` : ''}, ${
                        closed ? 'booking closed' : spotsLabel(session.spots_remaining)
                      }`}
                      disabled={disabled || closed || full}
                      onClick={() => onPick(session.id)}
                    >
                      <span className="class-date__tile" aria-hidden="true">
                        <span className="class-date__weekday">{weekday}</span>
                        <span className="class-date__day">{dayNumber}</span>
                      </span>
                      <span className="class-date__text">
                        <span className="class-date__time">{range}</span>
                        {className && !filterId ? <span className="class-date__class">{className}</span> : null}
                      </span>
                      <span
                        className={`class-date__spots${
                          !closed && isLowSpots(session.spots_remaining) ? ' class-date__spots--low' : ''
                        }`}
                      >
                        {closed ? 'Booking closed' : spotsLabel(session.spots_remaining)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
        </div>
      )}
    </div>
  )
}
