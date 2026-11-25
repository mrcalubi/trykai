import Icon from './ui/Icon'
import { sessionDayLabel } from '../lib/hostSessions'
import { classDates, datesLabel } from '../lib/sessionTypes'
import { classPlacesLine } from '../lib/bookingPickers'

/**
 * "Pick what you'll make": one card per class. "See dates" fills the booking
 * card's What you'll make field, so the two are one choice. With several
 * places (00059), each card says where it runs: "Bedok only".
 */
export function ClassCards({ classes, sessions, places = [], filterId, onPick }) {
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
          const where = places.length > 1 ? classPlacesLine(sessions, type.id, places) : ''
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
                  {count > 0
                    ? [datesLabel(count), `next ${sessionDayLabel(next.starts_at)}`, where].filter(Boolean).join(' · ')
                    : 'No dates yet'}
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
