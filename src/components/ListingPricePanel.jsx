import FormattedPrice from './FormattedPrice'

export default function ListingPricePanel({ breakdown, groupSize }) {
  if (!breakdown) return null

  return (
    <div className="price-panel" aria-live="polite">
      <p className="price-panel__row">
        <span>Guests pay</span>
        <span className="price-panel__amount">
          <FormattedPrice cents={breakdown.guestsPayCents} />
        </span>
      </p>
      {breakdown.youReceiveCents != null ? (
        <p className="price-panel__row">
          <span>You receive per guest</span>
          <span className="price-panel__amount">
            <FormattedPrice cents={breakdown.youReceiveCents} />
          </span>
        </p>
      ) : null}
      {breakdown.afterFeeCents != null ? (
        <p className="price-panel__row price-panel__row--small">
          <span>
            After your first {breakdown.feeFreeBookings} bookings ({breakdown.feePercent}% host
            fee)
          </span>
          <span className="price-panel__amount">
            <FormattedPrice cents={breakdown.afterFeeCents} />
          </span>
        </p>
      ) : null}
      {breakdown.fullSessionHighCents != null ? (
        <p className="price-panel__row price-panel__row--total">
          <span>A full session of {groupSize} pays you</span>
          <span className="price-panel__amount">
            {breakdown.fullSessionLowCents != null ? (
              <>
                <FormattedPrice cents={breakdown.fullSessionLowCents} />
                –
                <FormattedPrice cents={breakdown.fullSessionHighCents} />
              </>
            ) : (
              <FormattedPrice cents={breakdown.fullSessionHighCents} />
            )}
          </span>
        </p>
      ) : null}
      {breakdown.fullSessionLowCents != null ? (
        <p className="price-panel__note">depending on how guests book</p>
      ) : null}
    </div>
  )
}
