import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDuration } from '../lib/duration'
import { formatDayTitle } from '../lib/sessionCalendar'
import { formatSessionDay, formatSessionTime } from '../lib/sessionDate'
import {
  SESSION_BATCH_MAX,
  WEEKDAYS,
  formatBatchWhen,
  generateRecurringDates,
  isSelectableDateKey,
  monthKeysInWindow,
  previewSessionBatch,
  selectableDateWindow,
  singaporeMonthKey,
  timesByDateFromLists,
} from '../lib/sessionBatch'
import Button from './ui/Button'
import DateMultiSelectCalendar from './DateMultiSelectCalendar'

function toggleInList(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

function copyTimes(times) {
  return times.length > 0 ? [...times] : ['']
}

function filledTimes(times) {
  return (times ?? []).filter(Boolean)
}

function groupItemsByDate(items) {
  const groups = []
  const indexByKey = {}
  for (const item of items) {
    let index = indexByKey[item.dateKey]
    if (index === undefined) {
      index = groups.length
      indexByKey[item.dateKey] = index
      groups.push({ dateKey: item.dateKey, items: [] })
    }
    groups[index].items.push(item)
  }
  return groups
}

function TimeFields({ times, onChangeTime, onRemoveTime, onAddTime }) {
  return (
    <div className="add-sessions__times">
      {times.map((time, index) => (
        <div key={index} className="add-sessions__time-row">
          <label className="label">
            {index === 0 ? 'Time' : `Time ${index + 1}`}
            <input
              type="time"
              value={time}
              onChange={(event) => onChangeTime(index, event.target.value)}
              className="input"
            />
          </label>
          {times.length > 1 ? (
            <button
              type="button"
              className="btn btn--ghost add-sessions__remove-time"
              onClick={() => onRemoveTime(index)}
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}
      <button type="button" className="btn btn--ghost" onClick={onAddTime}>
        + add time
      </button>
    </div>
  )
}

function PreviewSessionList({ items, skipped = false }) {
  if (items.length === 0) return null

  if (skipped) {
    return (
      <ul className="add-sessions__preview-list add-sessions__preview-list--skipped">
        {items.map((item) => (
          <li key={`skip-${item.dateKey}-${item.time}`}>
            {formatBatchWhen(item.startsAt)} ({item.reason})
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="add-sessions__preview-groups">
      {groupItemsByDate(items).map((group) => (
        <div key={group.dateKey} className="add-sessions__preview-group">
          <p className="add-sessions__preview-day">{formatSessionDay(group.items[0].startsAt)}</p>
          <ul className="add-sessions__preview-list">
            {group.items.map((item) => (
              <li key={`${item.dateKey}-${item.time}`} className="add-sessions__preview-session">
                {formatSessionTime(item.startsAt)}
                {item.sharedWith?.length ? (
                  <span className="add-sessions__shared">
                    {' '}
                    · shared with {item.sharedWith.join(', ')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default function AddSessionsForm({
  listing,
  existingSessions,
  otherListings = [],
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
  const [timesByDate, setTimesByDate] = useState({})
  const [perDateTimes, setPerDateTimes] = useState(false)
  const [durationMins, setDurationMins] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [alsoListingIds, setAlsoListingIds] = useState([])
  const [focusDateKey, setFocusDateKey] = useState(null)
  const dateRowRefs = useRef({})

  const monthIndex = monthKeys.indexOf(monthKey)
  const duration = usesListingDuration ? listing.duration_mins : parseInt(durationMins, 10)

  const selectedLabel = useMemo(() => {
    if (selectedDateKeys.length === 0) return 'No dates selected'
    if (selectedDateKeys.length === 1) return '1 date selected'
    return `${selectedDateKeys.length} dates selected`
  }, [selectedDateKeys])

  const countsByDate = useMemo(() => {
    const counts = {}
    if (perDateTimes) {
      for (const key of selectedDateKeys) {
        counts[key] = filledTimes(timesByDate[key]).length
      }
    } else {
      const n = filledTimes(times).length
      for (const key of selectedDateKeys) counts[key] = n
    }
    return counts
  }, [perDateTimes, selectedDateKeys, timesByDate, times])

  useLayoutEffect(() => {
    if (!focusDateKey) return
    const row = dateRowRefs.current[focusDateKey]
    if (!row) return
    row.scrollIntoView?.({ block: 'nearest' })
    row.querySelector('input[type="time"]')?.focus()
    setFocusDateKey(null)
  }, [focusDateKey, timesByDate, selectedDateKeys])

  function applyQuickFill(nextWeekdays, nextEvery, nextFor) {
    const dates = generateRecurringDates({
      weekdays: nextWeekdays,
      everyWeeks: nextEvery,
      forWeeks: nextFor,
    })
    setSelectedDateKeys(dates)
    if (perDateTimes) {
      setTimesByDate((prev) => {
        const next = {}
        for (const key of dates) {
          next[key] = prev[key] ? [...prev[key]] : copyTimes(times)
        }
        return next
      })
    }
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
    const isSelected = selectedDateKeys.includes(dateKey)
    if (perDateTimes && isSelected) {
      setFocusDateKey(dateKey)
      return
    }
    setSelectedDateKeys((prev) => toggleInList(prev, dateKey).sort())
    if (perDateTimes && !isSelected) {
      setTimesByDate((prev) => ({ ...prev, [dateKey]: copyTimes(times) }))
      setFocusDateKey(dateKey)
    }
  }

  function unpickDate(dateKey) {
    setPreview(null)
    setSelectedDateKeys((prev) => prev.filter((key) => key !== dateKey))
    setTimesByDate((prev) => {
      const next = { ...prev }
      delete next[dateKey]
      return next
    })
  }

  function setPerDateMode(on) {
    setPreview(null)
    if (on) {
      setTimesByDate(timesByDateFromLists(selectedDateKeys, copyTimes(times)))
      setPerDateTimes(true)
      return
    }
    const firstKey = selectedDateKeys[0]
    const firstTimes = firstKey ? timesByDate[firstKey] : times
    setTimes(copyTimes(firstTimes ?? times))
    setPerDateTimes(false)
  }

  function changeSharedTime(index, value) {
    setPreview(null)
    setTimes((prev) => prev.map((item, itemIndex) => (itemIndex === index ? value : item)))
  }

  function removeSharedTime(index) {
    setPreview(null)
    setTimes((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  function addSharedTime() {
    setTimes((prev) => [...prev, ''])
  }

  function changeDateTime(dateKey, index, value) {
    setPreview(null)
    setTimesByDate((prev) => ({
      ...prev,
      [dateKey]: (prev[dateKey] ?? ['']).map((item, itemIndex) =>
        itemIndex === index ? value : item,
      ),
    }))
  }

  function removeDateTime(dateKey, index) {
    setPreview(null)
    setTimesByDate((prev) => {
      const current = prev[dateKey] ?? ['']
      const nextTimes = current.filter((_, itemIndex) => itemIndex !== index)
      return { ...prev, [dateKey]: nextTimes.length > 0 ? nextTimes : [''] }
    })
  }

  function addDateTime(dateKey) {
    setTimesByDate((prev) => ({
      ...prev,
      [dateKey]: [...(prev[dateKey] ?? ['']), ''],
    }))
  }

  function review(event) {
    event.preventDefault()
    setError('')
    setPreview(null)

    const map = perDateTimes
      ? Object.fromEntries(
          selectedDateKeys
            .map((key) => [key, filledTimes(timesByDate[key])])
            .filter(([, dateTimes]) => dateTimes.length > 0),
        )
      : timesByDateFromLists(selectedDateKeys, filledTimes(times))

    if (selectedDateKeys.length === 0 || Object.keys(map).length === 0) {
      setError('Please enter a date and time.')
      return
    }

    if (!usesListingDuration && (Number.isNaN(duration) || duration < 1)) {
      setError('Duration must be at least 1 minute.')
      return
    }

    const spots = Number(listing.max_guests)
    if (!Number.isInteger(spots) || spots < 1) {
      setError('Set spots per session in listing settings first.')
      return
    }

    const next = previewSessionBatch({
      timesByDate: map,
      durationMins: duration,
      existingSessions,
      listingId: listing.id,
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
    const spots = Number(listing.max_guests)
    setSaving(true)
    setError('')
    const result = await onCreated({
      accepted: preview.accepted,
      skipped: preview.skipped,
      spots,
      duration,
      usesListingDuration,
      alsoListingIds,
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
        countsByDate={countsByDate}
        canGoPrev={monthIndex > 0}
        canGoNext={monthIndex >= 0 && monthIndex < monthKeys.length - 1}
        onToggleDate={toggleDate}
        onPrevMonth={() => setMonthKey(monthKeys[monthIndex - 1])}
        onNextMonth={() => setMonthKey(monthKeys[monthIndex + 1])}
      />

      <label className="toggle-card add-sessions__per-date">
        <input
          type="checkbox"
          checked={perDateTimes}
          onChange={(event) => setPerDateMode(event.target.checked)}
        />
        <span className="toggle-card__copy">
          <span className="toggle-card__title">Set times per date</span>
          <span className="toggle-card__hint">
            {perDateTimes ? 'Each picked date has its own times.' : 'Same times for every date.'}
          </span>
        </span>
      </label>

      {perDateTimes ? (
        <div className="add-sessions__per-date-list">
          {selectedDateKeys.map((dateKey) => {
            const dateTimes = timesByDate[dateKey] ?? ['']
            const dateTitle = formatDayTitle(dateKey)
            return (
              <div
                key={dateKey}
                className="add-sessions__date-times"
                role="group"
                aria-label={dateTitle}
                ref={(el) => {
                  if (el) dateRowRefs.current[dateKey] = el
                  else delete dateRowRefs.current[dateKey]
                }}
              >
                <div className="add-sessions__date-heading-row">
                  <p className="add-sessions__date-heading">{dateTitle}</p>
                  <button
                    type="button"
                    className="btn btn--ghost add-sessions__remove-date"
                    onClick={() => unpickDate(dateKey)}
                  >
                    Remove date
                  </button>
                </div>
                <TimeFields
                  times={dateTimes}
                  onChangeTime={(index, value) => changeDateTime(dateKey, index, value)}
                  onRemoveTime={(index) => removeDateTime(dateKey, index)}
                  onAddTime={() => addDateTime(dateKey)}
                />
              </div>
            )
          })}
        </div>
      ) : (
        <TimeFields
          times={times}
          onChangeTime={changeSharedTime}
          onRemoveTime={removeSharedTime}
          onAddTime={addSharedTime}
        />
      )}

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

      <p className="hint">
        {Number.isInteger(Number(listing.max_guests)) && Number(listing.max_guests) >= 1
          ? `${listing.max_guests} spots per session · `
          : ''}
        <Link to={`/edit-listing/${listing.id}`}>change in listing settings</Link>
      </p>

      {otherListings.length > 0 ? (
        <fieldset className="add-sessions__also">
          <legend className="add-sessions__legend">Also offer these times on</legend>
          <p className="hint">
            The first booking takes the time. Your other listings at that time close automatically,
            and reopen if that booking is cancelled.
          </p>
          {otherListings.map((other) => (
            <label key={other.id} className="checkbox-label">
              <input
                type="checkbox"
                checked={alsoListingIds.includes(other.id)}
                onChange={() => {
                  setAlsoListingIds((ids) =>
                    ids.includes(other.id) ? ids.filter((id) => id !== other.id) : [...ids, other.id]
                  )
                  setPreview(null)
                }}
              />
              {other.title}
            </label>
          ))}
        </fieldset>
      ) : null}

      {error ? <p className="error-message">{error}</p> : null}

      {preview ? (
        <div className="add-sessions__preview" role="status">
          <p className="add-sessions__preview-title">
            This creates {preview.accepted.length}{' '}
            {preview.accepted.length === 1 ? 'session' : 'sessions'}
            {alsoListingIds.length > 0
              ? ` on each of ${alsoListingIds.length + 1} listings`
              : ''}
            {preview.skipped.length > 0
              ? `. ${preview.skipped.length} will be skipped.`
              : '.'}
          </p>
          <PreviewSessionList items={preview.accepted} />
          <PreviewSessionList items={preview.skipped} skipped />
        </div>
      ) : null}

      <div className="add-sessions__actions">
        {preview ? (
          <Button
            type="button"
            variant="primary"
            disabled={preview.accepted.length === 0}
            loading={saving}
            loadingLabel="Creating"
            onClick={confirm}
          >
            Create sessions
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
