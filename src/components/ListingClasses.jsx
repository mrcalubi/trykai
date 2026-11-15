import Icon from './ui/Icon'
import { isBookingClosed } from '../lib/bookingCutoff'
import { sessionDayLabel, sessionTimeRange } from '../lib/hostSessions'
import { isLowSpots, spotsLabel } from '../lib/listingSpots'
import { classDates, datesLabel } from '../lib/sessionTypes'
import { formatMonthTitle, monthCells } from '../lib/sessionCalendar'
import {
  datesInMonth,
  hasSeveralClasses,
  isBookable,
  monthDatesLabel,
  monthsWithDates,
  sessionsOfClass,
} from '../lib/classCalendar'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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
 * The booking card for a listing with classes: chips that match the cards, a
 * calendar that only lets guests tap days with dates, and that day's times.
 * It stays the same height however many weeks of dates the host adds.
 */
export function ClassDatePicker({
  listing,
  classes,
  classById,
  sessions,
  filterId,
  onFilter,
  monthKey,
  onMonth,
  dateKey,
  onDate,
  pickedId,
  onPick,
  disabled = false,
}) {
  const shown = sessionsOfClass(sessions, filterId)
  const months = monthsWithDates(shown)
  const monthIndex = months.indexOf(monthKey)
  const byDay = datesInMonth(shown, monthKey)
  const monthCount = Object.values(byDay).reduce((sum, list) => sum + list.length, 0)
  const daySessions = byDay[dateKey] ?? []
  const filterName = classById[filterId]?.name

  return (
    <div className="class-dates">
      {classes.length > 1 ? (
        <div className="class-dates__chips" role="group" aria-label="Class">
          {[{ id: null, name: 'All classes' }, ...classes].map((type) => {
            const on = (filterId ?? null) === type.id
            const count = sessionsOfClass(sessions, type.id).length
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

      {shown.length === 0 || !monthKey ? (
        <p className="class-dates__empty">
          No {filterName ?? ''} dates yet.{' '}
          {filterId ? (
            <button type="button" className="class-dates__all" onClick={() => onFilter(null)}>
              Show all classes
            </button>
          ) : null}
        </p>
      ) : (
        <>
          <div className="class-cal">
            <div className="class-cal__head">
              <button
                type="button"
                className="class-cal__nav"
                aria-label="Previous month"
                disabled={monthIndex <= 0}
                onClick={() => onMonth(months[monthIndex - 1])}
              >
                <Icon name="chevron-left" size={18} strokeWidth={2.2} />
              </button>
              <div className="class-cal__title">
                <p className="class-cal__month" aria-live="polite">
                  {formatMonthTitle(monthKey)}
                </p>
                <p className="class-cal__count">{monthDatesLabel(monthCount)}</p>
              </div>
              <button
                type="button"
                className="class-cal__nav"
                aria-label="Next month"
                disabled={monthIndex < 0 || monthIndex >= months.length - 1}
                onClick={() => onMonth(months[monthIndex + 1])}
              >
                <Icon name="chevron-right" size={18} strokeWidth={2.2} />
              </button>
            </div>
            <div className="class-cal__weekdays" aria-hidden="true">
              {WEEKDAY_LABELS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="class-cal__grid" role="group" aria-label={formatMonthTitle(monthKey)}>
              {monthCells(monthKey).map((cell, index) => {
                if (!cell) return <span key={`blank-${index}`} />
                const list = byDay[cell.dateKey]
                if (!list) {
                  return (
                    <span key={cell.dateKey} className="class-cal__day class-cal__day--off">
                      {cell.day}
                    </span>
                  )
                }
                const on = cell.dateKey === dateKey
                const several = hasSeveralClasses(list)
                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    className={`class-cal__day${on ? ' class-cal__day--on' : ''}`}
                    aria-pressed={on}
                    aria-label={`${sessionDayLabel(list[0].starts_at)}, ${list.length} ${
                      list.length === 1 ? 'time' : 'times'
                    }${several ? ', more than one class' : ''}`}
                    onClick={() => onDate(cell.dateKey)}
                  >
                    {cell.day}
                    {several ? <span className="class-cal__dot" aria-hidden="true" /> : null}
                  </button>
                )
              })}
            </div>
          </div>

          {daySessions.length > 0 ? (
            <fieldset className="class-times">
              <legend className="class-times__title">{sessionDayLabel(daySessions[0].starts_at)}</legend>
              {daySessions.map((session) => {
                const className = classById[session.type_id]?.name ?? ''
                const bookable = isBookable(session, listing.booking_cutoff_hours)
                const on = pickedId === session.id
                return (
                  <label
                    key={session.id}
                    className={`class-time${on ? ' class-time--on' : ''}${bookable ? '' : ' class-time--off'}`}
                  >
                    <input
                      type="radio"
                      name="class-time"
                      className="class-time__radio"
                      checked={on}
                      disabled={disabled || !bookable}
                      onChange={() => onPick(session.id)}
                    />
                    <span className="class-time__text">
                      <span className="class-time__range">{sessionTimeRange(session, listing)}</span>
                      {className ? <span className="class-time__class">{className}</span> : null}
                    </span>
                    <span
                      className={`class-time__spots${
                        bookable && isLowSpots(session.spots_remaining) ? ' class-time__spots--low' : ''
                      }`}
                    >
                      {isBookingClosed(session.starts_at, listing.booking_cutoff_hours)
                        ? 'Booking closed'
                        : spotsLabel(session.spots_remaining)}
                    </span>
                  </label>
                )
              })}
            </fieldset>
          ) : null}
        </>
      )}
    </div>
  )
}
