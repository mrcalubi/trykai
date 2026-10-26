import { useEffect } from 'react'
import Button from './ui/Button'

export default function UnsavedChangesDialog({ onKeepEditing, onDiscard }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onKeepEditing()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onKeepEditing])

  return (
    <div className="confirm-dialog-backdrop">
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        aria-describedby="unsaved-changes-copy"
      >
        <p id="unsaved-changes-title" className="confirm-dialog__copy">
          Discard your changes?
        </p>
        <p id="unsaved-changes-copy" className="confirm-dialog__copy">
          You have changes you haven&apos;t saved.
        </p>
        <div className="confirm-dialog__actions">
          <Button variant="secondary" onClick={onKeepEditing}>
            Keep editing
          </Button>
          <Button variant="destructive" onClick={onDiscard}>
            Discard
          </Button>
        </div>
      </div>
    </div>
  )
}
