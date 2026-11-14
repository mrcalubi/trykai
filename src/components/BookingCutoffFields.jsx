import {
  ARRIVAL_INSTRUCTIONS_MAX,
  ARRIVAL_INSTRUCTIONS_PLACEHOLDER,
  BOOKING_CUTOFF_HOURS,
  bookingCutoffExample,
  bookingCutoffHours,
  bookingCutoffLabel,
} from '../lib/bookingCutoff'

export function BookingCutoffFields({ value, onChange }) {
  const hours = bookingCutoffHours(value)
  return (
    <fieldset className="wizard-fieldset booking-cutoff" aria-describedby="booking-cutoff-help">
      <legend className="wizard-fieldset__legend">How much notice do you need?</legend>
      <p className="booking-cutoff__intro">
        Guests can book until this long before a session starts.
      </p>
      <div className="choice-chips booking-cutoff__options">
        {BOOKING_CUTOFF_HOURS.map((option) => (
          <label
            key={option}
            className={`choice-chip${hours === option ? ' choice-chip--on' : ''}`}
          >
            <input
              type="radio"
              name="booking-cutoff"
              checked={hours === option}
              onChange={() => onChange(option)}
              className="visually-hidden"
            />
            {bookingCutoffLabel(option)}
          </label>
        ))}
      </div>
      <div id="booking-cutoff-help" className="booking-cutoff__example" aria-live="polite">
        <p>{bookingCutoffExample(hours)}</p>
        <p className="hint">More notice gives you time to buy materials or prepare add-ons.</p>
      </div>
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

export function CheckoutHostNote({ hostName, value, onChange, autoFocus = false }) {
  return (
    <label className="checkout-host-note">
      Note for {hostName} (optional)
      <input
        type="text"
        className="input"
        autoFocus={autoFocus}
        maxLength={120}
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, 120))}
      />
      <span className="hint">Anything you&apos;d like {hostName} to know.</span>
    </label>
  )
}

export function HostContactLinks({ phone }) {
  const call = `tel:${phone}`
  const chat = `https://wa.me/${String(phone).replace(/^\+/, '')}`
  return (
    <div className="booking-contact">
      <a href={call} className="ui-button ui-button--secondary">
        Call
      </a>
      <a href={chat} className="ui-button ui-button--secondary">
        WhatsApp
      </a>
    </div>
  )
}
