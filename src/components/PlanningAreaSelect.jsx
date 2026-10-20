import { useId, useMemo, useRef, useState } from 'react'
import { planningAreaForAlias, searchAreaOptions } from '../lib/areaSearch'
import { PLANNING_AREA_NAMES, hostPlanningAreaNames } from '../lib/planningAreas'

const PICK_AREA = 'Pick an area from the list.'

export default function PlanningAreaSelect({
  id,
  value,
  onChange,
  required = false,
  disabled = false,
  hideUninhabited = false,
  allowEmpty = false,
  placeholder = 'Search areas or neighbourhoods',
}) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const listId = `${inputId}-list`
  const errorId = `${inputId}-error`
  const inputRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value ?? '')
  const [syncedValue, setSyncedValue] = useState(value)
  const [activeIndex, setActiveIndex] = useState(0)
  const [error, setError] = useState('')

  if (value !== syncedValue) {
    setSyncedValue(value)
    if (!error) setQuery(value ?? '')
  }

  const names = hideUninhabited ? hostPlanningAreaNames(value) : PLANNING_AREA_NAMES

  const options = useMemo(() => {
    const selected = (value ?? '').toLowerCase()
    const browsing = query.trim().toLowerCase() === selected
    if (browsing) return names.map((name) => ({ name, label: name }))
    return searchAreaOptions(query, names)
  }, [names, query, value])

  const safeIndex = options.length === 0 ? 0 : Math.min(activeIndex, options.length - 1)

  function setValidity(message) {
    setError(message)
    inputRef.current?.setCustomValidity(message)
  }

  function select(name) {
    setValidity('')
    onChange(name)
    setQuery(name)
    setOpen(false)
  }

  function commitTyped(raw) {
    const match = planningAreaForAlias(raw)
    const allowed = match && names.includes(match)
    if (allowed) {
      select(match)
      return
    }
    setOpen(false)
    if (raw.trim()) {
      setQuery(raw)
      setValidity(PICK_AREA)
      return
    }
    setQuery('')
    setValidity(allowEmpty || !required ? '' : PICK_AREA)
    if (allowEmpty) onChange('')
  }

  function moveActive(delta) {
    if (options.length === 0) return
    setActiveIndex((current) => {
      const clamped = Math.min(current, options.length - 1)
      const next = clamped + delta
      if (next < 0) return options.length - 1
      if (next >= options.length) return 0
      return next
    })
  }

  const activeOption = options[safeIndex]
  const activeId = activeOption ? `${listId}-opt-${safeIndex}` : undefined

  return (
    <div className="planning-area-select">
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        className="input"
        value={query}
        disabled={disabled}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? activeId : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        aria-required={required || undefined}
        required={required && !allowEmpty ? true : undefined}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value)
          setActiveIndex(0)
          setOpen(true)
          setValidity('')
        }}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          commitTyped(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
            if (open) moveActive(1)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
            if (open) moveActive(-1)
          } else if (event.key === 'Enter') {
            if (open && activeOption) {
              event.preventDefault()
              select(activeOption.name)
            }
          } else if (event.key === 'Escape') {
            event.preventDefault()
            setQuery(value ?? '')
            setValidity('')
            setOpen(false)
          } else if (event.key === 'Tab') {
            commitTyped(event.currentTarget.value)
          }
        }}
      />
      {open ? (
        <ul id={listId} role="listbox" className="planning-area-select__list">
          {options.length === 0 ? (
            <li className="planning-area-select__empty">No matching planning areas</li>
          ) : (
            options.map((option, index) => (
              <li key={option.name} role="presentation">
                <button
                  type="button"
                  tabIndex={-1}
                  id={`${listId}-opt-${index}`}
                  role="option"
                  aria-selected={option.name === value}
                  className={`planning-area-select__option${
                    index === safeIndex ? ' planning-area-select__option--active' : ''
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => select(option.name)}
                >
                  {option.label}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
      {error ? (
        <p id={errorId} className="error-message" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
