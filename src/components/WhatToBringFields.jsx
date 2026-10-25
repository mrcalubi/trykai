import { useState } from 'react'
import {
  MAX_WHAT_TO_BRING,
  MAX_WHAT_TO_BRING_CHARS,
  WHAT_TO_BRING_SUGGESTIONS,
  normalizeWhatToBringItem,
} from '../lib/whatToBring'

export default function WhatToBringFields({ value, onChange }) {
  const [draft, setDraft] = useState('')
  const [nothing, setNothing] = useState(false)
  const items = value ?? []
  const canAdd = !nothing && items.length < MAX_WHAT_TO_BRING

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
    <fieldset className="fieldset">
      <legend className="fieldset__legend">What guests should bring</legend>
      <div className="checkboxes">
        <label className="checkbox-label">
          <input type="checkbox" checked={nothing} onChange={chooseNothing} />
          Nothing, we provide everything
        </label>
      </div>
      <div className="provided-custom">
        <div className="provided-custom__chips">
          {WHAT_TO_BRING_SUGGESTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className="provided-custom__chip provided-custom__chip--suggest"
              disabled={!canAdd || items.includes(option)}
              onClick={() => addItem(option)}
            >
              {option}
            </button>
          ))}
        </div>
        {items.length ? (
          <div className="provided-custom__chips">
            {items.map((item) => (
              <span key={item} className="provided-custom__chip">
                {item}
                <button type="button" onClick={() => setItems(items.filter((entry) => entry !== item))} aria-label={`Remove ${item}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
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
      </div>
    </fieldset>
  )
}
