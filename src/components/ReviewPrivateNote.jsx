import {
  PRIVATE_NOTE_HINT,
  PRIVATE_NOTE_LABEL,
  PRIVATE_NOTE_MAX,
  PRIVATE_NOTE_OPTIONAL,
  PRIVATE_NOTE_PLACEHOLDER,
} from '../lib/twoWayReviews'

export default function ReviewPrivateNote({ value, onChange, id = 'review-private-note' }) {
  return (
    <div className="review-form__private">
      <label className="review-form__private-label" htmlFor={id}>
        {PRIVATE_NOTE_LABEL}
        <span className="review-form__private-optional">{PRIVATE_NOTE_OPTIONAL}</span>
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, PRIVATE_NOTE_MAX))}
        placeholder={PRIVATE_NOTE_PLACEHOLDER}
        rows={3}
        maxLength={PRIVATE_NOTE_MAX}
        className="input input--textarea"
      />
      <p className="review-form__private-hint">{PRIVATE_NOTE_HINT}</p>
    </div>
  )
}
