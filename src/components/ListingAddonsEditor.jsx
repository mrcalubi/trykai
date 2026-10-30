import { useRef } from 'react'
import FieldHint from './FieldHint'
import Icon from './ui/Icon'
import { revokeIfBlobUrl } from '../lib/coverCrop'
import { IMAGE_ACCEPT } from '../lib/heicImage'
import {
  ADDON_DESCRIPTION_MAX,
  ADDON_IDEAS,
  ADDON_NAME_MAX,
  MAX_LISTING_ADDONS,
  OCCASION_IDEAS,
  addonEarningsLine,
  addonLivePill,
  emptyAddon,
  startAddonFromIdea,
} from '../lib/listingAddons'
import { filesToPhotos } from '../lib/listingPhotos'

function replaceAddon(addons, index, patch) {
  return addons.map((addon, i) => (i === index ? { ...addon, ...patch } : addon))
}

export default function ListingAddonsEditor({ addons, onChange, fieldHints = {} }) {
  const pickerRefs = useRef({})

  function setAddon(index, patch) {
    onChange(replaceAddon(addons, index, patch))
  }

  function addBlank() {
    if (addons.length >= MAX_LISTING_ADDONS) return
    onChange([...addons, emptyAddon()])
  }

  function removeAt(index) {
    const next = addons[index]
    revokeIfBlobUrl(next?.photo?.previewUrl)
    onChange(addons.filter((_, i) => i !== index))
  }

  function startFrom(name, unit) {
    if (addons.length >= MAX_LISTING_ADDONS && !addons.some((addon) => !addon.name.trim())) return
    onChange(startAddonFromIdea(addons, name, unit))
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

  const earnings = addonEarningsLine(addons[0])
  const atCap = addons.length >= MAX_LISTING_ADDONS

  return (
    <section className="addons-editor" aria-labelledby="addons-editor-heading">
      <div className="addons-editor__header">
        <h2 id="addons-editor-heading" className="form-section__title">
          Add-ons · optional
        </h2>
        <p className="addons-editor__count">
          {addons.length} of {MAX_LISTING_ADDONS}
        </p>
      </div>

      <div className="addons-pitch">
        <img src="/trykai.png" alt="" className="addons-pitch__mascot" width="72" height="72" />
        <div className="addons-pitch__copy">
          <p className="addons-pitch__title">Earn more while giving more!</p>
          <p className="addons-pitch__body">
            Give guests something special to add, like nicer materials or a gift to take home.
          </p>
        </div>
      </div>

      <div className="addons-ideas">
        <p className="addons-ideas__label">Ideas to start from</p>
        <div className="addons-ideas__chips">
          {ADDON_IDEAS.map((name) => (
            <button
              key={name}
              type="button"
              className="addons-chip"
              disabled={atCap && addons.every((addon) => addon.name.trim())}
              onClick={() => startFrom(name, 'person')}
            >
              {name}
            </button>
          ))}
        </div>
        <p className="hint">Tap one to start with</p>
      </div>

      <div className="addons-ideas">
        <p className="addons-ideas__label">For an occasion · usually per booking</p>
        <div className="addons-ideas__chips">
          {OCCASION_IDEAS.map((name) => (
            <button
              key={name}
              type="button"
              className="addons-chip"
              disabled={atCap && addons.every((addon) => addon.name.trim())}
              onClick={() => startFrom(name, 'booking')}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {addons.map((addon, index) => {
        const live = addonLivePill(addon)
        const pickerId = `addon-photo-${addon.key}`
        return (
          <article key={addon.key} className="addon-card">
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
                <label htmlFor={pickerId} className="addon-card__add-photo">
                  <Icon name="plus" size={20} />
                </label>
              )}
            </div>

            <label className="label">
              Name
              <input
                type="text"
                value={addon.name}
                maxLength={ADDON_NAME_MAX}
                onChange={(e) => setAddon(index, { name: e.target.value })}
                className="input"
              />
            </label>
            <FieldHint>{fieldHints[`addon-${index}-name`]}</FieldHint>

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
            <FieldHint>{fieldHints[`addon-${index}-price`]}</FieldHint>

            <fieldset className="wizard-fieldset">
              <legend className="wizard-fieldset__legend">Charged</legend>
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
                    {unit === 'person' ? 'Per person' : 'Per booking'}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="label">
              Short description
              <textarea
                value={addon.description}
                maxLength={ADDON_DESCRIPTION_MAX}
                rows={2}
                onChange={(e) => setAddon(index, { description: e.target.value })}
                className="input input--textarea"
              />
            </label>

            {live ? <p className="addon-card__pill">{live}</p> : null}

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
                <label className="label">
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
                <FieldHint>{fieldHints[`addon-${index}-limit`]}</FieldHint>
              </>
            ) : null}

            <button
              type="button"
              className="btn btn--ghost btn--small addon-card__remove"
              onClick={() => removeAt(index)}
            >
              Remove
            </button>
          </article>
        )
      })}

      {atCap ? null : (
        <button type="button" className="btn btn--secondary" onClick={addBlank}>
          + Add an add-on
        </button>
      )}

      {earnings ? <p className="addons-editor__earnings">{earnings}</p> : null}
      <p className="hint">Group discounts come off your session price only, never add-ons.</p>
    </section>
  )
}
