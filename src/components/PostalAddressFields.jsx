import { useId, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { acceptedPlanningAreaFromLookup } from '../lib/areaSearch'
import { edgeFunctionErrorMessage } from '../lib/edgeFunctionError'
import { composeFullAddress, isValidPostal } from '../../supabase/functions/_shared/onemap.ts'
import PlanningAreaSelect from './PlanningAreaSelect'
import Button from './ui/Button'
import Icon from './ui/Icon'

const AREA_HINT = 'Filled from your postal code. Change it if guests know your spot by another name.'
const ADDRESS_PRIVACY = 'Hidden from guests until they book.'

export default function PostalAddressFields({
  value,
  onChange,
  area,
  onAreaChange,
  areaHint,
  allowChangeAddress = false,
}) {
  const areaId = useId()
  const [postal, setPostal] = useState('')
  const [unit, setUnit] = useState('')
  const [results, setResults] = useState([])
  const [picked, setPicked] = useState(null)
  const [status, setStatus] = useState('')
  const [looking, setLooking] = useState(false)
  const [postalOpen, setPostalOpen] = useState(!allowChangeAddress || !value)
  const lastLookedUp = useRef('')
  const requestId = useRef(0)

  function applyPlanningArea(raw) {
    const next = acceptedPlanningAreaFromLookup(raw, area)
    if (next) onAreaChange(next)
  }

  function applyPick(hit, nextUnit = unit) {
    setPicked(hit)
    onChange(composeFullAddress(hit.address, nextUnit))
    setStatus('')
  }

  async function lookup(code, { force = false } = {}) {
    if (!isValidPostal(code)) {
      setResults([])
      setPicked(null)
      setStatus('Enter a 6-digit postal code.')
      return
    }
    if (!force && code === lastLookedUp.current) return
    lastLookedUp.current = code
    const id = ++requestId.current
    setLooking(true)
    setStatus('')
    const { data, error } = await supabase.functions.invoke('lookup-postal-code', {
      body: { postal: code },
    })
    if (id !== requestId.current) return
    setLooking(false)
    const hits = Array.isArray(data?.results) ? data.results : []
    if (error || data?.error || hits.length === 0) {
      setResults([])
      setPicked(null)
      setStatus(
        (await edgeFunctionErrorMessage(error, data)) || 'No address matches that postal code.',
      )
      return
    }
    applyPlanningArea(data?.planning_area)
    setResults(hits)
    if (hits.length === 1) applyPick(hits[0])
  }

  function handlePostalChange(raw) {
    const next = raw.replace(/\D/g, '').slice(0, 6)
    requestId.current += 1
    setLooking(false)
    setPostal(next)
    setResults([])
    setStatus('')
    setUnit('')
    const keepSaved = allowChangeAddress && !picked
    setPicked(null)
    if (!keepSaved && value) onChange('')
    if (next !== lastLookedUp.current) lastLookedUp.current = ''
    if (isValidPostal(next)) lookup(next)
  }

  const showPostal = postalOpen
  const showCard = Boolean(value)

  return (
    <div className="postal-address">
      {showPostal ? (
        <label className="label">
          Postal code
          <input
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            value={postal}
            onChange={(event) => handlePostalChange(event.target.value)}
            placeholder="470012"
            className="input"
          />
        </label>
      ) : null}
      {looking ? (
        <p className="postal-address__looking" role="status">
          <span className="tk-spinner" aria-hidden="true" />
          Looking up your address…
        </p>
      ) : null}
      {status ? (
        <div className="postal-address__status">
          <p className="field-hint" role="status">
            {status}
          </p>
          <Button type="button" variant="secondary" onClick={() => lookup(postal.trim(), { force: true })}>
            Try again
          </Button>
        </div>
      ) : null}
      {results.length > 1 ? (
        <ul className="postal-address__list" role="listbox" aria-label="Matching addresses">
          {results.map((hit) => (
            <li key={hit.address}>
              <button
                type="button"
                role="option"
                aria-selected={picked?.address === hit.address}
                className={`postal-address__option${
                  picked?.address === hit.address ? ' postal-address__option--on' : ''
                }`}
                onClick={() => applyPick(hit)}
              >
                {hit.address}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {showCard ? (
        <div className="postal-address__card">
          <Icon name="check" size={16} className="postal-address__card-check" />
          <div className="postal-address__card-body">
            <p className="postal-address__card-address">{value}</p>
            <p className="hint">{ADDRESS_PRIVACY}</p>
          </div>
          {allowChangeAddress && !postalOpen ? (
            <button type="button" className="link-button" onClick={() => setPostalOpen(true)}>
              Change address
            </button>
          ) : null}
        </div>
      ) : null}
      {picked ? (
        <label className="label">
          Unit number (optional)
          <input
            type="text"
            value={unit}
            onChange={(event) => {
              const next = event.target.value
              setUnit(next)
              onChange(composeFullAddress(picked.address, next))
            }}
            placeholder="#05-12"
            className="input"
          />
        </label>
      ) : null}
      <label className="label" htmlFor={areaId}>
        Area guests see
        <PlanningAreaSelect
          id={areaId}
          value={area}
          onChange={onAreaChange}
          hideUninhabited
        />
      </label>
      <p className="hint">{AREA_HINT}</p>
      {areaHint}
    </div>
  )
}
