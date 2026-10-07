import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { PLANNING_AREA_NAMES } from '../lib/planningAreas'

function matchesQuery(name, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return name.toLowerCase().includes(q)
}

function exactMatch(query) {
  const q = query.trim().toLowerCase()
  if (!q) return null
  return PLANNING_AREA_NAMES.find((name) => name.toLowerCase() === q) ?? null
}

export default function PlanningAreaSelect({
  id,
  value,
  onChange,
  required = false,
  disabled = false,
}) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const listId = `${inputId}-list`
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value ?? '')
  const [syncedValue, setSyncedValue] = useState(value)
  const [activeIndex, setActiveIndex] = useState(0)

  if (value !== syncedValue) {
    setSyncedValue(value)
    setQuery(value ?? '')
  }

  const options = useMemo(() => {
    const selected = (value ?? '').toLowerCase()
    const browsing = query.trim().toLowerCase() === selected
    if (browsing) return PLANNING_AREA_NAMES
    return PLANNING_AREA_NAMES.filter((name) => matchesQuery(name, query))
  }, [query, value])

  const safeIndex = options.length === 0 ? 0 : Math.min(activeIndex, options.length - 1)

  useEffect(() => {
    if (!open) return undefined

    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        const match = exactMatch(query)
        if (match) {
          onChange(match)
          setQuery(match)
        } else {
          setQuery(value ?? '')
        }
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open, query, value, onChange])

  function select(name) {
    onChange(name)
    setQuery(name)
    setOpen(false)
  }

  function commitQuery() {
    const match = exactMatch(query)
    if (match) {
      select(match)
      return
    }
    setQuery(value ?? '')
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
    <div className="planning-area-select" ref={rootRef}>
      <input
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
        aria-required={required || undefined}
        required={required || undefined}
        placeholder="Search planning areas"
        onChange={(event) => {
          setQuery(event.target.value)
          setActiveIndex(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          if (rootRef.current?.contains(event.relatedTarget)) return
          commitQuery()
          setOpen(false)
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
              select(activeOption)
            }
          } else if (event.key === 'Escape') {
            event.preventDefault()
            setQuery(value ?? '')
            setOpen(false)
          }
        }}
      />
      {open ? (
        <ul id={listId} role="listbox" className="planning-area-select__list">
          {options.length === 0 ? (
            <li className="planning-area-select__empty">No matching planning areas</li>
          ) : (
            options.map((name, index) => (
              <li key={name} role="presentation">
                <button
                  type="button"
                  id={`${listId}-opt-${index}`}
                  role="option"
                  aria-selected={name === value}
                  className={`planning-area-select__option${
                    index === safeIndex ? ' planning-area-select__option--active' : ''
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => select(name)}
                >
                  {name}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
