import { useMemo, useState } from 'react'
import { formatDuration } from '../lib/duration'
import {
  SESSION_BATCH_MAX,
  WEEKDAYS,
  formatBatchWhen,
  formatSessionDateTime,
  generateRecurringDates,
  isSelectableDateKey,
  monthKeysInWindow,
  previewSessionBatch,
  selectableDateWindow,
  singaporeMonthKey,
} from '../lib/sessionBatch'
import Button from './ui/Button'
import DateMultiSelectCalendar from './DateMultiSelectCalendar'

function toggleInList(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

export default function AddSessionsForm({
  listing,
  existingSessions,
  onCancel,
  onCreated,
}) {
  const dateWindow = selectableDateWindow()
  const monthKeys = monthKeysInWindow()
  const usesListingDuration =
    Number.isInteger(listing.duration_mins) && listing.duration_mins >= 1

  const [monthKey, setMonthKey] = useState(singaporeMonthKey(`${dateWindow.minDateKey}T12:00:00+08:00`))
  const [selectedDateKeys, setSelectedDateKeys] = useState([])
  const [weekdays, setWeekdays] = useState([])
  const [everyWeeks, setEveryWeeks] = useState(1)
  const [forWeeks, setForWeeks] = useState(2)
  const [times, setTimes] = useState([''])
  const [durationMins, setDurationMins] = useState('')
  const [spotsTotal, setSpotsTotal] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)

  const monthIndex = monthKeys.indexOf(monthKey)
  const duration = usesListingDuration ? listing.duration_mins : parseInt(durationMins, 10)

  const selectedLabel = useMemo(() => {
    if (selectedDateKeys.length === 0) return 'No dates selected'
    if (selectedDateKeys.length === 1) return '1 date selected'
    return `${selectedDateKeys.length} dates selected`
  }, [selectedDateKeys])

  function applyQuickFill(nextWeekdays, nextEvery, nextFor) {
    const dates = generateRecurringDates({
      weekdays: nextWeekdays,
      everyWeeks: nextEvery,
      forWeeks: nextFor,
    })
    setSelectedDateKeys(dates)
    if (dates[0]) {
      setMonthKey(singaporeMonthKey(`${dates[0]}T12:00:00+08:00`))
    }
  }

  function toggleWeekday(id) {
    const next = toggleInList(weekdays, id).sort((a, b) => a - b)
    setWeekdays(next)
    if (next.length > 0) applyQuickFill(next, everyWeeks, forWeeks)
  }

  function changeEveryWeeks(value) {
    const next = Number(value) === 2 ? 2 : 1
    setEveryWeeks(next)
    if (weekdays.length > 0) applyQuickFill(weekdays, next, forWeeks)
  }

  function changeForWeeks(value) {
    const next = Math.max(1, Math.min(12, parseInt(value, 10) || 1))
    setForWeeks(next)
    if (weekdays.length > 0) applyQuickFill(weekdays, everyWeeks, next)
  }

  function toggleDate(dateKey) {
    if (!isSelectableDateKey(dateKey)) return
    setPreview(null)
    setSelectedDateKeys((prev) => toggleInList(prev, dateKey).sort())
  }

  function review(event) {
    event.preventDefault()
    setError('')
    setPreview(null)

    const filledTimes = times.filter(Boolean)
    if (selectedDateKeys.length === 0 || filledTimes.length === 0) {
      setError('Please enter a date and time.')
      return
    }

    if (!usesListingDuration && (Number.isNaN(duration) || duration < 1)) {
      setError('Duration must be at least 1 minute.')
      return
    }

    const spots = parseInt(spotsTotal, 10)
    if (Number.isNaN(spots) || spots < 1) {
      setError('Spots total must be at least 1.')
      return
    }

    const next = previewSessionBatch({
      dateKeys: selectedDateKeys,
      times: filledTimes,
      durationMins: duration,
      existingSessions,
    })

    if (!next.ok) {
      setError(next.error)
      return
    }

    if (next.accepted.length === 0 && next.skipped.length === 0) {
      setError('Please enter a date and time.')
      return
    }

    if (next.accepted.length === 0 && next.skipped.every((item) => item.reason === 'in the past')) {
      setError('Choose a time in the future.')
      return
    }

    setPreview(next)
  }

  async function confirm() {
    if (!preview) return
    const spots = parseInt(spotsTotal, 10)
    setSaving(true)
    setError('')
    const result = await onCreated({
      accepted: preview.accepted,
      skipped: preview.skipped,
      spots,
      duration,
      usesListingDuration,
    })
    setSaving(false)
    if (result?.error) {
      setError(result.error)
    }
  }

  return (
    <form onSubmit={review} className="dashboard-card__form form add-sessions">
      <fieldset className="add-sessions__quickfill">
        <legend className="add-sessions__legend">Quick fill</legend>
        <p className="hint">
          Every weekday, every 1 or 2 weeks. This only pre-selects dates — you can still
          untick any.
        </p>
        <div className="add-sessions__weekdays" role="group" aria-label="Weekdays">
          {WEEKDAYS.map((day) => (
            <button
              key={day.id}
              type="button"
              className={
                weekdays.includes(day.id)
                  ? 'add-sessions__chip add-sessions__chip--on'
                  : 'add-sessions__chip'
              }
              aria-pressed={weekdays.includes(day.id)}
              onClick={() => toggleWeekday(day.id)}
            >
              {day.label}
            </button>
          ))}
        </div>
        <div className="form__row add-sessions__repeat">
          <label className="label">
            Every
            <select
              className="input"
              value={everyWeeks}
              onChange={(event) => changeEveryWeeks(event.target.value)}
            >
              <option value={1}>1 week</option>
              <option value={2}>2 weeks</option>
            </select>
          </label>
          <label className="label">
            For
            <select
              className="input"
              value={forWeeks}
              onChange={(event) => changeForWeeks(event.target.value)}
            >
              {Array.from({ length: 12 }, (_, index) => index + 1).map((weeks) => (
                <option key={weeks} value={weeks}>
                  {weeks} {weeks === 1 ? 'week' : 'weeks'}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <p className="hint">{selectedLabel}. Dates from tomorrow up to 80 days ahead.</p>

      <DateMultiSelectCalendar
        monthKey={monthKey}
        selectedDateKeys={selectedDateKeys}
        minDateKey={dateWindow.minDateKey}
        maxDateKey={dateWindow.maxDateKey}
        todayKey={dateWindow.todayKey}
        canGoPrev={monthIndex > 0}
        canGoNext={monthIndex >= 0 && monthIndex < monthKeys.length - 1}
        onToggleDate={toggleDate}
        onPrevMonth={() => setMonthKey(monthKeys[monthIndex - 1])}
        onNextMonth={() => setMonthKey(monthKeys[monthIndex + 1])}
      />

      <div className="add-sessions__times">
        {times.map((time, index) => (
          <div key={index} className="add-sessions__time-row">
            <label className="label">
              {index === 0 ? 'Time' : `Time ${index + 1}`}
              <input
                type="time"
                value={time}
                onChange={(event) => {
                  setPreview(null)
                  setTimes((prev) =>
                    prev.map((item, itemIndex) =>
                      itemIndex === index ? event.target.value : item,
                    ),
                  )
                }}
                className="input"
              />
            </label>
            {times.length > 1 ? (
              <button
                type="button"
                className="btn btn--ghost add-sessions__remove-time"
                onClick={() => {
                  setPreview(null)
                  setTimes((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                }}
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setTimes((prev) => [...prev, ''])}
        >
          + add time
        </button>
      </div>

      {usesListingDuration ? (
        <p className="hint">Each session is {formatDuration(listing.duration_mins)}.</p>
      ) : (
        <label className="label">
          Duration (mins)
          <input
            type="number"
            value={durationMins}
            onChange={(event) => setDurationMins(event.target.value)}
            min="1"
            placeholder="60"
            required
            className="input"
          />
        </label>
      )}

      <label className="label">
        Spots total
        <input
          type="number"
          value={spotsTotal}
          onChange={(event) => setSpotsTotal(event.target.value)}
          min="1"
          placeholder="4"
          required
          className="input"
        />
      </label>

      {error ? <p className="error-message">{error}</p> : null}

      {preview ? (
        <div className="add-sessions__preview" role="status">
          <p className="add-sessions__preview-title">
            This creates {preview.accepted.length}{' '}
            {preview.accepted.length === 1 ? 'session' : 'sessions'}
            {preview.skipped.length > 0
              ? `. ${preview.skipped.length} will be skipped.`
              : '.'}
          </p>
          {preview.accepted.length > 0 ? (
            <ul className="add-sessions__preview-list">
              {preview.accepted.map((item) => (
                <li key={`${item.dateKey}-${item.time}`}>
                  {formatSessionDateTime(item.startsAt)}
                </li>
              ))}
            </ul>
          ) : null}
          {preview.skipped.length > 0 ? (
            <ul className="add-sessions__preview-list add-sessions__preview-list--skipped">
              {preview.skipped.map((item) => (
                <li key={`skip-${item.dateKey}-${item.time}`}>
                  {formatBatchWhen(item.startsAt)} ({item.reason})
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="add-sessions__actions">
        {preview ? (
          <Button
            type="button"
            variant="primary"
            disabled={saving || preview.accepted.length === 0}
            onClick={confirm}
          >
            {saving ? 'Creating…' : 'Create sessions'}
          </Button>
        ) : (
          <Button type="submit" variant="primary">
            Review sessions
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p className="hint">At most {SESSION_BATCH_MAX} sessions per batch.</p>
    </form>
  )
}
