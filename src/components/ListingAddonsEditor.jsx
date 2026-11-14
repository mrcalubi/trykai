import { useRef, useState } from 'react'
import FieldHint from './FieldHint'
import Icon from './ui/Icon'
import { revokeIfBlobUrl } from '../lib/coverCrop'
import { IMAGE_ACCEPT } from '../lib/heicImage'
import {
  ADDON_DESCRIPTION_MAX,
  ADDON_IDEAS,
  ADDON_NAME_MAX,
  ADDON_UNIT_COPY,
  MAX_LISTING_ADDONS,
  OCCASION_IDEAS,
  addonEarningsLine,
  addonFieldHints,
  addonLivePill,
  addonSummary,
  emptyAddon,
  startAddonFromIdea,
} from '../lib/listingAddons'
import { filesToPhotos } from '../lib/listingPhotos'

function replaceAddon(addons, index, patch) {
  return addons.map((addon, i) => (i === index ? { ...addon, ...patch } : addon))
}

const FIELDS = ['name', 'price', 'limit']

/** "You get S$15 per guest · guests pay S$17" wraps at the dot, never mid-phrase. */
function keepPhrasesTogether(text) {
  return text
    .split(' · ')
    .map((part) => part.replace(/ /g, ' '))
    .join(' · ')
}

/** The optional extras, folded away until the host wants them. Opens by itself when any are set. */
function MoreDetails({ initialOpen, children }) {
  const [open, setOpen] = useState(initialOpen)
  return (
    <details
      className="addon-card__more"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Description, photo and limit · optional</summary>
      <div className="addon-card__more-body">{children}</div>
    </details>
  )
}

/**
 * Add-ons as a short list. Each saved add-on is one line (name, price, Edit);
 * only the one being written opens as a form. New ones start from an idea,
 * grouped by how they're charged, or from scratch.
 */
