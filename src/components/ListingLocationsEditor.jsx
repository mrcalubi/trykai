import { useId, useState } from 'react'
import PostalAddressFields from './PostalAddressFields'
import { ArrivalInstructionsField } from './BookingCutoffFields'
import FieldHint from './FieldHint'
import Button from './ui/Button'
import Icon from './ui/Icon'
import {
  emptyLocation,
  LOCATION_LABEL_MAX,
  MAX_LOCATIONS,
  MULTI_LOCATION_CONFIRM,
  MULTI_LOCATION_DISCLAIMER,
  MULTI_LOCATION_GUEST_NOTE,
} from '../lib/listingLocations'

function datesText(count) {
  return `${count} upcoming ${count === 1 ? 'date' : 'dates'}`
}

function LabelField({ value, onChange }) {
  return (
    <label className="label">
      Name guests see · optional
      <input
        type="text"
        className="input"
        value={value}
        maxLength={LOCATION_LABEL_MAX}
        placeholder="e.g. Tampines studio"
        onChange={(event) => onChange(event.target.value.slice(0, LOCATION_LABEL_MAX))}
      />
      <span className="hint">Without a name, guests see the area.</span>
    </label>
  )
}

/**
 * Where it happens (00059). One location, as before, unless the host turns on
 * multiple locations after ticking that they can run every location at the
 * same time. Location 1 is the listing's own address, area and directions;
 * locations 2 to 4 are `extras`. A location with upcoming dates can't be
 * removed here: the database refuses it, so the card says why instead.
 */
export default function ListingLocationsEditor({
  area,
  onAreaChange,
  fullAddress,
  onFullAddressChange,
  arrivalInstructions,
  onArrivalChange,
  primaryId = null,
  primaryLabel = '',
  onPrimaryLabelChange,
  multiLocation = false,
  onMultiLocationChange,
  extras = [],
  onExtrasChange,
  fieldHints = {},
  allowChangeAddress = false,
  datesByLocationId = {},
  available = true,
}) {
  const confirmId = useId()
  const [confirming, setConfirming] = useState(false)
  const [ticked, setTicked] = useState(false)
  const total = 1 + extras.length
  const extrasWithDates = extras.filter((location) => location.id && datesByLocationId[location.id] > 0)

  function setExtra(key, patch) {
    onExtrasChange(extras.map((location) => (location.key === key ? { ...location, ...patch } : location)))
  }

  function turnOn() {
    onMultiLocationChange(true)
    if (extras.length === 0) onExtrasChange([emptyLocation()])
    setConfirming(false)
    setTicked(false)
  }

  function turnOff() {
    onExtrasChange([])
    onMultiLocationChange(false)
  }

  const primaryFields = (
    <>
      <PostalAddressFields
        value={fullAddress}
        onChange={onFullAddressChange}
        area={area}
        onAreaChange={onAreaChange}
        areaHint={<FieldHint>{fieldHints.area}</FieldHint>}
        allowChangeAddress={allowChangeAddress}
      />
      <FieldHint>{fieldHints.fullAddress}</FieldHint>
      <ArrivalInstructionsField value={arrivalInstructions} onChange={onArrivalChange} />
    </>
  )

  if (!multiLocation) {
    return (
      <div className="locations-editor">
        {primaryFields}
        {!available ? null : confirming ? (
          <div className="locations-confirm" role="group" aria-labelledby={`${confirmId}-title`}>
            <p id={`${confirmId}-title`} className="locations-confirm__title">
              Multiple locations
            </p>
            <p className="locations-confirm__text">{MULTI_LOCATION_DISCLAIMER}</p>
            <p className="hint">{MULTI_LOCATION_GUEST_NOTE}</p>
            <label className="locations-confirm__check">
              <input type="checkbox" checked={ticked} onChange={(event) => setTicked(event.target.checked)} />
              <span>{MULTI_LOCATION_CONFIRM}</span>
            </label>
            <div className="locations-confirm__actions">
              <Button type="button" variant="primary" disabled={!ticked} onClick={turnOn}>
                Turn on multiple locations
              </Button>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setConfirming(false)
                  setTicked(false)
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="locations-offer">
            <div className="locations-offer__text">
              <p className="locations-offer__title">Run this at more than one place?</p>
              <p className="hint">For hosts with a team who can teach at each place at the same time.</p>
            </div>
            <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
              Add a location
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="locations-editor">
      <div className="locations-editor__head">
        <p className="locations-editor__intro">
          Each location runs its own sessions with their own spots, so they fill up separately.
        </p>
        <span className="locations-editor__count">
          {total} of {MAX_LOCATIONS}
        </span>
      </div>

      <ol className="locations-editor__list">
        <li className="location-card">
          <div className="location-card__head">
            <h3 className="location-card__title">Location 1</h3>
            {primaryId && datesByLocationId[primaryId] > 0 ? (
              <span className="location-card__dates">{datesText(datesByLocationId[primaryId])}</span>
            ) : null}
          </div>
          <LabelField value={primaryLabel} onChange={onPrimaryLabelChange} />
          {primaryFields}
        </li>

        {extras.map((location, index) => {
          const number = index + 2
          const dates = location.id ? datesByLocationId[location.id] ?? 0 : 0
          return (
            <li key={location.key} className="location-card">
              <div className="location-card__head">
                <h3 className="location-card__title">Location {number}</h3>
                {dates > 0 ? (
                  <span className="location-card__dates">{datesText(dates)}</span>
                ) : (
                  <button
                    type="button"
                    className="link-button location-card__remove"
                    aria-label={`Remove location ${number}`}
                    onClick={() => onExtrasChange(extras.filter((item) => item.key !== location.key))}
                  >
                    Remove
                  </button>
                )}
              </div>
              {dates > 0 ? (
                <p className="hint location-card__locked">
                  To remove this location, first remove its dates in Hosting.
                </p>
              ) : null}
              <LabelField value={location.label} onChange={(label) => setExtra(location.key, { label })} />
              <PostalAddressFields
                value={location.fullAddress}
                onChange={(next) => setExtra(location.key, { fullAddress: next })}
                area={location.area}
                onAreaChange={(next) => setExtra(location.key, { area: next })}
                areaHint={<FieldHint>{fieldHints[`location-${index}-area`]}</FieldHint>}
                allowChangeAddress={allowChangeAddress && Boolean(location.id)}
              />
              <FieldHint>{fieldHints[`location-${index}-fullAddress`]}</FieldHint>
              <ArrivalInstructionsField
                value={location.arrivalInstructions}
                onChange={(next) => setExtra(location.key, { arrivalInstructions: next })}
              />
            </li>
          )
        })}
      </ol>

      {total < MAX_LOCATIONS ? (
        <button
          type="button"
          className="locations-editor__add"
          onClick={() => onExtrasChange([...extras, emptyLocation()])}
        >
          <Icon name="plus" size={16} strokeWidth={2.4} />
          Add another location
        </button>
      ) : null}

      <p className="hint">{MULTI_LOCATION_GUEST_NOTE}</p>

      <div className="locations-editor__off">
        <button
          type="button"
          className="link-button"
          disabled={extrasWithDates.length > 0}
          onClick={turnOff}
        >
          Turn off multiple locations
        </button>
        {extrasWithDates.length > 0 ? (
          <p className="hint">To turn this off, first remove the dates at your other locations in Hosting.</p>
        ) : null}
      </div>
    </div>
  )
}
