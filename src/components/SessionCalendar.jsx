import {
  formatDayLabel,
  formatMonthTitle,
  monthCells,
  sessionCountLabel,
} from '../lib/sessionCalendar'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function SessionCalendar({
  monthKey,
  countsByDay,
  selectedDateKey,
  todayKey,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  canGoPrev,
  canGoNext,
  loading = false,
}) {
  const monthTitle = formatMonthTitle(monthKey)

  return (
    <div className="session-calendar" aria-busy={loading || undefined}>
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

          const count = countsByDay[cell.dateKey] ?? 0
          const isSelected = cell.dateKey === selectedDateKey
          const classes = [
            'session-calendar__day',
            count > 0 && 'session-calendar__day--available',
            isSelected && 'session-calendar__day--selected',
            cell.dateKey === todayKey && 'session-calendar__day--today',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              key={cell.dateKey}
              type="button"
              className={classes}
              disabled={count === 0}
              aria-pressed={isSelected}
              aria-label={`${formatDayLabel(cell.dateKey)}, ${sessionCountLabel(count)}`}
              onClick={() => onSelectDate(cell.dateKey)}
            >
              <span className="session-calendar__day-number">{cell.day}</span>
              {count > 0 && <span className="session-calendar__count">{count}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
