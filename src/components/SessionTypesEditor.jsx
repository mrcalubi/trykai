import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from './ui/Button'
import FieldHint from './FieldHint'
import Icon from './ui/Icon'
import { revokeIfBlobUrl } from '../lib/coverCrop'
import { IMAGE_ACCEPT } from '../lib/heicImage'
import { filesToPhotos } from '../lib/listingPhotos'
import { sessionDayLabel } from '../lib/hostSessions'
import {
  MAX_SESSION_TYPES,
  SESSION_TYPE_DESCRIPTION_MAX,
  SESSION_TYPE_NAME_MAX,
  classDates,
  emptySessionType,
} from '../lib/sessionTypes'

function upcomingLabel(count) {
  return `${count} upcoming ${count === 1 ? 'date' : 'dates'}`
}

function ClassThumb({ photo, className = '' }) {
  return photo ? (
    <img src={photo.previewUrl} alt="" className={`class-card__thumb ${className}`} />
  ) : (
    <span className={`class-card__thumb class-card__thumb--empty ${className}`} aria-hidden="true">
      <Icon name="layers" size={22} />
    </span>
  )
}

/**
 * Edit listing → Classes (session types, 00056). Each class is a summary card
 * with its dates and an Add dates button; Edit opens it in place with its own
 * Save. Up to 4. Every class is the listing's price.
 */
