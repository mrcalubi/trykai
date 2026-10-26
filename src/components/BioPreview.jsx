import { useState } from 'react'
import { previewBio } from '../lib/bioPreview'

export default function BioPreview({
  bio,
  lines = 2,
  maxChars = 160,
  className = 'detail-host__bio',
}) {
  const [open, setOpen] = useState(false)
  const { preview, truncated } = previewBio(bio, { lines, maxChars })
  const text = String(bio ?? '').trim()

  if (!text) return null

  return (
    <p className={className}>
      {open || !truncated ? text : preview}
      {truncated ? (
        <button
          type="button"
          className="detail-host__more"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Less' : '… more'}
        </button>
      ) : null}
    </p>
  )
}
