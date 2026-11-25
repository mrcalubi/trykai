import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import Button from './ui/Button'
import Icon from './ui/Icon'
import OverflowMenu from './ui/OverflowMenu'
import { SpotBar } from './HostSessionParts'
import { sessionGuestsLine } from '../lib/companions'
import { heldSessionLine, isHeld } from '../lib/sharedAvailability'
import {
  bookedSeats,
  confirmedBookings,
  hasBlockingBookings,
  sessionCapacity,
  sessionDayLabel,
  sessionTimeRange,
  spotsLabel,
  upcomingDatesSummary,
} from '../lib/hostSessions'

const COLLAPSED_ROWS = 5

function rowStatus(session, listing, heldByTitles) {
  const capacity = sessionCapacity(session, listing)
  const booked = bookedSeats(session)
  if (confirmedBookings(session).length > 0) {
    return { kind: 'booked', label: `${booked} of ${capacity} booked`, booked, capacity }
  }
  if (isHeld(session)) {
    return {
      kind: 'held',
      label: 'Taken',
      booked: 0,
      capacity,
      note: heldSessionLine(heldByTitles[session.held_by_session_id]),
    }
  }
  return { kind: 'open', label: `Open · ${spotsLabel(capacity)}`, booked: 0, capacity }
}

/**
 * A listing's upcoming dates: booked ones link to their session page, open
 * ones have a ⋯ menu (Change time, Remove). Select picks open dates to remove
 * together. Removing waits a few seconds so it can be undone.
 */
