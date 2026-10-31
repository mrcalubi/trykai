import FormattedPrice from './FormattedPrice'
import { addonGuestUnitCents } from '../lib/pricing'
import {
  ADDON_NOTE_HINT,
  ADDON_NOTE_MAX,
  maxAddonQuantity,
  remainingForAddon,
} from '../lib/bookingAddons'

export default function CheckoutAddons({
  addons,
  quantities,
  guestsCount,
  remainingById,
  hostName,
  note,
  onQuantity,
  onNote,
}) {
  if (!addons?.length) return null

  const picked = addons.some((addon) => (quantities[addon.id] || 0) > 0)

  return (
    <div className="checkout-addons">
      <p className="checkout__label" id="checkout-addons-label">
        Make it extra <span className="checkout-addons__optional">· Optional</span>
      </p>
      <ul className="checkout-addons__list" aria-labelledby="checkout-addons-label">
        {addons.map((addon) => {
          const remaining = remainingForAddon(addon, remainingById)
          const max = maxAddonQuantity(addon, guestsCount, remaining)
          const quantity = quantities[addon.id] || 0
          const guestCents = addonGuestUnitCents(addon.price_cents)
          const showLeft = remaining != null && remaining <= 3
          return (
            <li key={addon.id} className="checkout-addons__item">
              <div className="checkout-addons__copy">
                <p className="checkout-addons__name">{addon.name}</p>
                <p className="checkout-addons__hint">
                  {addon.unit === 'booking' ? 'Once per booking' : 'For how many of you?'}
                </p>
                <p className="checkout-addons__price">
                  <FormattedPrice cents={guestCents} />
                  {addon.unit === 'booking' ? ' per booking' : ' per person'}
                </p>
                {showLeft ? (
                  <p className="checkout-addons__left">
                    {remaining} left this session
                  </p>
                ) : null}
              </div>
              {addon.unit === 'booking' ? (
                <button
                  type="button"
                  className={`checkout-addons__toggle${quantity === 1 ? ' checkout-addons__toggle--on' : ''}`}
                  aria-pressed={quantity === 1}
                  disabled={quantity === 0 && max < 1}
                  onClick={() => onQuantity(addon.id, quantity === 1 ? 0 : 1)}
                >
                  {quantity === 1 ? 'Added' : 'Add'}
                </button>
              ) : (
                <div className="guest-stepper__controls">
                  <button
                    type="button"
                    className="guest-stepper__btn"
                    aria-label={`Fewer ${addon.name}`}
                    disabled={quantity <= 0}
                    onClick={() => onQuantity(addon.id, quantity - 1)}
                  >
                    −
                  </button>
                  <span className="guest-stepper__count" aria-live="polite">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    className="guest-stepper__btn"
                    aria-label={`More ${addon.name}`}
                    disabled={quantity >= max}
                    onClick={() => onQuantity(addon.id, quantity + 1)}
                  >
                    +
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {picked ? (
        <label className="checkout-addons__note">
          <span>Anything {hostName} should know? {ADDON_NOTE_HINT}</span>
          <input
            type="text"
            maxLength={ADDON_NOTE_MAX}
            value={note}
            onChange={(event) => onNote(event.target.value.slice(0, ADDON_NOTE_MAX))}
          />
        </label>
      ) : null}
    </div>
  )
}