export default function ListingAddonsEditor({ addons, onChange, fieldHints = {} }) {
  const pickerRefs = useRef({})
  const [openKey, setOpenKey] = useState(null)
  const [picking, setPicking] = useState(false)
  const [checked, setChecked] = useState(() => new Set())

  const atCap = addons.length >= MAX_LISTING_ADDONS

  function hintsFor(addon, index) {
    const own = checked.has(addon.key) ? addonFieldHints([addon]) : {}
    const hints = {}
    for (const field of FIELDS) {
      const hint = fieldHints[`addon-${index}-${field}`] ?? own[`addon-0-${field}`]
      if (hint) hints[field] = hint
    }
    return hints
  }

  function setAddon(index, patch) {
    onChange(replaceAddon(addons, index, patch))
  }

  function openPicker() {
    setOpenKey(null)
    setPicking(true)
  }

  function startBlank() {
    if (atCap) return
    const addon = emptyAddon()
    onChange([...addons, addon])
    setPicking(false)
    setOpenKey(addon.key)
  }

  function startFrom(name, unit) {
    const next = startAddonFromIdea(addons, name, unit)
    const started = next.find((addon, i) => addon !== addons[i])
    if (!started) return
    onChange(next)
    setPicking(false)
    setOpenKey(started.key)
  }

  function finish(addon) {
    if (Object.keys(addonFieldHints([addon])).length) {
      setChecked((keys) => new Set(keys).add(addon.key))
      return
    }
    setOpenKey(null)
  }

  function removeAt(index) {
    const gone = addons[index]
    revokeIfBlobUrl(gone?.photo?.previewUrl)
    if (gone?.key === openKey) setOpenKey(null)
    onChange(addons.filter((_, i) => i !== index))
  }

  async function pickPhoto(index, fileList) {
    const { photos } = await filesToPhotos(fileList, 1)
    const photo = photos[0]
    if (!photo) return
    revokeIfBlobUrl(addons[index]?.photo?.previewUrl)
    setAddon(index, { photo })
  }

  function removePhoto(index) {
    revokeIfBlobUrl(addons[index]?.photo?.previewUrl)
    setAddon(index, { photo: null })
  }

  function renderRow(addon, index) {
    const summary = addonSummary(addon)
    const label = addon.name.trim() || 'Untitled add-on'
    return (
      <li key={addon.key} className="addon-row">
        {addon.photo ? (
          <img src={addon.photo.previewUrl} alt="" className="addon-row__thumb" />
        ) : null}
        <div className="addon-row__copy">
          <p className="addon-row__name">{label}</p>
          <p className={`addon-row__meta${summary.ready ? '' : ' addon-row__meta--todo'}`}>
            {keepPhrasesTogether(summary.text)}
          </p>
        </div>
        <div className="addon-row__actions">
          <button
            type="button"
            className="btn btn--ghost btn--small"
            aria-label={`Edit ${label}`}
            onClick={() => {
              setPicking(false)
              setOpenKey(addon.key)
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="addon-row__remove"
            aria-label={`Remove ${label}`}
            onClick={() => removeAt(index)}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </li>
    )
  }

  function renderCard(addon, index) {
    const hints = hintsFor(addon, index)
    const live = addonLivePill(addon)
    const earnings = addonEarningsLine(addon)
    const pickerId = `addon-photo-${addon.key}`
    return (
      <li key={addon.key}>
        <article className="addon-card" aria-label={addon.name.trim() || 'New add-on'}>
          <label className="label">
            Name
            <input
              type="text"
              value={addon.name}
              maxLength={ADDON_NAME_MAX}
              placeholder="Take-home kit"
              onChange={(e) => setAddon(index, { name: e.target.value })}
              className="input"
            />
          </label>
          <FieldHint>{hints.name}</FieldHint>

          <fieldset className="wizard-fieldset">
            <legend className="addon-card__legend">How it&apos;s charged</legend>
            <div className="choice-chips addon-card__unit">
              {['person', 'booking'].map((unit) => (
                <label
                  key={unit}
                  className={`choice-chip${addon.unit === unit ? ' choice-chip--on' : ''}`}
                >
                  <input
                    type="radio"
                    name={`addon-unit-${addon.key}`}
                    checked={addon.unit === unit}
                    onChange={() => setAddon(index, { unit })}
                    className="visually-hidden"
                  />
                  {ADDON_UNIT_COPY[unit].label}
                </label>
              ))}
            </div>
            <p className="hint">{ADDON_UNIT_COPY[addon.unit].hint}</p>
          </fieldset>

          <label className="label">
            You get
            <span className="addon-card__price">
              <span aria-hidden="true">S$</span>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="500"
                step="1"
                value={addon.price}
                onChange={(e) => setAddon(index, { price: e.target.value })}
                className="input"
                aria-label="You get in Singapore dollars"
              />
            </span>
          </label>
          <FieldHint>{hints.price}</FieldHint>
          {live ? <p className="addon-card__pill">{live}</p> : null}
          {earnings ? <p className="addon-card__earnings">{earnings}</p> : null}

          <MoreDetails
            initialOpen={Boolean(
              addon.description.trim() || addon.photo || addon.sessionLimitEnabled || hints.limit,
            )}
          >
              <label className="label">
                Short description
                <textarea
                  value={addon.description}
                  maxLength={ADDON_DESCRIPTION_MAX}
                  rows={2}
                  placeholder="Your cup, glazed and fired, ready in two weeks."
                  onChange={(e) => setAddon(index, { description: e.target.value })}
                  className="input input--textarea"
                />
              </label>

              <div className="addon-card__photo">
                <input
                  id={pickerId}
                  ref={(node) => {
                    pickerRefs.current[addon.key] = node
                  }}
                  type="file"
                  accept={IMAGE_ACCEPT}
                  aria-label={addon.photo ? 'Change photo' : 'Add photo'}
                  className="visually-hidden"
                  onChange={(event) => {
                    pickPhoto(index, event.target.files)
                    event.target.value = ''
                  }}
                />
                {addon.photo ? (
                  <>
                    <img src={addon.photo.previewUrl} alt="" className="addon-card__thumb" />
                    <div className="addon-card__photo-actions">
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        onClick={() => pickerRefs.current[addon.key]?.click()}
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        onClick={() => removePhoto(index)}
                      >
                        Remove photo
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <label htmlFor={pickerId} className="addon-card__add-photo">
                      <Icon name="camera" size={20} />
                    </label>
                    <p className="addon-card__photo-hint">
                      <span className="addon-card__photo-title">Photo</span>
                      One clear shot of what guests get.
                    </p>
                  </>
                )}
              </div>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={addon.sessionLimitEnabled}
                  onChange={(e) =>
                    setAddon(index, {
                      sessionLimitEnabled: e.target.checked,
                      sessionLimit: e.target.checked ? addon.sessionLimit : '',
                    })
                  }
                />
                Limit per session
              </label>
              {addon.sessionLimitEnabled ? (
                <>
                  <label className="label addon-card__limit">
                    Units
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="99"
                      value={addon.sessionLimit}
                      onChange={(e) => setAddon(index, { sessionLimit: e.target.value })}
                      className="input"
                      aria-label="Limit per session"
                    />
                  </label>
                  <FieldHint>{hints.limit}</FieldHint>
                </>
              ) : (
                <p className="hint">For things you only have a few of, like spare kits.</p>
              )}
          </MoreDetails>

          <div className="addon-card__footer">
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => removeAt(index)}
            >
              Remove
            </button>
            <button
              type="button"
              className="btn btn--primary btn--small addon-card__done"
              onClick={() => finish(addon)}
            >
              Done
            </button>
          </div>
        </article>
      </li>
    )
  }

  function renderPicker() {
    return (
      <div className="addons-picker" role="group" aria-labelledby="addons-picker-title">
        <div className="addons-picker__head">
          <p id="addons-picker-title" className="addons-picker__title">
            Start from an idea
          </p>
          <button
            type="button"
            className="addons-picker__close"
            aria-label="Close ideas"
            onClick={() => setPicking(false)}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        {[
          { unit: 'person', ideas: ADDON_IDEAS },
          { unit: 'booking', ideas: OCCASION_IDEAS },
        ].map(({ unit, ideas }) => (
          <div key={unit} className="addons-ideas">
            <p className="addons-ideas__label">{ADDON_UNIT_COPY[unit].group}</p>
            <div className="addons-ideas__chips">
              {ideas.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="addons-chip"
                  onClick={() => startFrom(name, unit)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button type="button" className="btn btn--secondary btn--small" onClick={startBlank}>
          Write my own
        </button>
      </div>
    )
  }

  return (
    <section className="addons-editor" aria-labelledby="addons-editor-heading">
      <div className="addons-editor__header">
        <h2 id="addons-editor-heading" className="form-section__title">
          Add-ons · optional
        </h2>
        {addons.length ? (
          <p className="addons-editor__count">
            {addons.length} of {MAX_LISTING_ADDONS}
          </p>
        ) : null}
      </div>
      <p className="addons-editor__intro">
        Extras guests can add when they book, like a take-home kit or a birthday setup. You set
        the price.
      </p>

      {addons.length ? (
        <ul className="addons-list">
          {addons.map((addon, index) => {
            const open = addon.key === openKey || Object.keys(hintsFor(addon, index)).length > 0
            return open ? renderCard(addon, index) : renderRow(addon, index)
          })}
        </ul>
      ) : null}

      {picking && !atCap ? renderPicker() : null}

      {!picking && !atCap ? (
        <button type="button" className="btn btn--secondary addons-editor__add" onClick={openPicker}>
          <Icon name="plus" size={16} /> Add an add-on
        </button>
      ) : null}

      {addons.length ? (
        <p className="hint">Group discounts come off your session price only, never add-ons.</p>
      ) : null}
    </section>
  )
}
