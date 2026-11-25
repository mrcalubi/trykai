import { useEffect, useRef, useState } from 'react'
import Icon from './ui/Icon'
import {
  anyClassValue,
  anyPlaceValue,
  classOptions,
  placeFieldValue,
  placeOptions,
  placeShort,
} from '../lib/bookingPickers'

function OptionThumb({ kind, option }) {
  if (!option.id) {
    return (
      <span className="pick-option__thumb pick-option__thumb--any" aria-hidden="true">
        <Icon name="grid" size={18} />
      </span>
    )
  }
  if (kind === 'place') {
    return (
      <span className="pick-option__thumb pick-option__thumb--place" aria-hidden="true">
        <Icon name="pin" size={18} />
      </span>
    )
  }
  return option.photoUrl ? (
    <img src={option.photoUrl} alt="" className="pick-option__thumb pick-option__thumb--photo" />
  ) : (
    <span className="pick-option__thumb pick-option__thumb--class" aria-hidden="true">
      <Icon name="layers" size={18} />
    </span>
  )
}

/** One field in the box, with its list under it (a sheet from the bottom on phones). */
function PickerField({
  kind,
  icon,
  label,
  value,
  picked,
  clearLabel,
  open,
  onToggle,
  onClose,
  onClear,
  fieldRef,
  panel,
}) {
  const panelRef = useRef(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  // Opening moves focus to the chosen option; Escape closes.
  useEffect(() => {
    if (!open) return undefined
    panelRef.current?.querySelector('[aria-pressed="true"]')?.focus?.()
    function onKey(event) {
      if (event.key === 'Escape') closeRef.current(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div
      className={['pick-field', open ? 'pick-field--open' : '', picked ? 'pick-field--picked' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <button
        ref={fieldRef}
        type="button"
        className="pick-field__button"
        aria-label={`${label}: ${value}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={onToggle}
      >
        <Icon name={icon} size={20} className="pick-field__icon" />
        <span className="pick-field__text">
          <span className="pick-field__label">{label}</span>
          <span className="pick-field__value">{value}</span>
        </span>
        {picked ? null : <Icon name="chevronDown" size={18} className="pick-field__chevron" />}
      </button>
      {picked ? (
        <button
          type="button"
          className="pick-field__clear"
          aria-label={clearLabel}
          onClick={() => {
            onClear()
            fieldRef.current?.focus?.()
          }}
        >
          <Icon name="close" size={16} strokeWidth={2.2} />
        </button>
      ) : null}
      {open ? (
        <>
          <div className="pick-backdrop" aria-hidden="true" onClick={() => onClose(false)} />
          <div ref={panelRef} className="pick-panel" role="dialog" aria-label={panel.title}>
            <div className="pick-panel__sheet-head">
              <div>
                <h3 className="pick-panel__sheet-title">{panel.title}</h3>
                {panel.sub ? <p className="pick-panel__sheet-sub">{panel.sub}</p> : null}
              </div>
              <button type="button" className="pick-panel__close" aria-label="Close" onClick={() => onClose(true)}>
                <Icon name="close" size={18} strokeWidth={2.2} />
              </button>
            </div>
            <p className="pick-panel__label">{panel.label}</p>
            <ul className="pick-panel__list">
              {panel.options.map((option) => {
                const on = (panel.chosenId ?? null) === option.id
                return (
                  <li key={option.id ?? 'any'}>
                    <button
                      type="button"
                      className={`pick-option${option.greyed ? ' pick-option--greyed' : ''}`}
                      aria-pressed={on}
                      onClick={() => panel.onPick(option.id)}
                    >
                      <OptionThumb kind={kind} option={option} />
                      <span className="pick-option__copy">
                        <span className="pick-option__name">{option.name}</span>
                        {option.meta ? <span className="pick-option__meta">{option.meta}</span> : null}
                      </span>
                      {on ? <Icon name="check" size={18} strokeWidth={2.4} className="pick-option__check" /> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
            {panel.note ? <p className="pick-panel__note">{panel.note}</p> : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

/**
 * "Where" and "What you'll make" on the booking card (DECISIONS.md, 26 November
 * 2026). Each shows only when there is a choice: several places, or more than
 * one class. `sessions` is every upcoming session, or null while loading.
 */
export default function BookingPickers({ sessions, places = [], classes = [], placeId, classId, onPlace, onClass }) {
  const [open, setOpen] = useState(null)
  const placeRef = useRef(null)
  const classRef = useRef(null)
  const showPlaces = places.length > 1
  const showClasses = classes.length > 1
  if (!showPlaces && !showClasses) return null

  const place = places.find((item) => item.id === placeId) ?? null
  const type = classes.find((item) => item.id === classId) ?? null
  const loaded = Array.isArray(sessions)
  const withMeta = (options) => (loaded ? options : options.map((option) => ({ ...option, meta: '' })))

  function close(returnFocus) {
    const was = open
    setOpen(null)
    if (returnFocus) (was === 'class' ? classRef : placeRef).current?.focus?.()
  }

  const placeList = withMeta(
    placeOptions({ sessions: sessions ?? [], places, classId: type?.id ?? null, className: type?.name ?? '' }),
  )
  const classList = withMeta(classOptions({ sessions: sessions ?? [], classes, places, placeId: place?.id ?? null }))
  const greyedPlaces = loaded && placeList.some((option) => option.greyed)
  const greyedClasses = loaded && classList.some((option) => option.greyed)

  return (
    <div className="pick-box">
      {showPlaces ? (
        <PickerField
          kind="place"
          icon="pin"
          label="Where"
          value={place ? placeFieldValue(place) : anyPlaceValue(places)}
          picked={Boolean(place)}
          clearLabel="Show every place"
          open={open === 'place'}
          onToggle={() => setOpen(open === 'place' ? null : 'place')}
          onClose={close}
          onClear={() => onPlace(null)}
          fieldRef={placeRef}
          panel={{
            title: 'Where',
            sub: type ? `For ${type.name}` : 'Pick a place',
            label: 'Pick a place',
            options: placeList,
            chosenId: place?.id ?? null,
            note: greyedPlaces
              ? `Greyed places don't run ${type.name}. Picking one shows every class again.`
              : "Same price at every place. You get the exact address once you've booked.",
            onPick: (id) => {
              onPlace(id)
              close(true)
            },
          }}
        />
      ) : null}
      {showClasses ? (
        <PickerField
          kind="class"
          icon="layers"
          label="What you'll make"
          value={type ? type.name : anyClassValue(classes)}
          picked={Boolean(type)}
          clearLabel="Show every class"
          open={open === 'class'}
          onToggle={() => setOpen(open === 'class' ? null : 'class')}
          onClose={close}
          onClear={() => onClass(null)}
          fieldRef={classRef}
          panel={{
            title: "What you'll make",
            sub: place ? `At ${placeFieldValue(place)}` : 'Pick a class',
            label: place ? `Classes at ${placeShort(place)}` : 'Pick a class',
            options: classList,
            chosenId: type?.id ?? null,
            note: greyedClasses
              ? `Greyed classes don't run at ${placeShort(place)}. Picking one shows every place again.`
              : '',
            onPick: (id) => {
              onClass(id)
              close(true)
            },
          }}
        />
      ) : null}
    </div>
  )
}
