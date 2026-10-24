import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { edgeFunctionErrorMessage } from '../lib/edgeFunctionError'
import { composeFullAddress, isValidPostal } from '../../supabase/functions/_shared/onemap.ts'
import Button from './ui/Button'

export default function PostalAddressFields({ value, onChange }) {
  const [postal, setPostal] = useState('')
  const [unit, setUnit] = useState('')
  const [results, setResults] = useState([])
  const [picked, setPicked] = useState(null)
  const [status, setStatus] = useState('')
  const [looking, setLooking] = useState(false)

  function applyPick(hit, nextUnit = unit) {
    setPicked(hit)
    onChange(composeFullAddress(hit.address, nextUnit))
    setStatus('')
  }

  async function lookup() {
    const code = postal.trim()
    if (!isValidPostal(code)) {
      setResults([])
      setPicked(null)
      setStatus('Enter a 6-digit postal code.')
      return
    }
    setLooking(true)
    setStatus('')
    const { data, error } = await supabase.functions.invoke('lookup-postal-code', {
      body: { postal: code },
    })
    setLooking(false)
    const hits = Array.isArray(data?.results) ? data.results : []
    if (error || data?.error || hits.length === 0) {
      setResults([])
      setPicked(null)
      setStatus(await edgeFunctionErrorMessage(error, data) || 'No address matches that postal code.')
      return
    }
    setResults(hits)
    if (hits.length === 1) applyPick(hits[0])
  }

  return (
    <div className="postal-address">
      <label className="label">
        Postal code
        <input
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          value={postal}
          onChange={(event) => setPostal(event.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="470012"
          className="input"
        />
      </label>
      <Button type="button" variant="secondary" onClick={lookup} loading={looking} loadingLabel="Looking up">
        Find addresses
      </Button>
      {status ? (
        <p className="field-hint" role="status">
          {status}
        </p>
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
      <label className="label">
        Unit number (optional)
        <input
          type="text"
          value={unit}
          onChange={(event) => {
            const next = event.target.value
            setUnit(next)
            if (picked) onChange(composeFullAddress(picked.address, next))
          }}
          placeholder="#05-12"
          className="input"
        />
      </label>
      <label className="label">
        Full address
        <input
          type="text"
          value={value}
          readOnly
          className="input"
          placeholder="Look up a postal code to fill this"
        />
        <span className="hint">Hidden from browse. Revealed only after a confirmed booking.</span>
      </label>
    </div>
  )
}
