import { useEffect } from 'react'
import Cropper from 'react-easy-crop'
import Button from './ui/Button'

export default function PhotoCropDialog({
  title,
  image,
  aspect,
  cropShape = 'rect',
  crop,
  zoom,
  onCropChange,
  onZoomChange,
  onCropComplete,
  onApply,
  onCancel,
  applyDisabled = false,
  applyLabel = 'Use this crop',
  extraActions = null,
}) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div className="confirm-dialog-backdrop">
      <div
        className="confirm-dialog confirm-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-crop-title"
      >
        <p id="photo-crop-title" className="confirm-dialog__copy">
          {title}
        </p>
        <div className={`cover-crop${cropShape === 'round' ? ' cover-crop--round' : ''}`}>
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={cropShape}
            showGrid={cropShape !== 'round'}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="confirm-dialog__actions">
          <Button variant="primary" onClick={onApply} disabled={applyDisabled}>
            {applyLabel}
          </Button>
          {extraActions}
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
