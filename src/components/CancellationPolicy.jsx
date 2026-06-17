import { useState } from 'react'
import { CANCELLATION_POLICY_ITEMS } from '../lib/cancellationPolicy'

export function CancellationPolicyCollapsible() {
  const [open, setOpen] = useState(false)

  return (
    <div className="cancellation-policy">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="cancellation-policy__toggle"
        aria-expanded={open}
      >
        Cancellation Policy
        <span className="cancellation-policy__chevron">{open ? '−' : '+'}</span>
      </button>
      {open && <CancellationPolicyContent />}
    </div>
  )
}

export function CancellationPolicyInfo() {
  return (
    <div className="cancellation-policy cancellation-policy--static">
      <p className="cancellation-policy__heading">Cancellation Policy</p>
      <CancellationPolicyContent />
    </div>
  )
}

function CancellationPolicyContent() {
  return (
    <div className="cancellation-policy__content">
      {CANCELLATION_POLICY_ITEMS.map((item) => (
        <p key={item.scenario} className="cancellation-policy__row">
          <strong>{item.scenario}:</strong> {item.resolution}
        </p>
      ))}
    </div>
  )
}
