import Button from './ui/Button'
import { PHOTO_SKIP_COPY } from '../lib/listingFieldHints'

export default function PhotoSkipDialog({ onAdd, onSkip }) {
  return (
    <div className="confirm-dialog-backdrop">
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-skip-title"
      >
        <p id="photo-skip-title" className="confirm-dialog__copy">
          {PHOTO_SKIP_COPY}
        </p>
        <div className="confirm-dialog__actions">
          <Button variant="primary" onClick={onAdd}>
            Add photos
          </Button>
          <Button variant="secondary" onClick={onSkip}>
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  )
}
