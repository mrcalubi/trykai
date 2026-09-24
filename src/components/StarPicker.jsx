import { useState } from 'react'

export default function StarPicker({ value, onChange }) {
  const [hovered, setHovered] = useState(0)
  const filledThrough = hovered || value

  return (
    <div
      className="star-picker"
      role="group"
      aria-label="Rating"
      onMouseLeave={() => setHovered(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          className={`star-picker__btn${star <= filledThrough ? ' star-picker__btn--active' : ''}`}
          aria-label={`${star} star${star !== 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
    </div>
  )
}
