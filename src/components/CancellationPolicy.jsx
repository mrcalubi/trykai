import { useState } from 'react'
import {
  CANCELLATION_POLICY_ITEMS,
  GUEST_CANCELLATION_POLICY_ITEMS,
  GUEST_HOST_CANCEL_COPY,
} from '../lib/cancellationPolicy'

export function CancellationPolicyInfo() {
  return (
    <div className="cancellation-policy cancellation-policy--static">
      <p className="cancellation-policy__heading">Cancellation Policy</p>
      <CancellationPolicyContent items={CANCELLATION_POLICY_ITEMS} />
    </div>
  )
}

export function GuestCancellationNote() {
  const [open, setOpen] = useState(false)

  return (
    <div className="guest-cancel-note">
      <p className="guest-cancel-note__line">
        Full refund if you cancel 48+ hours before ·{' '}
        <button
          type="button"
          className="guest-cancel-note__link"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
        >
          Cancellation policy
        </button>
      </p>
      {open ? (
        <div className="guest-cancel-note__rules">
          <CancellationPolicyContent items={GUEST_CANCELLATION_POLICY_ITEMS} />
          <p className="cancellation-policy__row">{GUEST_HOST_CANCEL_COPY}</p>
        </div>
      ) : null}
    </div>
  )
}

function CancellationPolicyContent({ items }) {
  return (
    <div className="cancellation-policy__content">
      {items.map((item) => (
        <p key={item.scenario} className="cancellation-policy__row">
          <strong>{item.scenario}:</strong> {item.resolution}
        </p>
      ))}
    </div>
  )
}
