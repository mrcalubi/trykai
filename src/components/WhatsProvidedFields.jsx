import { useState } from 'react'
import {
  MAX_CUSTOM_PROVIDED,
  MAX_CUSTOM_PROVIDED_CHARS,
  WHATS_PROVIDED_PRESETS,
  customProvidedItems,
} from '../lib/whatsProvided'

export default function WhatsProvidedFields({ value, onChange }) {
  const [draft, setDraft] = useState('')
  const custom = customProvidedItems(value)
  const noneSelected = value.includes('None')
  const canAdd = custom.length < MAX_CUSTOM_PROVIDED

  function togglePreset(option) {
    if (option === 'None') {
      onChange(value.includes('None') ? [] : ['None'])
      return
    }
    const withoutNone = value.filter((item) => item !== 'None')
    onChange(
      withoutNone.includes(option)
        ? withoutNone.filter((item) => item !== option)
        : [...withoutNone, option],
    )
  }

  function addCustom(event) {
    event.preventDefault()
    const next = draft.trim().slice(0, MAX_CUSTOM_PROVIDED_CHARS)
    if (!next || !canAdd || noneSelected) return
    if (value.includes(next) || WHATS_PROVIDED_PRESETS.includes(next)) {
      setDraft('')
      return
    }
    onChange([...value.filter((item) => item !== 'None'), next])
    setDraft('')
  }

  function removeCustom(item) {
    onChange(value.filter((entry) => entry !== item))
  }

  return (
    <fieldset className="fieldset">
      <legend className="fieldset__legend">What&apos;s provided</legend>
      <div className="checkboxes">
        {WHATS_PROVIDED_PRESETS.map((option) => (
          <label key={option} className="checkbox-label">
            <input
              type="checkbox"
              checked={value.includes(option)}
              disabled={option !== 'None' && noneSelected}
              onChange={() => togglePreset(option)}
            />
            {option}
          </label>
        ))}
      </div>
      <div className="provided-custom">
        {custom.length ? (
          <div className="provided-custom__chips">
            {custom.map((item) => (
              <span key={item} className="provided-custom__chip">
                {item}
                <button type="button" onClick={() => removeCustom(item)} aria-label={`Remove ${item}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {canAdd ? (
          <div className="provided-custom__add">
            <label className="label">
              Add your own
              <input
                type="text"
                value={draft}
                maxLength={MAX_CUSTOM_PROVIDED_CHARS}
                disabled={noneSelected}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addCustom(event)
                }}
                placeholder="e.g. Apron"
                className="input"
              />
            </label>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={addCustom}
              disabled={noneSelected}
            >
              + Add your own
            </button>
          </div>
        ) : (
          <p className="hint">Up to {MAX_CUSTOM_PROVIDED} of your own items.</p>
        )}
      </div>
    </fieldset>
  )
}
