import { useState } from 'react'
import { generateSingpassKeys } from '../lib/singpassKeys'

function CopyBlock({ label, hint, value }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="keys-block">
      <p className="keys-block__label">{label}</p>
      <p className="hint">{hint}</p>
      <textarea className="input input--textarea keys-block__value" readOnly rows={5} value={value} />
      <button type="button" className="btn btn--secondary" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

/**
 * /admin/singpass-keys. Generates TryKai's Singpass signing and encryption
 * keys in this browser. Nothing is sent anywhere: the private keys go into
 * Supabase secrets by hand, the public set into the Singpass app.
 */
export default function AdminSingpassKeys() {
  const [keys, setKeys] = useState(null)
  const [error, setError] = useState('')

  async function generate() {
    setError('')
    try {
      setKeys(await generateSingpassKeys())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate keys.')
    }
  }

  return (
    <div className="page page--form">
      <div className="form-card">
        <h1 className="form-card__title">Singpass keys</h1>
        <p className="form-card__subtitle">
          Makes a new signing key and encryption key in this browser. Nothing is saved or sent.
          Make one set for staging and a separate set for production, and close the page when done.
        </p>

        {error && <p className="error-message error-message--spaced">{error}</p>}

        {!keys ? (
          <button type="button" className="btn btn--primary" onClick={generate}>
            Generate keys
          </button>
        ) : (
          <>
            <CopyBlock
              label="1. Supabase secret SINGPASS_SIGNING_KEY"
              hint="Private. Paste only into Edge Functions → Secrets of the matching Supabase project."
              value={keys.signingKey}
            />
            <CopyBlock
              label="2. Supabase secret SINGPASS_ENCRYPTION_KEY"
              hint="Private. Same place, same project."
              value={keys.encryptionKey}
            />
            <CopyBlock
              label="3. Singpass app JWKS (public)"
              hint="Safe to share. Paste into the Singpass app's JWKS field."
              value={keys.jwks}
            />
          </>
        )}
      </div>
    </div>
  )
}
