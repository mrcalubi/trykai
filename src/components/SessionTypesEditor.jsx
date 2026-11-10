import { useRef } from 'react'
import FieldHint from './FieldHint'
import Icon from './ui/Icon'
import { revokeIfBlobUrl } from '../lib/coverCrop'
import { IMAGE_ACCEPT } from '../lib/heicImage'
import { filesToPhotos } from '../lib/listingPhotos'
import {
  MAX_SESSION_TYPES,
  SESSION_TYPE_DESCRIPTION_MAX,
  SESSION_TYPE_NAME_MAX,
  emptySessionType,
} from '../lib/sessionTypes'

function replaceAt(list, index, patch) {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item))
}

/**
 * Edit listing: up to 4 session types. The host picks one for each batch of
 * dates in Add sessions. Same shape as the add-ons editor, without prices.
 */
export default function SessionTypesEditor({ types, onChange, fieldHints = {} }) {
  const pickerRefs = useRef({})

  function setType(index, patch) {
    onChange(replaceAt(types, index, patch))
  }

  function removeAt(index) {
    revokeIfBlobUrl(types[index]?.photo?.previewUrl)
    onChange(types.filter((_, i) => i !== index))
  }

  async function pickPhoto(index, fileList) {
    const { photos } = await filesToPhotos(fileList, 1)
    const photo = photos[0]
    if (!photo) return
    revokeIfBlobUrl(types[index]?.photo?.previewUrl)
    setType(index, { photo })
  }

  function removePhoto(index) {
    revokeIfBlobUrl(types[index]?.photo?.previewUrl)
    setType(index, { photo: null })
  }

  const atCap = types.length >= MAX_SESSION_TYPES

  return (
    <section className="addons-editor session-types-editor" aria-labelledby="session-types-heading">
      <div className="addons-editor__header">
        <h2 id="session-types-heading" className="form-section__title">
          Session types · optional
        </h2>
        <p className="addons-editor__count">
          {types.length} of {MAX_SESSION_TYPES}
        </p>
      </div>
      <p className="hint">
        Teach more than one thing? Add a type for each, like &quot;Hand-tied bouquet&quot; and
        &quot;Table centrepiece&quot;. You choose the type when you add dates. Every type is the same
        price.
      </p>

      {types.map((type, index) => {
        const pickerId = `session-type-photo-${type.key}`
        return (
          <article key={type.key} className="addon-card session-type-card">
            <div className="addon-card__photo">
              <input
                id={pickerId}
                ref={(node) => {
                  pickerRefs.current[type.key] = node
                }}
                type="file"
                accept={IMAGE_ACCEPT}
                aria-label={type.photo ? 'Change photo' : 'Add photo'}
                className="visually-hidden"
                onChange={(event) => {
                  pickPhoto(index, event.target.files)
                  event.target.value = ''
                }}
              />
              {type.photo ? (
                <>
                  <img src={type.photo.previewUrl} alt="" className="addon-card__thumb" />
                  <div className="addon-card__photo-actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => pickerRefs.current[type.key]?.click()}
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
                    <Icon name="plus" size={20} />
                  </label>
                  <p className="addon-card__photo-hint">
                    <span className="addon-card__photo-title">Photo · optional</span>
                    What guests make or do in this type.
                  </p>
                </>
              )}
            </div>

            <label className="label">
              Name
              <input
                type="text"
                value={type.name}
                maxLength={SESSION_TYPE_NAME_MAX}
                onChange={(event) => setType(index, { name: event.target.value })}
                className="input"
              />
            </label>
            <FieldHint>{fieldHints[`type-${index}-name`]}</FieldHint>

            <label className="label">
              Short description
              <textarea
                value={type.description}
                maxLength={SESSION_TYPE_DESCRIPTION_MAX}
                rows={2}
                onChange={(event) => setType(index, { description: event.target.value })}
                className="input input--textarea"
              />
            </label>

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
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => onChange([...types, emptySessionType()])}
        >
          + Add a session type
        </button>
      )}
      {types.length > 0 ? (
        <p className="hint">
          Removing a type keeps it on dates you already added. New dates need one of the types above.
        </p>
      ) : null}
    </section>
  )
}
