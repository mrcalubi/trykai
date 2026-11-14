import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import FormattedPrice from './FormattedPrice'
import Icon from './ui/Icon'
import { addonGuestUnitCents } from '../lib/pricing'
import {
  checkoutExtrasSummary,
  guestAddonPriceParts,
  maxAddonQuantity,
  remainingForAddon,
} from '../lib/bookingAddons'

/**
 * Checkout extras as one row ("Make it extra · from $9"). Tapping it opens a
 * panel with the extras; nothing changes on the checkout until "Add to
 * booking", and closing the panel keeps what was there before.
 */
export default function CheckoutAddons({
  addons,
  quantities,
  guestsCount,
  remainingById,
  onApply,
}) {
  const [draft, setDraft] = useState(null)
  const rowRef = useRef(null)

  if (!addons?.length) return null

  const summary = checkoutExtrasSummary(addons, quantities)

  function close() {
    setDraft(null)
    rowRef.current?.focus()
  }

  return (
    <>
      <button
        ref={rowRef}
        type="button"
        className={`extras-row${summary.picked ? ' extras-row--picked' : ''}`}
        aria-haspopup="dialog"
        onClick={() => setDraft({ ...quantities })}
      >
        <span className="extras-row__icon" aria-hidden="true">
          <Icon name="star" size={18} />
        </span>
        <span className="extras-row__copy">
          <span className="extras-row__title">Make it extra</span>
          <span className="extras-row__sub">{summary.text}</span>
        </span>
        <span className="extras-row__price">
          {summary.picked ? '+' : 'from '}
          <FormattedPrice cents={summary.cents} />
        </span>
        <Icon name="chevronRight" size={18} />
      </button>

      {draft ? (
        <ExtrasSheet
          addons={addons}
          draft={draft}
          guestsCount={guestsCount}
          remainingById={remainingById}
          onDraft={setDraft}
          onClose={close}
          onApply={() => {
            onApply(draft)
            close()
          }}
        />
      ) : null}
    </>
  )
}

function ExtrasSheet({ addons, draft, guestsCount, remainingById, onDraft, onClose, onApply }) {
  const closeRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const total = checkoutExtrasSummary(addons, draft)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  // Once per opening: focus Close, stop the page scrolling under the panel,
  // and let Escape close it wherever focus is.
  useEffect(() => {
    closeRef.current?.focus()
    document.body.classList.add('extras-sheet-open')
    function onKey(event) {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('extras-sheet-open')
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  function setQuantity(id, quantity) {
    onDraft((current) => ({ ...current, [id]: Math.max(0, quantity) }))
  }

  return createPortal(
    <div
      className="extras-sheet"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="extras-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="extras-sheet-title"
      >
        <span className="extras-sheet__handle" aria-hidden="true" />
        <div className="extras-sheet__head">
          <h2 id="extras-sheet-title" className="extras-sheet__title">
            Make it extra
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="extras-sheet__close"
            aria-label="Close extras"
            onClick={onClose}
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <p className="extras-sheet__intro">Optional. Pick any for this booking.</p>

        <ul className="extras-sheet__list">
          {addons.map((addon) => {
            const remaining = remainingForAddon(addon, remainingById)
            const max = maxAddonQuantity(addon, guestsCount, remaining)
            const quantity = Number(draft[addon.id]) || 0
            const perBooking = addon.unit === 'booking'
            const picked = quantity > 0
            return (
              <li key={addon.id} className={`extras-card${picked ? ' extras-card--on' : ''}`}>
                <div className="extras-card__main">
                  {addon.photo?.remoteUrl ? (
                    <img src={addon.photo.remoteUrl} alt="" className="extras-card__thumb" />
                  ) : (
                    <span className="extras-card__thumb extras-card__thumb--empty" aria-hidden="true">
                      <Icon name="sparkle" size={22} />
                    </span>
                  )}
                  <div className="extras-card__copy">
                    <p className="extras-card__name">{addon.name}</p>
                    {addon.description ? (
                      <p className="extras-card__desc">{addon.description}</p>
                    ) : null}
                    <p className="extras-card__price">
                      <FormattedPrice cents={addonGuestUnitCents(addon.price_cents)} />{' '}
                      {guestAddonPriceParts(addon).unit}
                    </p>
                    {remaining != null && remaining <= 3 ? (
                      <p className="extras-card__left">
                        {remaining > 0 ? `${remaining} left this session` : 'None left this session'}
                      </p>
                    ) : null}
                  </div>
                  {perBooking || !picked ? (
                    <button
                      type="button"
                      // Back from the stepper (Fewer to 0): keep focus on this card.
                      autoFocus={!perBooking}
                      className={`extras-card__add${picked ? ' extras-card__add--on' : ''}`}
                      aria-label={`Add ${addon.name}`}
                      aria-pressed={perBooking ? picked : undefined}
                      disabled={!picked && max < 1}
                      onClick={() => setQuantity(addon.id, picked ? 0 : 1)}
                    >
                      {picked ? 'Added' : 'Add'}
                    </button>
                  ) : null}
                </div>

                {!perBooking && picked ? (
                  <div className="extras-card__count">
                    <span>For how many of you?</span>
                    <div className="guest-stepper__controls">
                      <button
                        type="button"
                        // Replaces the Add button that had focus.
                        autoFocus
                        className="guest-stepper__btn"
                        aria-label={`Fewer ${addon.name}`}
                        onClick={() => setQuantity(addon.id, quantity - 1)}
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
                        onClick={() => setQuantity(addon.id, quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>

        <div className="extras-sheet__foot">
          <button type="button" className="btn btn--primary extras-sheet__apply" onClick={onApply}>
            {total.picked ? (
              <>
                Add to booking · +<FormattedPrice cents={total.cents} />
              </>
            ) : (
              'Done'
            )}
          </button>
          <p className="extras-sheet__note">Your total updates on the checkout screen.</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