export default function SessionTypesEditor({
  types,
  savedTypes = [],
  onChange,
  onSave,
  saving = false,
  fieldHints = {},
  upcomingSessions = [],
  listingId,
  priceLabel = '',
}) {
  const pickerRef = useRef(null)
  const [editingKey, setEditingKey] = useState(null)
  const [confirmRemoveKey, setConfirmRemoveKey] = useState(null)
  const savedByKey = Object.fromEntries(savedTypes.map((type) => [type.key, type]))
  const atCap = types.length >= MAX_SESSION_TYPES

  function setType(key, patch) {
    onChange(types.map((type) => (type.key === key ? { ...type, ...patch } : type)))
  }

  async function pickPhoto(key, fileList) {
    const { photos } = await filesToPhotos(fileList, 1)
    const photo = photos[0]
    if (!photo) return
    revokeIfBlobUrl(types.find((type) => type.key === key)?.photo?.previewUrl)
    setType(key, { photo })
  }

  function cancelEdit(type) {
    const saved = savedByKey[type.key]
    if (type.photo && type.photo !== saved?.photo) revokeIfBlobUrl(type.photo.previewUrl)
    onChange(
      saved ? types.map((item) => (item.key === type.key ? saved : item)) : types.filter((item) => item.key !== type.key),
    )
    setEditingKey(null)
    setConfirmRemoveKey(null)
  }

  async function save() {
    const ok = await onSave?.()
    if (ok) setEditingKey(null)
  }

  async function remove(type) {
    revokeIfBlobUrl(type.photo?.previewUrl)
    const next = types.filter((item) => item.key !== type.key)
    onChange(next)
    setConfirmRemoveKey(null)
    setEditingKey(null)
    if (savedByKey[type.key]) await onSave?.({ sessionTypes: next })
  }

  function addClass() {
    const fresh = emptySessionType()
    onChange([...types, fresh])
    setEditingKey(fresh.key)
  }

  return (
    <section className="classes-editor" aria-label="Classes">
      <div className="classes-editor__head">
        <p className="classes-editor__price">
          {priceLabel ? `All classes cost the listing price, ${priceLabel}.` : 'All classes cost the listing price.'}
        </p>
        <span className="classes-editor__count">
          {types.length} of {MAX_SESSION_TYPES}
        </span>
      </div>

      <ul className="classes-editor__list">
        {types.map((type, index) => {
          const { count, next } = type.id ? classDates(upcomingSessions, type.id) : { count: 0, next: null }
          const name = type.name.trim()

          if (editingKey !== type.key) {
            return (
              <li key={type.key} className="class-card">
                <ClassThumb photo={type.photo} />
                <div className="class-card__text">
                  <p className="class-card__name">{name || 'Untitled class'}</p>
                  {type.description ? <p className="class-card__desc">{type.description}</p> : null}
                  <p className="class-card__dates">
                    {!type.id
                      ? 'Not saved yet'
                      : count > 0
                        ? `${upcomingLabel(count)} · next ${sessionDayLabel(next.starts_at)}`
                        : 'No dates yet'}
                  </p>
                </div>
                <div className="class-card__actions">
                  {type.id ? (
                    <Link
                      to={`/hosting?add=${listingId}&class=${type.id}`}
                      className="btn btn--secondary class-card__add"
                      aria-label={`Add dates for ${name}`}
                    >
                      <Icon name="plus" size={16} strokeWidth={2.4} />
                      Add dates
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className="class-card__edit"
                    aria-label={`Edit ${name || 'class'}`}
                    onClick={() => {
                      setConfirmRemoveKey(null)
                      setEditingKey(type.key)
                    }}
                  >
                    Edit
                  </button>
                </div>
              </li>
            )
          }

          const pickerId = `class-photo-${type.key}`
          return (
            <li key={type.key} className="class-card class-card--editing">
              <div className="class-card__edit-head">
                <h3 className="class-card__edit-title">
                  {savedByKey[type.key] ? `Editing: ${savedByKey[type.key].name}` : 'New class'}
                </h3>
                {type.id ? <span className="class-card__dates">{upcomingLabel(count)}</span> : null}
              </div>
              <div className="class-card__fields">
                <div className="class-card__photo">
                  <input
                    id={pickerId}
                    ref={pickerRef}
                    type="file"
                    accept={IMAGE_ACCEPT}
                    aria-label={type.photo ? 'Change photo' : 'Add photo'}
                    className="visually-hidden"
                    onChange={(event) => {
                      pickPhoto(type.key, event.target.files)
                      event.target.value = ''
                    }}
                  />
                  {type.photo ? (
                    <>
                      <ClassThumb photo={type.photo} className="class-card__thumb--large" />
                      <div className="class-card__photo-actions">
                        <button type="button" className="class-card__link" onClick={() => pickerRef.current?.click()}>
                          Change
                        </button>
                        <button
                          type="button"
                          className="class-card__link"
                          onClick={() => {
                            revokeIfBlobUrl(type.photo?.previewUrl)
                            setType(type.key, { photo: null })
                          }}
                        >
                          Remove photo
                        </button>
                      </div>
                    </>
                  ) : (
                    <label htmlFor={pickerId} className="class-card__add-photo">
                      <Icon name="camera" size={20} />
                      <span className="class-card__add-photo-title">Add photo</span>
                      <span className="class-card__add-photo-hint">Optional. What guests make.</span>
                    </label>
                  )}
                </div>
                <div className="class-card__inputs">
                  <label className="label">
                    Name
                    <input
                      type="text"
                      value={type.name}
                      maxLength={SESSION_TYPE_NAME_MAX}
                      onChange={(event) => setType(type.key, { name: event.target.value })}
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
                      onChange={(event) => setType(type.key, { description: event.target.value })}
                      className="input input--textarea"
                    />
                  </label>
                  <p className="class-card__hint">Shown on your listing, at checkout and on the guest&apos;s booking.</p>
                </div>
              </div>
              <div className="class-card__foot">
                <div className="class-card__remove">
                  {confirmRemoveKey === type.key ? (
                    <>
                      <p className="class-card__remove-ask">Remove {name || 'this class'}?</p>
                      <div className="class-card__remove-actions">
                        <button
                          type="button"
                          className="class-card__remove-btn"
                          disabled={saving}
                          onClick={() => remove(type)}
                        >
                          Yes, remove
                        </button>
                        <button type="button" className="class-card__link" onClick={() => setConfirmRemoveKey(null)}>
                          Keep it
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="class-card__remove-btn"
                      onClick={() => (savedByKey[type.key] ? setConfirmRemoveKey(type.key) : cancelEdit(type))}
                    >
                      Remove this class
                    </button>
                  )}
                  {savedByKey[type.key] ? (
                    <p className="class-card__hint">
                      New dates can&apos;t use it.{' '}
                      {count > 0
                        ? `Its ${count === 1 ? 'date stays' : `${count} dates stay`} as ${count === 1 ? 'it is' : 'they are'}.`
                        : 'It has no upcoming dates.'}
                    </p>
                  ) : null}
                </div>
                <div className="class-card__save">
                  <button type="button" className="btn btn--secondary" onClick={() => cancelEdit(type)}>
                    Cancel
                  </button>
                  <Button type="button" variant="primary" loading={saving} loadingLabel="Saving" onClick={save}>
                    Save
                  </Button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {atCap || editingKey ? null : (
        <button type="button" className="classes-editor__add" onClick={addClass}>
          <Icon name="plus" size={16} strokeWidth={2.4} />
          {types.length === 0 ? 'Add a class' : 'Add another class'}
        </button>
      )}

      <div className="classes-editor__how">
        <p className="classes-editor__how-title">How classes and dates fit together</p>
        <ol>
          <li>Add a class here, or straight from Add dates.</li>
          <li>In Add dates, pick the class first. Every date in that batch is that class, and it can&apos;t change later.</li>
          <li>You can only teach one class at a time, so two classes can&apos;t overlap.</li>
        </ol>
      </div>
    </section>
  )
}
