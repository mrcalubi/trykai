import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { formatDuration } from '../lib/duration'
import { formatDayTitle } from '../lib/sessionCalendar'
import { formatSessionTime } from '../lib/sessionDate'
import {
  SESSION_BATCH_MAX,
  WEEKDAYS,
  buildSessionStarts,
  generateRecurringDates,
  isSelectableDateKey,
  monthKeysInWindow,
  previewSessionBatch,
  selectableDateWindow,
  singaporeDateTime,
  singaporeMonthKey,
} from '../lib/sessionBatch'
import { readSessionDraft, writeSessionDraft } from '../lib/sessionFormDraft'
import { supabase } from '../lib/supabase'
import {
  MAX_SESSION_TYPES,
  SESSION_TYPE_DESCRIPTION_MAX,
  SESSION_TYPE_NAME_MAX,
  classDates,
  createSessionType,
  datesLabel,
} from '../lib/sessionTypes'
import Button from './ui/Button'
import Icon from './ui/Icon'
import DateMultiSelectCalendar from './DateMultiSelectCalendar'

/** Start times most hosts reach for. Any other time the host adds joins them. */
const PRESET_TIMES = ['09:00', '10:00', '14:00', '19:30']
const WEEK_CHOICES = [2, 4, 8]
const COLLAPSED_ROWS = 5
const SPOTS_ERROR = 'spots'

function toggleInList(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

function filledTimes(times) {
  return (times ?? []).filter(Boolean)
}

function copyTimes(times) {
  const filled = filledTimes(times)
  return filled.length > 0 ? [...filled] : ['']
}

/** "Sat 21 Nov". */
function dayLabel(dateKey) {
  return formatDayTitle(dateKey).replace(',', '')
}

/** "4 Feb". */
function shortDate(dateKey) {
  return formatDayTitle(dateKey).split(', ').pop()
}

/** "10:00 am" for an `HH:MM` start. */
function clockLabel(time) {
  return formatSessionTime(singaporeDateTime('2026-01-05', time))
}

function slotKey(dateKey, time) {
  return `${dateKey} ${time}`
}

function sessionsLabel(count) {
  return `${count} ${count === 1 ? 'session' : 'sessions'}`
}

function missingTimesMessage(dateKeys) {
  const labels = dateKeys.map(dayLabel)
  const remove = labels.length === 1 ? 'that date' : 'those dates'
  return `Add a time for ${labels.join(', ')}, or remove ${remove}.`
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
      <button type="button" className="add-dates__text-btn" onClick={onAddTime}>
        + Add a time
      </button>
    </div>
  )
}

/**
 * Add dates: which days, what time, then the sessions it makes, in one sheet.
 * Full screen on a phone, a panel on a computer. One way out (×) and one main
 * button, which names how many sessions it adds as the host picks.
 */
