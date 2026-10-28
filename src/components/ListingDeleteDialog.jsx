import { useEffect } from 'react'
import Button from './ui/Button'
import { LISTING_DELETE_SESSIONS_UNAVAILABLE } from '../lib/listingDelete'

function sessionLabel(count) {
  return count === 1 ? '1 upcoming session' : `${count} upcoming sessions`
}

function bookingLabel(count) {
  return count === 1 ? '1 upcoming booking' : `${count} upcoming bookings`
}

export default function ListingDeleteDialog({
  listing,
  sessionCount,
  bookingCount,
  loading,
  error,
  unavailable = false,
  onClose,
  onConfirm,
}) {
  const blocked = unavailable || bookingCount > 0
  const title = listing.title

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="confirm-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-delete-title"
      >
        <p id="listing-delete-title" className="cancel-confirm__warning">
          {unavailable
            ? LISTING_DELETE_SESSIONS_UNAVAILABLE
            : blocked
              ? `'${title}' has ${bookingLabel(bookingCount)}. Cancel those sessions first. Guests are refunded in full.`
              : `Delete '${title}'? This can't be undone.${
                  sessionCount > 0
                    ? ` Its ${sessionLabel(sessionCount)} will be removed too.`
                    : ''
                }`}
        </p>
        {error ? (
          <p className="error-message" role="alert">
            {error}
          </p>
        ) : null}
        <div className="confirm-dialog__actions">
          {blocked ? (
            <Button variant="secondary" onClick={onClose}>
              OK
            </Button>
          ) : (
            <>
              <Button variant="destructive" loading={loading} loadingLabel="Deleting" onClick={onConfirm}>
                Confirm delete
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Keep listing
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
