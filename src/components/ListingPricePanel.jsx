import { useEffect, useId, useRef, useState } from 'react'
import FormattedPrice from './FormattedPrice'
import Icon from './ui/Icon'
import { GROUP_DISCOUNT_TIERS } from '../lib/pricing'
import { formatCents } from '../lib/cancellationPolicy'

export default function ListingPricePanel({ breakdown, groupSize }) {
  const [open, setOpen] = useState(false)
  const popoverId = useId()
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event) {
      if (!wrapRef.current?.contains(event.target)) setOpen(false)
    }
    function onKey(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!breakdown) return null

  const spots = groupSize || breakdown.groupSize || 1
  const showYouGet = breakdown.youReceiveCents != null
  const footnote =
    breakdown.isFoundingHost === true
      ? 'Founding host: no host fee, ever.'
      : breakdown.isFoundingHost === false
        ? '10% host fee from your 4th booking.'
        : null

  return (
    <div className="price-panel" aria-live="polite" ref={wrapRef}>
      <div className={`price-panel__figures${showYouGet ? '' : ' price-panel__figures--solo'}`}>
        <p className="price-panel__figure">
          <span className="price-panel__figure-label">Guests pay</span>
          <span className="price-panel__figure-amount">
            <FormattedPrice cents={breakdown.guestsPayCents} />
          </span>
          <span className="price-panel__figure-unit">per person</span>
        </p>
        {showYouGet ? (
          <p className="price-panel__figure">
            <span className="price-panel__figure-label">You get</span>
            <span className="price-panel__figure-amount">
              <FormattedPrice cents={breakdown.youReceiveCents} />
            </span>
            <span className="price-panel__figure-unit">per person</span>
          </p>
        ) : null}
      </div>

      {breakdown.fullSessionHighCents != null ? (
        <div className="price-panel__session">
          <p className="price-panel__session-line">
            Full session of {spots}:{' '}
            <span className="price-panel__amount">
              <FormattedPrice cents={breakdown.fullSessionCents ?? breakdown.fullSessionHighCents} />
            </span>
          </p>
          <button
            type="button"
            className="price-panel__info"
            aria-label="How these numbers work"
            aria-expanded={open}
            aria-controls={popoverId}
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name="info" size={16} />
          </button>
          {open ? (
            <div id={popoverId} className="price-panel__popover" role="note">
              {breakdown.groupPricing ? (
                <>
                  <p>If guests book together:</p>
                  <ul>
                    {GROUP_DISCOUNT_TIERS.map((tier) => (
                      <li key={String(tier.guests)}>
                        {tier.guests} guests: {tier.percent}% off the lesson
                      </li>
                    ))}
                  </ul>
                  <p>
                    One group of {spots}: {formatCents(breakdown.togetherCents)} before any host
                    fee.
                  </p>
                </>
              ) : (
                <p>Group discounts are off. Guests pay the same per person at every group size.</p>
              )}
              {breakdown.afterFeeCents != null ? (
                <p>
                  After the 10% host fee (from your 4th booking):{' '}
                  {formatCents(breakdown.afterFeeCents)} per person.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {footnote ? <p className="price-panel__note">{footnote}</p> : null}
    </div>
  )
}
