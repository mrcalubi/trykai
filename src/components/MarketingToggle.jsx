import { useEffect, useState } from 'react'
import { marketingOptIn, setMarketingOptIn } from '../lib/marketing'

/** Settings: marketing email choice. Saves on change. Hidden until it loads. */
export default function MarketingToggle() {
  const [optIn, setOptIn] = useState(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    let cancelled = false
    marketingOptIn().then((value) => {
      if (!cancelled) setOptIn(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (optIn === null) return null

  async function change(next) {
    setSaving(true)
    setStatus('')
    const saved = await setMarketingOptIn(next)
    setSaving(false)
    if (saved === null) {
      setStatus('Could not save. Try again.')
      return
    }
    setOptIn(saved)
    setStatus(saved ? 'Saved. We email at most once a week.' : "Saved. You won't get offers by email.")
  }

  return (
    <div className="settings-marketing">
      <label className="toggle-card">
        <input
          type="checkbox"
          checked={optIn}
          disabled={saving}
          onChange={(event) => change(event.target.checked)}
        />
        <span className="toggle-card__copy">
          <span className="toggle-card__title">Allow TryKai to email me new sessions and offers (at most once a week)</span>
        </span>
      </label>
      {status ? (
        <p className="settings-hint" role="status">
          {status}
        </p>
      ) : null}
    </div>
  )
}
