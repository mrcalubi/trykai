import { useState } from 'react'
import { Link } from 'react-router-dom'
import SessionCalendar from '../SessionCalendar'
import {
  clip,
  dateChip,
  reviewerName,
  spotsLine,
  starsText,
} from '../../lib/profileV2'
import { formatSessionTime } from '../../lib/sessionDate'
import {
  formatDayTitle,
  shiftMonth,
  singaporeDateKey,
  singaporeMonthKey,
} from '../../lib/sessionCalendar'

/* Featured review ----------------------------------------------------------- */

export function FeaturedReviewCard({ review, isOwn, reviewCount = 0 }) {
  if (!review) {
    if (!isOwn) return null
    return (
      <section className="featured-review featured-review--empty" aria-labelledby="featured-review-title">
        <h2 id="featured-review-title" className="eyebrow profile-card-head__title">
          Featured review
        </h2>
        <p className="featured-review__empty">
          Your best review shows here after your first session. You choose which one.
        </p>
      </section>
    )
  }

  const listing = review.listing_title ? ` · ${review.listing_title}` : ''
  return (
    <section className="featured-review" aria-labelledby="featured-review-title">
      <div className="profile-card-head">
        <h2 id="featured-review-title" className="eyebrow profile-card-head__title">
          {isOwn ? 'Featured review' : 'What guests say'}
        </h2>
        {isOwn ? (
          <Link to="/settings#featured-review" className="profile-text-button">
            Change
          </Link>
        ) : null}
      </div>
      <span className="featured-review__quote" aria-hidden="true">
        “
      </span>
      <blockquote className="featured-review__text">{clip(review.comment, 220) || 'Five stars.'}</blockquote>
      <p className="featured-review__by">
        {reviewerName(review)} ·{' '}
        <span aria-label={`${review.rating} out of 5 stars`}>{starsText(review.rating)}</span>
        {listing}
      </p>
      {!isOwn && reviewCount > 1 ? (
        <a href="#profile-reviews" className="profile-text-button featured-review__all">
          Read all {reviewCount} reviews
        </a>
      ) : null}
    </section>
  )
}

/* Coming up ----------------------------------------------------------------- */

export function DateChip({ iso, tone = 'blue' }) {
  const { weekday, day } = dateChip(iso)
  return (
    <span className={`date-chip date-chip--${tone}`} aria-hidden="true">
      <span className="date-chip__weekday">{weekday}</span>
      <span className="date-chip__day">{day}</span>
    </span>
  )
}

export function ComingUp({ sessions, listings }) {
  if (!sessions?.length) return null
  const byId = new Map((listings ?? []).map((listing) => [listing.id, listing]))
  return (
    <section className="profile-section" aria-labelledby="coming-up-title">
      <div className="profile-section__head">
        <h2 id="coming-up-title" className="profile-section__title">
          Coming up
        </h2>
        <span className="profile-section__aside">Next 30 days</span>
      </div>
      <ul className="coming-up">
        {sessions.map((session) => {
          const listing = byId.get(session.listing_id)
          const spots = spotsLine(session.spots_remaining)
          const low = Number(session.spots_remaining) > 0 && Number(session.spots_remaining) <= 3
          return (
            <li key={session.id}>
              <Link to={`/listings/${session.listing_id}`} className="coming-up__card">
                <DateChip iso={session.starts_at} />
                <span className="coming-up__text">
                  <span className="coming-up__title">{listing?.title ?? 'Session'}</span>
                  <span className="coming-up__meta">
                    {formatSessionTime(session.starts_at)}
                    {listing?.area ? ` · ${listing.area}` : ''}
                  </span>
                  {spots ? (
                    <span className={low ? 'coming-up__spots coming-up__spots--low' : 'coming-up__spots'}>
                      {spots}
                    </span>
                  ) : null}
                </span>
                <span className="coming-up__cta" aria-hidden="true">
                  Book →
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* Calendar card for the Hosting and Bookings tabs ---------------------------- */

const LEGENDS = {
  host: [
    ['booked', 'Booked'],
    ['open', 'Open'],
  ],
  guest: [
    ['booked', 'Upcoming'],
    ['past', 'Attended'],
  ],
}

export function TabCalendar({ marks, summary, legend = 'host', renderDay, nowMs, label }) {
  const todayKey = singaporeDateKey(nowMs)
  const todayMonth = singaporeMonthKey(nowMs)
  const months = [...new Set(Object.keys(marks).map((key) => key.slice(0, 7)))].sort()
  const firstMonth = months[0] && months[0] < todayMonth ? months[0] : todayMonth
  const lastMonth = months[months.length - 1] && months[months.length - 1] > todayMonth
    ? months[months.length - 1]
    : todayMonth
  const [monthOverride, setMonthOverride] = useState(null)
  const [selectedDateKey, setSelectedDateKey] = useState(null)
  const visibleMonth =
    monthOverride && monthOverride >= firstMonth && monthOverride <= lastMonth
      ? monthOverride
      : todayMonth

  const monthMarks = Object.fromEntries(
    Object.entries(marks).filter(([dateKey]) => dateKey.startsWith(visibleMonth)),
  )

  return (
    <section className="tab-calendar" aria-label={label}>
      {summary ? <p className="tab-calendar__summary">{summary}</p> : null}
      <SessionCalendar
        monthKey={visibleMonth}
        marksByDay={monthMarks}
        selectedDateKey={selectedDateKey}
        todayKey={todayKey}
        onSelectDate={(key) => setSelectedDateKey((current) => (current === key ? null : key))}
        onPrevMonth={() => setMonthOverride(shiftMonth(visibleMonth, -1))}
        onNextMonth={() => setMonthOverride(shiftMonth(visibleMonth, 1))}
        canGoPrev={visibleMonth > firstMonth}
        canGoNext={visibleMonth < lastMonth}
      />
      <p className="tab-calendar__legend">
        {LEGENDS[legend].map(([tone, text]) => (
          <span key={tone}>
            <span className={`session-calendar__dot session-calendar__dot--${tone}`} aria-hidden="true" />
            {text}
          </span>
        ))}
      </p>
      {selectedDateKey ? (
        <div className="tab-calendar__day">
          <p className="tab-calendar__day-title">{formatDayTitle(selectedDateKey)}</p>
          <ul className="tab-calendar__day-list">{renderDay(selectedDateKey)}</ul>
        </div>
      ) : null}
    </section>
  )
}
