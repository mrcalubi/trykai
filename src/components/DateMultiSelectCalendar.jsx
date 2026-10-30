import {
  formatDayLabel,
  formatMonthTitle,
  monthCells,
} from '../lib/sessionCalendar'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function DateMultiSelectCalendar({
  monthKey,
  selectedDateKeys,
  minDateKey,
  maxDateKey,
  todayKey,
  countsByDate = {},
  onToggleDate,
  onPrevMonth,
  onNextMonth,
  canGoPrev,
  canGoNext,
}) {
  const monthTitle = formatMonthTitle(monthKey)
  const selected = new Set(selectedDateKeys)

  return (
    <div className="session-calendar">
      <div className="session-calendar__header">
        <button
          type="button"
          className="session-calendar__nav"
          aria-label="Previous month"
          disabled={!canGoPrev}
          onClick={onPrevMonth}
        >
          ‹
        </button>
        <p className="session-calendar__month" aria-live="polite">
          {monthTitle}
        </p>
        <button
          type="button"
          className="session-calendar__nav"
          aria-label="Next month"
          disabled={!canGoNext}
          onClick={onNextMonth}
        >
          ›
        </button>
      </div>

      <div className="session-calendar__weekdays" aria-hidden="true">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      <div className="session-calendar__grid" role="group" aria-label={monthTitle}>
        {monthCells(monthKey).map((cell, index) => {
          if (!cell) {
            return <span key={`blank-${index}`} className="session-calendar__blank" />
          }

          const pickable = cell.dateKey >= minDateKey && cell.dateKey <= maxDateKey
          const isSelected = selected.has(cell.dateKey)
          const timeCount = countsByDate[cell.dateKey] ?? 0
          const classes = [
            'session-calendar__day',
            pickable && 'session-calendar__day--available',
            isSelected && 'session-calendar__day--selected',
            cell.dateKey === todayKey && 'session-calendar__day--today',
          ]
            .filter(Boolean)
            .join(' ')
          const extraLabel = [
            isSelected ? 'selected' : null,
            timeCount > 1 ? `${timeCount} times` : null,
          ]
            .filter(Boolean)
            .join(', ')

          return (
            <button
              key={cell.dateKey}
              type="button"
              className={classes}
              disabled={!pickable}
              aria-pressed={isSelected}
              aria-label={`${formatDayLabel(cell.dateKey)}${extraLabel ? `, ${extraLabel}` : ''}`}
              onClick={() => onToggleDate(cell.dateKey)}
            >
              <span className="session-calendar__day-number">{cell.day}</span>
              {timeCount > 1 ? (
                <span className="session-calendar__count" aria-hidden="true">
                  {timeCount}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
