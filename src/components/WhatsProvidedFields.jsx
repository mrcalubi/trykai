import { useId, useState } from 'react'
import Icon from './ui/Icon'
import {
  MAX_CUSTOM_PROVIDED,
  MAX_CUSTOM_PROVIDED_CHARS,
  WHATS_PROVIDED_PRESETS,
  customProvidedItems,
} from '../lib/whatsProvided'

/**
 * What the host provides: tap chips to pick (a tick when picked, a plus when
 * not), add your own, or choose "None" on its own, which clears the rest.
 */
export default function WhatsProvidedFields({ value, onChange, showLegend = true }) {
  const [draft, setDraft] = useState('')
  const noneHintId = useId()
  const custom = customProvidedItems(value)
  const noneSelected = value.includes('None')
  const canAdd = custom.length < MAX_CUSTOM_PROVIDED
  const presets = WHATS_PROVIDED_PRESETS.filter((option) => option !== 'None')

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
    <fieldset className="wizard-fieldset pick-fields">
      <legend className={showLegend ? 'wizard-fieldset__legend' : 'visually-hidden'}>
        What&apos;s provided
      </legend>
      <div className="pick-chips">
        {presets.map((option) => {
          const on = value.includes(option)
          return (
            <label
              key={option}
              className={`pick-chip${on ? ' pick-chip--on' : ''}${noneSelected ? ' pick-chip--off' : ''}`}
            >
              <input
                type="checkbox"
                className="visually-hidden"
                checked={on}
                disabled={noneSelected}
                onChange={() => togglePreset(option)}
              />
              <Icon name={on ? 'check' : 'plus'} size={14} />
              {option}
            </label>
          )
        })}
        {custom.map((item) => (
          <span key={item} className="pick-chip pick-chip--on">
            <Icon name="check" size={14} />
            {item}
            <button type="button" onClick={() => removeCustom(item)} aria-label={`Remove ${item}`}>
              ×
            </button>
          </span>
        ))}
      </div>

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

      <div className={`pick-none${noneSelected ? ' pick-none--on' : ''}`}>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={noneSelected}
            aria-describedby={noneHintId}
            onChange={() => togglePreset('None')}
          />
          None
        </label>
        <p id={noneHintId} className="hint">
          Guests bring everything they need. Clears the items above.
        </p>
      </div>
    </fieldset>
  )
}