export default function HostListingDates({
  listing,
  sessions: unsorted,
  typeNameById = {},
  locationNameById = {},
  heldByTitles = {},
  guestsBySession = {},
  sessionHref,
  expanded,
  onExpand,
  onCollapse,
  selecting,
  selectedIds,
  onToggleSelecting,
  onToggleSelect,
  onRemove,
  undo,
  onAddDates,
  editingSessionId,
  editDate,
  editTime,
  editError,
  editLoading,
  onAskEdit,
  onEditDate,
  onEditTime,
  onSaveEdit,
  onCancelEdit,
}) {
  const undoRef = useRef(null)
  const sessions = [...unsorted].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
  const booked = sessions.filter((session) => confirmedBookings(session).length > 0)
  const held = sessions.filter((session) => !booked.includes(session) && isHeld(session))
  const open = sessions.length - booked.length - held.length
  const removable = sessions.filter((session) => confirmedBookings(session).length === 0)
  const selectedHere = removable.filter((session) => selectedIds.has(session.id))
  const shown = expanded || sessions.length <= COLLAPSED_ROWS + 1 ? sessions : sessions.slice(0, COLLAPSED_ROWS)
  const undoLabel = undo?.label

  useEffect(() => {
    if (undoLabel) undoRef.current?.focus()
  }, [undoLabel])

  return (
    <section className="host-dates" aria-label={`Upcoming dates for ${listing.title}`}>
      <div className="host-dates__head">
        <p className="host-dates__title">
          Upcoming dates
          <span className="host-dates__summary">
            {upcomingDatesSummary({ booked: booked.length, open, held: held.length })}
          </span>
        </p>
        <div className="host-dates__actions">
          {removable.length > 0 ? (
            <button
              type="button"
              className="host-dates__select"
              aria-pressed={selecting}
              onClick={onToggleSelecting}
            >
              {selecting ? 'Done' : 'Select'}
            </button>
          ) : null}
          <Button
            className="host-dates__add"
            variant="primary"
            aria-haspopup="dialog"
            onClick={onAddDates}
          >
            <Icon name="plus" size={16} strokeWidth={2.4} />
            Add dates
          </Button>
        </div>
      </div>

      {sessions.length > 0 ? (
        <ul className="host-dates__list">
          {shown.map((session) => {
            const status = rowStatus(session, listing, heldByTitles)
            const day = sessionDayLabel(session.starts_at)
            const time = sessionTimeRange(session, listing)
            const typeName = typeNameById[session.type_id] ?? ''
            const placeName = locationNameById[session.location_id] ?? ''
            const editing = editingSessionId === session.id
            const canSelect = selecting && status.kind !== 'booked'
            const names = status.kind === 'booked' ? sessionGuestsLine(guestsBySession[session.id]) : ''
            const menuItems = [
              ...(hasBlockingBookings(session)
                ? []
                : [{ label: 'Change time', onSelect: () => onAskEdit(session) }]),
              { label: 'Remove', destructive: true, onSelect: () => onRemove([session]) },
            ]
            return (
              <li
                key={session.id}
                className={[
                  'host-date',
                  `host-date--${status.kind}`,
                  canSelect ? 'host-date--selectable' : '',
                  selecting && status.kind === 'booked' ? 'host-date--locked' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {canSelect ? (
                  <input
                    type="checkbox"
                    className="host-date__check"
                    checked={selectedIds.has(session.id)}
                    onChange={() => onToggleSelect(session.id)}
                    aria-label={`Select ${day}, ${time}`}
                  />
                ) : null}
                <div className="host-date__when">
                  <p className="host-date__day">{day}</p>
                  <p className="host-date__time">{time}</p>
                  {typeName ? <p className="host-date__type">{typeName}</p> : null}
                  {placeName ? <p className="host-date__type host-date__place">{placeName}</p> : null}
                </div>

                {editing ? (
                  <div className="host-date__edit">
                    <label className="label">
                      Date
                      <input
                        type="date"
                        className="input"
                        value={editDate}
                        onChange={(event) => onEditDate(event.target.value)}
                      />
                    </label>
                    <label className="label">
                      Time
                      <input
                        type="time"
                        className="input"
                        value={editTime}
                        onChange={(event) => onEditTime(event.target.value)}
                      />
                    </label>
                    <div className="host-date__edit-actions">
                      <Button
                        variant="primary"
                        loading={editLoading}
                        loadingLabel="Saving"
                        onClick={() => onSaveEdit(session)}
                      >
                        Save time
                      </Button>
                      <button type="button" className="host-dates__text-btn" onClick={onCancelEdit}>
                        Cancel
                      </button>
                    </div>
                    {editError ? <p className="error-message host-date__error">{editError}</p> : null}
                  </div>
                ) : (
                  <div className="host-date__meta">
                    <span className={`host-pill host-pill--${status.kind}`}>{status.label}</span>
                    <SpotBar booked={status.booked} capacity={status.capacity} />
                    <span className="host-date__who">
                      {status.kind === 'booked'
                        ? names
                        : status.kind === 'held'
                          ? status.note
                          : 'No bookings yet'}
                    </span>
                  </div>
                )}

                {editing || selecting ? null : status.kind === 'booked' ? (
                  <Link className="host-date__open" to={sessionHref(session.id)}>
                    Guests and details
                    <span className="visually-hidden">
                      {' '}
                      for {day}, {time}
                    </span>
                    <Icon name="chevron-right" size={16} strokeWidth={2.2} />
                  </Link>
                ) : (
                  <OverflowMenu
                    className="ui-overflow--quiet host-date__menu"
                    label={`Options for ${day}, ${time}`}
                    items={menuItems}
                  />
                )}
              </li>
            )
          })}
          {sessions.length > COLLAPSED_ROWS + 1 ? (
            <li className="host-date host-date--more">
              <button type="button" className="host-dates__text-btn" onClick={expanded ? onCollapse : onExpand}>
                {expanded ? 'Show fewer' : `Show all ${sessions.length} dates`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      {selecting ? (
        <div className="host-dates__bulk" role="status">
          <span>
            {selectedHere.length === 0
              ? 'Pick open dates to remove. Booked dates stay.'
              : `${selectedHere.length} selected`}
          </span>
          {selectedHere.length > 0 ? (
            <button
              type="button"
              className="host-dates__remove"
              onClick={() => onRemove(selectedHere)}
            >
              Remove {selectedHere.length === 1 ? '1 date' : `${selectedHere.length} dates`}
            </button>
          ) : null}
        </div>
      ) : null}

      {undo ? (
        <div className="host-dates__undo" role="status">
          <span>{undo.label}</span>
          <button ref={undoRef} type="button" className="host-dates__undo-btn" onClick={undo.onUndo}>
            Undo
          </button>
          <button
            type="button"
            className="host-dates__undo-close"
            aria-label="Dismiss"
            onClick={undo.onDismiss}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      ) : null}
    </section>
  )
}