export default function AddSessionsForm({
  listing,
  existingSessions,
  otherListings = [],
  sessionTypes = [],
  classNameById = {},
  classesAvailable = false,
  initialTypeId = null,
  onTypeCreated,
  subtitle = '',
  onCancel,
  onCreated,
}) {
  const titleId = useId()
  const dateWindow = selectableDateWindow()
  const monthKeys = monthKeysInWindow()
  const usesListingDuration =
    Number.isInteger(listing.duration_mins) && listing.duration_mins >= 1

  // A host who leaves (e.g. to change spots) comes back to the same picks.
  const [restored] = useState(() => readSessionDraft(listing.id))
  const [mode, setMode] = useState(() => {
    if (restored?.mode) return restored.mode
    if (restored && restored.weekdays.length === 0 && restored.selectedDateKeys.length > 0) {
      return 'dates'
    }
    return 'weekly'
  })
  const [monthKey, setMonthKey] = useState(() =>
    singaporeMonthKey(
      `${restored?.selectedDateKeys[0] ?? dateWindow.minDateKey}T12:00:00+08:00`,
    ),
  )
  const [selectedDateKeys, setSelectedDateKeys] = useState(restored?.selectedDateKeys ?? [])
  const [weekdays, setWeekdays] = useState(restored?.weekdays ?? [])
  const [forWeeks, setForWeeks] = useState(restored?.forWeeks ?? 4)
  const [times, setTimes] = useState(() => filledTimes(restored?.times).sort())
  const [timesByDate, setTimesByDate] = useState(restored?.timesByDate ?? {})
  const [perDateTimes, setPerDateTimes] = useState(restored?.perDateTimes ?? false)
  const [removedSlots, setRemovedSlots] = useState(restored?.removedSlots ?? [])
  const [durationMins, setDurationMins] = useState(restored?.durationMins ?? '')
  const [otherTimeOpen, setOtherTimeOpen] = useState(false)
  const [otherTime, setOtherTime] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [alsoListingIds, setAlsoListingIds] = useState(() => {
    const otherIds = new Set(otherListings.map((other) => other.id))
    return (restored?.alsoListingIds ?? []).filter((id) => otherIds.has(id))
  })
  const [focusDateKey, setFocusDateKey] = useState(null)
  // Session types (00056): one type for the whole batch. One type is picked
  // for the host; with more, they choose.
  const [typeId, setTypeId] = useState(() => {
    if (initialTypeId && sessionTypes.some((type) => type.id === initialTypeId)) return initialTypeId
    return sessionTypes.length === 1 ? sessionTypes[0].id : null
  })
  const [newClassOpen, setNewClassOpen] = useState(false)
  const [newClassName, setNewClassName] = useState('')
  const [newClassDescription, setNewClassDescription] = useState('')
  const [newClassError, setNewClassError] = useState('')
  const [newClassSaving, setNewClassSaving] = useState(false)
  const chosenType = sessionTypes.find((type) => type.id === typeId) ?? null
  const dateRowRefs = useRef({})
  const closeRef = useRef(null)
  const listRef = useRef(null)
  const addingRef = useRef(null)
  const onCancelRef = useRef(onCancel)
  const focusRemoveRef = useRef(null)

  const monthIndex = monthKeys.indexOf(monthKey)

  useEffect(() => {
    onCancelRef.current = onCancel
  })

  // Once per opening: focus Close, keep the page still under the sheet, let
  // Escape close it, and hand focus back to whatever opened it.
  useEffect(() => {
    const opener = document.activeElement
    closeRef.current?.focus()
    document.body.classList.add('add-dates-open')
    function onKey(event) {
      if (event.key === 'Escape') onCancelRef.current?.()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('add-dates-open')
      document.removeEventListener('keydown', onKey)
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus()
    }
  }, [])

  useEffect(() => {
    writeSessionDraft(listing.id, {
      mode,
      selectedDateKeys,
      weekdays,
      everyWeeks: 1,
      forWeeks,
      times,
      timesByDate,
      perDateTimes,
      removedSlots,
      durationMins,
      alsoListingIds,
    })
  }, [
    listing.id,
    mode,
    selectedDateKeys,
    weekdays,
    forWeeks,
    times,
    timesByDate,
    perDateTimes,
    removedSlots,
    durationMins,
    alsoListingIds,
  ])

  const parsedDuration = parseInt(durationMins, 10)
  const duration = usesListingDuration ? listing.duration_mins : parsedDuration
  const durationOk = usesListingDuration || (Number.isInteger(parsedDuration) && parsedDuration >= 1)
  const spots = Number(listing.max_guests)
  const spotsOk = Number.isInteger(spots) && spots >= 1

  const timesMap = useMemo(() => {
    const removed = new Set(removedSlots)
    const map = {}
    for (const dateKey of selectedDateKeys) {
      const list = perDateTimes ? filledTimes(timesByDate[dateKey]) : times
      const kept = [...new Set(list)].filter((time) => !removed.has(slotKey(dateKey, time))).sort()
      if (kept.length > 0) map[dateKey] = kept
    }
    return map
  }, [selectedDateKeys, perDateTimes, timesByDate, times, removedSlots])

  const startCount = useMemo(() => buildSessionStarts(timesMap).length, [timesMap])
  const overLimit = startCount > SESSION_BATCH_MAX

  const preview = useMemo(() => {
    if (!durationOk || overLimit) return null
    return previewSessionBatch({
      timesByDate: timesMap,
      durationMins: duration,
      existingSessions,
      listingId: listing.id,
      typeId: chosenType?.id ?? null,
      classNameById,
    })
  }, [durationOk, overLimit, timesMap, duration, existingSessions, listing.id, chosenType, classNameById])

  const accepted = useMemo(
    () => [...(preview?.accepted ?? [])].sort((a, b) => a.startsAt - b.startsAt),
    [preview],
  )
  const skipped = preview?.skipped ?? []
  const sessionCount = overLimit ? startCount : accepted.length
  // Added and skipped dates in one list, so a skipped date shows where it falls.
  const rows = [
    ...accepted.map((item) => ({ item, skipped: false })),
    ...skipped.map((item) => ({ item, skipped: true })),
  ].sort((a, b) => a.item.startsAt - b.item.startsAt)
  const visibleRows = showAll || rows.length <= COLLAPSED_ROWS + 1 ? rows : rows.slice(0, COLLAPSED_ROWS)
  const clashSkips = skipped.filter((item) => item.reason !== 'in the past').length
  const classClash = skipped.some((item) => item.otherClass)
  const chipTimes = [...new Set([...PRESET_TIMES, ...times])].sort()

  useLayoutEffect(() => {
    if (!focusDateKey) return
    const row = dateRowRefs.current[focusDateKey]
    if (!row) return
    row.scrollIntoView?.({ block: 'nearest' })
    row.querySelector('input[type="time"]')?.focus()
    setFocusDateKey(null)
  }, [focusDateKey, timesByDate, selectedDateKeys])

  // After an × the row is gone: focus the next one, or the list's heading.
  useLayoutEffect(() => {
    const index = focusRemoveRef.current
    if (index === null) return
    focusRemoveRef.current = null
    const buttons = listRef.current?.querySelectorAll('.add-dates__remove') ?? []
    const next = buttons[Math.min(index, buttons.length - 1)]
    if (next) next.focus()
    else addingRef.current?.focus()
  }, [accepted])

  function edited() {
    setError('')
  }

  function applyWeekly(nextWeekdays, nextWeeks) {
    const dates = generateRecurringDates({ weekdays: nextWeekdays, everyWeeks: 1, forWeeks: nextWeeks })
    setSelectedDateKeys(dates)
    setRemovedSlots([])
    if (perDateTimes) {
      setTimesByDate((prev) => {
        const next = {}
        for (const key of dates) {
          next[key] = prev[key] ? [...prev[key]] : copyTimes(times)
        }
        return next
      })
    }
    if (dates[0]) setMonthKey(singaporeMonthKey(`${dates[0]}T12:00:00+08:00`))
  }

  function toggleWeekday(id) {
    edited()
    const next = toggleInList(weekdays, id).sort((a, b) => a - b)
    setWeekdays(next)
    applyWeekly(next, forWeeks)
  }

  function changeForWeeks(weeks) {
    edited()
    setForWeeks(weeks)
    if (weekdays.length > 0) applyWeekly(weekdays, weeks)
  }

  function toggleDate(dateKey) {
    if (!isSelectableDateKey(dateKey)) return
    edited()
    const isSelected = selectedDateKeys.includes(dateKey)
    if (perDateTimes && isSelected) {
      setFocusDateKey(dateKey)
      return
    }
    if (isSelected) {
      unpickDate(dateKey)
      return
    }
    setSelectedDateKeys((prev) => [...prev, dateKey].sort())
    setRemovedSlots((prev) => prev.filter((slot) => !slot.startsWith(`${dateKey} `)))
    if (perDateTimes) {
      setTimesByDate((prev) => ({ ...prev, [dateKey]: copyTimes(times) }))
      setFocusDateKey(dateKey)
    }
  }

  function unpickDate(dateKey) {
    edited()
    setSelectedDateKeys((prev) => prev.filter((key) => key !== dateKey))
    setRemovedSlots((prev) => prev.filter((slot) => !slot.startsWith(`${dateKey} `)))
    setTimesByDate((prev) => {
      const next = { ...prev }
      delete next[dateKey]
      return next
    })
  }

  function removeSession(item, index) {
    edited()
    focusRemoveRef.current = index
    const left = (timesMap[item.dateKey] ?? []).filter((time) => time !== item.time)
    if (left.length === 0) {
      unpickDate(item.dateKey)
      return
    }
    if (perDateTimes) {
      setTimesByDate((prev) => ({
        ...prev,
        [item.dateKey]: filledTimes(prev[item.dateKey]).filter((time) => time !== item.time),
      }))
    } else {
      setRemovedSlots((prev) => [...prev, slotKey(item.dateKey, item.time)])
    }
  }

  function toggleTime(time) {
    edited()
    if (times.includes(time)) {
      setTimes((prev) => prev.filter((item) => item !== time))
      return
    }
    setTimes((prev) => [...prev, time].sort())
    setRemovedSlots((prev) => prev.filter((slot) => !slot.endsWith(` ${time}`)))
  }

  function addOtherTime() {
    if (!/^\d{2}:\d{2}$/.test(otherTime)) return
    if (!times.includes(otherTime)) toggleTime(otherTime)
    setOtherTime('')
    setOtherTimeOpen(false)
  }

  function setPerDateMode(on) {
    edited()
    if (on) {
      setTimesByDate((prev) => {
        const next = { ...prev }
        for (const key of selectedDateKeys) {
          if (filledTimes(next[key]).length === 0) next[key] = copyTimes(timesMap[key] ?? times)
        }
        return next
      })
      setPerDateTimes(true)
      return
    }
    const firstKey = selectedDateKeys[0]
    const firstTimes = firstKey ? filledTimes(timesByDate[firstKey]) : []
    setTimes((firstTimes.length > 0 ? [...new Set(firstTimes)] : times).sort())
    setRemovedSlots([])
    setPerDateTimes(false)
  }

  function changeDateTime(dateKey, index, value) {
    edited()
    setTimesByDate((prev) => ({
      ...prev,
      [dateKey]: (prev[dateKey] ?? ['']).map((item, itemIndex) => (itemIndex === index ? value : item)),
    }))
  }

  function removeDateTime(dateKey, index) {
    edited()
    setTimesByDate((prev) => {
      const nextTimes = (prev[dateKey] ?? ['']).filter((_, itemIndex) => itemIndex !== index)
      return { ...prev, [dateKey]: nextTimes.length > 0 ? nextTimes : [''] }
    })
  }

  function addDateTime(dateKey) {
    setTimesByDate((prev) => ({ ...prev, [dateKey]: [...(prev[dateKey] ?? ['']), ''] }))
  }

  async function addClass(event) {
    event?.preventDefault?.()
    const name = newClassName.trim()
    if (!name) {
      setNewClassError('Give this class a name.')
      return
    }
    setNewClassSaving(true)
    setNewClassError('')
    const { row, error: createError } = await createSessionType(
      supabase,
      listing.id,
      { name, description: newClassDescription },
      sessionTypes.length,
    )
    setNewClassSaving(false)
    if (createError || !row) {
      setNewClassError("We couldn't add that class. Try again.")
      return
    }
    onTypeCreated?.(row)
    setTypeId(row.id)
    setNewClassOpen(false)
    setNewClassName('')
    setNewClassDescription('')
    edited()
  }

  async function submit() {
    setError('')
    if (sessionTypes.length > 0 && !chosenType) {
      setError('Pick a class for these dates.')
      return
    }
    if (perDateTimes) {
      const missing = selectedDateKeys.filter((key) => filledTimes(timesByDate[key]).length === 0)
      if (missing.length > 0) {
        setError(missingTimesMessage(missing))
        return
      }
    }
    if (!durationOk) {
      setError('Add how long each session runs.')
      return
    }
    if (!spotsOk) {
      setError(SPOTS_ERROR)
      return
    }
    if (overLimit) {
      setError(`You can add up to ${SESSION_BATCH_MAX} sessions at a time. Pick fewer days or weeks.`)
      return
    }
    if (!preview || accepted.length === 0) {
      const allPast = skipped.length > 0 && skipped.every((item) => item.reason === 'in the past')
      if (allPast) setError('Choose a time in the future.')
      else if (skipped.length > 0) setError('None of these can be added. You can see why under You’re adding.')
      else setError('Pick at least one day and a start time.')
      return
    }

    setSaving(true)
    const result = await onCreated({
      accepted,
      skipped,
      spots,
      duration,
      usesListingDuration,
      alsoListingIds,
      typeId: chosenType?.id ?? null,
    })
    setSaving(false)
    if (result?.error) setError(result.error)
  }

  function sessionEnd(item) {
    return new Date(item.startsAt.getTime() + duration * 60_000)
  }

  let barNote = 'Pick days and a start time'
  if (overLimit) barNote = `Up to ${SESSION_BATCH_MAX} at a time`
  else if (clashSkips > 0) {
    barNote = `${datesLabel(clashSkips)} skipped for clashes`
  }
  else if (sessionCount > 0 && spotsOk) {
    const spotsTotal = sessionCount * spots
    barNote = `${spotsTotal} ${spotsTotal === 1 ? 'spot' : 'spots'} for guests to book`
    if (alsoListingIds.length > 0) barNote += ` · on ${alsoListingIds.length + 1} listings`
  } else if (sessionCount > 0) barNote = ''

  const oneOther = otherListings.length === 1

  return createPortal(
    <div
      className="add-dates"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <form
        className="add-dates__panel add-sessions"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="add-dates__head">
          <button
            ref={closeRef}
            type="button"
            className="add-dates__close"
            aria-label="Close"
            onClick={onCancel}
          >
            <Icon name="close" size={22} />
          </button>
          <div className="add-dates__heading">
            <h2 id={titleId} className="add-dates__title">
              Add dates
            </h2>
            {subtitle ? <p className="add-dates__sub">{subtitle}</p> : null}
          </div>
        </div>

        <div className="add-dates__body">
          {sessionTypes.length > 0 ? (
            <fieldset className="add-dates__section add-dates__classes">
              <legend className="add-dates__h add-dates__legend">
                Which class?
                <span className="add-dates__count" aria-hidden="true">
                  {sessionTypes.length} of {MAX_SESSION_TYPES}
                </span>
              </legend>
              <div className="add-dates__class-list">
                {sessionTypes.map((type) => {
                  const on = typeId === type.id
                  const { count } = classDates(
                    existingSessions.filter((session) => session.listing_id === listing.id),
                    type.id,
                  )
                  const detail = [type.description, datesLabel(count)].filter(Boolean).join(' · ')
                  return (
                    <label key={type.id} className={`add-dates__class${on ? ' add-dates__class--on' : ''}`}>
                      <input
                        type="radio"
                        name={`session-type-${listing.id}`}
                        checked={on}
                        aria-labelledby={`${titleId}-class-${type.id}`}
                        aria-describedby={`${titleId}-class-${type.id}-detail`}
                        onChange={() => {
                          setTypeId(type.id)
                          edited()
                        }}
                        className="visually-hidden"
                      />
                      {type.photoUrl ? (
                        <img src={type.photoUrl} alt="" className="add-dates__class-thumb" />
                      ) : (
                        <span className="add-dates__class-thumb add-dates__class-thumb--empty" aria-hidden="true">
                          <Icon name="layers" size={20} />
                        </span>
                      )}
                      <span className="add-dates__class-text">
                        <span id={`${titleId}-class-${type.id}`} className="add-dates__class-name">
                          {type.name}
                        </span>
                        <span id={`${titleId}-class-${type.id}-detail`} className="add-dates__class-detail">
                          {detail}
                        </span>
                      </span>
                      <span className="add-dates__class-mark" aria-hidden="true">
                        {on ? <Icon name="check" size={14} strokeWidth={3} /> : null}
                      </span>
                    </label>
                  )
                })}
              </div>
              {newClassOpen ? (
                <div className="add-dates__new-class" role="group" aria-label="New class">
                  <label className="label">
                    Class name
                    <input
                      type="text"
                      className="input"
                      value={newClassName}
                      maxLength={SESSION_TYPE_NAME_MAX}
                      autoFocus
                      onChange={(event) => setNewClassName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') addClass(event)
                      }}
                    />
                  </label>
                  <label className="label">
                    Short description · optional
                    <input
                      type="text"
                      className="input"
                      value={newClassDescription}
                      maxLength={SESSION_TYPE_DESCRIPTION_MAX}
                      onChange={(event) => setNewClassDescription(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') addClass(event)
                      }}
                    />
                  </label>
                  {newClassError ? <p className="error-message">{newClassError}</p> : null}
                  <div className="add-dates__new-class-actions">
                    <Button
                      type="button"
                      variant="primary"
                      loading={newClassSaving}
                      loadingLabel="Adding"
                      onClick={addClass}
                    >
                      Add class
                    </Button>
                    <button
                      type="button"
                      className="add-dates__text-btn"
                      onClick={() => {
                        setNewClassOpen(false)
                        setNewClassError('')
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="add-dates__hint">You can add a photo later in Edit listing.</p>
                </div>
              ) : sessionTypes.length < MAX_SESSION_TYPES ? (
                <button type="button" className="add-dates__new-class-btn" onClick={() => setNewClassOpen(true)}>
                  <Icon name="plus" size={16} strokeWidth={2.4} />
                  New class
                </button>
              ) : null}
              <p className="add-dates__hint">
                Every date in this batch is this class, and that can&apos;t change later.
                {sessionTypes.length > 1
                  ? ` For your other ${sessionTypes.length === 2 ? 'class' : 'classes'}, add a second batch.`
                  : ''}
              </p>
            </fieldset>
          ) : classesAvailable ? (
            <p className="add-dates__classes-none">
              <Icon name="layers" size={18} />
              <span>Teach more than one class here?</span>
              <Link to={`/edit-listing/${listing.id}?section=types`}>Set up classes</Link>
            </p>
          ) : null}

          <section className="add-dates__section" aria-labelledby={`${titleId}-days`}>
            <h3 id={`${titleId}-days`} className="add-dates__h">
              Which days?
            </h3>
            <div className="add-dates__switch" role="group" aria-labelledby={`${titleId}-days`}>
              {[
                ['weekly', 'Every week'],
                ['dates', 'Pick dates'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`add-dates__seg${mode === id ? ' add-dates__seg--on' : ''}`}
                  aria-pressed={mode === id}
                  onClick={() => setMode(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === 'weekly' ? (
              <>
                <div className="add-dates__days" role="group" aria-label="Days of the week">
                  {WEEKDAYS.map((day) => (
                    <button
                      key={day.id}
                      type="button"
                      className={`add-dates__day${weekdays.includes(day.id) ? ' add-dates__day--on' : ''}`}
                      aria-pressed={weekdays.includes(day.id)}
                      onClick={() => toggleWeekday(day.id)}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
                <div className="add-dates__weeks">
                  <span id={`${titleId}-weeks`} className="add-dates__weeks-label">
                    For the next
                  </span>
                  <div className="add-dates__pills" role="group" aria-labelledby={`${titleId}-weeks`}>
                    {WEEK_CHOICES.map((weeks) => (
                      <button
                        key={weeks}
                        type="button"
                        className={`add-dates__pill${forWeeks === weeks ? ' add-dates__pill--on' : ''}`}
                        aria-pressed={forWeeks === weeks}
                        aria-label={`${weeks} weeks`}
                        onClick={() => changeForWeeks(weeks)}
                      >
                        {weeks} wks
                      </button>
                    ))}
                  </div>
                </div>
                <p className="add-dates__hint">
                  Starting {dayLabel(dateWindow.minDateKey)}. You can remove single dates below.
                </p>
              </>
            ) : (
              <>
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
                <p className="add-dates__hint">
                  Tap dates to add them. Bookable from tomorrow to {shortDate(dateWindow.maxDateKey)}.
                </p>
              </>
            )}
          </section>

          <section className="add-dates__section" aria-labelledby={`${titleId}-time`}>
            <h3 id={`${titleId}-time`} className="add-dates__h">
              What time?
            </h3>
            {usesListingDuration ? (
              <p className="add-dates__hint add-dates__hint--top">
                Each session runs {formatDuration(listing.duration_mins)}. Pick one or more start
                times.
              </p>
            ) : (
              <>
                <label className="label add-dates__duration">
                  How long is each session? (mins)
                  <input
                    type="number"
                    inputMode="numeric"
                    value={durationMins}
                    onChange={(event) => {
                      setDurationMins(event.target.value)
                      edited()
                    }}
                    min="1"
                    placeholder="60"
                    className="input"
                  />
                </label>
                <p className="add-dates__hint add-dates__hint--top">Pick one or more start times.</p>
              </>
            )}

            {perDateTimes ? (
              <div className="add-sessions__per-date-list">
                {selectedDateKeys.length === 0 ? (
                  <p className="add-dates__hint">Pick some days first.</p>
                ) : null}
                {selectedDateKeys.map((dateKey) => {
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
                          className="add-dates__text-btn"
                          onClick={() => unpickDate(dateKey)}
                        >
                          Remove date
                        </button>
                      </div>
                      <TimeFields
                        times={timesByDate[dateKey] ?? ['']}
                        onChangeTime={(index, value) => changeDateTime(dateKey, index, value)}
                        onRemoveTime={(index) => removeDateTime(dateKey, index)}
                        onAddTime={() => addDateTime(dateKey)}
                      />
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="add-dates__times" role="group" aria-label="Start times">
                {chipTimes.map((time) => {
                  const on = times.includes(time)
                  return (
                    <button
                      key={time}
                      type="button"
                      className={`add-dates__time${on ? ' add-dates__time--on' : ''}`}
                      aria-pressed={on}
                      onClick={() => toggleTime(time)}
                    >
                      {clockLabel(time)}
                      {on ? <Icon name="check" size={16} strokeWidth={2.4} /> : null}
                    </button>
                  )
                })}
                {otherTimeOpen ? (
                  <span className="add-dates__other">
                    <input
                      type="time"
                      className="input add-dates__other-input"
                      aria-label="Other start time"
                      value={otherTime}
                      autoFocus
                      onChange={(event) => setOtherTime(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          addOtherTime()
                        }
                        if (event.key === 'Escape') {
                          event.stopPropagation()
                          setOtherTimeOpen(false)
                        }
                      }}
                    />
                    <button type="button" className="add-dates__other-add" onClick={addOtherTime}>
                      Add
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="add-dates__time add-dates__time--other"
                    onClick={() => setOtherTimeOpen(true)}
                  >
                    <Icon name="plus" size={16} strokeWidth={2.2} />
                    Other time
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              className="add-dates__link"
              onClick={() => setPerDateMode(!perDateTimes)}
            >
              {perDateTimes ? 'Use the same times every day' : 'Different times on different days?'}
            </button>
          </section>

          {otherListings.length > 0 ? (
            <div className="add-dates__also">
              {oneOther ? null : <p className="add-dates__also-title">Also offer these times on</p>}
              {otherListings.map((other) => (
                <label key={other.id} className="add-dates__also-row">
                  <span className="add-dates__also-name">
                    {oneOther ? `Also offer these times on ${other.title}` : other.title}
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    className="switch"
                    checked={alsoListingIds.includes(other.id)}
                    onChange={() => {
                      setAlsoListingIds((ids) =>
                        ids.includes(other.id) ? ids.filter((id) => id !== other.id) : [...ids, other.id],
                      )
                      edited()
                    }}
                  />
                </label>
              ))}
              <p className="add-dates__hint">
                {oneOther
                  ? 'Whichever gets booked first takes the slot. The other closes, and reopens if that booking is cancelled.'
                  : 'Whichever gets booked first takes the slot. The others close, and reopen if that booking is cancelled.'}
              </p>
            </div>
          ) : null}

          <section className="add-dates__section" aria-labelledby={`${titleId}-adding`}>
            <div className="add-dates__adding-head">
              <h3
                id={`${titleId}-adding`}
                ref={addingRef}
                tabIndex={-1}
                className="add-dates__h"
              >
                {chosenType ? `Adding · ${chosenType.name}` : 'You’re adding'}
              </h3>
              {sessionCount > 0 ? (
                <span className="add-dates__count">{sessionsLabel(sessionCount)}</span>
              ) : null}
            </div>

            {overLimit ? (
              <p className="add-dates__empty add-dates__empty--warn" role="status">
                That&apos;s {startCount} sessions. You can add up to {SESSION_BATCH_MAX} at a time, so
                pick fewer days or weeks.
              </p>
            ) : !durationOk ? (
              <p className="add-dates__empty">Add how long each session runs to see them here.</p>
            ) : rows.length === 0 ? (
              <p className="add-dates__empty">Pick days and a start time to see your sessions here.</p>
            ) : (
              <ul className="add-dates__list" ref={listRef}>
                {(() => {
                  let removeIndex = -1
                  return visibleRows.map(({ item, skipped: isSkipped }) => {
                    const day = dayLabel(item.dateKey)
                    const start = formatSessionTime(item.startsAt)
                    const range = `${start} – ${formatSessionTime(sessionEnd(item))}`
                    if (isSkipped) {
                      return (
                        <li key={`skip-${item.dateKey}-${item.time}`} className="add-dates__row add-dates__row--skipped">
                          <span className="add-dates__row-day">{day}</span>
                          <span className="add-dates__row-time">{range}</span>
                          <span className="add-dates__row-note add-dates__row-note--skip">
                            Skipped: {item.reason}
                          </span>
                        </li>
                      )
                    }
                    removeIndex += 1
                    const index = removeIndex
                    return (
                      <li key={`${item.dateKey}-${item.time}`} className="add-dates__row">
                        <span className="add-dates__row-day">{day}</span>
                        <span className="add-dates__row-time">{range}</span>
                        <button
                          type="button"
                          className="add-dates__remove"
                          aria-label={`Remove ${day}, ${start}`}
                          onClick={() => removeSession(item, index)}
                        >
                          <Icon name="close" size={18} />
                        </button>
                        {item.mergeInto ? (
                          <span className="add-dates__row-note">
                            Already on: adds {spotsOk ? `${spots} more ${spots === 1 ? 'spot' : 'spots'}` : 'more spots'}
                          </span>
                        ) : null}
                        {item.sharedWith?.length ? (
                          <span className="add-dates__row-note">
                            Shared with {item.sharedWith.join(', ')}
                          </span>
                        ) : null}
                      </li>
                    )
                  })
                })()}
                {rows.length > COLLAPSED_ROWS + 1 ? (
                  <li className="add-dates__row add-dates__row--more">
                    <button
                      type="button"
                      className="add-dates__link"
                      onClick={() => setShowAll((value) => !value)}
                    >
                      {showAll ? 'Show fewer' : `See all ${rows.length}`}
                    </button>
                  </li>
                ) : null}
              </ul>
            )}

            {classClash && !overLimit ? (
              <p className="add-dates__hint">
                You can only teach one class at a time, so dates that overlap another class are skipped.
              </p>
            ) : null}
          </section>
        </div>

        <div className="add-dates__bar">
          {error ? (
            <p className="error-message add-dates__error" role="alert">
              {error === SPOTS_ERROR ? (
                <>
                  Set spots per session in listing settings first.{' '}
                  <Link to={`/edit-listing/${listing.id}?section=price`}>Change spots</Link>
                </>
              ) : (
                error
              )}
            </p>
          ) : null}
          <div className="add-dates__bar-row">
            <div className="add-dates__total" aria-live="polite">
              <p className="add-dates__total-count">
                {sessionCount > 0 ? sessionsLabel(sessionCount) : 'No sessions yet'}
              </p>
              {barNote ? (
                <p className={`add-dates__total-note${overLimit ? ' add-dates__total-note--warn' : ''}`}>
                  {barNote}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="primary"
              className="add-dates__submit"
              loading={saving}
              loadingLabel="Adding"
              onClick={submit}
            >
              {sessionCount > 0 && !overLimit ? `Add ${sessionsLabel(sessionCount)}` : 'Add sessions'}
            </Button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  )
}
