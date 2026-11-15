import { useId, useState } from 'react'
import Icon from './ui/Icon'
import {
  MAX_WHAT_TO_BRING,
  MAX_WHAT_TO_BRING_CHARS,
  WHAT_TO_BRING_SUGGESTIONS,
  normalizeWhatToBringItem,
} from '../lib/whatToBring'

/**
 * What guests should bring. What's on the list is shown as filled chips under
 * "Guests bring"; suggestions sit apart as outlined "+" chips, so it is clear
 * which are picked. "Nothing" is its own option.
 */
export default function WhatToBringFields({ value, onChange, showLegend = true }) {
  const [draft, setDraft] = useState('')
  const [nothing, setNothing] = useState(false)
  const nothingHintId = useId()
  const items = value ?? []
  const canAdd = !nothing && items.length < MAX_WHAT_TO_BRING
  const suggestions = WHAT_TO_BRING_SUGGESTIONS.filter((option) => !items.includes(option))

  function setItems(next) {
    setNothing(false)
    onChange(next)
  }

  function chooseNothing() {
    const next = !nothing
    setNothing(next)
    if (next) {
      setDraft('')
      onChange([])
    }
  }

  function addItem(raw) {
    const next = normalizeWhatToBringItem(raw)
    if (!next || !canAdd || items.includes(next)) return
    setItems([...items, next])
    setDraft('')
  }

  function addCustom(event) {
    event.preventDefault()
    addItem(draft)
  }

  return (
    <fieldset className="wizard-fieldset pick-fields">
      <legend className={showLegend ? 'wizard-fieldset__legend' : 'visually-hidden'}>
        What guests should bring
      </legend>

      <p className="pick-label">Guests bring</p>
      {items.length ? (
        <div className="pick-chips">
          {items.map((item) => (
            <span key={item} className="pick-chip pick-chip--on">
              {item}
              <button
                type="button"
                onClick={() => setItems(items.filter((entry) => entry !== item))}
                aria-label={`Remove ${item}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="hint pick-empty">{nothing ? 'Nothing, you provide everything.' : 'Nothing yet.'}</p>
      )}

      {canAdd && suggestions.length ? (
        <>
          <p className="pick-label">Suggestions · tap to add</p>
          <div className="pick-chips">
            {suggestions.map((option) => (
              <button
                key={option}
                type="button"
                className="pick-chip pick-chip--suggest"
                onClick={() => addItem(option)}
              >
                <Icon name="plus" size={14} />
                {option}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {canAdd ? (
        <div className="provided-custom__add">
          <label className="label">
            Add something to bring
            <input
              type="text"
              value={draft}
              maxLength={MAX_WHAT_TO_BRING_CHARS}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addCustom(event)
              }}
              placeholder="e.g. Yoga mat"
              className="input"
            />
          </label>
          <button type="button" className="btn btn--ghost btn--small" onClick={addCustom}>
            + Add item
          </button>
        </div>
      ) : nothing ? null : (
        <p className="hint">Up to {MAX_WHAT_TO_BRING} items.</p>
      )}

      <div className={`pick-none${nothing ? ' pick-none--on' : ''}`}>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={nothing}
            aria-describedby={nothingHintId}
            onChange={chooseNothing}
          />
          Nothing, we provide everything
        </label>
        <p id={nothingHintId} className="hint">
          Clears the list above.
        </p>
      </div>
    </fieldset>
  )
}
