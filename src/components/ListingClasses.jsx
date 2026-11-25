import Icon from './ui/Icon'
import { sessionDayLabel } from '../lib/hostSessions'
import { classDates, datesLabel } from '../lib/sessionTypes'
import { sessionsOfClass } from '../lib/classCalendar'

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
 * Listing locations (00059): "All locations" and one chip per place. It filters
 * the dates below; with all locations, each time names its place.
 */
export function LocationChips({ locations, filterId, onFilter }) {
  return (
    <div className="class-dates__chips location-chips" role="group" aria-label="Location">
      {[{ id: null, name: 'All locations' }, ...locations].map((place) => {
        const on = (filterId ?? null) === place.id
        return (
          <button
            key={place.id ?? 'all'}
            type="button"
            className={`class-dates__chip${on ? ' class-dates__chip--on' : ''}`}
            aria-pressed={on}
            onClick={() => onFilter(place.id)}
          >
            {place.id ? <Icon name="pin" size={14} /> : null}
            {place.name}
          </button>
        )
      })}
    </div>
  )
}

/**
 * "All classes" and one chip per class, each with its number of dates. Above
 * the booking calendar; the same filter as the class cards.
 */
export function ClassChips({ classes, sessions, filterId, onFilter }) {
  return (
    <div className="class-dates__chips" role="group" aria-label="Class">
      {[{ id: null, name: 'All classes' }, ...classes].map((type) => {
        const on = (filterId ?? null) === type.id
        return (
          <button
            key={type.id ?? 'all'}
            type="button"
            className={`class-dates__chip${on ? ' class-dates__chip--on' : ''}`}
            aria-pressed={on}
            onClick={() => onFilter(type.id)}
          >
            {type.name}
            {sessions ? (
              <span className="class-dates__chip-count" aria-hidden="true">
                {sessionsOfClass(sessions, type.id).length}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
