import {
  ARRIVAL_INSTRUCTIONS_MAX,
  ARRIVAL_INSTRUCTIONS_PLACEHOLDER,
  BOOKING_CUTOFF_HOURS,
  bookingCutoffHours,
} from '../lib/bookingCutoff'

export function BookingCutoffFields({ value, onChange }) {
  const hours = bookingCutoffHours(value)
  return (
    <fieldset className="booking-cutoff">
      <legend className="booking-cutoff__legend">Bookings close</legend>
      <div className="booking-cutoff__options">
        {BOOKING_CUTOFF_HOURS.map((option) => (
          <label key={option} className="booking-cutoff__option">
            <input
              type="radio"
              name="booking-cutoff"
              checked={hours === option}
              onChange={() => onChange(option)}
            />
            {option} hours
          </label>
        ))}
      </div>
      <p className="hint">Pick longer if you need time to buy materials or prepare add-ons.</p>
    </fieldset>
  )
}

export function ArrivalInstructionsField({ value, onChange }) {
  return (
    <label className="label">
      How to find me
      <textarea
        className="input input--textarea"
        value={value}
        maxLength={ARRIVAL_INSTRUCTIONS_MAX}
        rows={3}
        placeholder={ARRIVAL_INSTRUCTIONS_PLACEHOLDER}
        onChange={(event) => onChange(event.target.value.slice(0, ARRIVAL_INSTRUCTIONS_MAX))}
      />
      <span className="hint">
        Optional. {value.length}/{ARRIVAL_INSTRUCTIONS_MAX}. Only confirmed guests see this.
      </span>
    </label>
  )
}

export function CheckoutHostNote({ hostName, value, onChange }) {
  return (
    <label className="checkout-host-note">
      Note for {hostName} (optional)
      <input
        type="text"
        className="input"
        maxLength={120}
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, 120))}
      />
      <span className="hint">For example, allergies or running a little late.</span>
    </label>
  )
}

export function HostContactLinks({ phone }) {
  const call = `tel:${phone}`
  const chat = `https://wa.me/${String(phone).replace(/^\+/, '')}`
  return (
    <p className="booking-contact">
      <a href={call}>Call</a>
      {' · '}
      <a href={chat}>WhatsApp</a>
    </p>
  )
}
